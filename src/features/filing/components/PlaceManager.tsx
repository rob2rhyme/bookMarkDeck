"use client";

// The furniture: a nestable tree of sites, rooms, cabinets and drawers. Modelled
// on the inventory pillar's LocationManager, but the vocabulary is paper's —
// a drawer, not a bin.
//
// A drawer can also say what it HOLDS ("A-J", "Taxes", "2019"), which is what
// turns the tree into something that can file for you — see lib/drawers.ts.

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

/** The older, denser field style the in-row controls have always used. */
const ROW_FIELD =
  "shrink-0 rounded-md border border-slate-700 bg-slate-950/60 px-1.5 py-1 text-[11px] text-slate-300 outline-none focus:border-blue-400";

export function PlaceManager({
  open,
  onClose,
  tree,
  addPlace,
  addCabinet,
  updatePlace,
  movePlace,
  removePlace,
  countByPlace,
}: {
  open: boolean;
  onClose: () => void;
  tree: PlaceNode[];
  addPlace: (
    name: string,
    parentId: string | null,
    kind?: PlaceKind,
    contents?: string
  ) => unknown;
  addCabinet: (
    name: string,
    parentId: string | null,
    drawerCount: number,
    scheme: "letters" | "numbers"
  ) => unknown;
  updatePlace: (
    id: string,
    patch: { name?: string; kind?: PlaceKind; contents?: string }
  ) => void;
  movePlace: (id: string, parentId: string | null) => boolean;
  removePlace: (id: string) => void;
  countByPlace: Record<string, number>;
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [kind, setKind] = useState<PlaceKind | "">("");
  const [contents, setContents] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);

  const [cabName, setCabName] = useState("");
  const [cabParent, setCabParent] = useState("");
  const [cabDrawers, setCabDrawers] = useState(4);
  const [cabScheme, setCabScheme] = useState<"letters" | "numbers">("letters");

  const flat = flattenTree(tree);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    addPlace(name, parentId || null, kind || undefined, contents || undefined);
    setName("");
    setContents("");
  }

  function submitCabinet(e: React.FormEvent) {
    e.preventDefault();
    if (!cabName.trim()) return;
    addCabinet(cabName, cabParent || null, cabDrawers, cabScheme);
    setCabName("");
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
                {" ".repeat(p.depth * 2)}
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
        <Input
          value={contents}
          onChange={(e) => setContents(e.target.value)}
          placeholder="Holds… A-J, Taxes, 2019 (optional)"
          aria-label="What this place holds"
        />
      </form>

      <details className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
        <summary className="cursor-pointer text-[13px] font-medium text-slate-300">
          Add a whole cabinet at once
        </summary>
        <form onSubmit={submitCabinet} className="mt-3 flex flex-col gap-2">
          <Input
            value={cabName}
            onChange={(e) => setCabName(e.target.value)}
            placeholder="Grey cabinet"
            aria-label="Cabinet name"
          />
          <div className="flex gap-2">
            <Select
              value={cabParent}
              onChange={(e) => setCabParent(e.target.value)}
              aria-label="Cabinet is inside"
            >
              <option value="">Top level</option>
              {flat.map((p) => (
                <option key={p.id} value={p.id}>
                  {" ".repeat(p.depth * 2)}
                  {p.name}
                </option>
              ))}
            </Select>
            <Select
              value={String(cabDrawers)}
              onChange={(e) => setCabDrawers(Number(e.target.value))}
              aria-label="How many drawers"
            >
              {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "drawer" : "drawers"}
                </option>
              ))}
            </Select>
          </div>
          <Select
            value={cabScheme}
            onChange={(e) => setCabScheme(e.target.value as "letters" | "numbers")}
            aria-label="How to label the drawers"
          >
            <option value="letters">Label them A–Z, split by drawer</option>
            <option value="numbers">Just number them</option>
          </Select>
          <button
            type="submit"
            disabled={!cabName.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            Add cabinet
          </button>
          <p className="text-[12px] text-slate-500">
            The A–Z split weighs the busy letters, so you get ranges like a real
            cabinet&rsquo;s rather than four equal slices with S and X in the
            same drawer. Retype any drawer&rsquo;s label afterwards.
          </p>
        </form>
      </details>

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
                className="rounded-lg px-2 py-1.5 transition hover:bg-slate-800/60"
                style={{ paddingLeft: `${p.depth * 16 + 8}px` }}
              >
                <div className="flex items-center gap-2">
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
                  <button
                    type="button"
                    onClick={() => removePlace(p.id)}
                    aria-label={`Delete ${p.name}`}
                    className="shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-red-500/15 hover:text-red-300"
                  >
                    <Trash className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-6">
                  <select
                    value={p.kind ?? ""}
                    onChange={(e) =>
                      updatePlace(p.id, {
                        kind: (e.target.value || undefined) as PlaceKind | undefined,
                      })
                    }
                    aria-label={`Kind of place for ${p.name}`}
                    className={ROW_FIELD}
                  >
                    {PLACE_KINDS.map((k) => (
                      <option key={k.id || "none"} value={k.id}>
                        {k.icon} {k.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={p.contents ?? ""}
                    onChange={(e) => updatePlace(p.id, { contents: e.target.value })}
                    placeholder="Holds… A-J"
                    aria-label={`What ${p.name} holds`}
                    className={`${ROW_FIELD} min-w-0 flex-1 shrink`}
                  />
                  <select
                    value={p.parentId ?? ""}
                    onChange={(e) => {
                      const ok = movePlace(p.id, e.target.value || null);
                      setMoveError(
                        ok ? null : `“${p.name}” can't move inside itself.`
                      );
                    }}
                    aria-label={`Move ${p.name}`}
                    className={ROW_FIELD}
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
                </div>
              </li>
            ))}
          </ul>
        )}
        {moveError && <p className="mt-2 text-xs text-red-400">{moveError}</p>}
        <p className="mt-3 text-[12px] text-slate-500">
          A drawer that says what it holds — <em>A-J</em>, <em>Taxes</em>,{" "}
          <em>2019</em>, <em>Misc.</em> — gets suggested when you file a folder,
          and prints that on its label. Deleting a place keeps everything inside
          it: the places under it move up to the top level, and folders lose only
          that one hop.
        </p>
      </div>
    </Modal>
  );
}
