import { describe, expect, it } from "vitest";

import { buildInventoryDigest } from "@/features/inventory/lib/digest";
import type { InventoryItem } from "@/features/inventory/lib/types";
import { attention, type Attention } from "@/features/inventory/lib/value";

const none = attention([], "2026-06-15");
const item = (name: string) => ({ id: name, name }) as InventoryItem;
const att = (over: Partial<Attention>): Attention => ({ ...none, ...over });

describe("buildInventoryDigest", () => {
  it("sends nothing when nothing needs a look", () => {
    expect(buildInventoryDigest(none)).toEqual({ title: "", body: "", count: 0 });
  });

  it("does not count an open loan that isn't overdue (the badge doesn't either)", () => {
    expect(buildInventoryDigest(att({ lentOut: [item("Drill")] })).count).toBe(0);
  });

  it("leads with the most urgent group and names its items", () => {
    const d = buildInventoryDigest(
      att({ useByExpired: [item("Milk"), item("Yogurt")], warrantySoon: [item("TV")] })
    );
    expect(d.title).toBe("2 items past use-by");
    expect(d.body).toBe("Milk and Yogurt · 1 warranty ending");
    expect(d.count).toBe(3);
  });

  it("puts a renewal ahead of upkeep and warranties", () => {
    const d = buildInventoryDigest(
      att({ renewsSoon: [item("Netflix")], maintenanceSoon: [item("Boiler")] })
    );
    expect(d.title).toBe("1 subscription renewing soon");
    expect(d.body).toBe("Netflix · 1 upkeep coming up");
  });

  it("caps named items and says how many more", () => {
    const d = buildInventoryDigest(att({ maintenanceOverdue: ["a", "b", "c", "d", "e"].map(item) }));
    expect(d.title).toBe("5 upkeep tasks overdue");
    expect(d.body).toBe("a, b, c and 2 more");
  });

  it("names nothing for a locked app, but still counts", () => {
    const d = buildInventoryDigest(
      att({ useByExpired: [item("Insulin")], lowStock: [item("Pills")] }),
      0
    );
    expect(d.title).toBe("1 item past use-by");
    expect(d.body).toBe("1 running low");
    expect(JSON.stringify(d)).not.toContain("Insulin");
  });
});
