"use client";

import type { InventoryItem } from "@/features/inventory/lib/types";
import { SECTION_LABEL_CLASS } from "@/components/ui/SectionLabel";
import {
  hasTrending,
  trending,
  type TrendingEntry,
} from "@/features/inventory/lib/activity";

type TrendingPanelProps = {
  items: InventoryItem[];
  onOpen: (item: InventoryItem) => void;
};

/**
 * Surfaces what you've actually been doing with your stuff lately — the items
 * you use, lend, and shuffle around most in the last 90 days. Computed from the
 * activity log; hides itself when there's nothing to show.
 */
export function TrendingPanel({ items, onOpen }: TrendingPanelProps) {
  const t = trending(items, Date.now(), 90, 5);
  if (!hasTrending(t)) return null;

  const columns: { key: string; title: string; entries: TrendingEntry[] }[] = [
    { key: "used", title: "✨ Most used", entries: t.used },
    { key: "lent", title: "🤝 Most lent", entries: t.lent },
    { key: "relocated", title: "📦 Most moved", entries: t.relocated },
  ].filter((c) => c.entries.length > 0);

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-200">
        🔥 Trending{" "}
        <span className="font-normal text-slate-500">· last 90 days</span>
      </h3>
      {/* grid-cols-1 (minmax(0,1fr)) clamps the mobile track so long nowrap
          item names truncate instead of pushing the column past the card. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {columns.map((c) => (
          <div key={c.key}>
            <p className={`mb-1.5 ${SECTION_LABEL_CLASS}`}>
              {c.title}
            </p>
            <ul className="flex flex-col gap-0.5">
              {c.entries.map((e) => (
                <li key={e.item.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(e.item)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left text-xs text-slate-300 transition hover:bg-slate-800/60 hover:text-slate-100"
                  >
                    <span className="min-w-0 truncate">{e.item.name}</span>
                    <span className="shrink-0 tabular-nums text-slate-500">
                      {e.count}×
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export default TrendingPanel;
