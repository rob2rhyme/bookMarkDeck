// Ported verbatim from the web app's src/utils/download.ts — the CSV writer is
// pure string work, so it runs identically on React Native. (The Blob/anchor
// download half of that file is browser-only and is replaced by
// expo-file-system + expo-sharing in src/backup.)

function csvCell(value: unknown): string {
  const s =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : String(value);
  // Quote when the value contains a comma, quote, or newline; escape quotes.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows → CSV text. `columns` fixes the header + order. */
export function toCsv(
  columns: string[],
  rows: Array<Record<string, unknown>>
): string {
  const head = columns.map(csvCell).join(",");
  const body = rows
    .map((row) => columns.map((c) => csvCell(row[c])).join(","))
    .join("\n");
  return body ? `${head}\n${body}` : head;
}
