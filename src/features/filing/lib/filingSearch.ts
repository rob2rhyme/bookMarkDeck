// "Where is that paper?" — the pillar's core interaction. Forgiving, ranked
// search over documents and folders, each result carrying its resolved place
// breadcrumb so the caller can lead with WHERE the thing is.
//
// The scoring ladder is modelled on inventorySearch.ts (exact → prefix →
// word-start → substring → all-tokens → some-tokens → fuzzy subsequence), so a
// typo or a word-order slip still surfaces the right folder.
//
// Aliases are why this beats a "Places" link field: "Car", "Auto", "Taurus" and
// "lemon" can all find one folder. Pure — see filingSearch.test.ts.

import { folderTrail, placePathsById } from "@/features/filing/lib/breadcrumb";
import type {
  FilingDocument,
  FilingFolder,
  FilingPlace,
} from "@/features/filing/lib/types";

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const asSubsequence = (needle: string, hay: string): boolean => {
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay[j] === needle[i]) i++;
  }
  return i === needle.length;
};

/** Relevance of a query against one field. Higher is better; 0 means no match. */
export function fieldScore(hay: string, q: string, qTokens: string[]): number {
  if (!hay) return 0;
  if (hay === q) return 100;
  if (hay.startsWith(q)) return 85;
  if (new RegExp(`\\b${escapeRegExp(q)}`).test(hay)) return 70;
  if (hay.includes(q)) return 55;
  if (qTokens.length > 0 && qTokens.every((t) => hay.includes(t))) return 45;
  const hits = qTokens.filter((t) => hay.includes(t)).length;
  if (hits > 0) return 20 + hits * 8;
  if (asSubsequence(q.replace(/\s+/g, ""), hay.replace(/\s+/g, ""))) return 15;
  return 0;
}

/**
 * Strip the natural-language wrapper people type into a "where is it?" box —
 * "where's my …", "find the …", a trailing "?" — leaving the thing itself.
 */
export function cleanQuery(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\?+$/, "")
    .replace(/^(where(?:'s| is| are)?|find|locate)\s+/i, "")
    .replace(/^(is|are)\s+/i, "")
    .replace(/^(my|the|our|a|an)\s+/i, "")
    .trim();
}

const best = (fields: (string | undefined)[], q: string, tokens: string[], weight = 1) =>
  fields.reduce(
    (acc, f) => (f ? Math.max(acc, fieldScore(f.toLowerCase(), q, tokens) * weight) : acc),
    0
  );

export type FolderHit = {
  kind: "folder";
  folder: FilingFolder;
  /** Root→leaf trail ending in the folder itself. */
  trail: string[];
  score: number;
};

export type DocumentHit = {
  kind: "document";
  document: FilingDocument;
  folder: FilingFolder | null;
  /** Trail of the folder it sits in; empty when unfiled. */
  trail: string[];
  score: number;
};

export type FilingHit = FolderHit | DocumentHit;

export type SearchInput = {
  places: FilingPlace[];
  folders: FilingFolder[];
  documents: FilingDocument[];
};

/**
 * Ranked find across folders and documents. Archived records are skipped —
 * you are looking for what you keep.
 *
 * A document scores on its own fields but inherits a fraction of its folder's
 * score, so searching "car" finds the title inside the Vehicles folder even when
 * the paper itself is called "Certificate of title".
 */
export function searchFiling(
  { places, folders, documents }: SearchInput,
  query: string,
  limit = 12
): FilingHit[] {
  const q = cleanQuery(query);
  if (q.length < 2) return [];
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);

  const paths = placePathsById(places);
  const folderById = new Map(folders.map((f) => [f.id, f]));

  const folderScore = new Map<string, number>();
  const hits: FilingHit[] = [];

  for (const folder of folders) {
    if (folder.archived) continue;
    const primary = fieldScore(folder.name.trim().toLowerCase(), q, tokens);
    const secondary = best(
      [folder.aliases.join(" "), folder.category, folder.tags.join(" ")],
      q,
      tokens,
      0.8 // aliases are deliberately strong — that is what they are for
    );
    const score = Math.max(primary, secondary);
    folderScore.set(folder.id, score);
    if (score <= 0) continue;
    hits.push({
      kind: "folder",
      folder,
      trail: folderTrail(folder, paths),
      score,
    });
  }

  for (const document of documents) {
    if (document.archived) continue;
    const primary = fieldScore(document.title.trim().toLowerCase(), q, tokens);
    const secondary = best(
      [document.aliases.join(" "), document.reference, document.tags.join(" "), document.note],
      q,
      tokens,
      0.6
    );
    const inherited = (folderScore.get(document.folderId ?? "") ?? 0) * 0.4;
    const score = Math.max(primary, secondary, inherited);
    if (score <= 0) continue;
    const folder = document.folderId ? folderById.get(document.folderId) ?? null : null;
    hits.push({
      kind: "document",
      document,
      folder,
      trail: folder ? folderTrail(folder, paths) : [],
      score,
    });
  }

  const label = (h: FilingHit) =>
    h.kind === "folder" ? h.folder.name : h.document.title;

  return hits
    .sort((a, b) => b.score - a.score || label(a).localeCompare(label(b)))
    .slice(0, limit);
}

/** Documents with no folder — the Unfiled inbox. */
export function unfiled(documents: FilingDocument[]): FilingDocument[] {
  return documents.filter((d) => !d.folderId && !d.archived);
}

/** Existing categories, for the folder form's suggestions. */
export function categorySuggestions(folders: FilingFolder[]): string[] {
  return [...new Set(folders.map((f) => f.category?.trim()).filter(Boolean) as string[])].sort();
}
