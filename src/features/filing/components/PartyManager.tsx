"use client";

// Whose paper this is. A label on a folder inside ONE account — not a second
// user, and not household multi-user (ruled out in ENGAGEMENT-ROADMAP.md).
// Nobody else signs in; nothing is shared between accounts.

import { useState } from "react";

import { Modal } from "@/components/Modal";
import { Trash, Plus } from "@/components/icons";
import { Input, Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionLabel } from "@/components/ui/SectionLabel";
import {
  PARTY_KINDS,
  TAB_COLORS,
  type FilingParty,
  type PartyKind,
  type TabColor,
} from "@/features/filing/lib/types";

const SWATCH: Record<TabColor, string> = {
  slate: "bg-slate-400",
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  violet: "bg-violet-500",
  teal: "bg-teal-500",
};

const kindIcon = (kind: PartyKind) =>
  PARTY_KINDS.find((k) => k.id === kind)?.icon ?? "🏷️";

export function PartyManager({
  open,
  onClose,
  parties,
  addParty,
  updateParty,
  removeParty,
  countByParty,
}: {
  open: boolean;
  onClose: () => void;
  parties: FilingParty[];
  addParty: (name: string, kind: PartyKind, color?: TabColor) => unknown;
  updateParty: (id: string, patch: Partial<Omit<FilingParty, "id">>) => void;
  removeParty: (id: string) => void;
  countByParty: Record<string, number>;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PartyKind>("family");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    addParty(name, kind);
    setName("");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="filing-parties-title"
      panelClassName="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <h2 id="filing-parties-title" className="text-lg font-semibold tracking-tight text-slate-50">
        People &amp; clients
      </h2>
      <p className="mt-1 text-[13px] text-slate-400">
        Tag a folder with whose paper it is, then see everything of theirs at
        once. These are labels in your own account — nobody else signs in.
      </p>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-2">
        <SectionLabel>Add someone</SectionLabel>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mom, or Acme Ltd"
            aria-label="Name"
          />
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as PartyKind)}
            aria-label="Kind"
            className="max-w-[9rem]"
          >
            {PARTY_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.icon} {k.label}
              </option>
            ))}
          </Select>
          <button
            type="submit"
            disabled={!name.trim()}
            className="shrink-0 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            <span className="sr-only">Add</span>
          </button>
        </div>
      </form>

      <div className="mt-6">
        <SectionLabel>Everyone</SectionLabel>
        {parties.length === 0 ? (
          <EmptyState className="mt-2">
            Nobody yet. Add a family member or a client to group their folders.
          </EmptyState>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {parties.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-slate-800/60"
              >
                <span aria-hidden>{kindIcon(p.kind)}</span>
                <input
                  value={p.name}
                  onChange={(e) => updateParty(p.id, { name: e.target.value })}
                  aria-label={`Rename ${p.name}`}
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none focus:text-blue-200"
                />
                <div className="flex shrink-0 items-center gap-1" role="group" aria-label={`Colour for ${p.name}`}>
                  {TAB_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => updateParty(p.id, { color: c })}
                      aria-label={c}
                      aria-pressed={p.color === c}
                      className={`h-4 w-4 rounded-full transition ${SWATCH[c]} ${
                        p.color === c
                          ? "ring-2 ring-slate-100 ring-offset-1 ring-offset-slate-900"
                          : "opacity-50 hover:opacity-100"
                      }`}
                    />
                  ))}
                </div>
                {countByParty[p.id] ? (
                  <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-300">
                    {countByParty[p.id]}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeParty(p.id)}
                  aria-label={`Delete ${p.name}`}
                  className="shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-red-500/15 hover:text-red-300"
                >
                  <Trash className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
