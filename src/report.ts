import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { format } from "date-fns";
import { Config, CounterMap, RepoStats } from "./types";

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="style.css" />
  <script defer src="sortable.js"></script>
</head>
<body>
  <header class="topbar">
    <h1>${esc(title)}</h1>
    <nav>
      <a href="index.html">General</a>
      <a href="activity.html">Activity</a>
      <a href="authors.html">Authors</a>
      <a href="files.html">Files</a>
      <a href="lines.html">Lines</a>
      <a href="tags.html">Tags</a>
    </nav>
  </header>
  <main>
    ${body}
  </main>
</body>
</html>`;
}

function listRows(items: Array<[string, string]>): string {
  return `<dl>${items
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
    .join("")}</dl>`;
}

function topEntries(map: CounterMap, limit: number): Array<[string, number]> {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function simpleBarsSvg(items: Array<[string, number]>, width = 960, height = 260): string {
  if (items.length === 0) {
    return "<p>No data</p>";
  }

  const maxValue = Math.max(...items.map(([, v]) => v), 1);
  const margin = { top: 10, right: 10, bottom: 80, left: 40 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const barWidth = Math.max(6, Math.floor(innerWidth / items.length) - 4);

  const bars = items
    .map(([label, value], idx) => {
      const h = Math.round((value / maxValue) * innerHeight);
      const x = margin.left + idx * (barWidth + 4);
      const y = margin.top + (innerHeight - h);
      const lx = x + Math.floor(barWidth / 2);
      const ly = margin.top + innerHeight + 14;
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" class="bar" />
        <text x="${lx}" y="${ly}" class="axis-label" transform="rotate(45 ${lx} ${ly})">${esc(label)}</text>
      `;
    })
    .join("\n");

  return `<svg viewBox="0 0 ${width} ${height}" class="chart" role="img" aria-label="Bar chart">
    <line x1="${margin.left}" y1="${margin.top + innerHeight}" x2="${width - margin.right}" y2="${margin.top + innerHeight}" class="axis" />
    <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + innerHeight}" class="axis" />
    ${bars}
  </svg>`;
}

