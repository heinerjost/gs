import { execFileSync } from "node:child_process";

export function runGit(repoPath: string, args: string[]): string {
  return execFileSync("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 256,
  }).trimEnd();
}

export function runGitBuffer(repoPath: string, args: string[]): Buffer {
  return execFileSync("git", ["-C", repoPath, ...args], {
    encoding: "buffer",
    maxBuffer: 1024 * 1024 * 256,
  }) as Buffer;
}

export function resolveGitRoot(repoPath: string): string {
  return runGit(repoPath, ["rev-parse", "--show-toplevel"]).trim();
}
