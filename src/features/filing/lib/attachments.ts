"use client";

// Client helpers for attaching a scan to a paper.
//
// COPIED in shape from features/inventory/lib/uploadPhoto.ts — a feature never
// imports another feature. The /api/filing/* routes are this pillar's own.
//
// Everything degrades to null when R2 isn't configured, so the UI can simply
// not offer attachments rather than failing halfway through one.

import type { FilingAttachment } from "@/features/filing/lib/types";

export type UploadResult = { path: string; url: string };

type PresignResponse = {
  enabled?: boolean;
  uploadUrl?: string;
  publicUrl?: string;
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
 * The size is declared to the route so an oversized file is refused BEFORE the
 * bytes move; a presigned PUT can't carry a size condition, so this is the only
 * place the limit can be applied cheaply.
 */
export async function uploadAttachment(
  file: File,
  documentId: string
): Promise<{ ok: true; result: UploadResult } | { ok: false; reason: UploadFailure }> {
  let presign: PresignResponse;
  try {
    const res = await fetch("/api/filing/attachment/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, contentType: file.type, size: file.size }),
    });
    presign = (await res.json()) as PresignResponse;
  } catch {
    return { ok: false, reason: "failed" };
  }

  if (!presign?.enabled) return { ok: false, reason: "disabled" };
  if (presign.error === "unsupported_type") return { ok: false, reason: "unsupported_type" };
  if (presign.error === "too_large") return { ok: false, reason: "too_large" };
  if (presign.error === "rate_limited") return { ok: false, reason: "rate_limited" };
  if (!presign.uploadUrl || !presign.publicUrl || !presign.path) {
    return { ok: false, reason: "failed" };
  }

  try {
    const put = await fetch(presign.uploadUrl, {
      method: "PUT",
      body: file,
      // Must match the signed content-type exactly or R2 rejects the PUT.
      headers: { "Content-Type": file.type },
    });
    if (!put.ok) return { ok: false, reason: "failed" };
    return { ok: true, result: { path: presign.path, url: presign.publicUrl } };
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
