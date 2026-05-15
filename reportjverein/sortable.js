(() => {
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
