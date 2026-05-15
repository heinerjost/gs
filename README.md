# gitstats-ts

TypeScript/Node implementation inspired by GitStats.

It generates a static HTML report for a Git repository with pages for:

- General statistics
- Activity (hour/day/week/month/year)
- Authors (top list, author of month/year)
- Files (file count by date, extensions)
- Lines (lines of code by date)
- Tags

## Requirements

- Node.js 20+
- Git in PATH

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

## Run

```bash
npm run start -- /path/to/git/repo ./report
```

For development (without build):

```bash
npm run dev -- /path/to/git/repo ./report
```

## CLI Options

```bash
gitstats-ts <gitPath> <outputPath> [options]

Options:
  --max-authors <n>      Maximum authors in top list (default: 20)
  --max-domains <n>      Maximum domains in top list (default: 10)
  --max-ext-length <n>   Maximum extension length (default: 10)
  --no-cache             Disable cache load/save
  --cache-file <path>    Cache file path (default: gitstats-ts.cache.json)
```

## Notes

- The generated report is fully static and can be opened directly in a browser.
- Chart rendering uses inline SVG, so no gnuplot is required.
- Caching is enabled by default and stores stats as JSON in the output folder.
- Cache invalidation is based on HEAD, tag refs, and relevant CLI config values.
