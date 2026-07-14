// Client helpers for the R2 object store: upload a compressed image via the
// presign route (photos AND attachments share it), and best-effort deletion of
// objects whose photo/attachment/item was removed. Returns/uses null-tolerant
// shapes so everything keeps working as data: URLs when R2 isn't configured.

export type UploadResult = { path: string; url: string };

type PresignResponse = {
  enabled?: boolean;
  uploadUrl?: string;
  publicUrl?: string;
  path?: string;
};

export async function uploadInventoryPhoto(
  blob: Blob,
  contentType: string,
  itemId: string
): Promise<UploadResult | null> {
  let presign: PresignResponse;
  try {
    const res = await fetch("/api/inventory/photo/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, contentType }),
    });
    presign = (await res.json()) as PresignResponse;
  } catch {
    return null;
  }
  if (!presign?.enabled || !presign.uploadUrl || !presign.publicUrl || !presign.path) {
    return null; // R2 not configured → caller keeps the data: URL
  }

  try {
    const put = await fetch(presign.uploadUrl, {
      method: "PUT",
      body: blob,
      headers: { "Content-Type": contentType },
    });
    if (!put.ok) return null;
    return { path: presign.path, url: presign.publicUrl };
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget cleanup of R2 objects (photo replaced/cleared, attachment or
 * item deleted). Falsy/empty entries are dropped, so callers can pass optional
 * `path` fields straight through. Failures only leave orphans — never surfaced.
 */
export function deleteInventoryObjects(
  paths: Array<string | undefined | null>
): void {
  const keys = [...new Set(paths.filter((p): p is string => Boolean(p?.trim())))];
  if (keys.length === 0) return;
  fetch("/api/inventory/object/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths: keys }),
  }).catch(() => {});
}
