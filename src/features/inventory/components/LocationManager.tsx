"use client";

import { useMemo, useState } from "react";

import { Modal } from "@/components/Modal";
import { Check, Pencil, Plus, Trash2, X } from "@/components/icons";
import {
  flattenTree,
  type LocationNode,
} from "@/features/inventory/hooks/useInventoryLocations";

type LocationManagerProps = {
  open: boolean;
  tree: LocationNode[];
  countByLocation: Record<string, number>;
  onAdd: (name: string, parentId: string | null) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onPrintLabels: () => Promise<void>;
  onSeedCommon?: () => void; // seed a handful of common rooms (empty-state only)
  onClose: () => void;
};

const fieldClass =
  "w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none";

export function LocationManager({
  open,
  tree,
  countByLocation,
  onAdd,
  onRename,
  onRemove,
  onPrintLabels,
  onSeedCommon,
  onClose,
}: LocationManagerProps) {
  const flat = useMemo(() => flattenTree(tree), [tree]);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [printing, setPrinting] = useState(false);

  const printLabels = async () => {
    setPrinting(true);
    try {
      await onPrintLabels();
    } finally {
      setPrinting(false);
    }
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name, parentId || null);
    setName("");
  };

  const commitRename = () => {
    if (editingId && editName.trim()) onRename(editingId, editName);
    setEditingId(null);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      label="Manage locations"
      panelClassName="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-50">Locations</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition hover:text-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Rooms, shelves, boxes — nest them however you store things.
      </p>

      <form onSubmit={add} className="mt-4 flex flex-col gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New location (e.g. Garage)"
          aria-label="New location name"
          className={fieldClass}
        />
        <div className="flex gap-2">
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            aria-label="Parent location"
            className={fieldClass}
          >
            <option value="">Top level</option>
            {flat.map((l) => (
              <option key={l.id} value={l.id}>
                {`${"  ".repeat(l.depth)}${l.name}`}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </form>

      <ul className="mt-4 flex flex-col gap-1">
        {flat.length === 0 && (
          <li className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-700/70 px-3 py-6 text-center text-sm text-slate-500">
            <span>No locations yet.</span>
            {onSeedCommon && (
              <button
                type="button"
                onClick={onSeedCommon}
                className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-sky-400 hover:text-sky-300"
              >
                Add common rooms
              </button>
            )}
          </li>
        )}
        {flat.map((l) => (
          <li
            key={l.id}
            className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-800/40"
            style={{ paddingLeft: `${0.5 + l.depth * 1.1}rem` }}
          >
            {editingId === l.id ? (
              <>
                <input
                  type="text"
                  value={editName}
                  autoFocus
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className={`${fieldClass} py-1`}
                />
                <button
                  type="button"
                  onClick={commitRename}
                  aria-label="Save name"
                  className="shrink-0 text-emerald-400 transition hover:text-emerald-300"
                >
                  <Check className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                  {l.name}
                  {countByLocation[l.id] > 0 && (
                    <span className="ml-1.5 text-xs text-slate-500 tabular-nums">
                      {countByLocation[l.id]}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(l.id);
                    setEditName(l.name);
                  }}
                  aria-label={`Rename ${l.name}`}
                  className="shrink-0 text-slate-500 opacity-100 transition hover:text-blue-300 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(l.id)}
                  aria-label={`Delete ${l.name}`}
                  className="shrink-0 text-slate-500 opacity-100 transition hover:text-red-300 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      {flat.length > 0 && (
        <button
          type="button"
          onClick={printLabels}
          disabled={printing}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300 disabled:opacity-50"
        >
          🏷️ {printing ? "Preparing labels…" : "Print QR labels"}
        </button>
      )}

      <p className="mt-3 text-[11px] text-slate-500">
        Deleting a location keeps its items (they become Unassigned) and lifts any
        nested locations up a level. Print QR labels to stick on boxes — scan one
        to see what&apos;s inside without unpacking.
      </p>
    </Modal>
  );
}

export default LocationManager;
