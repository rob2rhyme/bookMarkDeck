// Client-side image compression for item photos. Downscales + re-encodes a
// picked/captured file to a compact `data:` URL small enough to live on the
// Firestore item doc (well under the 1 MB cap). `fitWithin` is pure + tested;
// the canvas encode is browser-only. When Cloudflare R2 lands, the same
// compressed blob is what gets uploaded — only the sink changes.

/** Scale (w,h) so the longest edge is at most `maxEdge`, preserving aspect and
 *  never upscaling. Returns whole pixels. */
export function fitWithin(
  w: number,
  h: number,
  maxEdge: number
): { w: number; h: number } {
  if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 };
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { w: Math.round(w), h: Math.round(h) };
  const scale = maxEdge / longest;
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** Approx. decoded byte size of a `data:` URL (base64 is ~4/3 of the bytes). */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

export type CompressOptions = {
  maxEdge?: number; // longest-edge cap in px
  quality?: number; // 0–1 encoder quality
  mime?: "image/webp" | "image/jpeg";
  maxBytes?: number; // reject if the result is still larger than this
};

async function loadBitmap(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(file);
    return {
      width: bmp.width,
      height: bmp.height,
      draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h),
      close: () => bmp.close(),
    };
  }
  // Fallback for browsers without createImageBitmap (older Safari).
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      close: () => {},
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Compress an image File to a compact `data:` URL. Downscales to `maxEdge`,
 * encodes WebP (falls back to JPEG where WebP encode is unsupported), and if the
 * first pass is still too big, retries at lower quality then a smaller size.
 * Throws when the input isn't an image or can't be squeezed under `maxBytes`.
 */
export async function compressImageFile(
  file: File,
  opts: CompressOptions = {}
): Promise<{ dataUrl: string; w: number; h: number; bytes: number }> {
  if (!file.type.startsWith("image/")) throw new Error("Not an image file.");
  const mime = opts.mime ?? "image/webp";
  const maxBytes = opts.maxBytes ?? 900_000;

  const bitmap = await loadBitmap(file);
  try {
    // Progressive fallback: shrink the edge and drop quality until it fits.
    const attempts: { edge: number; q: number }[] = [
      { edge: opts.maxEdge ?? 1400, q: opts.quality ?? 0.6 },
      { edge: 1200, q: 0.5 },
      { edge: 1000, q: 0.45 },
      { edge: 800, q: 0.4 },
    ];
    let last = "";
    let lastDims = { w: 0, h: 0 };
    for (const a of attempts) {
      const { w, h } = fitWithin(bitmap.width, bitmap.height, a.edge);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable.");
      bitmap.draw(ctx, w, h);
      let dataUrl = canvas.toDataURL(mime, a.q);
      // Some engines silently fall back to PNG if the mime is unsupported.
      if (!dataUrl.startsWith(`data:${mime}`)) dataUrl = canvas.toDataURL("image/jpeg", a.q);
      last = dataUrl;
      lastDims = { w, h };
      if (dataUrlBytes(dataUrl) <= maxBytes) {
        return { dataUrl, w, h, bytes: dataUrlBytes(dataUrl) };
      }
    }
    const bytes = dataUrlBytes(last);
    if (bytes > maxBytes) throw new Error("Photo is too large to store — try a smaller image.");
    return { dataUrl: last, w: lastDims.w, h: lastDims.h, bytes };
  } finally {
    bitmap.close();
  }
}
