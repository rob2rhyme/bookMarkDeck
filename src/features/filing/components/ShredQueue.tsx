"use client";

// Papers whose retention has run out. This is a REVIEW QUEUE, not a delete
// timer: nothing here removes anything on its own. You confirm, and the paper
// keeps a receipt on its timeline saying it was destroyed and when.
//
// It shares the Attention surface with what's due (UpcomingPanel) rather than
// getting a panel of its own — one place to look, two kinds of thing.

import { EmptyState } from "@/components/ui/EmptyState";
import { BUCKET_LABELS, relativeDue, type Bucket } from "@/features/filing/lib/obligations";
import {
  RETENTION_ACTION_LABELS,
  groupShredByBucket,
  type ShredItem,
} from "@/features/filing/lib/retention";

const BUCKET_TONE: Record<Bucket, string> = {
  overdue: "text-red-400",
  week: "text-amber-400",
  month: "text-slate-300",
  later: "text-slate-400",
};

export function ShredQueue({
  items,
  onShred,
  onReviewed,
  onHold,
}: {
  items: ShredItem[];
  onShred: (documentId: string) => void;
  onReviewed: (documentId: string) => void;
  /** Put the whole folder on hold — the consumer form of a legal hold. */
  onHold: (folderId: string) => void;
}) {
  const groups = groupShredByBucket(items);

  return (
    <section className="px-3 sm:px-0">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Ready to clear
        </h3>
        {items.length > 0 && (
          <span className="text-[11px] tabular-nums text-slate-500">
            {items.length} to review
          </span>
        )}
      </div>

      {groups.length === 0 ? (
        <EmptyState>
          Nothing to clear. Give a folder a retention rule and its papers will
          show up here once they&rsquo;ve aged out.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([bucket, list]) => (
            <div key={bucket}>
              <p
                className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${BUCKET_TONE[bucket]}`}
              >
                {BUCKET_LABELS[bucket]}
                <span className="ml-1.5 font-normal tabular-nums opacity-70">
                  {list.length}
                </span>
              </p>
              <ul className="flex flex-col gap-1">
                {list.map(({ document, folder, rule, destroyOn, daysAway }) => (
                  <li
                    key={document.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-800/70 bg-slate-900/50 px-4 py-3"
                  >
                    <span aria-hidden className="shrink-0">
                      {rule.action === "shred" ? "🗑️" : rule.action === "archive" ? "📦" : "👀"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-100">
                        {document.title}
                      </p>
                      <p className="truncate text-[12px] text-slate-500">
                        {folder ? `${folder.name} · ` : "Unfiled · "}
                        {rule.label}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-[12px] font-medium tabular-nums ${
                        daysAway < 0 ? "text-red-400" : "text-slate-400"
                      }`}
                    >
                      {destroyOn} · {relativeDue(daysAway)}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onShred(document.id)}
                        className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-red-400 hover:text-red-300"
                      >
                        {RETENTION_ACTION_LABELS[rule.action]}
                      </button>
                      <button
                        type="button"
                        onClick={() => onReviewed(document.id)}
                        className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
                      >
                        Keep
                      </button>
                      {folder && (
                        <button
                          type="button"
                          onClick={() => onHold(folder.id)}
                          title="Pause the reminder for this whole folder without changing the date"
                          className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-amber-400 hover:text-amber-300"
                        >
                          Hold
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
