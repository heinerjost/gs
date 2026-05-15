export type CounterMap = Record<string, number>;

export interface AuthorStats {
  name: string;
  email: string;
  commits: number;
  linesAdded: number;
  linesRemoved: number;
  firstCommitTs: number;
  lastCommitTs: number;
  activeDays: Set<string>;
}

export interface ExtensionStats {
  files: number;
  lines: number;
}

export interface TagStats {
  name: string;
  date: string;
  commits: number;
  authors: CounterMap;
}

export interface RepoStats {
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
  activeDays: Set<string>;
  authors: Record<string, AuthorStats>;
  domains: CounterMap;
  activityByHourOfDay: CounterMap;
  activityByDayOfWeek: CounterMap;
  activityByHourOfWeek: Record<string, CounterMap>;
  activityByMonthOfYear: CounterMap;
  activityByYearMonth: CounterMap;
  activityByYear: CounterMap;
  activityByYearWeek: CounterMap;
  authorOfMonth: Record<string, CounterMap>;
  authorOfYear: Record<string, CounterMap>;
  filesByDate: Record<string, number>;
  extensions: Record<string, ExtensionStats>;
  linesOfCodeByDate: Record<string, number>;
  tags: TagStats[];
}

export interface Config {
  maxAuthors: number;
  maxDomains: number;
  maxExtLength: number;
}
