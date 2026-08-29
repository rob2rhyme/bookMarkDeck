"use client";

import type { InventoryItem, InventoryLocation } from "@/features/inventory/lib/types";
import { SECTION_LABEL_CLASS } from "@/components/ui/SectionLabel";
import {
  formatMoney,
  itemCount,
  resaleCurve,
  totalPaid,
  totalResale,
  totalValue,
  valueByCategory,
  valueByLocation,
  type CurvePoint,
  type Rollup,
} from "@/features/inventory/lib/value";

type ValuePanelProps = {
  items: InventoryItem[];
  locations: InventoryLocation[];
  currency: string;
  today: string; // YYYY-MM-DD — needed for the depreciation estimate
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

function ResaleCurve({ points }: { points: CurvePoint[] }) {
  const W = 100;
  const H = 32;
  const max = Math.max(1, points[0]?.total ?? 1);
  const n = points.length - 1;
  const coords = points.map((p, i) => {
    const x = n === 0 ? 0 : (i / n) * W;
    const y = H - (p.total / max) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-10 w-full" aria-hidden>
      <defs>
        <linearGradient id="resaleGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#34d399" stopOpacity="0.35" />
          <stop offset="1" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#resaleGrad)" />
      <path
        d={line}
        fill="none"
        stroke="#34d399"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ValuePanel({ items, locations, currency, today }: ValuePanelProps) {
  const total = totalValue(items);
  const count = itemCount(items);
  const byCategory = valueByCategory(items);
  const byLocation = valueByLocation(items, locations);

  const paid = totalPaid(items);
  const resaleNow = totalResale(items, today);
  const retained = paid > 0 ? Math.round((resaleNow / paid) * 100) : 0;
  const curve = resaleCurve(items, today, 5);

  return (
    <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className={SECTION_LABEL_CLASS}>
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

      {paid > 0 && (
        <section className="mt-5 border-t border-slate-800/60 pt-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Resale estimate
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                Paid{" "}
                <span className="tabular-nums text-slate-300">
                  {formatMoney(paid, currency)}
                </span>{" "}
                <span className="text-slate-500">(incl. tax)</span> · worth now{" "}
                <span className="font-semibold tabular-nums text-emerald-300">
                  ≈ {formatMoney(resaleNow, currency)}
                </span>
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-slate-800/70 px-2 py-0.5 text-[11px] tabular-nums text-slate-300">
              {retained}% retained
            </span>
          </div>
          <div className="mt-2">
            <ResaleCurve points={curve} />
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            Straight-line estimate by category, projected 5 years out — a guide, not an appraisal.
          </p>
        </section>
      )}
    </div>
  );
}

export default ValuePanel;
