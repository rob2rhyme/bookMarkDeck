// A calendar file of paperwork deadlines, so they show up where people already
// look (ANALYSIS-FILING-LOG.md §6). Pure — see ics.test.ts.
//
// This produces a file to IMPORT, not a URL to subscribe to. A live subscription
// feed would mean a publicly-fetchable URL carrying one person's paperwork; that
// is a real privacy surface and it is deliberately not built here. Re-export
// after changes instead.
//
// All events are all-day VALUE=DATE events. A renewal is a day, not an instant,
// and all-day events dodge the timezone question entirely — no VTIMEZONE, no
// DST edge case, no "due at midnight in whose zone?".

import { CONFIDENTIAL_NAME, isConfidential } from "@/features/filing/lib/confidential";
import { periodMonths, isDate } from "@/features/filing/lib/obligations";
import { destroyOnFor } from "@/features/filing/lib/retention";
import type {
  FilingDocument,
  FilingFolder,
  Obligation,
} from "@/features/filing/lib/types";
import { OBLIGATION_KINDS } from "@/features/filing/lib/types";

const PRODID = "-//Bookmark Deck//Filing//EN";

/** RFC 5545 wants CRLF, and readers are stricter about it than you'd hope. */
const CRLF = "\r\n";

/** Escape the four characters RFC 5545 reserves inside a TEXT value. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold long lines at 75 octets, per RFC 5545. Measured in UTF-8 BYTES, not
 * characters — a naive character fold splits a multi-byte character across the
 * boundary and corrupts it, which is exactly how an emoji in a folder name
 * would break the whole file.
 */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  let limit = 75;

  for (const ch of line) {
    const size = enc.encode(ch).length;
    if (currentBytes + size > limit) {
      out.push(current);
      current = " "; // continuation lines start with a single space
      currentBytes = 1;
      limit = 75;
    }
    current += ch;
    currentBytes += size;
  }
  out.push(current);
  return out.join(CRLF);
}

const YMD = (date: string) => date.replace(/-/g, "");

/** DTSTART for an all-day event; DTEND is exclusive, so it's the next day. */
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** A stable UID, so re-importing updates the event instead of duplicating it. */
function uid(kind: string, documentId: string, suffix: string): string {
  return `${kind}-${documentId}-${suffix}@bookmarkdeck`;
}

function rrule(o: Obligation): string | null {
  const months = periodMonths(o);
  if (months === null) return null;
  if (months % 12 === 0) {
    const years = months / 12;
    return years === 1 ? "RRULE:FREQ=YEARLY" : `RRULE:FREQ=YEARLY;INTERVAL=${years}`;
  }
  return months === 1 ? "RRULE:FREQ=MONTHLY" : `RRULE:FREQ=MONTHLY;INTERVAL=${months}`;
}

export type IcsEvent = {
  uid: string;
  date: string; // YYYY-MM-DD
  summary: string;
  description?: string;
  rrule?: string | null;
};

/** Where the paper is — the line you actually want when the reminder fires. */
function whereLine(folder: FilingFolder | null, trail?: string[]): string {
  if (trail?.length) return trail.join(" > ");
  return folder ? folder.name : "Unfiled";
}

/**
 * Every dated thing worth putting on a calendar: each open obligation, plus each
 * paper's retention date. Completed one-offs and permanent papers contribute
 * nothing, because a calendar entry you can't act on is noise.
 */
export function filingEvents(
  documents: FilingDocument[],
  folders: FilingFolder[],
  opts: { includeRetention?: boolean; trailFor?: (documentId: string) => string[] } = {}
): IcsEvent[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const events: IcsEvent[] = [];

  for (const doc of documents) {
    if (doc.archived) continue;
    const folder = (doc.folderId && byId.get(doc.folderId)) || null;
    const secret = isConfidential(doc);
    // A calendar file is plaintext that leaves the app. A confidential paper's DATE is worth
    // having there (a passport renewal you'd miss otherwise); its NAME, its label and where
    // it is kept are not — so it appears as "A confidential paper", by kind of obligation.
    const where = secret ? "" : whereLine(folder, opts.trailFor?.(doc.id));

    for (const o of doc.obligations ?? []) {
      if (o.archived || !isDate(o.dueOn)) continue;
      // A completed one-off is done; a completed repeat has already rolled.
      if (o.completedOn && periodMonths(o) === null) continue;
      events.push({
        uid: uid("obligation", doc.id, o.id),
        date: o.dueOn,
        summary: secret
          ? `${CONFIDENTIAL_NAME} — ${OBLIGATION_KINDS.find((k) => k.id === o.kind)?.label ?? "due"}`
          : `${o.label || doc.title}`,
        description: secret ? CONFIDENTIAL_NAME : `${doc.title} — ${where}`,
        rrule: rrule(o),
      });
    }

    if (opts.includeRetention) {
      const destroyOn = destroyOnFor(doc, folder);
      if (destroyOn && !folder?.keepReason) {
        events.push({
          uid: uid("retention", doc.id, "destroy"),
          date: destroyOn,
          summary: `Clear out: ${secret ? CONFIDENTIAL_NAME.toLowerCase() : doc.title}`,
          description: secret ? "Retention reached" : `Retention reached — ${where}`,
        });
      }
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.uid.localeCompare(b.uid));
}

/**
 * A complete VCALENDAR. `stamp` is injected rather than read from the clock so
 * the output is deterministic and testable.
 */
export function buildIcs(events: IcsEvent[], stamp = "19700101T000000Z"): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Bookmark Deck — Filing",
  ];

  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${YMD(e.date)}`,
      `DTEND;VALUE=DATE:${YMD(nextDay(e.date))}`,
      `SUMMARY:${escapeText(e.summary)}`
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.rrule) lines.push(e.rrule);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}
