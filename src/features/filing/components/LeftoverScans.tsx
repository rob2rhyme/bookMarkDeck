"use client";

// Scans left in storage by papers deleted before deleting a paper took its scans with
// it. Found on request, shown as a count, removed only on a second tap — never swept
// automatically (see `orphanScans` for why a sweep isn't safe).

import { useState } from "react";

import { SectionLabel } from "@/components/ui/SectionLabel";
import type { FilingAttachment } from "@/features/filing/lib/types";

export type LeftoverScansApi = {
  find: () => Promise<FilingAttachment[]>;
  remove: (scans: FilingAttachment[]) => Promise<boolean>;
};

type State =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "found"; scans: FilingAttachment[] }
  | { kind: "done"; removed: number }
  | { kind: "error"; message: string };

const mb = (bytes: number) => (bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`);
const scansWord = (n: number) => `${n} scan${n === 1 ? "" : "s"}`;

export function LeftoverScans({ api }: { api: LeftoverScansApi }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const check = async () => {
    setState({ kind: "busy" });
    try {
      const scans = await api.find();
      setState(scans.length ? { kind: "found", scans } : { kind: "done", removed: 0 });
    } catch {
      setState({ kind: "error", message: "Couldn’t reach the cloud. Try again when you’re online." });
    }
  };

  const remove = async (scans: FilingAttachment[]) => {
    setState({ kind: "busy" });
    const ok = await api.remove(scans);
    setState(
      ok
        ? { kind: "done", removed: scans.length }
        : { kind: "error", message: "Some scans couldn’t be removed. Nothing was lost — try again later." }
    );
  };

  return (
    <div className="border-t border-slate-800 pt-4">
      <SectionLabel>Scans from deleted papers</SectionLabel>
      <p className="mt-1 text-[13px] text-slate-400">
        Deleting a paper now removes its scans. Papers deleted before that left theirs in storage — check
        for any and remove them here.
      </p>

      {state.kind === "found" ? (
        <div className="mt-3 space-y-2">
          <p className="text-[13px] text-slate-200">
            {scansWord(state.scans.length)} ({mb(state.scans.reduce((n, s) => n + (s.size || 0), 0))}) belong
            {state.scans.length === 1 ? "s" : ""} to papers that no longer exist. Scans added in the last day are
            left alone, in case their paper is still on its way from another device.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void remove(state.scans)}
              className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500"
            >
              Remove {scansWord(state.scans.length)}
            </button>
            <button
              type="button"
              onClick={() => setState({ kind: "idle" })}
              className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
            >
              Keep them
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void check()}
          disabled={state.kind === "busy"}
          className="mt-3 rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 disabled:opacity-40"
        >
          {state.kind === "busy" ? "Checking…" : "Check for leftover scans"}
        </button>
      )}

      {state.kind === "done" && (
        <p role="status" className="mt-2 text-[12px] text-emerald-400">
          {state.removed ? `Removed ${scansWord(state.removed)}.` : "No leftover scans."}
        </p>
      )}
      {state.kind === "error" && <p className="mt-2 text-[12px] text-red-400">{state.message}</p>}
    </div>
  );
}
