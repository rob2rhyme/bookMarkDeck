"use client";

// Creating or editing the thing you physically pull out of a drawer.
// Name + where it lives is enough; everything else is optional, because entry
// friction is what kills apps in this category (ANALYSIS-FILING-LOG.md §12).

import { useEffect, useState } from "react";

import { Modal } from "@/components/Modal";
import { Input, Select } from "@/components/ui/Field";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { flattenTree, type PlaceNode } from "@/features/filing/lib/tree";
import type { FilingFolder, FilingParty } from "@/features/filing/lib/types";

export type FolderDraft = {
  name: string;
  homePlaceId: string | null;
  partyId: string | null;
  category: string;
  aliases: string;
};

const EMPTY: FolderDraft = {
  name: "",
  homePlaceId: null,
  partyId: null,
  category: "",
  aliases: "",
};

export function FolderFormModal({
  open,
  onClose,
  onSubmit,
  editing,
  tree,
  parties,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (draft: FolderDraft) => void;
  editing?: FilingFolder | null;
  tree: PlaceNode[];
  parties: FilingParty[];
  categories: string[];
}) {
  const [draft, setDraft] = useState<FolderDraft>(EMPTY);
  const flat = flattenTree(tree);

  // Refill when the modal opens, so editing one folder then another doesn't
  // leave the previous values behind.
  useEffect(() => {
    if (!open) return;
    setDraft(
      editing
        ? {
            name: editing.name,
            homePlaceId: editing.homePlaceId,
            partyId: editing.partyId ?? null,
            category: editing.category ?? "",
            aliases: editing.aliases.join(", "),
          }
        : EMPTY
    );
  }, [open, editing]);

  const set = <K extends keyof FolderDraft>(k: K, v: FolderDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    onSubmit(draft);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="filing-folder-title"
      panelClassName="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="filing-folder-title" className="text-lg font-semibold tracking-tight text-slate-50">
          {editing ? "Edit folder" : "New folder"}
        </h2>
        <p className="text-[12px] text-slate-500">A name is enough</p>
      </div>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <div>
          <SectionLabel>Name</SectionLabel>
          <Input
            autoFocus
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Vehicles"
            aria-label="Folder name"
            className="mt-1"
          />
        </div>

        <div>
          <SectionLabel>Where it lives</SectionLabel>
          <Select
            value={draft.homePlaceId ?? ""}
            onChange={(e) => set("homePlaceId", e.target.value || null)}
            aria-label="Home place"
            className="mt-1"
          >
            <option value="">No place yet</option>
            {flat.map((p) => (
              <option key={p.id} value={p.id}>
                {" ".repeat(p.depth * 2)}
                {p.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <SectionLabel>Whose</SectionLabel>
            <Select
              value={draft.partyId ?? ""}
              onChange={(e) => set("partyId", e.target.value || null)}
              aria-label="Party"
              className="mt-1"
            >
              <option value="">Nobody in particular</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <SectionLabel>Category</SectionLabel>
            <Input
              list="filing-folder-categories"
              value={draft.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="Property"
              aria-label="Category"
              className="mt-1"
            />
            <datalist id="filing-folder-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>

        <div>
          <SectionLabel>Also call it</SectionLabel>
          <Input
            value={draft.aliases}
            onChange={(e) => set("aliases", e.target.value)}
            placeholder="car, auto, Taurus"
            aria-label="Aliases, comma separated"
            className="mt-1"
          />
          <p className="mt-1 text-[12px] text-slate-500">
            Comma separated. Every word here finds this folder later — so add the
            one you&rsquo;ll actually type at 11pm.
          </p>
        </div>

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!draft.name.trim()}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {editing ? "Save" : "Create folder"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
