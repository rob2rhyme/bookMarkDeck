import { describe, expect, it } from "vitest";

import {
  looksScannable,
  normalizeBarcode,
  openFactsCategory,
  parseOpenFacts,
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

describe("openFactsCategory", () => {
  it("keeps the readable leaf, stripping a language prefix and dashes", () => {
    expect(openFactsCategory("en:beverages, en:carbonated-drinks")).toBe(
      "carbonated drinks"
    );
    expect(openFactsCategory("Snacks")).toBe("Snacks");
    expect(openFactsCategory(undefined)).toBeUndefined();
  });
});

describe("parseOpenFacts", () => {
  it("maps an Open Facts hit (name, first brand, leaf category, front image)", () => {
    const info = parseOpenFacts({
      status: 1,
      product: {
        product_name: "Pocari Sweat",
        brands: "Otsuka, Pocari",
        categories: "en:beverages, en:sports-drinks",
        image_front_url: "https://img.off/front.jpg",
        image_url: "https://img.off/any.jpg",
      },
    });
    expect(info).toEqual({
      name: "Pocari Sweat",
      brand: "Otsuka",
      category: "sports drinks",
      imageUrl: "https://img.off/front.jpg",
    });
  });

  it("treats status 0 / missing product as a miss", () => {
    expect(parseOpenFacts({ status: 0, status_verbose: "product not found" })).toBeNull();
    expect(parseOpenFacts({ status: 1 })).toBeNull();
    expect(parseOpenFacts({ status: 1, product: { quantity: "500ml" } })).toBeNull();
    expect(parseOpenFacts("nope")).toBeNull();
  });

  it("falls back through name fields and tolerates a string status", () => {
    const info = parseOpenFacts({
      status: "1",
      product: { generic_name: "Kettle", brands: "Acme" },
    });
    expect(info?.name).toBe("Kettle");
    expect(info?.brand).toBe("Acme");
  });
});
