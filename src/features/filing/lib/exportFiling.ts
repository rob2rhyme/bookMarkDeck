// Getting your filing log out, and back in (ANALYSIS-FILING-LOG.md §10, Phase 6).
// Pure — see exportFiling.test.ts.
//
// Two formats, two jobs:
//   JSON  — the complete round-trip. Everything, re-importable, merge-safe.
//   CSV   — the flat "what do I have and where" sheet, for a spreadsheet or a
//           printout. Lossy on purpose: obligations and activity don't flatten
//           into a row, so CSV is an export only, never an import.
//
// Import MERGES BY ID and never deletes. Restoring a backup onto a live account
// must not silently remove anything the backup predates.

import { formatPath } from "@/features/filing/lib/breadcrumb";
import { destroyOnFor, ruleById } from "@/features/filing/lib/retention";
import {
  DEFAULT_FILING_SETTINGS,
  normalizeSettings,
  type FilingBackup,
  type FilingDocument,
  type FilingFolder,
  type FilingParty,
  type FilingPlace,
} from "@/features/filing/lib/types";

export const BACKUP_VERSION = 1;

export type FilingExport = FilingBackup & {
  version: number;
  exportedAt: string;
};

export function buildBackup(data: FilingBackup, exportedAt: string): FilingExport {
  return { version: BACKUP_VERSION, exportedAt, ...data };
}

/* ----------------------------------------------------------------- CSV --- */

/** RFC 4180: quote when the value contains a comma, quote or newline. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_COLUMNS = [
  "Title",
  "Type",
  "Folder",
  "Where",
  "Whose",
  "Document date",
  "Filed",
  "Reference",
  "Retention",
  "Clear out on",
  "Next due",
  "Linked account",
  "Tags",
  "Note",
] as const;

/**
 * One row per paper, with the location resolved to a readable breadcrumb rather
 * than an id — a spreadsheet full of UUIDs answers nothing.
 */
export function documentsToCsv(
  documents: FilingDocument[],
  folders: FilingFolder[],
  parties: FilingParty[],
  trailFor: (documentId: string) => string[]
): string {
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const partyById = new Map(parties.map((p) => [p.id, p]));

  const rows = documents
    .filter((d) => !d.archived)
    .map((d) => {
      const folder = (d.folderId && folderById.get(d.folderId)) || null;
      const partyId = d.partyId ?? folder?.partyId ?? null;
      const rule = ruleById(d.retentionRuleId) ?? ruleById(folder?.retentionRuleId);
      return [
        d.title,
        d.docType ?? "",
        folder?.name ?? "Unfiled",
        formatPath(trailFor(d.id).slice(0, -1), ""),
        (partyId && partyById.get(partyId)?.name) || "",
        d.docDate ?? "",
        d.filedAt ?? "",
        d.reference ?? "",
        rule?.label ?? "",
        destroyOnFor(d, folder) ?? "",
        d.nextDueOn ?? "",
        d.bookmarkLink?.url ?? "",
        (d.tags ?? []).join(" "),
        d.note ?? "",
      ];
    });

  return [CSV_COLUMNS, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/* -------------------------------------------------------------- import --- */

export type ImportSummary = {
  places: number;
  parties: number;
  folders: number;
  documents: number;
  settings: boolean;
  /** Records rejected as malformed, so a partial file reports honestly. */
  skipped: number;
};

export type ImportResult = { ok: true; data: FilingBackup; summary: ImportSummary } | {
  ok: false;
  error: string;
};

const hasId = (v: unknown): v is { id: string } =>
  Boolean(v) && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" && (v as { id: string }).id !== "";

const named = (v: unknown): boolean =>
  typeof (v as { name?: unknown }).name === "string" && (v as { name: string }).name.trim() !== "";

const titled = (v: unknown): boolean =>
  typeof (v as { title?: unknown }).title === "string" && (v as { title: string }).title.trim() !== "";

/**
 * Parse and validate an export file. Rejects wholesale only when the file isn't
 * a filing backup at all; individual malformed records are counted and dropped,
 * so one bad row can't cost you the other four hundred.
 */
export function parseBackup(raw: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "That file isn't a filing backup." };
  }

  const o = parsed as Record<string, unknown>;
  const looksRight =
    Array.isArray(o.places) ||
    Array.isArray(o.folders) ||
    Array.isArray(o.documents) ||
    Array.isArray(o.parties);
  if (!looksRight) {
    return { ok: false, error: "That file isn't a filing backup." };
  }

  let skipped = 0;
  const take = <T>(value: unknown, valid: (v: unknown) => boolean): T[] => {
    if (!Array.isArray(value)) return [];
    const out: T[] = [];
    for (const item of value) {
      if (hasId(item) && valid(item)) out.push(item as T);
      else skipped++;
    }
    return out;
  };

  const data: FilingBackup = {
    places: take<FilingPlace>(o.places, named),
    parties: take<FilingParty>(o.parties, named),
    folders: take<FilingFolder>(o.folders, named),
    documents: take<FilingDocument>(o.documents, titled),
    settings: o.settings ? normalizeSettings(o.settings) : DEFAULT_FILING_SETTINGS,
  };

  return {
    ok: true,
    data,
    summary: {
      places: data.places.length,
      parties: data.parties.length,
      folders: data.folders.length,
      documents: data.documents.length,
      settings: Boolean(o.settings),
      skipped,
    },
  };
}

/**
 * Merge imported records into existing ones by id.
 *
 * Incoming wins on conflict, existing records absent from the file are KEPT, and
 * order is existing-then-new so the list doesn't reshuffle. Never deletes:
 * importing a six-month-old backup must not wipe six months of filing.
 */
export function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const item of incoming) {
    const prev = byId.get(item.id);
    byId.set(item.id, prev ? { ...prev, ...item } : item);
  }
  return [...byId.values()];
}
