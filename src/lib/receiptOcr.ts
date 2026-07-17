// Parse the raw text an OCR pass pulls off a receipt into the few fields worth
// prefilling: merchant, date, total. Pure + heuristic + unit-tested — the OCR
// engine itself (Tesseract.js, on-device) is wired separately and only imported
// on demand. Nothing here leaves the device.

export type ReceiptFields = {
  merchant?: string;
  date?: string; // YYYY-MM-DD
  total?: number;
};

const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");

function iso(y: number, mo: number, d: number): string | undefined {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** First plausible business-name line near the top (mostly letters, not a date,
 *  address, phone, or a header word). */
export function findMerchant(lines: string[]): string | undefined {
  for (const l of lines.slice(0, 6)) {
    const letters = (l.match(/[a-z]/gi) || []).length;
    if (letters < 2 || letters / l.length < 0.4) continue;
    if (/receipt|invoice|order|tel|phone|www|\.com|@|street|\bst\b|\brd\b|\bave\b/i.test(l)) continue;
    if (/^\d/.test(l)) continue;
    const cleaned = l.replace(/[^\w &'.-]/g, " ").replace(/\s+/g, " ").trim();
    if (cleaned) return cleaned.slice(0, 60);
  }
  return undefined;
}

/** First date in common formats → YYYY-MM-DD. Ambiguous D/M vs M/D resolves to
 *  M/D (US) unless the first number is clearly a day (>12). */
export function findDate(raw: string): string | undefined {
  let m = raw.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return iso(+m[1], +m[2], +m[3]);

  m = raw.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    let y = +m[3];
    if (y < 100) y += 2000;
    const [mo, d] = a > 12 ? [b, a] : [a, b];
    const out = iso(y, mo, d);
    if (out) return out;
  }

  m = raw.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(20\d{2})\b/);
  if (m) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    if (mo) return iso(+m[3], mo, +m[2]);
  }

  m = raw.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(20\d{2})\b/);
  if (m) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    if (mo) return iso(+m[3], mo, +m[1]);
  }
  return undefined;
}

function amountIn(s: string): number | undefined {
  const m = s.match(/\d[\d,]*\.\d{2}/g);
  if (!m) return undefined;
  const vals = m.map((x) => parseFloat(x.replace(/,/g, ""))).filter((n) => Number.isFinite(n));
  return vals.length ? Math.max(...vals) : undefined;
}

/** The grand total: prefer a labelled "total / amount due" line (never a
 *  subtotal); otherwise fall back to the largest amount on the receipt. */
export function findTotal(lines: string[]): number | undefined {
  const labelled = lines
    .filter((l) => /total|amount due|balance due|grand total/i.test(l) && !/sub[\s-]?total/i.test(l))
    .map(amountIn)
    .filter((n): n is number => n != null);
  if (labelled.length) return Math.max(...labelled);

  const all = lines.map(amountIn).filter((n): n is number => n != null);
  return all.length ? Math.max(...all) : undefined;
}

export function parseReceiptText(raw: string): ReceiptFields {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: ReceiptFields = {};
  const merchant = findMerchant(lines);
  const date = findDate(raw);
  const total = findTotal(lines);
  if (merchant) out.merchant = merchant;
  if (date) out.date = date;
  if (total != null) out.total = total;
  return out;
}
