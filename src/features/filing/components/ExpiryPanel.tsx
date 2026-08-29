"use client";

// What you hold, and when each piece stops being valid.
//
// Separate from "Coming up" on purpose: an expiring passport is not the same
// kind of fact as an unpaid invoice. You can't settle it late, the consequence
// is being turned away at a desk, and the lead time is months. So this lists
// EVERYTHING with a validity date — including the licence that's fine for
// another three years — rather than filtering to what's imminent.

import { EmptyState } from "@/components/ui/EmptyState";
import {
  EXPIRY_STATUS_LABELS,
  TRAVEL_VALIDITY_MONTHS,
  groupByStatus,
  type ExpiryItem,
  type ExpiryStatus,
} from "@/features/filing/lib/expiry";
import { relativeDue } from "@/features/filing/lib/obligations";
import { DOC_TYPES } from "@/features/filing/lib/types";

const TONE: Record<ExpiryStatus, string> = {
  expired: "text-red-400",
  critical: "text-amber-400",
  soon: "text-slate-300",
  ok: "text-slate-400",
};

const docIcon = (t?: string) => DOC_TYPES.find((d) => d.id === (t ?? ""))?.icon ?? "📄";

export function ExpiryPanel({
  items,
  connected,
  onRenew,
  onOpen,
}: {
  items: ExpiryItem[];
  /** Expiry dates live on the cloud copy, not the slim on-device cache. */
  connected: boolean;
  /** Mark this occurrence done — a repeat rolls forward one period. */
  onRenew: (documentId: string, obligationId: string) => void;
  onOpen: (documentId: string) => void;
}) {
  const groups = groupByStatus(items);
  const travelBlocked = items.filter((i) => i.travelValid === false);

  return (
    <section className="px-3 sm:px-0">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Valid until
        </h3>
        {items.length > 0 && (
          <span className="text-[11px] tabular-nums text-slate-500">
            {items.length} tracked
          </span>
        )}
      </div>

      {groups.length === 0 ? (
        connected ? (
          <EmptyState>
            Nothing with an expiry date yet. Add a passport, licence or permit and
            give it a &ldquo;renew&rdquo; or &ldquo;expires&rdquo; reminder — this
            is where you&rsquo;ll see how long each one has left.
          </EmptyState>
        ) : (
          // The on-device cache keeps only what the list, badge and queues need
          // (ANALYSIS-FILING-LOG.md §7); the dates themselves come from the cloud
          // copy. Saying so beats an empty list that looks like lost data.
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-300/90">
            Expiry dates aren&rsquo;t loaded on this device yet — they live in your
            account rather than the local cache. Sign in to sync and they&rsquo;ll
            appear here. Anything you add now is kept and pushed up when you do.
          </p>
        )
      ) : (
        <div className="flex flex-col gap-4">
          {travelBlocked.length > 0 && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-300/90">
              {travelBlocked.length === 1
                ? "One passport has"
                : `${travelBlocked.length} passports have`}{" "}
              under {TRAVEL_VALIDITY_MONTHS} months left. Many countries refuse
              entry — and airlines refuse boarding — below that, even though the
              passport is still in date. Check your destination&rsquo;s rule.
            </p>
          )}

          {groups.map(([status, list]) => (
            <div key={status}>
              <p
                className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${TONE[status]}`}
              >
                {EXPIRY_STATUS_LABELS[status]}
                <span className="ml-1.5 font-normal tabular-nums opacity-70">
                  {list.length}
                </span>
              </p>
              <ul className="flex flex-col gap-1">
                {list.map(({ document, obligation, folder, expiresOn, daysLeft, travelValid, travelCutoff }) => (
                  <li
                    key={`${document.id}-${obligation.id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-800/70 bg-slate-900/50 px-4 py-3"
                  >
                    <span aria-hidden className="shrink-0">
                      {docIcon(document.docType)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpen(document.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm font-semibold text-slate-100">
                        {obligation.label || document.title}
                      </span>
                      <span className="block truncate text-[12px] text-slate-500">
                        {obligation.label ? `${document.title} · ` : ""}
                        {folder ? folder.name : "Unfiled"}
                        {travelValid === false && travelCutoff
                          ? ` · travel-valid until ${travelCutoff}`
                          : ""}
                      </span>
                    </button>
                    <span
                      className={`shrink-0 text-[12px] font-medium tabular-nums ${
                        daysLeft < 0 ? "text-red-400" : TONE[status]
                      }`}
                    >
                      {expiresOn} · {relativeDue(daysLeft)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRenew(document.id, obligation.id)}
                      className="shrink-0 rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-300"
                    >
                      Renewed
                    </button>
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
