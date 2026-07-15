// Price comparison across competitor stores. Pure + unit-tested — the network
// call lives in /api/inventory/price-compare; this file only decides *what* to
// show. Two sources feed it: a live price API (UPCitemdb offers) and the user's
// saved manual compare-links. Rule: when the API returns any offers they win
// and the manual links are bypassed; otherwise the manual links are shown.

import type { PriceLink } from "./types";

/** A single competitor price, from a live API or a saved manual link. */
export type PriceOffer = {
  store: string;
  url?: string;
  price?: number;
  currency?: string;
  condition?: string;
  source: "api" | "manual";
};

/** An offer before we tag where it came from (what a lookup provider returns). */
export type RawOffer = Omit<PriceOffer, "source">;

export type PriceSource = "api" | "manual" | "none";

export type PriceComparison = {
  source: PriceSource;
  /** Cheapest-first; priced offers rank ahead of unpriced ones. */
  offers: PriceOffer[];
  /** The cheapest offer that actually carries a price, if any. */
  best?: PriceOffer;
};

function posNum(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function tidy(
  raw: RawOffer[],
  source: "api" | "manual",
  fallbackCurrency?: string
): PriceOffer[] {
  return raw
    .map((o) => ({
      store: (o.store ?? "").trim(),
      url: o.url?.trim() || undefined,
      price: posNum(o.price),
      currency: o.currency?.trim() || fallbackCurrency,
      condition: o.condition?.trim() || undefined,
      source,
    }))
    .filter((o) => o.store !== "" || o.url !== undefined);
}

function cheapestFirst(offers: PriceOffer[]): PriceOffer[] {
  return [...offers].sort((a, b) => {
    if (a.price == null && b.price == null) return 0;
    if (a.price == null) return 1; // unpriced sinks to the bottom
    if (b.price == null) return -1;
    return a.price - b.price;
  });
}

/**
 * Merge the two sources with API precedence. If the live API returned any
 * usable offers, show those and bypass the manual links; otherwise fall back to
 * the user's saved compare-links.
 */
export function resolvePriceComparison(
  apiOffers: RawOffer[],
  manualLinks: PriceLink[],
  fallbackCurrency?: string
): PriceComparison {
  const api = tidy(apiOffers, "api", fallbackCurrency);
  if (api.length > 0) {
    const offers = cheapestFirst(api);
    return { source: "api", offers, best: offers.find((o) => o.price != null) };
  }
  const manual = tidy(
    manualLinks.map((l) => ({
      store: l.store,
      url: l.url,
      price: l.price,
      currency: l.currency,
    })),
    "manual",
    fallbackCurrency
  );
  if (manual.length > 0) {
    const offers = cheapestFirst(manual);
    return { source: "manual", offers, best: offers.find((o) => o.price != null) };
  }
  return { source: "none", offers: [] };
}

/** Positive savings of the best offer vs. what the user paid, else undefined. */
export function savingsVsPaid(
  best: PriceOffer | undefined,
  paidPrice?: number
): number | undefined {
  const bestPrice = best?.price;
  if (bestPrice == null || paidPrice == null) return undefined;
  const diff = paidPrice - bestPrice;
  return diff > 0 ? diff : undefined;
}