function table(headers: string[], rows: string[][]): string {
  return `<table class="sortable"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

function writeStyle(outDir: string): void {
  const css = `:root {
  --bg: #f8f4ee;
  --paper: #fffdf8;
  --ink: #1f1f1f;
  --accent: #0d6e6e;
  --accent-soft: #cde8e8;
  --line: #d7d0c7;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
  color: var(--ink);
  background: radial-gradient(circle at top right, #f0eee8, var(--bg) 45%);
}
.topbar {
  position: sticky;
  top: 0;
  z-index: 2;
  background: rgba(255, 253, 248, 0.95);
  border-bottom: 1px solid var(--line);
  backdrop-filter: blur(5px);
  padding: 1rem 1.2rem;
}
.topbar h1 { margin: 0 0 0.8rem; font-size: 1.2rem; }
nav { display: flex; gap: 0.6rem; flex-wrap: wrap; }
nav a {
  text-decoration: none;
  color: var(--ink);
  border: 1px solid var(--line);
  background: var(--paper);
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
}
nav a:hover { background: var(--accent-soft); }
main { padding: 1rem 1.2rem 2rem; max-width: 1200px; margin: 0 auto; }
section {
  margin-bottom: 1.2rem;
  border: 1px solid var(--line);
  background: var(--paper);
  border-radius: 14px;
  padding: 0.8rem 1rem;
}
h2 { margin-top: 0; }
dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.35rem 0.8rem;
}
dt { font-weight: 700; }
dd { margin: 0; }
table {
  width: 100%;
  border-collapse: collapse;
  overflow-x: auto;
  display: block;
}
th, td {
  border-bottom: 1px solid var(--line);
  text-align: left;
  padding: 0.42rem;
  font-size: 0.92rem;
}
thead th {
  position: sticky;
  top: 0;
  background: #efe8dc;
}
table.sortable thead th {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
table.sortable thead th::after {
  content: " \u2195";
  color: #777;
  font-size: 0.82em;
}
table.sortable thead th.sort-asc::after {
  content: " \u2191";
  color: #1f1f1f;
}
table.sortable thead th.sort-desc::after {
  content: " \u2193";
  color: #1f1f1f;
}
.chart { width: 100%; height: auto; background: #fff; border: 1px solid var(--line); border-radius: 10px; }
.axis { stroke: #4a4a4a; stroke-width: 1; }
.bar { fill: var(--accent); opacity: 0.9; }
.axis-label { font-size: 10px; fill: #404040; }
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1rem;
}
@media (max-width: 640px) {
  .topbar h1 { font-size: 1rem; }
  nav a { font-size: 0.85rem; }
}
`;

  writeFileSync(join(outDir, "style.css"), css, "utf8");
}

function writeSortableScript(outDir: string): void {
  const script = `(() => {
  const detectType = (rows, index) => {
    for (const row of rows) {
      const cell = row.cells[index];
      if (!cell) continue;
      const raw = cell.textContent?.trim() ?? "";
      if (!raw) continue;

      const num = Number(raw.replace(/[^0-9.+-]/g, ""));
      if (!Number.isNaN(num) && /[0-9]/.test(raw)) return "number";

      const date = Date.parse(raw);
      if (!Number.isNaN(date)) return "date";

      return "string";
    }
    return "string";
  };

  const toComparable = (value, type) => {
    const raw = (value ?? "").trim();
    if (type === "number") {
      const num = Number(raw.replace(/[^0-9.+-]/g, ""));
      return Number.isNaN(num) ? Number.NEGATIVE_INFINITY : num;
    }
    if (type === "date") {
      const ts = Date.parse(raw);
      return Number.isNaN(ts) ? Number.NEGATIVE_INFINITY : ts;
    }
    return raw.toLowerCase();
  };

  const clearClasses = (headers) => {
    for (const h of headers) {
      h.classList.remove("sort-asc", "sort-desc");
    }
  };

  const tables = document.querySelectorAll("table.sortable");
  for (const table of tables) {
    const headRow = table.tHead?.rows?.[0];
    const body = table.tBodies?.[0];
    if (!headRow || !body) continue;

    const headers = Array.from(headRow.cells);
    headers.forEach((header, index) => {
      header.addEventListener("click", () => {
        const rows = Array.from(body.rows);
        const isDesc = header.classList.contains("sort-desc");
        const nextAsc = isDesc;
        const type = detectType(rows, index);

        rows.sort((a, b) => {
          const av = toComparable(a.cells[index]?.textContent ?? "", type);
          const bv = toComparable(b.cells[index]?.textContent ?? "", type);
          if (av < bv) return nextAsc ? -1 : 1;
          if (av > bv) return nextAsc ? 1 : -1;
          return 0;
        });

        clearClasses(headers);
        header.classList.add(nextAsc ? "sort-asc" : "sort-desc");
        rows.forEach((row) => body.appendChild(row));
      });
    });
  }
})();
`;

  writeFileSync(join(outDir, "sortable.js"), script, "utf8");
}

function winnerFromMap(map: CounterMap): [string, number] {
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  return sorted[0] ?? ["-", 0];
}

export function renderReport(stats: RepoStats, outDir: string, config: Config): void {
  mkdirSync(outDir, { recursive: true });
  writeStyle(outDir);
  writeSortableScript(outDir);

  const firstDate = stats.firstCommitTs > 0 ? format(new Date(stats.firstCommitTs * 1000), "yyyy-MM-dd HH:mm:ss") : "-";
  const lastDate = stats.lastCommitTs > 0 ? format(new Date(stats.lastCommitTs * 1000), "yyyy-MM-dd HH:mm:ss") : "-";
  const ageDays =
    stats.firstCommitTs > 0 && stats.lastCommitTs > 0
      ? Math.floor((stats.lastCommitTs - stats.firstCommitTs) / 86400) + 1
      : 0;
  const activeDays = stats.activeDays.size;

  const indexBody = `
<section>
  <h2>General Statistics</h2>
  ${listRows([
    ["Project", stats.projectName],
    ["Generated", format(new Date(stats.generatedAt), "yyyy-MM-dd HH:mm:ss")],
    ["Report period", `${firstDate} to ${lastDate}`],
    ["Age", `${ageDays} days (${activeDays} active)`],
    ["Total commits", String(stats.totalCommits)],
    ["Total authors", String(stats.totalAuthors)],
    ["Total files", String(stats.totalFiles)],
    ["Total lines of code", String(stats.totalLines)],
    ["Line delta", `+${stats.totalLinesAdded} / -${stats.totalLinesRemoved}`],
  ])}
</section>
<section>
  <h2>Top Domains</h2>
  ${table(
    ["Domain", "Commits"],
    topEntries(stats.domains, config.maxDomains).map(([domain, commits]) => [domain, String(commits)]),
  )}
</section>`;

  const weekEntries = Object.entries(stats.activityByYearWeek).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-32);
  const activityBody = `
<section>
  <h2>Weekly Activity (Last 32 Weeks)</h2>
  ${simpleBarsSvg(weekEntries)}
</section>
<section class="grid">
  <div>
    <h2>Hour of Day</h2>
    ${simpleBarsSvg(Object.entries(stats.activityByHourOfDay).sort((a, b) => Number(a[0]) - Number(b[0])))}
  </div>
  <div>
    <h2>Day of Week</h2>
    ${simpleBarsSvg(Object.entries(stats.activityByDayOfWeek).sort((a, b) => Number(a[0]) - Number(b[0])))}
  </div>
</section>
<section>
  <h2>Commits by Year/Month</h2>
  ${table(
    ["Month", "Commits"],
    Object.entries(stats.activityByYearMonth)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([month, commits]) => [month, String(commits)]),
  )}
</section>
<section>
  <h2>Commits by Year</h2>
  ${table(
    ["Year", "Commits"],
    Object.entries(stats.activityByYear)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([year, commits]) => [year, String(commits)]),
  )}
</section>`;

  const authorRows = Object.entries(stats.authors)
    .sort((a, b) => b[1].commits - a[1].commits)
    .slice(0, config.maxAuthors)
    .map(([, author], idx) => {
      const first = author.firstCommitTs > 0 ? format(new Date(author.firstCommitTs * 1000), "yyyy-MM-dd") : "-";
      const last = author.lastCommitTs > 0 ? format(new Date(author.lastCommitTs * 1000), "yyyy-MM-dd") : "-";
      return [
        String(idx + 1),
        `${author.name} <${author.email}>`,
        String(author.commits),
        String(author.linesAdded),
        String(author.linesRemoved),
        first,
        last,
        String(author.activeDays.size),
      ];
    });

  const aomRows = Object.entries(stats.authorOfMonth)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([month, counts]) => {
      const [name, commits] = winnerFromMap(counts);
      return [month, name, String(commits)];
    });

  const aoyRows = Object.entries(stats.authorOfYear)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([year, counts]) => {
      const [name, commits] = winnerFromMap(counts);
      return [year, name, String(commits)];
    });

  const authorsBody = `
<section>
  <h2>Top Authors</h2>
  ${table(["#", "Author", "Commits", "+Lines", "-Lines", "First", "Last", "Active days"], authorRows)}
</section>
<section class="grid">
  <div>
    <h2>Author of Month</h2>
    ${table(["Month", "Author", "Commits"], aomRows)}
  </div>
  <div>
    <h2>Author of Year</h2>
    ${table(["Year", "Author", "Commits"], aoyRows)}
  </div>
</section>`;

  const filesByDateRows = Object.entries(stats.filesByDate)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, files]) => [date, String(files)]);

  const extensionRows = Object.entries(stats.extensions)
    .sort((a, b) => b[1].lines - a[1].lines)
    .map(([ext, info]) => [ext, String(info.files), String(info.lines), String(Math.round(info.lines / Math.max(info.files, 1)))]);

  const filesBody = `
<section>
  <h2>File Totals</h2>
  ${listRows([
    ["Total files", String(stats.totalFiles)],
    ["Total lines", String(stats.totalLines)],
    ["Average lines/file", (stats.totalLines / Math.max(stats.totalFiles, 1)).toFixed(2)],
  ])}
</section>
<section>
  <h2>File Count by Date</h2>
  ${simpleBarsSvg(filesByDateRows.map(([d, v]) => [d, Number(v)]))}
  ${table(["Date", "Files"], filesByDateRows.slice(-120).reverse())}
</section>
<section>
  <h2>Extensions</h2>
  ${table(["Extension", "Files", "Lines", "Lines/File"], extensionRows)}
</section>`;

  const locRows = Object.entries(stats.linesOfCodeByDate)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, lines]) => [date, String(lines)]);

  const linesBody = `
<section>
  <h2>Lines of Code by Date</h2>
  ${simpleBarsSvg(locRows.map(([d, v]) => [d, Number(v)]))}
  ${table(["Date", "Lines"], locRows.slice(-120).reverse())}
</section>`;

  const tagsBody = `
<section>
  <h2>Tags</h2>
  ${listRows([
    ["Total tags", String(stats.tags.length)],
    ["Average commits/tag", (stats.totalCommits / Math.max(stats.tags.length, 1)).toFixed(2)],
  ])}
  ${table(
    ["Tag", "Date", "Commits", "Authors"],
    stats.tags.map((tag) => [
      tag.name,
      tag.date,
      String(tag.commits),
      Object.entries(tag.authors)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([a, c]) => `${a} (${c})`)
        .join(", "),
    ]),
  )}
</section>`;

  writeFileSync(join(outDir, "index.html"), page(`GitStats TS - ${stats.projectName}`, indexBody), "utf8");
  writeFileSync(join(outDir, "activity.html"), page(`Activity - ${stats.projectName}`, activityBody), "utf8");
  writeFileSync(join(outDir, "authors.html"), page(`Authors - ${stats.projectName}`, authorsBody), "utf8");
  writeFileSync(join(outDir, "files.html"), page(`Files - ${stats.projectName}`, filesBody), "utf8");
  writeFileSync(join(outDir, "lines.html"), page(`Lines - ${stats.projectName}`, linesBody), "utf8");
  writeFileSync(join(outDir, "tags.html"), page(`Tags - ${stats.projectName}`, tagsBody), "utf8");
  const json = JSON.stringify(
    stats,
    (_key, value) => {
      if (value instanceof Set) {
        return Array.from(value).sort();
      }
      return value;
    },
    2,
  );
  writeFileSync(join(outDir, "stats.json"), json, "utf8");
}
