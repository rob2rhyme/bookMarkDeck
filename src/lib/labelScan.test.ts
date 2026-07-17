import { describe, expect, it } from "vitest";

import { parseLabelText, scoreLine } from "@/lib/labelScan";

describe("scoreLine", () => {
  it("rejects digit-only, symbol-heavy, and boilerplate lines", () => {
    expect(scoreLine("012345678905")).toBeLessThan(0);
    expect(scoreLine("$$$ ---")).toBeLessThan(0);
    expect(scoreLine("Made in China")).toBeLessThan(0);
    expect(scoreLine("www.acme.com")).toBeLessThan(0);
  });
  it("rewards a short multi-word descriptor over a single word", () => {
    expect(scoreLine("Wireless Noise Cancelling Headphones")).toBeGreaterThan(
      scoreLine("Headphones")
    );
  });
});

describe("parseLabelText", () => {
  it("picks the product descriptor as the name", () => {
    const text = [
      "SONY",
      "WH-1000XM5",
      "Wireless Noise Cancelling Headphones",
      "Made in Malaysia",
      "0 27242 92060 5",
    ].join("\n");
    const out = parseLabelText(text);
    expect(out.name).toBe("Wireless Noise Cancelling Headphones");
    expect(out.brand).toBe("SONY");
  });

  it("caps the name length and trims OCR punctuation", () => {
    const out = parseLabelText("**Acme Deluxe Stainless Steel Kettle!!**");
    expect(out.name).toBe("Acme Deluxe Stainless Steel Kettle");
  });

  it("does not grab a stray all-caps token as the brand", () => {
    const out = parseLabelText("Sony A7 IV Camera Body");
    expect(out.brand).toBeUndefined();
    expect(out.name).toBe("Sony A7 IV Camera Body");
  });

  it("returns nothing usable from pure noise", () => {
    const out = parseLabelText("1234567890\n$$$$\n---\nNET WT 12 OZ");
    expect(out.name).toBeUndefined();
    expect(out.brand).toBeUndefined();
  });

  it("handles an empty / blank scan", () => {
    expect(parseLabelText("")).toEqual({});
    expect(parseLabelText("   \n  \n")).toEqual({});
  });
});
