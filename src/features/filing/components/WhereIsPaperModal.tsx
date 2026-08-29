"use client";

// "Where is this paper?" — the one question the pillar exists to answer, given
// its own focused surface so it can be reached from ⌘K without hunting for the
// search box. Leads with WHERE, because that is what you are standing in front
// of a cabinet needing to know.

import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/Modal";
import { Input } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatPath, isCheckedOut } from "@/features/filing/lib/breadcrumb";
import { searchFiling, type SearchInput } from "@/features/filing/lib/filingSearch";
import { DOC_TYPES } from "@/features/filing/lib/types";

const docIcon = (t?: string) => DOC_TYPES.find((d) => d.id === (t ?? ""))?.icon ?? "📄";

export function WhereIsPaperModal({
  open,
  onClose,
  data,
  partyNameById,
  onOpenFolder,
}: {
  open: boolean;
  onClose: () => void;
  data: SearchInput;
  partyNameById: Record<string, string>;
  onOpenFolder?: (folderId: string) => void;
}) {
  const [query, setQuery] = useState("");

  // Reopening should start clean — the last thing you looked for is rarely the
  // next thing you need.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const hits = useMemo(() => searchFiling(data, query, 8), [data, query]);
  const asked = query.trim().length >= 2;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="filing-where-title"
      panelClassName="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <h2 id="filing-where-title" className="text-lg font-semibold tracking-tight text-slate-50">
        Where is it?
      </h2>
      <p className="mt-1 text-[13px] text-slate-400">
        Ask the way you&rsquo;d ask a person — &ldquo;where&rsquo;s my car
        title?&rdquo;
      </p>

      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="car title"
        aria-label="What are you looking for?"
        className="mt-4"
      />

      <div className="mt-4 flex flex-col gap-2">
        {!asked ? (
          <p className="text-[13px] text-slate-500">
            Type at least two letters. Nicknames work too, if you gave the folder
            any.
          </p>
        ) : hits.length === 0 ? (
          <EmptyState>
            Nothing matches that. Try a shorter word — or add it as a nickname on
            the folder so it works next time.
          </EmptyState>
        ) : (
          hits.map((hit) => {
            const isFolder = hit.kind === "folder";
            const name = isFolder ? hit.folder.name : hit.document.title;
            const party = isFolder
              ? hit.folder.partyId
              : hit.document.partyId ?? hit.folder?.partyId;
            const folderId = isFolder ? hit.folder.id : hit.folder?.id;
            return (
              <button
                key={isFolder ? `f-${hit.folder.id}` : `d-${hit.document.id}`}
                type="button"
                onClick={() => {
                  if (folderId && onOpenFolder) onOpenFolder(folderId);
                  onClose();
                }}
                className="rounded-xl border border-slate-800/70 bg-slate-900/50 px-4 py-3 text-left transition hover:border-blue-400/60"
              >
                {/* The answer first: where it is. */}
                <p className="text-sm font-semibold text-blue-300">
                  {formatPath(hit.trail, "Unfiled — no place yet")}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-slate-300">
                  <span aria-hidden>
                    {isFolder ? "🗂️" : docIcon(hit.document.docType)}
                  </span>
                  {name}
                  {party && partyNameById[party] && (
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                      {partyNameById[party]}
                    </span>
                  )}
                  {isFolder && isCheckedOut(hit.folder) && (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                      out — not in its usual place
                    </span>
                  )}
                </p>
              </button>
            );
          })
        )}
      </div>
    </Modal>
  );
}
