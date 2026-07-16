"use client";

import { useState } from "react";

import { ExternalLink } from "@/components/icons";
import {
  resolvePriceComparison,
  savingsVsPaid,
  sortedOffers,
  type PriceOffer,
  type RawOffer,
} from "@/features/inventory/lib/priceCompare";
import type { PriceLink } from "@/features/inventory/lib/types";
import { formatMoney } from "@/features/inventory/lib/value";

type PriceComparisonPanelProps = {
  /** Live offers (from the barcode price lookup); [] when none/unavailable. */
  liveOffers: RawOffer[];
  /** The lookup is still in flight. */
  loading: boolean;
  /** Saved manual compare-links — the fallback when the API has nothing. */
  manualLinks: PriceLink[];
  currency: string;
  /** What to measure savings against (item: price paid; wish: your estimate). */
  referencePrice?: number;
  referenceLabel?: string;
};

function OfferRow({
  offer,
  fallbackCurrency,
  best,
}: {
  offer: PriceOffer;
  fallbackCurrency: string;
  best: boolean;
}) {
  const price =
    offer.price != null
      ? formatMoney(offer.price, offer.currency ?? fallbackCurrency)
      : null;
  const inner = (
    <>
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        {best && <span aria-label="cheapest">⭐</span>}
        <span className="truncate">{offer.store || "Store"}</span>
        {offer.condition && (
          <span className="shrink-0 text-[10px] text-slate-500">
            {offer.condition}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1 tabular-nums">
        {price ? (
          <span className={best ? "text-emerald-300" : "text-slate-200"}>
            {price}
          </span>
        ) : (
          <span className="text-blue-300">View</span>
        )}
        {offer.url && <ExternalLink className="h-3.5 w-3.5 text-slate-500" />}
      </span>
    </>
  );
  const cls = `flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${
    best
      ? "border-emerald-600/40 bg-emerald-500/5"
      : "border-slate-800 bg-slate-950/40"
  }`;
  return offer.url ? (
    <a
      href={offer.url}
      target="_blank"
      rel="noopener noreferrer"
      title={offer.url}
      className={`${cls} transition hover:border-blue-400/60`}
    >
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/**
 * The price-comparison block shared by the item detail view and wishlist
 * entries: live API offers win, saved compare-links are the fallback,
 * cheapest-first with a low/high sort toggle, and a savings line against the
 * caller's reference price. Renders nothing when there's nothing to show.
 */
export function PriceComparisonPanel({
  liveOffers,
  loading,
  manualLinks,
  currency,
  referencePrice,
  referenceLabel = "what you paid",
}: PriceComparisonPanelProps) {
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const compare = resolvePriceComparison(liveOffers, manualLinks, currency);
  const savings = savingsVsPaid(compare.best, referencePrice);

  if (compare.source === "none" && !loading) return null;

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Price comparison
        </p>
        <span className="flex items-center gap-1.5">
          {compare.offers.some((o) => o.price != null) && (
            <button
              type="button"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              aria-label={`Sort by price, currently ${
                sortDir === "asc" ? "lowest first" : "highest first"
              }`}
              className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-300 transition hover:border-blue-400 hover:text-blue-200"
            >
              Price {sortDir === "asc" ? "↑ low first" : "↓ high first"}
            </button>
          )}
          {compare.source === "api" ? (
            <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-200">
              Live prices
            </span>
          ) : compare.source === "manual" ? (
            <span className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] font-medium text-slate-400">
              Saved links
            </span>
          ) : null}
        </span>
      </div>
      {compare.source === "none" && loading ? (
        <p className="text-xs text-slate-500">Checking live prices…</p>
      ) : (
        <>
          {savings != null && compare.best?.price != null && (
            <p className="mb-1.5 text-xs text-emerald-300">
              Cheapest{" "}
              {formatMoney(compare.best.price, compare.best.currency ?? currency)}{" "}
              — save {formatMoney(savings, currency)} vs. {referenceLabel}.
            </p>
          )}
          <ul className="flex flex-col gap-1.5">
            {sortedOffers(compare, sortDir).map((o, i) => (
              <li key={`${o.store}-${o.url ?? i}`}>
                <OfferRow
                  offer={o}
                  fallbackCurrency={currency}
                  best={o === compare.best}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default PriceComparisonPanel;
