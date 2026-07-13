"use client";

import type { InventoryItem, InventoryLocation } from "@/features/inventory/lib/types";
import {
  formatMoney,
  itemCount,
  totalValue,
  valueByCategory,
  valueByLocation,
  type Rollup,
} from "@/features/inventory/lib/value";

type ValuePanelProps = {
  items: InventoryItem[];
  locations: InventoryLocation[];
  currency: string;
};

function Bars({ rows, currency }: { rows: Rollup[]; currency: string }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">Nothing to summarize yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {rows.slice(0, 6).map((r) => (
        <li key={r.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-slate-300">
              {r.label}
              <span className="ml-1 text-slate-500 tabular-nums">({r.count})</span>
            </span>
            <span className="shrink-0 tabular-nums text-slate-400">
              {formatMoney(r.total, currency)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-400"
              style={{ width: `${Math.max(3, (r.total / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ValuePanel({ items, locations, currency }: ValuePanelProps) {
  const total = totalValue(items);
  const count = itemCount(items);
  const byCategory = valueByCategory(items);
  const byLocation = valueByLocation(items, locations);

  return (
    <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Total value
          </p>
          <p className="text-3xl font-semibold tabular-nums text-emerald-300">
            {formatMoney(total, currency)}
          </p>
        </div>
        <p className="text-sm text-slate-400">
          <span className="font-semibold text-slate-200 tabular-nums">{count}</span>{" "}
          item{count === 1 ? "" : "s"} catalogued
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            By category
          </h4>
          <Bars rows={byCategory} currency={currency} />
        </section>
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            By location
          </h4>
          <Bars rows={byLocation} currency={currency} />
        </section>
      </div>
    </div>
  );
}

export default ValuePanel;
