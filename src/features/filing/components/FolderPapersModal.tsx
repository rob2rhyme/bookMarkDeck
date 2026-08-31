"use client";

// What's actually in a folder. The bridge from "I found the folder" to "I want
// to do something with this paper" — edit it, move it, or set a reminder.

import { Modal } from "@/components/Modal";
import { Trash } from "@/components/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActivityTimeline } from "@/features/filing/components/ActivityTimeline";
import { SECTION_LABEL_CLASS } from "@/components/ui/SectionLabel";
import { formatPath } from "@/features/filing/lib/breadcrumb";
import { bucketOf, relativeDue, daysBetween } from "@/features/filing/lib/obligations";
import { DOC_TYPES, type FilingDocument, type FilingFolder } from "@/features/filing/lib/types";

const docIcon = (t?: string) => DOC_TYPES.find((d) => d.id === (t ?? ""))?.icon ?? "📄";

export function FolderPapersModal({
  open,
  onClose,
  folder,
  documents,
  trail,
  today,
  onEdit,
  onRemind,
  onLink,
  onScans,
  scansEnabled,
  onRemove,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  folder: FilingFolder | null;
  documents: FilingDocument[];
  trail: string[];
  today: string;
  onEdit: (d: FilingDocument) => void;
  onRemind: (documentId: string) => void;
  onLink: (documentId: string) => void;
  onScans: (documentId: string) => void;
  /** Withheld entirely when object storage isn't configured. */
  scansEnabled: boolean;
  onRemove: (documentId: string) => void;
  onAdd: () => void;
}) {
  if (!folder) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="filing-papers-title"
      panelClassName="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <h2 id="filing-papers-title" className="text-lg font-semibold tracking-tight text-slate-50">
        🗂️ {folder.name}
      </h2>
      <p className="mt-1 text-[13px] text-slate-400">
        {formatPath(trail.slice(0, -1), "No place set")}
      </p>

      {documents.length === 0 ? (
        <EmptyState className="mt-5">Nothing filed in here yet.</EmptyState>
      ) : (
        <ul className="mt-5 flex flex-col gap-1">
          {documents.map((d) => {
            const days = d.nextDueOn ? daysBetween(today, d.nextDueOn) : null;
            return (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2"
              >
                <span aria-hidden>{docIcon(d.docType)}</span>
                <button
                  type="button"
                  onClick={() => onEdit(d)}
                  className="min-w-0 flex-1 truncate text-left text-sm text-slate-200 transition hover:text-blue-300"
                >
                  {d.title}
                </button>
                {d.nextDueOn && days !== null && (
                  <span
                    className={`text-[11px] tabular-nums ${
                      bucketOf(d.nextDueOn, today) === "overdue"
                        ? "text-red-400"
                        : "text-slate-400"
                    }`}
                  >
                    {relativeDue(days)}
                  </span>
                )}
                {d.bookmarkLink && (
                  <a
                    href={d.bookmarkLink.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open ${d.bookmarkLink.title}`}
                    className="rounded-full border border-blue-500/40 px-2.5 py-0.5 text-[11px] font-semibold text-blue-300 transition hover:border-blue-400"
                  >
                    🔗 {d.bookmarkLink.title}
                  </a>
                )}
                {scansEnabled && (
                  <button
                    type="button"
                    onClick={() => onScans(d.id)}
                    className="rounded-full border border-slate-700 px-2.5 py-0.5 text-[11px] font-semibold text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
                  >
                    {d.hasAttachment ? "📎 Scans" : "Scan"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onLink(d.id)}
                  className="rounded-full border border-slate-700 px-2.5 py-0.5 text-[11px] font-semibold text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
                >
                  {d.bookmarkLink ? "Change" : "Link"}
                </button>
                <button
                  type="button"
                  onClick={() => onRemind(d.id)}
                  className="rounded-full border border-slate-700 px-2.5 py-0.5 text-[11px] font-semibold text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
                >
                  {d.obligations?.length ? "Reminders" : "Remind me"}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(d.id)}
                  aria-label={`Remove ${d.title}`}
                  className="rounded-md p-1 text-slate-500 transition hover:bg-red-500/15 hover:text-red-300"
                >
                  <Trash className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {(folder.activity?.length ?? 0) > 0 && (
        <details className="mt-5">
          <summary className={`cursor-pointer ${SECTION_LABEL_CLASS}`}>
            Where it&rsquo;s been
          </summary>
          <ActivityTimeline activity={folder.activity} />
        </details>
      )}

      <button
        type="button"
        onClick={onAdd}
        className="mt-5 w-full rounded-lg border border-dashed border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-blue-400 hover:text-blue-300"
      >
        + File another paper here
      </button>
    </Modal>
  );
}
