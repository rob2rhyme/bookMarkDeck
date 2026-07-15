"use client";

import { useEffect, useState } from "react";

import type { RawOffer } from "@/features/inventory/lib/priceCompare";

type Result = {
  offers: RawOffer[];
  /** A paid price API is configured (vs. the keyless trial). */
  configured: boolean;
  loading: boolean;
};

/**
 * Fetch live competitor offers for an item's barcode from
 * /api/inventory/price-compare. No barcode → no request (manual links still
 * drive the comparison). Best-effort: network errors resolve to no offers.
 */
export function useItemPriceOffers(
  barcode: string | undefined,
  enabled: boolean
): Result {
  const [offers, setOffers] = useState<RawOffer[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setOffers([]);
    const code = (barcode ?? "").trim();
    if (!enabled || !code) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/inventory/price-compare?code=${encodeURIComponent(code)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : { offers: [], configured: false }))
      .then((d: { offers?: RawOffer[]; configured?: boolean }) => {
        if (cancelled) return;
        setOffers(Array.isArray(d.offers) ? d.offers : []);
        setConfigured(Boolean(d.configured));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [barcode, enabled]);

  return { offers, configured, loading };
}
