import { describe, expect, it } from "vitest";
import { advisories, auditError, evaluate } from "../../scripts/audit-policy.mjs";

const counts = (o: Partial<Record<string, number>> = {}) => {
  const c = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, ...o };
  return { ...c, total: c.info + c.low + c.moderate + c.high + c.critical };
};
const report = (o: Partial<Record<string, number>> = {}, vulnerabilities = {}) => ({
  vulnerabilities,
  metadata: { vulnerabilities: counts(o) },
});

describe("evaluate", () => {
  it("passes a clean tree", () => {
    expect(evaluate(report(), report()).failures).toEqual([]);
  });

  it("passes dev-only moderates and says so, rather than failing forever", () => {
    const r = evaluate(report({ moderate: 10 }), report());
    expect(r.failures).toEqual([]);
    expect(r.notes[0]).toContain("10 lower-severity");
    expect(r.notes[0]).toContain("not shipped");
  });

  it("fails anything in the production tree, even low", () => {
    const r = evaluate(report({ low: 1 }), report({ low: 1 }));
    expect(r.failures[0]).toContain("production tree");
  });

  it("fails high and critical even in dev-only packages", () => {
    expect(evaluate(report({ high: 1 }), report()).failures[0]).toContain("high/critical");
    expect(evaluate(report({ critical: 2 }), report()).failures[0]).toContain("2 high/critical");
  });

  it("does not add the dev-only note when something already failed on severity", () => {
    expect(evaluate(report({ high: 1, moderate: 3 }), report()).notes).toEqual([]);
  });
});

describe("auditError", () => {
  it("treats an unreachable registry as unknown, never clean", () => {
    expect(auditError({ error: { code: "ENOTFOUND", summary: "audit endpoint returned an error" } })).toContain("audit endpoint");
    expect(auditError({ error: { code: "ENOTFOUND" } })).toBe("ENOTFOUND");
  });
  it("rejects missing or countless reports", () => {
    expect(auditError(null)).toBe("no readable report");
    expect(auditError({})).toContain("no vulnerability counts");
  });
  it("accepts a real report", () => {
    expect(auditError(report())).toBeNull();
  });
});

describe("advisories", () => {
  it("lists the root of each chain once, most severe first, skipping inherited names", () => {
    const adv = (severity: string, name: string, url: string) => ({ severity, name, title: `${name} problem`, url });
    const list = advisories(
      report(
        { moderate: 2, high: 1 },
        {
          minimatch: { name: "minimatch", via: [adv("moderate", "minimatch", "u1")] },
          glob: { name: "glob", via: ["minimatch", adv("moderate", "minimatch", "u1")] },
          lib: { name: "lib", via: [adv("high", "lib", "u2")] },
        },
      ),
    );
    expect(list.map((a: { name: string }) => a.name)).toEqual(["lib", "minimatch"]);
  });
});
