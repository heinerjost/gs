import { basename } from "node:path";
import { getISOWeek, getISOWeekYear, parseISO } from "date-fns";
import { Config, CounterMap, RepoStats, TagStats } from "./types";
import { resolveGitRoot, runGit, runGitBuffer } from "./git";

const COMMIT_MARKER = "__COMMIT__|";

function inc(map: CounterMap, key: string, by = 1): void {
  map[key] = (map[key] ?? 0) + by;
}

function parseNumstatLine(line: string): { add: number; del: number } | null {
  const parts = line.split("\t");
  if (parts.length < 3) {
    return null;
  }

  const add = parts[0] === "-" ? 0 : Number(parts[0]);
  const del = parts[1] === "-" ? 0 : Number(parts[1]);

  if (Number.isNaN(add) || Number.isNaN(del)) {
    return null;
  }

  return { add, del };
}

function extensionOf(path: string, maxExtLength: number): string {
  const lastDot = path.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === path.length - 1) {
    return "(none)";
  }

  const ext = path.slice(lastDot + 1).toLowerCase();
  if (ext.length > maxExtLength) {
    return "(none)";
  }
  return ext;
}

function toOffsetTz(raw: string): string {
  if (/^[+-]\d{4}$/.test(raw)) {
    return `${raw.slice(0, 3)}:${raw.slice(3)}`;
  }
  return raw;
}

function countNewlines(buf: Buffer): number {
  let lines = 0;
  for (let i = 0; i < buf.length; i += 1) {
    if (buf[i] === 10) {
      lines += 1;
    }
  }

  if (buf.length > 0 && buf[buf.length - 1] !== 10) {
    lines += 1;
  }

  return lines;
}

