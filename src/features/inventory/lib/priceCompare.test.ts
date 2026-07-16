import { describe, expect, it } from "vitest";

import {
  resolvePriceComparison,
  savingsVsPaid,
  sortedOffers,
  type RawOffer,
} from "./priceCompare";
import { parseUpcItemDbOffers } from "./productLookup";
import type { PriceLink } from "./types";

const manual: PriceLink[] = [
  { id: "a", store: "Best Buy", url: "https://bb.example/p", price: 220 },
  { id: "b", store: "Newegg", url: "https://ne.example/p", price: 199 },
  { id: "c", store: "No price", url: "https://np.example/p" },
];

const apiOffers: RawOffer[] = [
  { store: "Amazon", url: "https://amz.example/p", price: 189, condition: "New" },
  { store: "Walmart", url: "https://wm.example/p", price: 210 },
];

describe("resolvePriceComparison", () => {
  it("uses API offers and bypasses manual links when the API returns data", () => {
    const r = resolvePriceComparison(apiOffers, manual, "USD");
    expect(r.source).toBe("api");
    expect(r.offers.map((o) => o.store)).toEqual(["Amazon", "Walmart"]);
    expect(r.best?.store).toBe("Amazon");
    expect(r.best?.price).toBe(189);
  });

  it("falls back to manual compare-links when the API has no offers", () => {
    const r = resolvePriceComparison([], manual, "USD");
    expect(r.source).toBe("manual");
    // cheapest-first; the unpriced link sinks to the bottom
    expect(r.offers.map((o) => o.store)).toEqual(["Newegg", "Best Buy", "No price"]);
    expect(r.best?.store).toBe("Newegg");
  });

  it("reports 'none' when neither source has anything", () => {
    expect(resolvePriceComparison([], []).source).toBe("none");
  });

  it("drops non-positive prices but keeps the link", () => {
    const r = resolvePriceComparison(
      [{ store: "Store", url: "https://s.example", price: 0 }],
      [],
      "USD"
    );
    expect(r.source).toBe("api");
    expect(r.offers[0].price).toBeUndefined();
    expect(r.offers[0].store).toBe("Store");
  });

  it("applies the fallback currency to offers missing one", () => {
    const r = resolvePriceComparison(
      [{ store: "S", url: "https://s.example", price: 10 }],
      [],
      "EUR"
    );
    expect(r.offers[0].currency).toBe("EUR");
  });
});

describe("sortedOffers", () => {
  it("asc keeps cheapest-first; desc reverses priced offers only", () => {
    const c = resolvePriceComparison([], manual, "USD");
    expect(sortedOffers(c, "asc").map((o) => o.store)).toEqual([
      "Newegg",
      "Best Buy",
      "No price",
    ]);
    expect(sortedOffers(c, "desc").map((o) => o.store)).toEqual([
      "Best Buy",
      "Newegg",
      "No price", // unpriced stays last in both directions
    ]);
  });
});

describe("savingsVsPaid", () => {
  it("returns the positive gap between paid and the best offer", () => {
    const r = resolvePriceComparison(apiOffers, manual, "USD");
    expect(savingsVsPaid(r.best, 250)).toBe(61);
  });
  it("is undefined when the best offer isn't cheaper", () => {
    const r = resolvePriceComparison(apiOffers, manual, "USD");
    expect(savingsVsPaid(r.best, 150)).toBeUndefined();
  });
  it("is undefined without a paid price or best offer", () => {
    expect(savingsVsPaid(undefined, 100)).toBeUndefined();
    expect(savingsVsPaid({ store: "s", source: "api" }, 100)).toBeUndefined();
  });
});

describe("parseUpcItemDbOffers", () => {
  it("maps merchant/price/link and skips empties", () => {
    const offers = parseUpcItemDbOffers({
      items: [
        {
          offers: [
            { merchant: "Amazon", price: 199.99, link: "https://a.example", currency: "USD", condition: "New" },
            { domain: "walmart.com", list_price: 210, link: "https://w.example" },
            { price: 5 }, // no store, no link → dropped
          ],
        },
      ],
    });
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({ store: "Amazon", price: 199.99, url: "https://a.example" });
    expect(offers[1]).toMatchObject({ store: "walmart.com", price: 210 });
  });

  it("returns [] for a shapeless or offer-less response", () => {
    expect(parseUpcItemDbOffers(null)).toEqual([]);
    expect(parseUpcItemDbOffers({ items: [{}] })).toEqual([]);
  });
});
