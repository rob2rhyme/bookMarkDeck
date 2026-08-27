"use client";

// Who has what, and when it's wanted back — the charge-out card, digitised.
// Nothing here sets a "checked out" flag: sending a folder somewhere other than
// its home place IS being checked out, so the two can never disagree.

import { useState } from "react";

import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Field";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { formatPath } from "@/features/filing/lib/breadcrumb";
import { custodyItems } from "@/features/filing/lib/custody";
import { relativeDue } from "@/features/filing/lib/obligations";
import type { FilingFolder, FilingPlace } from "@/features/filing/lib/types";

export function CustodyModal({
  open,
  onClose,
  folders,
  places,
  placePaths,
  today,
  onCheckOut,
  onReturn,
}: {
  open: boolean;
  onClose: () => void;
  folders: FilingFolder[];
  places: FilingPlace[];
  placePaths: Record<string, string[]>;
  today: string;
  onCheckOut: (
    folderId: string,
    input: { toPlaceId: string | null; heldBy?: string | null; dueBack?: string | null }
  ) => void;
  onReturn: (folderId: string) => void;
}) {
  const [folderId, setFolderId] = useState("");
  const [toPlaceId, setToPlaceId] = useState("");
  const [heldBy, setHeldBy] = useState("");
  const [dueBack, setDueBack] = useState("");

  const out = custodyItems(folders, today);
  const home = folders.filter((f) => !f.archived && !out.some((o) => o.folder.id === f.id));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderId) return;
    onCheckOut(folderId, {
      toPlaceId: toPlaceId || null,
      heldBy: heldBy || null,
      dueBack: dueBack || null,
    });
    setFolderId("");
    setToPlaceId("");
    setHeldBy("");
    setDueBack("");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="filing-custody-title"
      panelClassName="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <h2 id="filing-custody-title" className="text-lg font-semibold tracking-tight text-slate-50">
        Who has what
      </h2>
      <p className="mt-1 text-[13px] text-slate-400">
        Folders that aren&rsquo;t where they live right now.
      </p>

      {out.length === 0 ? (
        <EmptyState className="mt-5">Everything is where it belongs.</EmptyState>
      ) : (
        <ul className="mt-5 flex flex-col gap-1">
          {out.map(({ folder, heldBy: who, since, dueBack: due, daysOut, daysAway, overdue }) => (
            <li
              key={folder.id}
              className="flex items-center gap-2 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2"
            >
              <span aria-hidden className="shrink-0">
                {overdue ? "🔴" : "📤"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-200">
                  {folder.name}
                  {who ? <span className="text-slate-400"> · {who}</span> : null}
                </p>
                <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                  <span>
                    {formatPath(
                      folder.currentPlaceId ? placePaths[folder.currentPlaceId] ?? [] : [],
                      "Place unknown"
                    )}
                  </span>
                  {since && <span>· out {daysOut} days</span>}
                  {due && (
                    <span className={overdue ? "text-red-400" : "text-slate-500"}>
                      · back {relativeDue(daysAway ?? 0)}
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onReturn(folder.id)}
                className="shrink-0 rounded-full border border-slate-700 px-2.5 py-0.5 text-[11px] font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-300"
              >
                Back home
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        <SectionLabel>Send one out</SectionLabel>

        <Select
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
          aria-label="Folder to send out"
        >
          <option value="">Pick a folder…</option>
          {home.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <SectionLabel>Where to</SectionLabel>
            <Select
              value={toPlaceId}
              onChange={(e) => setToPlaceId(e.target.value)}
              aria-label="Destination place"
              className="mt-1"
            >
              <option value="">Somewhere else</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatPath(placePaths[p.id] ?? [p.name], p.name)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <SectionLabel>Back by</SectionLabel>
            <Input
              type="date"
              value={dueBack}
              onChange={(e) => setDueBack(e.target.value)}
              aria-label="Due back"
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <SectionLabel>Who has it</SectionLabel>
          <Input
            value={heldBy}
            onChange={(e) => setHeldBy(e.target.value)}
            placeholder="Dad, the accountant…"
            aria-label="Held by"
            className="mt-1"
          />
        </div>

        <button
          type="submit"
          disabled={!folderId}
          className="mt-1 rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:opacity-40"
        >
          Check it out
        </button>
      </form>
    </Modal>
  );
}
