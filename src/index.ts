#!/usr/bin/env node
import { Command } from "commander";
import { mkdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { computeCacheFingerprint, loadCachedStats, saveCachedStats } from "./cache";
import { collectStats } from "./collector";
import { resolveGitRoot } from "./git";
import { renderReport } from "./report";
import { Config } from "./types";

const DEFAULT_CACHE_FILE = "gitstats-ts.cache.json";

interface CliOptions {
  maxAuthors: string;
  maxDomains: string;
  maxExtLength: string;
  cache: boolean;
  cacheFile: string;
}

function parseIntOption(raw: string, name: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid value for ${name}: ${raw}`);
  }
  return value;
}

const program = new Command();
program
  .name("gitstats-ts")
  .description("Git repository statistics generator similar to GitStats")
  .argument("<gitPath>", "Path to git repository")
  .argument("<outputPath>", "Path to output report directory")
  .option("--max-authors <n>", "Maximum authors in top list", "20")
  .option("--max-domains <n>", "Maximum domains in top list", "10")
  .option("--max-ext-length <n>", "Maximum extension length", "10")
  .option("--no-cache", "Disable cache load/save")
  .option("--cache-file <path>", "Cache file path (absolute or relative to outputPath)", DEFAULT_CACHE_FILE)
  .action((gitPath: string, outputPath: string, options: CliOptions) => {
    const config: Config = {
      maxAuthors: parseIntOption(options.maxAuthors, "max-authors"),
      maxDomains: parseIntOption(options.maxDomains, "max-domains"),
      maxExtLength: parseIntOption(options.maxExtLength, "max-ext-length"),
    };

    const repoRoot = resolveGitRoot(gitPath);
    const outDir = resolve(outputPath);
    const cacheFilePath = isAbsolute(options.cacheFile) ? options.cacheFile : resolve(outDir, options.cacheFile);
    mkdirSync(outDir, { recursive: true });

    const started = Date.now();
    console.log(`Git path: ${repoRoot}`);
    console.log(`Output path: ${outDir}`);
    console.log("Collecting data...");

    let stats = null;
    let fingerprint = "";

    if (options.cache) {
      fingerprint = computeCacheFingerprint(repoRoot, config);
      stats = loadCachedStats(cacheFilePath, fingerprint);

      if (stats) {
        console.log(`Cache hit: ${cacheFilePath}`);
      } else {
        console.log(`Cache miss: ${cacheFilePath}`);
      }
    }

    if (!stats) {
      stats = collectStats(repoRoot, config);
      if (options.cache) {
        if (!fingerprint) {
          fingerprint = computeCacheFingerprint(repoRoot, config);
        }
        saveCachedStats(cacheFilePath, repoRoot, fingerprint, stats);
        console.log(`Cache saved: ${cacheFilePath}`);
      }
    }

    console.log("Generating report...");
    renderReport(stats, outDir, config);

    const elapsedSec = ((Date.now() - started) / 1000).toFixed(2);
    console.log(`Done in ${elapsedSec}s`);
    console.log(`Open: ${resolve(outDir, "index.html")}`);
  });

program.parse();
