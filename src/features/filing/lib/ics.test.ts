import { describe, expect, it } from "vitest";

import { buildIcs, escapeText, filingEvents, foldLine } from "@/features/filing/lib/ics";
import type { FilingDocument, FilingFolder, Obligation } from "@/features/filing/lib/types";

const ob = (over: Partial<Obligation> = {}): Obligation => ({
  id: "o1",
  kind: "renew",
  dueOn: "2026-09-01",
  ...over,
});

const doc = (over: Partial<FilingDocument> = {}): FilingDocument => ({
  id: "d1",
  title: "Auto policy",
  folderId: "f1",
  aliases: [],
  tags: [],
  obligations: [],
  createdAt: null,
  updatedAt: null,
  ...over,
});

const folder = (over: Partial<FilingFolder> = {}): FilingFolder => ({
  id: "f1",
  name: "Insurance",
  homePlaceId: null,
  currentPlaceId: null,
  parentId: null,
  aliases: [],
  tags: [],
  createdAt: null,
  updatedAt: null,
  ...over,
});

describe("escapeText", () => {
  it("escapes the four reserved characters", () => {
    expect(escapeText("a,b;c\\d")).toBe("a\\,b\;c\\\\d");
    expect(escapeText("one\ntwo")).toBe("one\\ntwo");
    expect(escapeText("one\r\ntwo")).toBe("one\\ntwo");
  });

  it("escapes the backslash first, so an escape isn't re-escaped", () => {
    // Naive ordering turns "\," into "\\\\," — a literal backslash then a comma.
    expect(escapeText("\\,")).toBe("\\\\\\,");
  });
});

describe("foldLine", () => {
  const bytes = (s: string) => new TextEncoder().encode(s).length;

  it("leaves a short line alone", () => {
    expect(foldLine("SUMMARY:short")).toBe("SUMMARY:short");
  });

  it("folds at 75 octets with a leading space on continuations", () => {
    const folded = foldLine("SUMMARY:" + "a".repeat(200));
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(bytes(p)).toBeLessThanOrEqual(75);
    for (const p of parts.slice(1)) expect(p.startsWith(" ")).toBe(true);
  });

  it("never splits a multi-byte character across the fold", () => {
    // The failure mode: measuring characters, not bytes, puts half an emoji at
    // the end of a line and corrupts the file.
    const folded = foldLine("SUMMARY:" + "🗂️".repeat(40));
    for (const p of folded.split("\r\n")) {
      expect(bytes(p)).toBeLessThanOrEqual(75);
      // A corrupted split shows up as a lone surrogate.
      expect(p).toBe(Array.from(p).join(""));
      expect(/[\uD800-\uDFFF]/.test(p.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ""))).toBe(false);
    }
  });
});

