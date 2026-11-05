// What "confidential" means for a paper beyond its sealed text.
//
// A paper is confidential exactly while it is LOCKED (`lock` set — see lock.ts; the flag is
// kept equal to it). Locking seals its reference and note. This module is the rest of the
// promise, the part that is about WHERE ITS NAME APPEARS:
//
//  - behind the Filing PIN, lists and search do not show it while the lock is on
//    (`shownDocuments`) — a privacy screen for a passer-by, honestly NOT encryption: the
//    title stays plaintext in storage, which is why the vault passphrase and the PIN are
//    separate things;
//  - a notification names no confidential paper, ever (digest.ts) — a lock screen is the
//    most public place a title can land, and the PIN can't cover it;
//  - a spreadsheet or a calendar file leaves the app as plaintext, so neither carries a
//    confidential paper's name (exportFiling.ts, ics.ts);
//  - ⌘K lists no papers at all, so there is nothing to filter there. An index added later
//    must skip `isConfidential`.
//
// Pure — see confidential.test.ts.

import type { FilingDocument } from "@/features/filing/lib/types";

type Flagged = Pick<FilingDocument, "confidential" | "lock">;

export const isConfidential = (d: Flagged): boolean => Boolean(d.confidential || d.lock);

/** What stands in for a confidential paper's name wherever a name would leave the app. */
export const CONFIDENTIAL_NAME = "A confidential paper";

/**
 * The papers a view may show. While the Filing PIN lock is on (`hidden`) confidential ones are
 * held back; otherwise — including when no PIN was ever set — everything shows, as before.
 */
export function shownDocuments<T extends Flagged>(documents: T[], hidden: boolean): T[] {
  return hidden ? documents.filter((d) => !isConfidential(d)) : documents;
}

export const countConfidential = (documents: Flagged[]): number => documents.filter(isConfidential).length;
