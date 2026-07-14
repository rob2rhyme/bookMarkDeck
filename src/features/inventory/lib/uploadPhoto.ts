// Client helper: upload a compressed image to Cloudflare R2 via the presign
// route. Returns the stored {path, url} on success, or null when R2 isn't
// configured (or anything fails) — the caller then falls back to a data: URL, so
// photo capture keeps working with or without R2.

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