describe("filingEvents", () => {
  it("emits one event per open obligation, with where it lives", () => {
    const events = filingEvents([doc({ obligations: [ob({ label: "Premium" })] })], [folder()]);
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe("Premium");
    expect(events[0].description).toBe("Auto policy — Insurance");
    expect(events[0].date).toBe("2026-09-01");
  });

  it("falls back to the paper's title when the obligation has no label", () => {
    expect(filingEvents([doc({ obligations: [ob()] })], [folder()])[0].summary).toBe("Auto policy");
  });

  it("uses the full trail when one is supplied", () => {
    const events = filingEvents([doc({ obligations: [ob()] })], [folder()], {
      trailFor: () => ["Garage", "Cabinet", "Insurance"],
    });
    expect(events[0].description).toBe("Auto policy — Garage > Cabinet > Insurance");
  });

  it("says Unfiled when the paper has no folder", () => {
    const events = filingEvents([doc({ folderId: null, obligations: [ob()] })], []);
    expect(events[0].description).toContain("Unfiled");
  });

  it("skips archived papers, archived obligations and undated ones", () => {
    expect(filingEvents([doc({ archived: true, obligations: [ob()] })], [folder()])).toHaveLength(0);
    expect(filingEvents([doc({ obligations: [ob({ archived: true })] })], [folder()])).toHaveLength(0);
    expect(filingEvents([doc({ obligations: [ob({ dueOn: "" })] })], [folder()])).toHaveLength(0);
  });

  it("skips a completed one-off but keeps a completed repeat", () => {
    // A completed repeat has already rolled to its next date — still wanted.
    expect(
      filingEvents([doc({ obligations: [ob({ completedOn: "2026-08-01" })] })], [folder()])
    ).toHaveLength(0);
    expect(
      filingEvents(
        [doc({ obligations: [ob({ completedOn: "2026-08-01", repeat: "yearly" })] })],
        [folder()]
      )
    ).toHaveLength(1);
  });

  it("adds retention events only when asked", () => {
    const f = folder({ retentionRuleId: "tax-3", coversThrough: "2018-12-31" });
    expect(filingEvents([doc()], [f])).toHaveLength(0);
    const withRetention = filingEvents([doc()], [f], { includeRetention: true });
    expect(withRetention).toHaveLength(1);
    expect(withRetention[0].date).toBe("2021-12-31");
    expect(withRetention[0].summary).toBe("Clear out: Auto policy");
  });

  it("leaves a folder on hold out of the retention events", () => {
    const f = folder({ retentionRuleId: "tax-3", coversThrough: "2018-12-31", keepReason: "Audit" });
    expect(filingEvents([doc()], [f], { includeRetention: true })).toHaveLength(0);
  });

  it("sorts by date", () => {
    const docs = [
      doc({ id: "b", obligations: [ob({ id: "o2", dueOn: "2026-12-01" })] }),
      doc({ id: "a", obligations: [ob({ id: "o1", dueOn: "2026-01-01" })] }),
    ];
    expect(filingEvents(docs, [folder()]).map((e) => e.date)).toEqual(["2026-01-01", "2026-12-01"]);
  });

  it("gives each event a stable uid, so re-importing updates rather than duplicates", () => {
    const d = [doc({ obligations: [ob()] })];
    expect(filingEvents(d, [folder()])[0].uid).toBe(filingEvents(d, [folder()])[0].uid);
    expect(filingEvents(d, [folder()])[0].uid).toBe("obligation-d1-o1@bookmarkdeck");
  });
});

describe("buildIcs", () => {
  const one = filingEvents([doc({ obligations: [ob({ label: "Premium" })] })], [folder()]);

  it("wraps events in a valid calendar", () => {
    const ics = buildIcs(one);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
    expect((ics.match(/END:VEVENT/g) ?? []).length).toBe(1);
  });

  it("uses CRLF everywhere, as RFC 5545 requires", () => {
    const ics = buildIcs(one);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("writes all-day events with an exclusive end date", () => {
    const ics = buildIcs(one);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260901");
    expect(ics).toContain("DTEND;VALUE=DATE:20260902");
  });

  it("rolls the exclusive end over a month and a year boundary", () => {
    const ics = buildIcs(filingEvents([doc({ obligations: [ob({ dueOn: "2026-12-31" })] })], [folder()]));
    expect(ics).toContain("DTEND;VALUE=DATE:20270101");
  });

  it("emits the right RRULE per recurrence", () => {
    const rule = (o: Partial<Obligation>) =>
      buildIcs(filingEvents([doc({ obligations: [ob(o)] })], [folder()]));
    expect(rule({ repeat: "yearly" })).toContain("RRULE:FREQ=YEARLY\r\n");
    expect(rule({ repeat: "monthly" })).toContain("RRULE:FREQ=MONTHLY\r\n");
    expect(rule({ repeat: "quarterly" })).toContain("RRULE:FREQ=MONTHLY;INTERVAL=3");
    expect(rule({ repeat: "custom", repeatMonths: 120 })).toContain("RRULE:FREQ=YEARLY;INTERVAL=10");
    expect(rule({ repeat: "custom", repeatMonths: 48 })).toContain("RRULE:FREQ=YEARLY;INTERVAL=4");
    expect(rule({ repeat: "none" })).not.toContain("RRULE");
  });

  it("escapes a comma in a title rather than splitting the field", () => {
    const ics = buildIcs(
      filingEvents([doc({ title: "Policy, renewed", obligations: [ob()] })], [folder()])
    );
    expect(ics).toContain("Policy\\, renewed");
  });

  it("keeps every line within 75 octets", () => {
    const ics = buildIcs(
      filingEvents(
        [doc({ title: "A very long paper title ".repeat(8), obligations: [ob()] })],
        [folder({ name: "A very long folder name ".repeat(6) })]
      )
    );
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("is deterministic for a fixed stamp", () => {
    expect(buildIcs(one, "20260828T000000Z")).toBe(buildIcs(one, "20260828T000000Z"));
  });

  it("produces an empty but valid calendar with no events", () => {
    const ics = buildIcs([]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});
