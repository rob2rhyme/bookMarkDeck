// Parse the raw text an OCR pass pulls off a product / its box / label into a
// suggested item name (and brand) — the free, on-device "what is this?" helper.
// Pure + heuristic + unit-tested; the OCR engine (Tesseract.js, on-device) is
// wired separately and imported on demand. Nothing here leaves the device.
//
// It's a *suggestion* that fills empty fields only (never overwrites your own
// typing) — like the barcode/receipt scanners. Best when the item has visible
// text/branding; noisy photos just yield nothing and you type instead.

export type LabelFields = {
  name?: string;
  brand?: string;
};

// Lines that are almost never the product's name — legal/marketing/packaging
// boilerplate, URLs, codes, quantities.
const NOISE =
  /made in|assembled in|distributed|manufactured (by|for)|www\.|https?:|\.com|warning|caution|danger|ingredients|nutrition|net\s?wt|\bqty\b|batch|\bexp(iry|ires)?\b|\blot\b|patent|keep out of reach|instructions|read the|®|™|©|barcode|^\W*\d[\d\s.,-]*$/i;

/** Strip OCR punctuation noise but keep letters, digits, and a few name chars. */
function cleanLine(l: string): string {
  return l
    .replace(/[^\w &'.+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Score a cleaned line on how "product-name shaped" it is. Negative = reject. */
export function scoreLine(l: string): number {
  const letters = (l.match(/[a-z]/gi) || []).length;
  if (letters < 2) return -1;
  if (letters / l.length < 0.4) return -1; // mostly digits/symbols
  if (NOISE.test(l)) return -1;

  const words = l.split(/\s+/).filter(Boolean).length;
  let s = Math.min(letters, 20);
  if (words >= 2 && words <= 6) s += 6; // a descriptor, not one word or a sentence
  if (/^[A-Z0-9]/.test(l)) s += 2; // labels tend to start capitalized
  if (l.length > 40) s -= (l.length - 40) / 3; // a paragraph, not a name
  return s;
}

/**
 * Best-guess the item's name (top-scoring line near the top) and, when the
 * label carries a standalone all-caps logo line, its brand.
 */
export function parseLabelText(raw: string): LabelFields {
  const lines = raw
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);

  const out: LabelFields = {};

  let best: { line: string; score: number } | null = null;
  for (const l of lines.slice(0, 12)) {
    const s = scoreLine(l);
    if (s > 0 && (!best || s > best.score)) best = { line: l, score: s };
  }
  if (best) out.name = best.line.slice(0, 60);

  // Brand: a standalone all-caps logo line (e.g. "SONY", "PHILIPS"), not a
  // stray all-caps token inside a longer line (which would grab "IV" etc.).
  for (const l of lines.slice(0, 8)) {
    if (/^[A-Z][A-Z&.-]{2,14}$/.test(l) && !NOISE.test(l)) {
      out.brand = l;
      break;
    }
  }

  return out;
}
