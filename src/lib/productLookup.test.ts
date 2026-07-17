import { describe, expect, it } from "vitest";

import {
  parseOpenLibrary,
  isIsbnEan,
  looksScannable,
  normalizeBarcode,
  openFactsCategory,
  parseOpenFacts,
  parseUpcItemDb,
  resolveUpcEndpoint,
  shortCategory,
  UPC_TRIAL_URL,
  usableLookupKey,
} from "@/lib/productLookup";

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

describe("usableLookupKey", () => {
  it("accepts a real-looking key", () => {
    expect(usableLookupKey("a1b2c3d4e5f6g7h8")).toBe("a1b2c3d4e5f6g7h8");
    expect(usableLookupKey("  padded_but_long_enough_key  ")).toBe(
      "padded_but_long_enough_key"
    );
  });
  it("rejects blanks, short strings, and pasted placeholders", () => {
    expect(usableLookupKey(undefined)).toBeUndefined();
    expect(usableLookupKey("")).toBeUndefined();
    expect(usableLookupKey("short")).toBeUndefined();
    expect(usableLookupKey("<your user_key from the dashboard>")).toBeUndefined();
    expect(usableLookupKey("your_user_key_here")).toBeUndefined();
    expect(usableLookupKey("PLACEHOLDER_VALUE_X")).toBeUndefined();
  });
});

describe("resolveUpcEndpoint", () => {
  it("defaults to the keyless trial endpoint", () => {
    expect(resolveUpcEndpoint(undefined, undefined)).toEqual({ url: UPC_TRIAL_URL });
  });
  it("falls back to trial when the paid endpoint has a placeholder key (the trap)", () => {
    expect(
      resolveUpcEndpoint(
        "https://api.upcitemdb.com/prod/v1/lookup",
        "<your user_key from the dashboard>"
      )
    ).toEqual({ url: UPC_TRIAL_URL });
  });
  it("uses the paid endpoint when a real key backs it", () => {
    const out = resolveUpcEndpoint(
      "https://api.upcitemdb.com/prod/v1/lookup",
      "realkey_abcdef123456"
    );
    expect(out).toEqual({
      url: "https://api.upcitemdb.com/prod/v1/lookup",
      key: "realkey_abcdef123456",
    });
  });
  it("passes a custom (non-upcitemdb) provider through as configured", () => {
    expect(resolveUpcEndpoint("https://api.example.com/lookup", undefined)).toEqual({
      url: "https://api.example.com/lookup",
    });
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

describe("isIsbnEan / parseOpenLibrary", () => {
  it("recognizes bookland EAN-13 codes", () => {
    expect(isIsbnEan("9780140328721")).toBe(true);
    expect(isIsbnEan("9791234567890")).toBe(true);
    expect(isIsbnEan("0123456789012")).toBe(false);
    expect(isIsbnEan("978014032872")).toBe(false); // 12 digits
  });

  it("parses an Open Library data response into a book prefill", () => {
    const key = "ISBN:9780140328721";
    const info = parseOpenLibrary(
      {
        [key]: {
          title: "Fantastic Mr Fox",
          authors: [{ name: "Roald Dahl" }],
          cover: { medium: "https://covers.openlibrary.org/b/id/x-M.jpg" },
        },
      },
      key
    );
    expect(info).toEqual({
      name: "Fantastic Mr Fox",
      author: "Roald Dahl",
      category: "Books",
      imageUrl: "https://covers.openlibrary.org/b/id/x-M.jpg",
      kindHint: "book",
    });
  });

  it("returns null on a miss or a title-less entry", () => {
    expect(parseOpenLibrary({}, "ISBN:1")).toBeNull();
    expect(parseOpenLibrary({ "ISBN:1": { authors: [] } }, "ISBN:1")).toBeNull();
  });
});
