// Pure helpers for turning a scanned/typed barcode into item fields. The network
// call lives in the API route (src/app/api/inventory/product-lookup); everything
// here is pure + unit-tested (see productLookup.test.ts).

/** Normalized product facts we can prefill an item from. All optional. */
export type ProductInfo = {
  name?: string;
  brand?: string;
  model?: string;
  category?: string;
  price?: number;
  imageUrl?: string;
};

/** Keep only the characters a barcode can carry; empty when nothing usable. */
export function normalizeBarcode(raw: string): string {
  return (raw ?? "").trim().replace(/\s+/g, "");
}

/** A plausible UPC/EAN/ITF length (8–14 digits) — cheap guard before a lookup. */
export function looksScannable(code: string): boolean {
  const c = normalizeBarcode(code);
  return /^\d{8,14}$/.test(c);
}

/** The keyless UPCitemdb trial endpoint — the safe default when there's no key. */
export const UPC_TRIAL_URL = "https://api.upcitemdb.com/prod/trial/lookup";

/** A user_key that's actually usable — not blank, not a pasted placeholder like
 *  "<your user_key from the dashboard>". Guards the #1 misconfiguration. */
export function usableLookupKey(key?: string): string | undefined {
  const k = key?.trim();
  if (!k || k.length < 12) return undefined;
  if (/[<>]|\byour\b|user[_ ]?key|placeholder|example|xxxx|dashboard/i.test(k)) {
    return undefined;
  }
  return k;
}

/**
 * Pick the UPCitemdb endpoint + key to use. The paid endpoint (`/prod/v1/`)
 * hard-requires a real key, so if it's configured without one we fall back to
 * the free trial rather than 401 on every scan — the exact trap of pointing
 * UPC_LOOKUP_URL at the paid endpoint with a placeholder key. Other custom
 * providers are used as configured.
 */
export function resolveUpcEndpoint(
  url?: string,
  key?: string
): { url: string; key?: string } {
  const validKey = usableLookupKey(key);
  const configured = url?.trim();
  if (!configured) return { url: UPC_TRIAL_URL, key: validKey };
  const isPaidUpcItemDb = /upcitemdb\.com\/prod\/v1\//i.test(configured);
  if (isPaidUpcItemDb && !validKey) return { url: UPC_TRIAL_URL };
  return { url: configured, key: validKey };
}

const str = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
};

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * Normalize an UPCitemdb (`/prod/.../lookup`) response into ProductInfo.
 * Returns null when there's no usable item. Picks the lowest recorded price
 * (a resale-friendly floor) and the first image. Defensive against any shape.
 */
export function parseUpcItemDb(json: unknown): ProductInfo | null {
  const root = (json ?? {}) as Record<string, unknown>;
  const items = Array.isArray(root.items) ? root.items : [];
  const first = items[0] as Record<string, unknown> | undefined;
  if (!first || typeof first !== "object") return null;

  const images = Array.isArray(first.images) ? first.images : [];
  const imageUrl = images.map(str).find(Boolean);

  const info: ProductInfo = {
    name: str(first.title),
    brand: str(first.brand),
    model: str(first.model),
    category: str(first.category),
    price: num(first.lowest_recorded_price) ?? num(first.highest_recorded_price),
    imageUrl,
  };

  // Nothing worth prefilling → treat as a miss.
  if (!info.name && !info.brand && !info.model && !info.category) return null;
  return info;
}

/** UPCitemdb often returns a deep taxonomy path; keep the leaf as the category. */
export function shortCategory(category?: string): string | undefined {
  if (!category) return undefined;
  const leaf = category.split(">").pop()?.trim();
  return leaf && leaf.length ? leaf : category;
}

/** Open Facts categories are a comma-separated taxonomy, often "en:"-prefixed;
 *  keep the readable leaf. */
export function openFactsCategory(raw?: string): string | undefined {
  if (!raw) return undefined;
  const last = raw.split(",").pop()?.trim();
  if (!last) return undefined;
  const clean = last.replace(/^[a-z]{2}:/, "").replace(/-/g, " ").trim();
  return clean.length ? clean : undefined;
}

/**
 * Normalize an Open Facts (Open Food/Products/Beauty Facts) `/api/v2/product`
 * response into ProductInfo. These are free + keyless + global (strong on
 * EAN/JAN), so they backstop UPCitemdb's US-centric, rate-limited trial. No
 * price in this source. Returns null on a miss (`status !== 1`) or empty item.
 */
export function parseOpenFacts(json: unknown): ProductInfo | null {
  const root = (json ?? {}) as Record<string, unknown>;
  if (root.status !== 1 && root.status !== "1") return null;
  const p = (root.product ?? {}) as Record<string, unknown>;
  if (!p || typeof p !== "object") return null;

  const info: ProductInfo = {
    name: str(p.product_name) ?? str(p.product_name_en) ?? str(p.generic_name),
    brand: str(p.brands)?.split(",")[0]?.trim(),
    category: openFactsCategory(str(p.categories)),
    imageUrl: str(p.image_front_url) ?? str(p.image_url),
  };

  if (!info.name && !info.brand && !info.category) return null;
  return info;
}
