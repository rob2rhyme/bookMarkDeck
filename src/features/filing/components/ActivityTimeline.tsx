"use client";

// What happened to this thing, newest first. Both a paper and a folder keep one,
// which is what makes "mark shredded" a receipt rather than a deletion.

import { EmptyState } from "@/components/ui/EmptyState";
import type { FilingActivity, FilingActivityType } from "@/features/filing/lib/types";

const ENTRY: Record<FilingActivityType, { icon: string; verb: string }> = {
  filed: { icon: "📥", verb: "Filed" },
  moved: { icon: "↔️", verb: "Moved" },
  taken: { icon: "📤", verb: "Taken out" },
  returned: { icon: "📥", verb: "Returned" },
  renewed: { icon: "🔄", verb: "Renewed" },
  paid: { icon: "💳", verb: "Paid" },
  reviewed: { icon: "👀", verb: "Reviewed" },
  shredded: { icon: "🗑️", verb: "Destroyed" },
  copied: { icon: "🖨️", verb: "Copied" },
  note: { icon: "📝", verb: "Note" },
};

/** "27 Aug 2026, 19:41" — the local reading of an ISO stamp. */
function when(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function detail(a: FilingActivity): string | null {
  const parts: string[] = [];
  if (a.fromPlace || a.toPlace) {
    parts.push(`${a.fromPlace ?? "somewhere"} → ${a.toPlace ?? "somewhere"}`);
  }
  if (a.to) parts.push(a.to);
  if (a.note) parts.push(a.note);
  return parts.length ? parts.join(" · ") : null;
}

export function ActivityTimeline({
  activity,
  emptyText = "Nothing recorded yet.",
  limit = 40,
}: {
  activity?: FilingActivity[];
  emptyText?: string;
  limit?: number;
}) {
  const entries = [...(activity ?? [])]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);

  if (entries.length === 0) return <EmptyState className="mt-3">{emptyText}</EmptyState>;

  return (
    <ol className="mt-3 flex flex-col gap-1">
      {entries.map((a) => {
        const meta = ENTRY[a.type] ?? ENTRY.note;
        const sub = detail(a);
        return (
          <li key={a.id} className="flex items-start gap-2 px-1 py-1.5">
            <span aria-hidden className="shrink-0 text-sm leading-5">
              {meta.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-slate-200">
                {meta.verb}
                {sub ? <span className="text-slate-400"> — {sub}</span> : null}
              </p>
              <p className="text-[11px] tabular-nums text-slate-500">{when(a.at)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
