"use client";

// Client helpers for attaching a scan to a paper.
//
// COPIED in shape from features/inventory/lib/uploadPhoto.ts — a feature never
// imports another feature. The /api/filing/* routes are this pillar's own.
//
// Everything degrades to null when R2 isn't configured, so the UI can simply
// not offer attachments rather than failing halfway through one.

import type { FilingAttachment } from "@/features/filing/lib/types";

/** Where the object landed. There is no public URL any more: a scan is read through `readUrl`. */
export type UploadResult = { path: string };

type PresignResponse = {
  enabled?: boolean;
  uploadUrl?: string;
  /** The Content-Type the upload was SIGNED with; the PUT must send exactly this. */
  uploadContentType?: string;
  path?: string;
  maxBytes?: number;
  error?: string;
};

/** What the presign route accepts. Kept here so the picker can filter too. */
export const ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;

export const ACCEPT_ATTR = ACCEPTED_TYPES.join(",");

export type UploadFailure =
  | "disabled"
  | "unsupported_type"
  | "too_large"
  | "rate_limited"
  | "failed";

export function isImage(contentType: string): boolean {
  return contentType.startsWith("image/");
}

/** Human size, for the list and for the too-large message. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Upload one file and return where it landed, or a reason it didn't.
 *
 * `body` is what is stored — the file itself, or, for a SEALED scan, the encrypted blob
 * (scanCrypto.sealScan); `contentType` is always the ORIGINAL type, which the route
 * checks against its allow-list either way (so SVG and HTML stay refused even sealed).
 *
 * The size is declared to the route so an oversized file is refused BEFORE the
 * bytes move; a presigned PUT can't carry a size condition, so this is the only
 * place the limit can be applied cheaply.
 */
export async function uploadAttachment(input: {
  body: Blob;
  contentType: string;
  documentId: string;
  encrypted?: boolean;
}): Promise<{ ok: true; result: UploadResult } | { ok: false; reason: UploadFailure }> {
  const { body, contentType, documentId, encrypted = false } = input;
  let presign: PresignResponse;
  try {
    const res = await fetch("/api/filing/attachment/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, contentType, size: body.size, encrypted }),
    });
    presign = (await res.json()) as PresignResponse;
  } catch {
    return { ok: false, reason: "failed" };
  }

  if (!presign?.enabled) return { ok: false, reason: "disabled" };
  if (presign.error === "unsupported_type") return { ok: false, reason: "unsupported_type" };
  if (presign.error === "too_large") return { ok: false, reason: "too_large" };
  if (presign.error === "rate_limited") return { ok: false, reason: "rate_limited" };
  if (!presign.uploadUrl || !presign.path) {
    return { ok: false, reason: "failed" };
  }

  try {
    const put = await fetch(presign.uploadUrl, {
      method: "PUT",
      body,
      // Must match the signed content-type exactly or R2 rejects the PUT.
      headers: { "Content-Type": presign.uploadContentType ?? contentType },
    });
    if (!put.ok) return { ok: false, reason: "failed" };
    return { ok: true, result: { path: presign.path } };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

export type ReadFailure = "disabled" | "rate_limited" | "failed";

/** A short-lived signed URL for one scan (the bucket may be private), or why not. */
export async function readUrl(path: string): Promise<{ ok: true; url: string } | { ok: false; reason: ReadFailure }> {
  try {
    const res = await fetch("/api/filing/attachment/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const json = (await res.json()) as { enabled?: boolean; url?: string; error?: string };
    if (!json?.enabled) return { ok: false, reason: "disabled" };
    if (json.error === "rate_limited") return { ok: false, reason: "rate_limited" };
    return json.url ? { ok: true, url: json.url } : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/**
 * The stored bytes of one scan — ciphertext for a sealed one. This is a browser fetch
 * of the signed URL, so the bucket's CORS must allow GET from the app's origin (the PUT
 * already needs it).
 */
export async function fetchStored(path: string): Promise<{ ok: true; bytes: ArrayBuffer } | { ok: false; reason: ReadFailure }> {
  const signed = await readUrl(path);
  if (!signed.ok) return signed;
  try {
    const res = await fetch(signed.url);
    if (!res.ok) return { ok: false, reason: "failed" };
    return { ok: true, bytes: await res.arrayBuffer() };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/**
 * Fire-and-forget cleanup for attachments whose record is gone. Failures only
 * leave an orphan in the bucket, so they're never surfaced — losing the pointer
 * is what matters, and that already happened.
 */
export function deleteFilingObjects(paths: Array<string | undefined | null>): void {
  const keys = [...new Set(paths.filter((p): p is string => Boolean(p?.trim())))];
  if (keys.length === 0) return;
  fetch("/api/filing/object/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths: keys }),
  }).catch(() => {});
}

/**
 * Delete objects and say whether they are gone — for a purge that must not drop
 * the pointers until it knows. True when storage isn't set up here (nothing can be
 * reached to delete); false on any failure, so the caller keeps its work queued.
 */
export async function purgeFilingObjects(paths: Array<string | undefined | null>): Promise<boolean> {
  const keys = [...new Set(paths.filter((p): p is string => Boolean(p?.trim())))];
  for (let i = 0; i < keys.length; i += 25) {
    const batch = keys.slice(i, i + 25); // the route takes 25 at a time
    try {
      const res = await fetch("/api/filing/object/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: batch }),
      });
      if (!res.ok) return false;
      const json = (await res.json()) as { enabled?: boolean; deleted?: number };
      if (json.enabled === false) return true;
      if (json.deleted !== batch.length) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export const READ_FAILURE_MESSAGES: Record<ReadFailure, string> = {
  disabled: "File storage isn't set up on this deployment.",
  rate_limited: "Too many requests just now. Try again in a minute.",
  failed: "Couldn't fetch that scan. Check your connection and try again.",
};

export const FAILURE_MESSAGES: Record<UploadFailure, string> = {
  disabled: "File storage isn't set up on this deployment.",
  unsupported_type: "That file type isn't supported — PDFs and images only.",
  too_large: "That file is too large.",
  rate_limited: "Too many uploads just now. Try again in a minute.",
  failed: "Upload didn't complete. Try again.",
};

/** Newest first — the scan you just added is the one you want to see. */
export function sortAttachments(list: FilingAttachment[]): FilingAttachment[] {
  return [...list].sort((a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? ""));
}

/**
 * One-shot capability probe: is object storage configured on this deployment?
 *
 * A POST with no contentType returns `{enabled:true, error:"unsupported_type"}`
 * when R2 is set up and `{enabled:false}` when it isn't, so this reuses the
 * presign route rather than adding an endpoint. The result is cached for the
 * page's lifetime — it can't change without a redeploy.
 */
let probed: Promise<boolean> | null = null;

export function attachmentsEnabled(): Promise<boolean> {
  if (!probed) {
    probed = fetch("/api/filing/attachment/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then((r) => r.json())
      .then((j: PresignResponse) => Boolean(j?.enabled))
      .catch(() => false);
  }
  return probed;
}
