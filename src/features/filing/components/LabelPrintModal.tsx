"use client";

// Printing the labels that make the physical half work. The QR and print libs
// load on demand, so nothing here is in the initial bundle.

import { useState } from "react";

import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { folderTrail } from "@/features/filing/lib/breadcrumb";
import type { FilingLabel } from "@/features/filing/lib/labels";
import { flattenTree, type PlaceNode } from "@/features/filing/lib/tree";
import type { FilingFolder } from "@/features/filing/lib/types";

type Scope = "places" | "folders" | "both";

export function LabelPrintModal({
  open,
  onClose,
  tree,
  folders,
  paths,
  partyNameById,
  countByPlace,
  countByFolder,
}: {
  open: boolean;
  onClose: () => void;
  tree: PlaceNode[];
  folders: FilingFolder[];
  paths: Record<string, string[]>;
  partyNameById: Record<string, string>;
  countByPlace: Record<string, number>;
  countByFolder: Record<string, number>;
}) {
  const [scope, setScope] = useState<Scope>("both");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const places = flattenTree(tree);
  const wantPlaces = scope !== "folders";
  const wantFolders = scope !== "places";
  const total = (wantPlaces ? places.length : 0) + (wantFolders ? folders.length : 0);

  async function print() {
    setBusy(true);
    setError(null);
    try {
      const { qrSvg } = await import("@/features/filing/lib/qr");
      const { labelUrl, filingLabelsHtml } = await import(
        "@/features/filing/lib/labels"
      );
      const { printHtml } = await import("@/utils/download");
      const origin = window.location.origin;

      const labels: FilingLabel[] = [];
      if (wantPlaces) {
        for (const p of places) {
          labels.push({
            id: p.id,
            kind: "place" as const,
            name: p.name,
            path: paths[p.id] ?? [p.name],
            count: countByPlace[p.id] ?? 0,
            qrSvg: await qrSvg(labelUrl(origin, "place", p.id)),
          });
        }
      }
      if (wantFolders) {
        for (const f of folders) {
          labels.push({
            id: f.id,
            kind: "folder" as const,
            name: f.name,
            path: folderTrail(f, paths),
            count: countByFolder[f.id] ?? 0,
            party: f.partyId ? partyNameById[f.partyId] : undefined,
            qrSvg: await qrSvg(labelUrl(origin, "folder", f.id)),
          });
        }
      }
      if (labels.length === 0) return;
      printHtml(filingLabelsHtml(labels));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't build the labels.");
    } finally {
      setBusy(false);
    }
  }

  const option = (value: Scope, label: string, hint: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setScope(value)}
      aria-pressed={scope === value}
      className={`flex-1 rounded-lg border px-3 py-2 text-left transition ${
        scope === value
          ? "border-blue-400/70 bg-blue-500/10"
          : "border-slate-700 hover:border-slate-500"
      }`}
    >
      <span className="block text-sm font-medium text-slate-100">{label}</span>
      <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span>
    </button>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="filing-labels-title"
      panelClassName="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <h2 id="filing-labels-title" className="text-lg font-semibold tracking-tight text-slate-50">
        Print labels
      </h2>
      <p className="mt-1 text-[13px] text-slate-400">
        Stick a QR on the drawer and on the folder. Scanning one opens this app
        filtered to it — so you can check a drawer without opening it.
      </p>

      <div className="mt-5">
        <SectionLabel>What to print</SectionLabel>
        <div className="mt-2 flex gap-2">
          {option("both", "Both", `${places.length} places · ${folders.length} folders`)}
          {option("places", "Places", "Drawer fronts")}
          {option("folders", "Folders", "Folder edges")}
        </div>
      </div>

      {total === 0 ? (
        <EmptyState className="mt-4">
          Nothing to label yet — add a place or a folder first.
        </EmptyState>
      ) : (
        <p className="mt-4 text-[12px] text-slate-500">
          {total} label{total === 1 ? "" : "s"}. Places print as square cards for
          a drawer front; folders print as wide strips for a folder&rsquo;s front
          edge, because that&rsquo;s how you read them in a drawer.
        </p>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={print}
          disabled={busy || total === 0}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? "Building…" : "Print"}
        </button>
      </div>
    </Modal>
  );
}
