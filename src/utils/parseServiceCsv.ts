// Bookmarks from other services' CSV exports, as the same records the browser
// HTML importer produces — so they go through the same preview, de-duplication,
// folder planning and Undo.
//
//   Raindrop.io  id,title,note,excerpt,url,folder,tags,created,cover,highlights,favorite
//   Pocket       title,url,time_added,tags,status   (tags separated by "|")
//
// Columns are found by NAME, case-insensitively and in any order, so a file
// with extra or missing columns still reads; only `url` is required. What is
// not mapped on purpose: Raindrop's `excerpt` (a page summary, not the reader's
// own note), `cover` and `highlights`.

import { parseCsv } from "@/utils/parseCsv";
import type { ParsedBookmark } from "@/utils/parseBookmarkHtml";

export type CsvFlavour = "raindrop" | "pocket" | "generic";

export type ParsedCsv = {
  flavour: CsvFlavour;
  bookmarks: ParsedBookmark[];
  /** Rows that had no usable link. */
  skipped: number;
};

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** A date as a unix time (seconds or milliseconds) or anything Date reads; null if neither. */
function toIso(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v)) {
    const n = Number(v);
    const ms = n > 1e11 ? n : n * 1000; // 10 digits is seconds, 13 is milliseconds
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const tagsOf = (raw: string, sep: RegExp) =>
  [...new Set(raw.split(sep).map((t) => t.trim()).filter(Boolean))];

/** Rows of a CSV export → bookmarks, or null when it isn't a link list (no `url` column). */
export function parseServiceCsv(text: string, now: Date = new Date()): ParsedCsv | null {
  const rows = parseCsv(text);
  if (rows.length === 0) return null;
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const iUrl = col("url", "link", "href");
  if (iUrl < 0) return null;

  const iTitle = col("title", "name");
  const iNote = col("note", "notes");
  const iFolder = col("folder", "collection");
  const iTags = col("tags");
  const iCreated = col("created", "time_added", "date", "added", "date_added");
  const iFav = col("favorite", "favourite");
  const iStatus = col("status");

  const flavour: CsvFlavour =
    header.includes("time_added") && iStatus >= 0
      ? "pocket"
      : header.includes("excerpt") || header.includes("favorite")
        ? "raindrop"
        : "generic";

  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const iso = now.toISOString();
  const bookmarks: ParsedBookmark[] = [];
  let skipped = 0;

  for (const r of rows.slice(1)) {
    const url = cell(r, iUrl);
    if (!SCHEME.test(url)) {
      skipped++;
      continue;
    }

    let folderPath: string[] = [];
    if (flavour === "pocket") {
      // Pocket has no folders; its two lists become one, so a read-later pile
      // doesn't mix into the rest of the deck.
      folderPath = cell(r, iStatus).toLowerCase() === "archive" ? ["Pocket", "Read archive"] : ["Pocket"];
    } else {
      const folder = cell(r, iFolder);
      // Raindrop's catch-all collection is called "Unsorted".
      if (folder && folder.toLowerCase() !== "unsorted") folderPath = [folder];
    }

    bookmarks.push({
      title: cell(r, iTitle) || url,
      url,
      note: cell(r, iNote),
      // Raindrop separates tags with commas; Pocket with "|".
      tags: tagsOf(cell(r, iTags), flavour === "pocket" ? /[|,]/ : /,/),
      createdAt: toIso(cell(r, iCreated)) ?? iso,
      folderPath,
      ...(iFav >= 0 && /^(true|1|yes)$/i.test(cell(r, iFav)) ? { pinned: true } : {}),
    });
  }
  return { flavour, bookmarks, skipped };
}
