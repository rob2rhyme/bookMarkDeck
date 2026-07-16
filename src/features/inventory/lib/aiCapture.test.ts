import { describe, expect, it } from "vitest";

import {
  captureInstructions,
  extractJson,
  parseAiProduct,
  splitImageDataUrl,
} from "./aiCapture";

describe("splitImageDataUrl", () => {
  it("splits a webp data URL into media type + base64", () => {
    expect(splitImageDataUrl("data:image/webp;base64,AAAA")).toEqual({
      mediaType: "image/webp",
      data: "AAAA",
    });
  });

  it("accepts jpeg and png", () => {
    expect(splitImageDataUrl("data:image/jpeg;base64,/9j/4A==")?.mediaType).toBe(
      "image/jpeg"
    );
    expect(splitImageDataUrl("data:image/png;base64,iVBOR w==")).toBeNull(); // space = not base64
    expect(splitImageDataUrl("data:image/png;base64,iVBORw==")?.mediaType).toBe(
      "image/png"
    );
  });

  it("rejects other formats, missing payloads, and non-data URLs", () => {
    expect(splitImageDataUrl("data:image/gif;base64,AAAA")).toBeNull();
    expect(splitImageDataUrl("data:image/webp;base64,")).toBeNull();
    expect(splitImageDataUrl("https://example.com/x.png")).toBeNull();
    expect(splitImageDataUrl("data:text/html;base64,AAAA")).toBeNull();
  });
});

describe("extractJson", () => {
  it("parses a bare JSON object", () => {
    expect(extractJson('{"name":"Mug"}')).toEqual({ name: "Mug" });
  });

  it("tolerates fences and surrounding prose", () => {
    expect(
      extractJson('Here you go:\n```json\n{"name":"Mug","estPrice":9.5}\n```\nDone.')
    ).toEqual({ name: "Mug", estPrice: 9.5 });
  });

  it("returns null for junk or truncated JSON", () => {
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson('{"name": "Mug"')).toBeNull();
    expect(extractJson("")).toBeNull();
  });
});

describe("parseAiProduct", () => {
  it("normalizes a full result", () => {
    expect(
      parseAiProduct({
        name: "  Anker PowerCore 10000  ",
        brand: "Anker",
        category: "Electronics",
        estPrice: 24.989,
        description: "A compact 10,000 mAh USB power bank.",
      })
    ).toEqual({
      name: "Anker PowerCore 10000",
      brand: "Anker",
      category: "Electronics",
      estPrice: 24.99,
      description: "A compact 10,000 mAh USB power bank.",
    });
  });

  it("keeps a name-only result and drops null/absent fields", () => {
    expect(parseAiProduct({ name: "Mug", brand: null, estPrice: null })).toEqual({
      name: "Mug",
      brand: undefined,
      category: undefined,
      estPrice: undefined,
      description: undefined,
    });
  });

  it("rejects empty names, non-objects, and arrays", () => {
    expect(parseAiProduct({ name: "" })).toBeNull();
    expect(parseAiProduct({ name: "   " })).toBeNull();
    expect(parseAiProduct(null)).toBeNull();
    expect(parseAiProduct("Mug")).toBeNull();
    expect(parseAiProduct([{ name: "Mug" }])).toBeNull();
  });

  it("drops unusable prices and clamps runaway strings", () => {
    expect(parseAiProduct({ name: "Mug", estPrice: -3 })?.estPrice).toBeUndefined();
    expect(parseAiProduct({ name: "Mug", estPrice: "9" })?.estPrice).toBeUndefined();
    expect(parseAiProduct({ name: "Mug", estPrice: NaN })?.estPrice).toBeUndefined();
    const long = parseAiProduct({ name: "x".repeat(500) });
    expect(long?.name).toHaveLength(120);
  });
});

describe("captureInstructions", () => {
  it("mentions the requested currency and the empty-name miss contract", () => {
    const p = captureInstructions("EUR");
    expect(p).toContain("EUR");
    expect(p).toContain('{"name": ""}');
  });
});
