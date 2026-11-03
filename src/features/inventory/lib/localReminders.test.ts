import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { InventoryItem } from "@/features/inventory/lib/types";
import { MAX_REMINDERS, REMINDER_HOUR, fingerprint, planLocalReminders } from "@/features/inventory/lib/localReminders";

// Reminders land at 9:00 in the device's own zone, so these pin one.
const prevTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Los_Angeles";
});
afterAll(() => {
  process.env.TZ = prevTz;
});

const TODAY = "2026-11-03";
const NOW = new Date(2026, 10, 3, 8, 0, 0).getTime(); // 3 Nov 08:00 local
const item = (over: Partial<InventoryItem> = {}): InventoryItem =>
  ({ id: "i1", name: "Blender", quantity: 1, tags: [], links: [], photos: [], lentTo: null, lentDate: null, dueDate: null, ...over }) as InventoryItem;
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, REMINDER_HOUR).getTime();

describe("planLocalReminders", () => {
  it("reminds 14 days before a warranty ends, at 9:00 local", () => {
    const plan = planLocalReminders([item({ warrantyExpiry: "2026-12-20" })], TODAY, NOW);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ at: at(2026, 12, 6), title: "Warranty ending in 2 weeks", body: "Blender" });
  });

  it("uses each kind's own lead", () => {
    const plan = planLocalReminders(
      [
        item({ id: "a", name: "Milk", useBy: "2026-11-20" }),
        item({ id: "b", name: "Streaming", billingCycle: "monthly", renewsOn: "2026-11-25" }),
        item({ id: "c", name: "Boiler", maintenanceDate: "2026-12-01" }),
        item({ id: "d", name: "Drill", lentTo: "Sam", dueDate: "2026-11-30" }),
      ],
      TODAY,
      NOW
    );
    const byTitle = Object.fromEntries(plan.map((r) => [r.title, r]));
    expect(byTitle["Use by in 3 days"].at).toBe(at(2026, 11, 17));
    expect(byTitle["Renews in 3 days"].at).toBe(at(2026, 11, 22));
    expect(byTitle["Upkeep due tomorrow"].at).toBe(at(2026, 11, 30));
    expect(byTitle["Due back today"]).toMatchObject({ at: at(2026, 11, 30), body: "Drill — lent to Sam" });
  });

  it("leaves out an event already inside its lead, or past — other surfaces cover those", () => {
    const plan = planLocalReminders(
      [
        item({ id: "a", warrantyExpiry: "2026-11-10" }), // 14-day lead passed
        item({ id: "b", warrantyExpiry: "2026-10-01" }), // ended
        item({ id: "c", useBy: "2026-11-05" }), // lead (2 Nov) passed
      ],
      TODAY,
      NOW
    );
    expect(plan).toEqual([]);
  });

  it("leaves out archived, returned and let-go items", () => {
    const plan = planLocalReminders(
      [
        item({ id: "a", warrantyExpiry: "2027-03-01", archived: true }),
        item({ id: "b", warrantyExpiry: "2027-03-01", status: "returned" }),
      ],
      TODAY,
      NOW
    );
    expect(plan).toEqual([]);
  });

  it("reminds far ahead — months, not a day", () => {
    const plan = planLocalReminders([item({ warrantyExpiry: "2027-06-30" })], TODAY, NOW);
    expect(plan[0].at).toBe(at(2027, 6, 16));
  });

  it("ignores a date that isn't one", () => {
    expect(planLocalReminders([item({ warrantyExpiry: "soon" }), item({ id: "b", maintenanceDate: "2026-13-45x" })], TODAY, NOW)).toEqual([]);
  });

  it("keeps names and who something is lent to out of a locked app's notifications", () => {
    const plan = planLocalReminders([item({ lentTo: "Sam", dueDate: "2026-11-30" })], TODAY, NOW, false);
    expect(plan[0].title).toBe("Due back today");
    expect(plan[0].body).toBe("Open My Stuff to see which.");
    expect(JSON.stringify(plan)).not.toMatch(/Blender|Sam/);
  });

  it("gives every reminder its own stable, plugin-safe id", () => {
    const items = Array.from({ length: 40 }, (_, i) => item({ id: `i${i}`, warrantyExpiry: "2027-02-01", maintenanceDate: "2027-02-02" }));
    const a = planLocalReminders(items, TODAY, NOW);
    const b = planLocalReminders(items, TODAY, NOW);
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
    expect(new Set(a.map((r) => r.id)).size).toBe(a.length);
    for (const r of a) {
      expect(Number.isInteger(r.id)).toBe(true);
      expect(r.id).toBeGreaterThan(7001);
      expect(r.id).toBeLessThan(2 ** 31);
    }
  });

  it("is soonest first and capped under the platform limit", () => {
    const items = Array.from({ length: 80 }, (_, i) => item({ id: `i${i}`, warrantyExpiry: `2027-0${(i % 9) + 1}-15` }));
    const plan = planLocalReminders(items, TODAY, NOW);
    expect(plan).toHaveLength(MAX_REMINDERS);
    expect(plan.map((r) => r.at)).toEqual([...plan.map((r) => r.at)].sort((x, y) => x - y));
    expect(plan[0].at).toBeLessThanOrEqual(plan[plan.length - 1].at);
  });

  it("doesn't schedule the same moment twice when an item's date changes id's inputs", () => {
    const a = planLocalReminders([item({ warrantyExpiry: "2027-02-01" })], TODAY, NOW)[0];
    const b = planLocalReminders([item({ warrantyExpiry: "2027-02-02" })], TODAY, NOW)[0];
    expect(a.id).not.toBe(b.id); // a moved date is a new reminder; the old one is replaced by the replan
  });
});

describe("fingerprint", () => {
  it("changes when anything the device would show changes, and not otherwise", () => {
    const base = planLocalReminders([item({ warrantyExpiry: "2027-02-01" })], TODAY, NOW);
    expect(fingerprint(base)).toBe(fingerprint(planLocalReminders([item({ warrantyExpiry: "2027-02-01" })], TODAY, NOW)));
    expect(fingerprint(base)).not.toBe(fingerprint(planLocalReminders([item({ name: "Mixer", warrantyExpiry: "2027-02-01" })], TODAY, NOW)));
    expect(fingerprint([])).toBe("");
  });
});
