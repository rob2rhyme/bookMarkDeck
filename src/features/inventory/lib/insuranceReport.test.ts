import { describe, expect, it } from "vitest";

import {
  buildInsuranceReport,
  insuranceReportHtml,
} from "@/features/inventory/lib/insuranceReport";
import type { InventoryItem } from "@/features/inventory/lib/types";

const today = "2026-07-14";

function item(partial: Partial<InventoryItem>): InventoryItem {
  return {
    id: partial.id ?? crypto.randomUUID(),
    name: partial.name ?? "Thing",
    locationId: null,
    tags: [],
    quantity: 1,
    links: [],
    photos: [],
    createdAt: null,
    updatedAt: null,
    ...partial,
  };
}

describe("buildInsuranceReport", () => {
  const items = [
    item({ name: "Camera", price: 1000, value: 900, purchaseDate: "2025-01-01", locationId: "l1", serial: "SN1", quantity: 1 }),
    item({ name: "Chairs", price: 100, quantity: 4, locationId: "l1" }), // paid 400
    item({ name: "Sold", price: 999, archived: true }), // excluded
  ];
  const names = { l1: "Office" };

  it("lists active items, resolves the location, and totals paid + value", () => {
    const r = buildInsuranceReport(items, names, today);
    expect(r.count).toBe(2);
    expect(r.totalPaid).toBe(1400); // 1000 + 400
    // Camera est = manual 900; Chairs est = price 100 × 4 (no date → flat) = 400
    expect(r.totalValue).toBe(1300);
    const camera = r.rows.find((x) => x.name === "Camera")!;
    expect(camera.location).toBe("Office");
    expect(camera.estValue).toBe(900);
  });

  it("sorts by estimated value, highest first", () => {
    expect(buildInsuranceReport(items, names, today).rows.map((r) => r.name)).toEqual([
      "Camera",
      "Chairs",
    ]);
  });
});

describe("insuranceReportHtml", () => {
  it("produces a self-contained doc with title, items, totals — HTML-escaped", () => {
    const report = buildInsuranceReport(
      [item({ name: "A & B <lamp>", price: 50 })],
      {},
      today
    );
    const html = insuranceReportHtml(report, {
      owner: "Robin",
      generatedAt: "July 14, 2026",
      currency: "USD",
    });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Schedule of Personal Property");
    expect(html).toContain("Prepared for Robin");
    expect(html).toContain("A &amp; B &lt;lamp&gt;"); // escaped, not raw
    expect(html).not.toContain("<lamp>");
    expect(html).toContain("$50");
  });
});
