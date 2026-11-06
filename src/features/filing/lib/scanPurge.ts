// Deleting a paper deletes its scans: the stored files first, then their pointers.
//
// Scans live only in the cloud (pointers in `filingDocs`, files in R2), so they can't
// be purged from an offline device, nor read from an offline cache — that answers
// "no scans" and a purge would be marked done with every file still stored. So a
// deleted paper's id is QUEUED on the device first, and leaves the queue only once
// the server has listed its scans and every one is confirmed gone. Until then it is
// retried on the next connect. Order matters: a pointer is the only way to find its
// file, so it is dropped only after the file is.

import type { FilingAttachment } from "@/features/filing/lib/types";

const BASE_KEY = "bookmarkdeck:filing:scanPurge:v1";
const keyFor = (email: string) => `${BASE_KEY}:${email}`;

function read(email: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(email)) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(email: string, ids: string[]): void {
  try {
    if (ids.length) localStorage.setItem(keyFor(email), JSON.stringify(ids));
    else localStorage.removeItem(keyFor(email));
  } catch {
    /* storage full or blocked: the purge still runs now, it just can't be retried */
  }
}

export function queueScanPurge(email: string, documentId: string): void {
  const ids = read(email);
  if (!ids.includes(documentId)) write(email, [...ids, documentId]);
}

export function queuedScanPurges(email: string): string[] {
  return read(email);
}

export type PurgeDeps = {
  /** The paper's scan pointers, from the server — it must throw rather than answer from a cache. */
  list: (documentId: string) => Promise<FilingAttachment[]>;
  /** True once every file is confirmed gone. */
  deleteFiles: (paths: string[]) => Promise<boolean>;
  deletePointer: (attachmentId: string) => Promise<void>;
};

/** Purge one paper's scans. True when nothing of them is left. */
export async function purgeScans(documentId: string, deps: PurgeDeps): Promise<boolean> {
  try {
    const scans = await deps.list(documentId);
    if (scans.length === 0) return true;
    if (!(await deps.deleteFiles(scans.map((s) => s.path)))) return false;
    await Promise.all(scans.map((s) => deps.deletePointer(s.id)));
    return true;
  } catch {
    return false;
  }
}

/** Work through the queue, one paper at a time; what fails stays for next time. */
export async function flushScanPurges(email: string, deps: PurgeDeps): Promise<void> {
  for (const id of read(email)) {
    if (await purgeScans(id, deps)) write(email, read(email).filter((x) => x !== id));
  }
}
