"use client";

// What's due, grouped the way you'd worry about it. One surface — Phase 4 folds
// the shred queue in here rather than building a second one.

import { EmptyState } from "@/components/ui/EmptyState";
import { formatPath } from "@/features/filing/lib/breadcrumb";
import {
  BUCKET_LABELS,
  groupByBucket,
  relativeDue,
  type Bucket,
  type DueItem,
} from "@/features/filing/lib/obligations";
import { OBLIGATION_KINDS } from "@/features/filing/lib/types";

const kindIcon = (k: string) =>
  OBLIGATION_KINDS.find((o) => o.id === k)?.icon ?? "🔔";

const BUCKET_TONE: Record<Bucket, string> = {
  overdue: "text-red-400",
  week: "text-amber-400",
  month: "text-slate-300",
  later: "text-slate-400",
};

export function UpcomingPanel({
  items,
  trailFor,
  onComplete,
}: {
  items: DueItem[];
  /** Root→leaf trail of the folder the paper sits in. */
  trailFor: (documentId: string) => string[];
  onComplete: (documentId: string, obligationId: string) => void;
}) {
  const groups = groupByBucket(items);

  return (
    <section className="px-3 sm:px-0">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Coming up
        </h3>
        {items.length > 0 && (
          <span className="text-[11px] tabular-nums text-slate-500">
            {items.length} to handle
          </span>
        )}
      </div>

      {groups.length === 0 ? (
        <EmptyState>
          Nothing due. Add a renewal or payment date to a paper and it&rsquo;ll
          show up here before it bites.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([bucket, list]) => (
            <div key={bucket}>
              <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${BUCKET_TONE[bucket]}`}>
                {BUCKET_LABELS[bucket]}
                <span className="ml-1.5 font-normal tabular-nums opacity-70">
                  {list.length}
                </span>
              </p>
              <ul className="flex flex-col gap-1">
                {list.map(({ document, obligation, daysAway }) => {
                  const trail = trailFor(document.id);
                  return (
                    <li
                      key={`${document.id}-${obligation.id}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-800/70 bg-slate-900/50 px-4 py-3"
                    >
                      <span aria-hidden>{kindIcon(obligation.kind)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-100">
                          {obligation.label || document.title}
                        </p>
                        <p className="truncate text-[12px] text-slate-500">
                          {obligation.label ? `${document.title} · ` : ""}
                          {formatPath(trail, "Unfiled")}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-[12px] font-medium tabular-nums ${
                          daysAway < 0 ? "text-red-400" : "text-slate-400"
                        }`}
                      >
                        {obligation.dueOn} · {relativeDue(daysAway)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onComplete(document.id, obligation.id)}
                        className="shrink-0 rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-300"
                      >
                        Done
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
