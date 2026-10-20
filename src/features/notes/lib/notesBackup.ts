// Notes backup (JSON, restorable) and export (Markdown, readable). Pure.
//
// - A backup carries locked notes ENCRYPTED, exactly as stored, plus the vault
//   records needed to open them (which hold only wrapped keys — lib/vault.ts). So
//   a backup restores on a fresh account and still unlocks with the passphrase or
//   recovery code, yet leaks nothing locked to whoever holds the file.
// - Restore MERGES BY ID AND NEVER DELETES, as filing's import does. On an id
//   both sides have, the backup's copy wins only if it is newer — restoring last
//   month's backup can't revert this week's edits.
// - The Markdown export is for reading elsewhere, so it can't carry ciphertext:
//   a locked note appears by title only.

import { dayKeyFor } from "@/lib/dayKey";
import { toPlainText } from "@/features/notes/lib/markdown";
import { normalizeNote, sortNotes, type Note } from "@/features/notes/lib/notes";
import { normalizeVault, type VaultRecord } from "@/features/notes/lib/vault";

const APP = "bookmarkdeck-notes";
const VERSION = 1;

export type NotesBackup = {
  app: typeof APP;
  version: number;
  exportedAt: string;
  notes: Note[];
  vaults: VaultRecord[];
};

export function buildBackup(notes: Note[], vaults: VaultRecord[], now = new Date()): NotesBackup {
  return { app: APP, version: VERSION, exportedAt: now.toISOString(), notes, vaults };
}

export class BackupFormatError extends Error {
  constructor(message = "That file isn't a Notes backup.") {
    super(message);
    this.name = "BackupFormatError";
  }
}

/** Parse and validate a backup file; every record goes through the same normalizers as the cloud. */
export function parseBackup(text: string): { notes: Note[]; vaults: VaultRecord[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupFormatError();
  }
  const r = raw as Partial<NotesBackup> | null;
  if (!r || r.app !== APP || !Array.isArray(r.notes)) throw new BackupFormatError();
  if (typeof r.version === "number" && r.version > VERSION) {
    throw new BackupFormatError("This backup is from a newer version of the app.");
  }
  return {
    notes: r.notes.map(normalizeNote).filter((n): n is Note => n !== null),
    vaults: (Array.isArray(r.vaults) ? r.vaults : []).map(normalizeVault).filter((v): v is VaultRecord => v !== null),
  };
}

export type ImportPlan = {
  /** Notes to write: new ones, and ones where the backup's copy is newer. */
  write: Note[];
  added: number;
  updated: number;
  /** On both sides with this device's copy as new or newer — left alone. */
  kept: number;
};

export function planImport(existing: Note[], incoming: Note[]): ImportPlan {
  const byId = new Map(existing.map((n) => [n.id, n]));
  const plan: ImportPlan = { write: [], added: 0, updated: 0, kept: 0 };
  const seen = new Set<string>();
  for (const n of incoming) {
    if (seen.has(n.id)) continue; // a hand-edited file may repeat an id
    seen.add(n.id);
    const cur = byId.get(n.id);
    if (!cur) {
      plan.write.push(n);
      plan.added++;
    } else if (n.updatedAt > cur.updatedAt) {
      plan.write.push(n);
      plan.updated++;
    } else {
      plan.kept++;
    }
  }
  return plan;
}

/** Vaults the backup has and this account lacks. Existing vaults are never replaced. */
export function vaultsToAdd(existing: VaultRecord[], incoming: VaultRecord[]): VaultRecord[] {
  const ids = new Set(existing.map((v) => v.id));
  return incoming.filter((v, i) => !ids.has(v.id) && incoming.findIndex((x) => x.id === v.id) === i);
}

/** All notes as one readable Markdown document, in list order. */
export function toMarkdownExport(notes: Note[], now = new Date()): string {
  const parts = [`# Notes`, ``, `_Exported ${dayKeyFor(now)} from Bookmark Deck._`];
  for (const n of sortNotes(notes)) {
    const title = n.title.trim() || toPlainText(n.body).split("\n").find((l) => l.trim())?.trim() || "Untitled";
    parts.push(``, `---`, ``, `## ${title.replace(/\n/g, " ")}`, ``);
    const meta = [n.pinned ? "📌 Pinned" : "", n.tags.length ? n.tags.map((t) => `#${t}`).join(" ") : "", `Edited ${dayKeyFor(new Date(n.updatedAt))}`]
      .filter(Boolean)
      .join(" · ");
    parts.push(`_${meta}_`, ``);
    parts.push(n.lock ? "🔒 _Locked note — its text is encrypted and not included here. The JSON backup keeps it._" : n.body.trim());
  }
  return parts.join("\n") + "\n";
}

export const backupFilename = (now = new Date()) => `bookmarkdeck-notes-${dayKeyFor(now)}.json`;
export const markdownFilename = (now = new Date()) => `bookmarkdeck-notes-${dayKeyFor(now)}.md`;