function collectTagStats(repoPath: string): TagStats[] {
  const tagsRaw = runGit(repoPath, [
    "for-each-ref",
    "--sort=creatordate",
    "--format=%(refname:short)|%(creatordate:iso8601)",
    "refs/tags",
  ]);

  if (!tagsRaw.trim()) {
    return [];
  }

  const tags = tagsRaw
    .split("\n")
    .map((line) => {
      const [name, ...dateParts] = line.split("|");
      return { name, date: dateParts.join("|") };
    })
    .filter((entry) => entry.name);

  const result: TagStats[] = [];
  let prevTag: string | null = null;

  for (const tag of tags) {
    const range = prevTag ? `${prevTag}..${tag.name}` : tag.name;
    const shortlog = runGit(repoPath, ["shortlog", "-s", "-n", "--all", range]);
    const authors: CounterMap = {};
    let commits = 0;

    for (const line of shortlog.split("\n")) {
      const match = line.match(/^\s*(\d+)\s+(.+)$/);
      if (!match) {
        continue;
      }

      const count = Number(match[1]);
      const author = match[2].trim();
      if (author) {
        authors[author] = count;
        commits += count;
      }
    }

    result.push({
      name: tag.name,
      date: tag.date,
      commits,
      authors,
    });

    prevTag = tag.name;
  }

  return result.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function collectStats(repoPathInput: string, config: Config): RepoStats {
  const repoPath = resolveGitRoot(repoPathInput);
  const projectName = basename(repoPath);

  const stats: RepoStats = {
    projectName,
    generatedAt: new Date().toISOString(),
    totalCommits: 0,
    totalAuthors: 0,
    totalFiles: 0,
    totalLines: 0,
    totalLinesAdded: 0,
    totalLinesRemoved: 0,
    firstCommitTs: Number.POSITIVE_INFINITY,
    lastCommitTs: 0,
    activeDays: new Set<string>(),
    authors: {},
    domains: {},
    activityByHourOfDay: {},
    activityByDayOfWeek: {},
    activityByHourOfWeek: {},
    activityByMonthOfYear: {},
    activityByYearMonth: {},
    activityByYear: {},
    activityByYearWeek: {},
    authorOfMonth: {},
    authorOfYear: {},
    filesByDate: {},
    extensions: {},
    linesOfCodeByDate: {},
    tags: [],
  };

  const dailyNetLineChanges: CounterMap = {};

  const logRaw = runGit(repoPath, [
    "log",
    "--numstat",
    "--date=iso-strict",
    "--pretty=format:" + COMMIT_MARKER + "%H|%at|%aN|%aE|%ai",
    "HEAD",
  ]);

  let currentAuthor = "";
  let currentEmail = "";
  let currentDay = "";
  let currentCommitAdd = 0;
  let currentCommitDel = 0;
  let currentFilesChanged = 0;

  const flushCommit = (): void => {
    if (!currentAuthor) {
      return;
    }

    const authorKey = `${currentAuthor} <${currentEmail}>`;
    const existing = stats.authors[authorKey];

    if (!existing) {
      stats.authors[authorKey] = {
        name: currentAuthor,
        email: currentEmail,
        commits: 1,
        linesAdded: currentCommitAdd,
        linesRemoved: currentCommitDel,
        firstCommitTs: Number.POSITIVE_INFINITY,
        lastCommitTs: 0,
        activeDays: new Set([currentDay]),
      };
    } else {
      existing.commits += 1;
      existing.linesAdded += currentCommitAdd;
      existing.linesRemoved += currentCommitDel;
      existing.activeDays.add(currentDay);
    }

    stats.totalLinesAdded += currentCommitAdd;
    stats.totalLinesRemoved += currentCommitDel;
    inc(dailyNetLineChanges, currentDay, currentCommitAdd - currentCommitDel);

    currentCommitAdd = 0;
    currentCommitDel = 0;
    currentFilesChanged = 0;
  };

  for (const line of logRaw.split("\n")) {
    if (line.startsWith(COMMIT_MARKER)) {
      flushCommit();

      const payload = line.slice(COMMIT_MARKER.length);
      const [sha, tsRaw, authorName, authorEmail, ...dateParts] =
        payload.split("|");
      void sha;
      const ai = dateParts.join("|").trim();
      const stamp = Number(tsRaw);
      const aiMatch = ai.match(
        /^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})$/,
      );
      if (!aiMatch || Number.isNaN(stamp)) {
        currentAuthor = "";
        continue;
      }

      const day = aiMatch[1];
      const hour = aiMatch[2];
      const tz = aiMatch[5];
      const month = day.slice(5, 7);
      const year = day.slice(0, 4);
      const yearMonth = day.slice(0, 7);
      const dayDate = parseISO(`${day}T00:00:00Z`);
      const week = String(getISOWeek(dayDate)).padStart(2, "0");
      const weekYear = String(getISOWeekYear(dayDate));
      const yearWeek = `${weekYear}-${week}`;
      const weekday = String((dayDate.getUTCDay() + 6) % 7);

      currentAuthor = authorName.trim();
      currentEmail = authorEmail.trim().toLowerCase();
      currentDay = day;
      stats.totalCommits += 1;
      stats.activeDays.add(day);
      stats.firstCommitTs = Math.min(stats.firstCommitTs, stamp);
      stats.lastCommitTs = Math.max(stats.lastCommitTs, stamp);

      inc(stats.activityByHourOfDay, hour);
      inc(stats.activityByDayOfWeek, weekday);
      if (!stats.activityByHourOfWeek[weekday]) {
        stats.activityByHourOfWeek[weekday] = {};
      }
      inc(stats.activityByHourOfWeek[weekday], hour);
      inc(stats.activityByMonthOfYear, month);
      inc(stats.activityByYearMonth, yearMonth);
      inc(stats.activityByYear, year);
      inc(stats.activityByYearWeek, yearWeek);

      if (!stats.authorOfMonth[yearMonth]) {
        stats.authorOfMonth[yearMonth] = {};
      }
      inc(stats.authorOfMonth[yearMonth], currentAuthor);

      if (!stats.authorOfYear[year]) {
        stats.authorOfYear[year] = {};
      }
      inc(stats.authorOfYear[year], currentAuthor);

      const domain = currentEmail.includes("@")
        ? (currentEmail.split("@").pop() ?? "unknown")
        : "unknown";
      inc(stats.domains, domain);

      continue;
    }

    const parsed = parseNumstatLine(line);
    if (!parsed) {
      continue;
    }

    currentCommitAdd += parsed.add;
    currentCommitDel += parsed.del;
    currentFilesChanged += 1;
  }

  flushCommit();

  for (const author of Object.values(stats.authors)) {
    const historyRaw = runGit(repoPath, [
      "log",
      "--author",
      `${author.name} <${author.email}>`,
      "--date=unix",
      "--pretty=format:%at",
      "HEAD",
    ]);

    for (const row of historyRaw.split("\n")) {
      if (!row.trim()) {
        continue;
      }
      const ts = Number(row.trim());
      if (!Number.isNaN(ts)) {
        author.firstCommitTs = Math.min(author.firstCommitTs, ts);
        author.lastCommitTs = Math.max(author.lastCommitTs, ts);
      }
    }

    if (!Number.isFinite(author.firstCommitTs)) {
      author.firstCommitTs = stats.firstCommitTs;
    }
  }

  stats.totalAuthors = Object.keys(stats.authors).length;

  const sortedDays = Object.keys(dailyNetLineChanges).sort();
  let runningLines = 0;
  for (const day of sortedDays) {
    runningLines += dailyNetLineChanges[day] ?? 0;
    if (runningLines < 0) {
      runningLines = 0;
    }
    stats.linesOfCodeByDate[day] = runningLines;
  }

  const revTreeRaw = runGit(repoPath, [
    "rev-list",
    "--pretty=format:%at|%T",
    "HEAD",
  ]);
  const treeFileCountCache: CounterMap = {};
  for (const line of revTreeRaw.split("\n")) {
    if (!line.includes("|") || line.startsWith("commit ")) {
      continue;
    }

    const [tsRaw, treeHash] = line.split("|");
    const ts = Number(tsRaw);
    if (Number.isNaN(ts) || !treeHash) {
      continue;
    }

    if (!treeFileCountCache[treeHash]) {
      const filesRaw = runGit(repoPath, [
        "ls-tree",
        "-r",
        "--name-only",
        treeHash,
      ]);
      treeFileCountCache[treeHash] = filesRaw
        ? filesRaw.split("\n").filter(Boolean).length
        : 0;
    }

    const day = new Date(ts * 1000).toISOString().slice(0, 10);
    stats.filesByDate[day] = treeFileCountCache[treeHash];
  }

  const headTree = runGit(repoPath, ["ls-tree", "-r", "-z", "HEAD"]);
  const entries = headTree.split("\0").filter(Boolean);
  const blobLineCache: CounterMap = {};

  for (const entry of entries) {
    const tabIdx = entry.indexOf("\t");
    if (tabIdx < 0) {
      continue;
    }

    const meta = entry.slice(0, tabIdx);
    const filePath = entry.slice(tabIdx + 1);
    const parts = meta.split(" ");
    if (parts.length < 3) {
      continue;
    }

    const sha = parts[2];
    const ext = extensionOf(filePath, config.maxExtLength);

    if (!stats.extensions[ext]) {
      stats.extensions[ext] = { files: 0, lines: 0 };
    }

    let lines = blobLineCache[sha] ?? -1;
    if (lines < 0) {
      const blob = runGitBuffer(repoPath, ["cat-file", "-p", sha]);
      lines = countNewlines(blob);
      blobLineCache[sha] = lines;
    }

    stats.extensions[ext].files += 1;
    stats.extensions[ext].lines += lines;
    stats.totalFiles += 1;
    stats.totalLines += lines;
  }

  stats.tags = collectTagStats(repoPath);

  if (!Number.isFinite(stats.firstCommitTs)) {
    stats.firstCommitTs = 0;
  }

  return stats;
}
