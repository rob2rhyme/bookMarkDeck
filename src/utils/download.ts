"use client";

// Tiny client-side file export helpers — no dependencies. Used to let users
// take their data out (CSV for spreadsheets, JSON for backup/re-import).

export function downloadText(
  filename: string,
  text: string,
  mime = "text/plain"
): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Write a self-contained HTML document into a hidden iframe and open the print
 *  dialog (Save as PDF). Nothing leaves the device; the iframe is cleaned up. */
export function printHtml(html: string): void {
  if (typeof window === "undefined") return;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const cdoc = win?.document;
  if (!win || !cdoc) {
    iframe.remove();
    return;
  }
  cdoc.open();
  cdoc.write(html);
  cdoc.close();
  win.onafterprint = () => iframe.remove();
  setTimeout(() => {
    win.focus();
    win.print();
  }, 150);
}

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
