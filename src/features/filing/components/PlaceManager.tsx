"use client";

// The furniture: a nestable tree of sites, rooms, cabinets and drawers. Modelled
// on the inventory pillar's LocationManager, but the vocabulary is paper's —
// a drawer, not a bin.

import { useState } from "react";

import { Modal } from "@/components/Modal";
import { Trash, Plus } from "@/components/icons";
import { Input, Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { flattenTree, type PlaceNode } from "@/features/filing/lib/tree";
import { PLACE_KINDS, type PlaceKind } from "@/features/filing/lib/types";

const kindIcon = (kind?: PlaceKind) =>
  PLACE_KINDS.find((k) => k.id === (kind ?? ""))?.icon ?? "📍";

export function PlaceManager({
  open,
  onClose,
  tree,
  addPlace,
  updatePlace,
  movePlace,
  removePlace,
  countByPlace,
}: {
  open: boolean;
  onClose: () => void;
  tree: PlaceNode[];
  addPlace: (name: string, parentId: string | null, kind?: PlaceKind) => unknown;
  updatePlace: (id: string, patch: { name?: string; kind?: PlaceKind }) => void;
  movePlace: (id: string, parentId: string | null) => boolean;
  removePlace: (id: string) => void;
  countByPlace: Record<string, number>;
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [kind, setKind] = useState<PlaceKind | "">("");
  const [moveError, setMoveError] = useState<string | null>(null);

  const flat = flattenTree(tree);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    addPlace(name, parentId || null, kind || undefined);
    setName("");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="filing-places-title"
      panelClassName="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <h2 id="filing-places-title" className="text-lg font-semibold tracking-tight text-slate-50">
        Places
      </h2>
      <p className="mt-1 text-[13px] text-slate-400">
        Where paper physically lives — a location, a room, a cabinet, a drawer.
        Nest them as deep as your house actually goes.
      </p>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-2">
        <SectionLabel>Add a place</SectionLabel>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Grey cabinet"
          aria-label="Place name"
        />
        <div className="flex gap-2">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as PlaceKind | "")}
            aria-label="Kind of place"
          >
            {PLACE_KINDS.map((k) => (
              <option key={k.id || "none"} value={k.id}>
                {k.icon} {k.label}
              </option>
            ))}
          </Select>
          <Select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            aria-label="Inside"
          >
            <option value="">Top level</option>
            {flat.map((p) => (
              <option key={p.id} value={p.id}>
                {" ".repeat(p.depth * 2)}
                {p.name}
              </option>
            ))}
          </Select>
          <button
            type="submit"
            disabled={!name.trim()}
            className="shrink-0 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            <span className="sr-only">Add place</span>
          </button>
        </div>
      </form>

      <div className="mt-6">
        <SectionLabel>Your places</SectionLabel>
        {flat.length === 0 ? (
          <EmptyState className="mt-2">
            No places yet. Start with where the cabinet is — &ldquo;Home
            office&rdquo;, then &ldquo;Grey cabinet&rdquo;, then &ldquo;Drawer
            1&rdquo;.
          </EmptyState>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {flat.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-slate-800/60"
                style={{ paddingLeft: `${p.depth * 16 + 8}px` }}
              >
                <span aria-hidden>{kindIcon(p.kind)}</span>
                <input
                  value={p.name}
                  onChange={(e) => updatePlace(p.id, { name: e.target.value })}
                  aria-label={`Rename ${p.name}`}
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none focus:text-blue-200"
                />
                {countByPlace[p.id] ? (
                  <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-300">
                    {countByPlace[p.id]}
                  </span>
                ) : null}
                <select
                  value={p.parentId ?? ""}
                  onChange={(e) => {
                    const ok = movePlace(p.id, e.target.value || null);
                    setMoveError(
                      ok ? null : `“${p.name}” can't move inside itself.`
                    );
                  }}
                  aria-label={`Move ${p.name}`}
                  className="shrink-0 rounded-md border border-slate-700 bg-slate-950/60 px-1.5 py-1 text-[11px] text-slate-300 outline-none focus:border-blue-400"
                >
                  <option value="">Top level</option>
                  {flat
                    .filter((o) => o.id !== p.id)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={() => removePlace(p.id)}
                  aria-label={`Delete ${p.name}`}
                  className="shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-red-500/15 hover:text-red-300"
                >
                  <Trash className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {moveError && <p className="mt-2 text-xs text-red-400">{moveError}</p>}
        <p className="mt-3 text-[12px] text-slate-500">
          Deleting a place keeps everything inside it — the places under it move
          up to the top level, and folders lose only that one hop.
        </p>
      </div>
    </Modal>
  );
}
