import { describe, expect, it } from "vitest";

import {
  looksScannable,
  normalizeBarcode,
  parseUpcItemDb,
  shortCategory,
} from "@/features/inventory/lib/productLookup";

describe("normalizeBarcode / looksScannable", () => {
  it("strips whitespace and validates length", () => {
    expect(normalizeBarcode("  012 345 678 905 ")).toBe("012345678905");
    expect(looksScannable("012345678905")).toBe(true); // 12 digits
    expect(looksScannable("1234567")).toBe(false); // 7 digits
    expect(looksScannable("ABC123")).toBe(false); // non-numeric
  });
});

describe("parseUpcItemDb", () => {
  it("maps title/brand/model/category, picks the lowest price and first image", () => {
    const info = parseUpcItemDb({
      code: "OK",
      items: [
        {
          title: "Sony WH-1000XM4 Headphones",
          brand: "Sony",
          model: "WH-1000XM4",
          category: "Electronics > Audio > Headphones",
          lowest_recorded_price: 248.5,
          highest_recorded_price: 349.99,
          images: ["https://img.example/x.jpg", "https://img.example/y.jpg"],
        },
      ],
    });
    expect(info).toEqual({
      name: "Sony WH-1000XM4 Headphones",
      brand: "Sony",
      model: "WH-1000XM4",
      category: "Electronics > Audio > Headphones",
      price: 248.5,
      imageUrl: "https://img.example/x.jpg",
    });
  });

  it("falls back to the highest price when there's no lowest", () => {
    const info = parseUpcItemDb({
      items: [{ title: "Thing", highest_recorded_price: 40 }],
    });
    expect(info?.price).toBe(40);
  });

  it("returns null when there's nothing identifying to prefill", () => {
    expect(parseUpcItemDb({ items: [] })).toBeNull();
    expect(parseUpcItemDb({ items: [{ lowest_recorded_price: 10 }] })).toBeNull();
    expect(parseUpcItemDb("nonsense")).toBeNull();
    expect(parseUpcItemDb({})).toBeNull();
  });

  it("ignores non-positive prices and non-string images", () => {
    const info = parseUpcItemDb({
      items: [{ title: "X", lowest_recorded_price: 0, images: [123, null] }],
    });
    expect(info).toEqual({ name: "X" });
  });
});

describe("shortCategory", () => {
  it("keeps the taxonomy leaf", () => {
    expect(shortCategory("Electronics > Audio > Headphones")).toBe("Headphones");
    expect(shortCategory("Toys")).toBe("Toys");
    expect(shortCategory(undefined)).toBeUndefined();
  });
});
