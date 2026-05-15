import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Config, RepoStats } from "./types";
import { runGit } from "./git";

const CACHE_SCHEMA_VERSION = 1;

interface SerializedAuthor {
  name: string;
  email: string;
  commits: number;
  linesAdded: number;
  linesRemoved: number;
  firstCommitTs: number;
  lastCommitTs: number;
  activeDays: string[];
}

interface SerializedRepoStats {
  projectName: string;
  generatedAt: string;
  totalCommits: number;
  totalAuthors: number;
  totalFiles: number;
  totalLines: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  firstCommitTs: number;
  lastCommitTs: number;
  activeDays: string[];
  authors: Record<string, SerializedAuthor>;
  domains: Record<string, number>;
  activityByHourOfDay: Record<string, number>;
  activityByDayOfWeek: Record<string, number>;
  activityByHourOfWeek: Record<string, Record<string, number>>;
  activityByMonthOfYear: Record<string, number>;
  activityByYearMonth: Record<string, number>;
  activityByYear: Record<string, number>;
  activityByYearWeek: Record<string, number>;
  authorOfMonth: Record<string, Record<string, number>>;
  authorOfYear: Record<string, Record<string, number>>;
  filesByDate: Record<string, number>;
  extensions: Record<string, { files: number; lines: number }>;
  linesOfCodeByDate: Record<string, number>;
  tags: Array<{ name: string; date: string; commits: number; authors: Record<string, number> }>;
}

interface CacheEnvelope {
  schemaVersion: number;
  createdAt: string;
  fingerprint: string;
  repoPath: string;
  stats: SerializedRepoStats;
}

function serializeStats(stats: RepoStats): SerializedRepoStats {
  const authors: Record<string, SerializedAuthor> = {};
  for (const [key, author] of Object.entries(stats.authors)) {
    authors[key] = {
      name: author.name,
      email: author.email,
      commits: author.commits,
      linesAdded: author.linesAdded,
      linesRemoved: author.linesRemoved,
      firstCommitTs: author.firstCommitTs,
      lastCommitTs: author.lastCommitTs,
      activeDays: Array.from(author.activeDays).sort(),
    };
  }

  return {
    projectName: stats.projectName,
    generatedAt: stats.generatedAt,
    totalCommits: stats.totalCommits,
    totalAuthors: stats.totalAuthors,
    totalFiles: stats.totalFiles,
    totalLines: stats.totalLines,
    totalLinesAdded: stats.totalLinesAdded,
    totalLinesRemoved: stats.totalLinesRemoved,
    firstCommitTs: stats.firstCommitTs,
    lastCommitTs: stats.lastCommitTs,
    activeDays: Array.from(stats.activeDays).sort(),
    authors,
    domains: stats.domains,
    activityByHourOfDay: stats.activityByHourOfDay,
    activityByDayOfWeek: stats.activityByDayOfWeek,
    activityByHourOfWeek: stats.activityByHourOfWeek,
    activityByMonthOfYear: stats.activityByMonthOfYear,
    activityByYearMonth: stats.activityByYearMonth,
    activityByYear: stats.activityByYear,
    activityByYearWeek: stats.activityByYearWeek,
    authorOfMonth: stats.authorOfMonth,
    authorOfYear: stats.authorOfYear,
    filesByDate: stats.filesByDate,
    extensions: stats.extensions,
    linesOfCodeByDate: stats.linesOfCodeByDate,
    tags: stats.tags,
  };
}

function deserializeStats(serialized: SerializedRepoStats): RepoStats {
  const authors: RepoStats["authors"] = {};
  for (const [key, author] of Object.entries(serialized.authors)) {
    authors[key] = {
      name: author.name,
      email: author.email,
      commits: author.commits,
      linesAdded: author.linesAdded,
      linesRemoved: author.linesRemoved,
      firstCommitTs: author.firstCommitTs,
      lastCommitTs: author.lastCommitTs,
      activeDays: new Set(author.activeDays ?? []),
    };
  }

  return {
    projectName: serialized.projectName,
    generatedAt: serialized.generatedAt,
    totalCommits: serialized.totalCommits,
    totalAuthors: serialized.totalAuthors,
    totalFiles: serialized.totalFiles,
    totalLines: serialized.totalLines,
    totalLinesAdded: serialized.totalLinesAdded,
    totalLinesRemoved: serialized.totalLinesRemoved,
    firstCommitTs: serialized.firstCommitTs,
    lastCommitTs: serialized.lastCommitTs,
    activeDays: new Set(serialized.activeDays ?? []),
    authors,
    domains: serialized.domains,
    activityByHourOfDay: serialized.activityByHourOfDay,
    activityByDayOfWeek: serialized.activityByDayOfWeek,
    activityByHourOfWeek: serialized.activityByHourOfWeek,
    activityByMonthOfYear: serialized.activityByMonthOfYear,
    activityByYearMonth: serialized.activityByYearMonth,
    activityByYear: serialized.activityByYear,
    activityByYearWeek: serialized.activityByYearWeek,
    authorOfMonth: serialized.authorOfMonth,
    authorOfYear: serialized.authorOfYear,
    filesByDate: serialized.filesByDate,
    extensions: serialized.extensions,
    linesOfCodeByDate: serialized.linesOfCodeByDate,
    tags: serialized.tags,
  };
}

export function computeCacheFingerprint(repoPath: string, config: Config): string {
  const head = runGit(repoPath, ["rev-parse", "HEAD"]);
  const tags = runGit(repoPath, ["for-each-ref", "--format=%(refname):%(objectname)", "refs/tags"]);
  const configLine = JSON.stringify(config);

  return createHash("sha256")
    .update(head)
    .update("\n")
    .update(tags)
    .update("\n")
    .update(configLine)
    .digest("hex");
}

export function loadCachedStats(cacheFilePath: string, expectedFingerprint: string): RepoStats | null {
  if (!existsSync(cacheFilePath)) {
    return null;
  }

  try {
    const raw = readFileSync(cacheFilePath, "utf8");
    const parsed = JSON.parse(raw) as CacheEnvelope;

    if (parsed.schemaVersion !== CACHE_SCHEMA_VERSION) {
      return null;
    }
    if (parsed.fingerprint !== expectedFingerprint) {
      return null;
    }
    if (!parsed.stats) {
      return null;
    }

    return deserializeStats(parsed.stats);
  } catch {
    return null;
  }
}

export function saveCachedStats(cacheFilePath: string, repoPath: string, fingerprint: string, stats: RepoStats): void {
  const payload: CacheEnvelope = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    fingerprint,
    repoPath,
    stats: serializeStats(stats),
  };

  writeFileSync(cacheFilePath, JSON.stringify(payload, null, 2), "utf8");
}
