"use client";

import { useState } from "react";

import { Modal } from "@/components/Modal";
import { downloadText } from "@/utils/download";
import type { Note } from "@/features/notes/lib/notes";
import {
  backupFilename,
  buildBackup,
  markdownFilename,
  parseBackup,
  planImport,
  toMarkdownExport,
  vaultsToAdd,
  type ImportPlan,
} from "@/features/notes/lib/notesBackup";
import type { VaultRecord } from "@/features/notes/lib/vault";

const BTN =
  "rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-blue-400 hover:text-blue-300 disabled:opacity-50";
const PRIMARY = "rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** Download a restorable backup, export readable Markdown, or restore a backup. */
export function NotesBackupDialog({
  open,
  onClose,
  notes,
  vaults,
  onRestore,
}: {
  open: boolean;
  onClose: () => void;
  notes: Note[];
  vaults: VaultRecord[];
  onRestore: (plan: ImportPlan, newVaults: VaultRecord[]) => void;
}) {
  const [pending, setPending] = useState<{ plan: ImportPlan; vaults: VaultRecord[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locked = notes.filter((n) => n.lock).length;

  const close = () => {
    setPending(null);
    setError(null);
    onClose();
  };

  const onFile = async (file: File | undefined) => {
    setPending(null);
    setError(null);
    if (!file) return;
    try {
      const parsed = parseBackup(await file.text());
      setPending({ plan: planImport(notes, parsed.notes), vaults: vaultsToAdd(vaults, parsed.vaults) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  };

  return (
    <Modal open={open} onClose={close} labelledBy="notes-backup-title">
      <div className="flex flex-col gap-5">
        <h2 id="notes-backup-title" className="text-lg font-semibold text-slate-50">
          Back up &amp; export
        </h2>

        <section className="flex flex-col gap-2">
          <p className="text-sm text-slate-400">
            A backup file holds all {plural(notes.length, "note")} and can be restored here later.
            {locked > 0 && <> {plural(locked, "locked note")} stay encrypted in it — your passphrase still opens them.</>}
          </p>
          <button
            type="button"
            disabled={notes.length === 0}
            onClick={() =>
              downloadText(backupFilename(), JSON.stringify(buildBackup(notes, vaults), null, 2), "application/json")
            }
            className={BTN}
          >
            Download backup (.json)
          </button>
          <button
            type="button"
            disabled={notes.length === 0}
            onClick={() => downloadText(markdownFilename(), toMarkdownExport(notes), "text/markdown")}
            className={BTN}
          >
            Export as Markdown (.md)
          </button>
          <p className="text-xs text-slate-500">Markdown is for reading elsewhere; locked notes appear by title only.</p>
        </section>

        <section className="flex flex-col gap-2 border-t border-slate-800 pt-4">
          <label className="flex flex-col gap-2 text-sm text-slate-300">
            Restore from a backup
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => void onFile(e.target.files?.[0])}
              className="text-sm text-slate-400 file:mr-3 file:rounded-full file:border file:border-slate-700 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-200"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          {pending && (
            <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-300">
              <p role="status">
                {pending.plan.write.length === 0 && pending.vaults.length === 0
                  ? "Everything in this backup is already here."
                  : [
                      pending.plan.added && `Adds ${plural(pending.plan.added, "note")}`,
                      pending.plan.updated && `updates ${plural(pending.plan.updated, "note")} (newer in the backup)`,
                    ]
                      .filter(Boolean)
                      .join(", ") || "Adds the locked-notes passphrase from this backup"}
                {pending.plan.kept > 0 &&
                  `. Keeps ${plural(pending.plan.kept, "note")} that ${pending.plan.kept === 1 ? "is" : "are"} newer here`}
                . Nothing is deleted.
              </p>
              {(pending.plan.write.length > 0 || pending.vaults.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    onRestore(pending.plan, pending.vaults);
                    close();
                  }}
                  className={PRIMARY}
                >
                  Restore
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
