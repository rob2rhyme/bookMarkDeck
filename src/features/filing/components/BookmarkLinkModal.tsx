"use client";

// Linking a paper to the online account it belongs to — the connection that
// earns this pillar its place in a bookmark app (ANALYSIS-FILING-LOG.md §2).
// The insurance policy in Drawer 2 and the insurer's login page become one
// record, so "where is it?" is answered for both halves at once.

import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Field";
import { SectionLabel } from "@/components/ui/SectionLabel";
import {
  displayHost,
  readBookmarks,
  searchBookmarks,
  suggestForTitle,
  type LinkableBookmark,
} from "@/features/filing/lib/bookmarks";
import type { FilingDocument } from "@/features/filing/lib/types";

export function BookmarkLinkModal({
  open,
  onClose,
  document: paper,
  email,
  onLink,
  onUnlink,
}: {
  open: boolean;
  onClose: () => void;
  document: FilingDocument | null;
  email?: string | null;
  onLink: (documentId: string, link: { id: string; title: string; url: string }) => void;
  onUnlink: (documentId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [all, setAll] = useState<LinkableBookmark[]>([]);

  // Read on open rather than on mount: bookmarks may have changed since the
  // dashboard loaded, and this is a cheap localStorage read.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setAll(readBookmarks(email));
  }, [open, email]);

  const suggestion = useMemo(
    () => (paper && !query.trim() ? suggestForTitle(all, paper.title) : null),
    [all, paper, query]
  );

  const results = useMemo(() => searchBookmarks(all, query), [all, query]);

  if (!paper) return null;

  const link = (b: LinkableBookmark) => {
    onLink(paper.id, { id: b.id, title: b.title, url: b.url });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="filing-link-title"
      panelClassName="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <h2 id="filing-link-title" className="text-lg font-semibold tracking-tight text-slate-50">
        Link an account
      </h2>
      <p className="mt-1 text-[13px] text-slate-400">
        The site this paper belongs to — the insurer, the bank, the agency. Then the
        paper and the site are one record. Keep the password itself in a password
        manager like Bitwarden or 1Password, not here.
      </p>

      {paper.bookmarkLink && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2">
          <span aria-hidden className="shrink-0">
            🔗
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-slate-200">{paper.bookmarkLink.title}</p>
            <p className="truncate text-[11px] text-slate-500">
              {displayHost(paper.bookmarkLink.url)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onUnlink(paper.id);
              onClose();
            }}
            className="shrink-0 rounded-full border border-slate-700 px-2.5 py-0.5 text-[11px] font-semibold text-slate-200 transition hover:border-red-400 hover:text-red-300"
          >
            Unlink
          </button>
        </div>
      )}

      {all.length === 0 ? (
        <EmptyState className="mt-5">
          No bookmarks on this device yet. Save the site in Bookmarks first, then
          come back and link it.
        </EmptyState>
      ) : (
        <>
          <div className="mt-5">
            <SectionLabel>Find it</SectionLabel>
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="geico, aetna, irs…"
              aria-label="Search bookmarks"
              className="mt-1"
            />
          </div>

          {suggestion && !paper.bookmarkLink && (
            <button
              type="button"
              onClick={() => link(suggestion)}
              className="mt-3 flex w-full items-center gap-2 rounded-lg border border-dashed border-blue-500/40 px-3 py-2 text-left transition hover:border-blue-400"
            >
              <span aria-hidden className="shrink-0">
                ✨
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-slate-200">{suggestion.title}</span>
                <span className="block truncate text-[11px] text-slate-500">
                  Looks like a match for &ldquo;{paper.title}&rdquo;
                </span>
              </span>
            </button>
          )}

          <ul className="mt-3 flex flex-col gap-1">
            {results.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => link(b)}
                  className="flex w-full items-center gap-2 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2 text-left transition hover:border-blue-400"
                >
                  <span aria-hidden className="shrink-0">
                    🔖
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-200">{b.title}</span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {displayHost(b.url)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {results.length === 0 && query.trim() && (
            <EmptyState className="mt-3">No bookmark matches that.</EmptyState>
          )}
        </>
      )}
    </Modal>
  );
}
