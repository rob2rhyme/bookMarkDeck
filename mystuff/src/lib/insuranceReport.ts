// Pure builders for a printable "schedule of personal property" — the data most
// home-insurance claims ask for. Shaping the rows, totals, and the
// self-contained HTML string is pure + tested here; opening a print window is
// the impure part and lives with the dashboard. `today` is passed in.

import type { InventoryItem } from "@/lib/types";
import { formatMoney, itemResale } from "@/lib/value";

export type InsuranceRow = {
  name: string;
  category: string;
  location: string;
  quantity: number;
  purchaseDate: string;
  serial: string;
  paid: number; // purchase price × quantity
  estValue: number; // current estimate (manual or depreciated) × quantity
};

export type InsuranceReport = {
  rows: InsuranceRow[];
  count: number;
  totalPaid: number;
  totalValue: number;
};

const price = (i: InventoryItem): number =>
  typeof i.price === "number" && Number.isFinite(i.price) ? i.price : 0;

/** Active items → a value-sorted schedule with paid / estimated-value totals. */
export function buildInsuranceReport(
  items: InventoryItem[],
  locationNameById: Record<string, string>,
  today: string
): InsuranceReport {
  const rows: InsuranceRow[] = [];
  let totalPaid = 0;
  let totalValue = 0;
  for (const i of items) {
    if (i.archived) continue;
    const quantity = Math.max(1, i.quantity || 1);
    const paid = price(i) * quantity;
    const estValue = itemResale(i, today); // already × quantity
    totalPaid += paid;
    totalValue += estValue;
    rows.push({
      name: i.name,
      category: i.category ?? "",
      location: i.locationId ? locationNameById[i.locationId] ?? "" : "",
      quantity,
      purchaseDate: i.purchaseDate ?? "",
      serial: i.serial ?? "",
      paid,
      estValue,
    });
  }
  rows.sort((a, b) => b.estValue - a.estValue || a.name.localeCompare(b.name));
  return { rows, count: rows.length, totalPaid, totalValue };
}

export type InsuranceMeta = {
  owner?: string;
  generatedAt: string; // human-readable date string, passed in
  currency: string;
  title?: string;
};

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"
  );

/** A complete, self-contained printable HTML document for the schedule. */
export function insuranceReportHtml(
  report: InsuranceReport,
  meta: InsuranceMeta
): string {
  const title = meta.title ?? "Schedule of Personal Property";
  const money = (n: number) => esc(formatMoney(n, meta.currency));
  const cell = (s: string) => esc(s) || "—";

  const body = report.rows
    .map(
      (r, i) => `<tr>
      <td class="n">${i + 1}</td>
      <td class="name">${esc(r.name)}${r.quantity > 1 ? ` <span class="q">×${r.quantity}</span>` : ""}</td>
      <td>${cell(r.category)}</td>
      <td>${cell(r.location)}</td>
      <td>${cell(r.purchaseDate)}</td>
      <td class="mono">${cell(r.serial)}</td>
      <td class="money">${money(r.paid)}</td>
      <td class="money">${money(r.estValue)}</td>
    </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { margin: 16mm; }
  * { box-sizing: border-box; }
  body { font: 12px/1.4 -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 0; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .meta { color: #555; margin: 0 0 16px; font-size: 12px; }
  .totals { display: flex; gap: 24px; margin: 0 0 16px; padding: 12px 0; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd; }
  .totals div { display: flex; flex-direction: column; }
  .totals span { color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  .totals strong { font-size: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #666; border-bottom: 1.5px solid #ccc; }
  td.n { color: #999; width: 24px; }
  td.name { font-weight: 600; }
  td.q { color: #888; font-weight: 400; }
  td.mono { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; }
  td.money, th.money { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 700; border-top: 1.5px solid #ccc; border-bottom: none; }
  .foot { margin-top: 16px; color: #777; font-size: 10px; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <h1>${esc(title)}</h1>
  <p class="meta">${meta.owner ? `Prepared for ${esc(meta.owner)} &middot; ` : ""}${esc(meta.generatedAt)}</p>
  <div class="totals">
    <div><span>Items</span><strong>${report.count}</strong></div>
    <div><span>Total paid</span><strong>${money(report.totalPaid)}</strong></div>
    <div><span>Estimated value</span><strong>${money(report.totalValue)}</strong></div>
  </div>
  <table>
    <thead><tr>
      <th class="n">#</th><th>Item</th><th>Category</th><th>Location</th>
      <th>Purchased</th><th>Serial</th><th class="money">Paid</th><th class="money">Est. value</th>
    </tr></thead>
    <tbody>${body || `<tr><td colspan="8" style="color:#888;padding:16px">No items to list.</td></tr>`}</tbody>
    <tfoot><tr>
      <td></td><td colspan="5">${report.count} item${report.count === 1 ? "" : "s"}</td>
      <td class="money">${money(report.totalPaid)}</td>
      <td class="money">${money(report.totalValue)}</td>
    </tr></tfoot>
  </table>
  <p class="foot">Estimated values are the owner&rsquo;s own estimates or a straight-line depreciation heuristic, provided for reference only — not a professional appraisal.</p>
</body></html>`;
}
