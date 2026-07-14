import { describe, expect, it } from "vitest";

import {
  findDate,
  findMerchant,
  findTotal,
  parseReceiptText,
} from "@/features/inventory/lib/receiptOcr";

const SAMPLE = `BOSCH HOME CENTER
123 Main Street
Tel: 555-0100

Cordless Drill        149.99
Drill Bits             19.99
Subtotal              169.98
Tax                    14.02
TOTAL                 184.00

Date: 03/14/2026
Thank you!`;

describe("parseReceiptText", () => {
  it("pulls merchant, date, and the grand total from a receipt", () => {
    expect(parseReceiptText(SAMPLE)).toEqual({
      merchant: "BOSCH HOME CENTER",
      date: "2026-03-14",
      total: 184,
    });
  });

  it("returns an empty object when nothing is recognizable", () => {
    expect(parseReceiptText("~~~~\n****")).toEqual({});
  });
});

describe("findTotal", () => {
  const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
  it("prefers the labelled total over subtotal and line items", () => {
    expect(findTotal(lines("Item 50.00\nSubtotal 50.00\nTotal 54.25"))).toBe(54.25);
  });
  it("falls back to the largest amount when nothing is labelled", () => {
    expect(findTotal(lines("A 4.00\nB 12.50\nC 3.00"))).toBe(12.5);
  });
});

describe("findDate", () => {
  it("normalizes several formats to YYYY-MM-DD", () => {
    expect(findDate("2026-03-14")).toBe("2026-03-14");
    expect(findDate("03/14/2026")).toBe("2026-03-14"); // US M/D
    expect(findDate("25/12/2026")).toBe("2026-12-25"); // day > 12 → D/M
    expect(findDate("Mar 14, 2026")).toBe("2026-03-14");
    expect(findDate("14 Mar 2026")).toBe("2026-03-14");
    expect(findDate("no date here")).toBeUndefined();
  });
});

describe("findMerchant", () => {
  it("skips addresses/phones and takes the name line", () => {
    expect(findMerchant(["ACME TOOLS", "42 Oak Ave", "Tel: 555"])).toBe("ACME TOOLS");
    expect(findMerchant(["555-0100", "12/12/2026"])).toBeUndefined();
  });
});
