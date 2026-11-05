/**
 * What `npm run audit` decides, kept apart from running npm so a test can feed it
 * reports (`src/lib/auditPolicy.test.ts`).
 *
 * The policy is CLAUDE.md's "Dependency security note", written down:
 *   - anything in the PRODUCTION tree fails, at any severity — it ships;
 *   - `high` / `critical` anywhere fails — "any high or critical line is new and real";
 *   - lower severities in dev-only packages are listed, not failed: the standing
 *     ESLint → glob/minimatch chain is denial-of-service through crafted glob
 *     patterns the lint plugins read at lint time, and npm's fix is a downgrade.
 */

export const SEVERITIES = ["info", "low", "moderate", "high", "critical"];

const rank = (s) => SEVERITIES.indexOf(s);

/** The advisories at the root of each chain: `via` holds a package name when the
 *  problem is inherited and an object when this package is where it lives. */
export function advisories(report) {
  const seen = new Map();
  for (const v of Object.values(report?.vulnerabilities ?? {})) {
    for (const via of v.via ?? []) {
      if (via && typeof via === "object") {
        const key = via.url || `${via.name}:${via.title}`;
        if (!seen.has(key)) {
          seen.set(key, {
            severity: via.severity,
            name: via.name ?? v.name,
            title: via.title ?? "",
            url: via.url ?? "",
          });
        }
      }
    }
  }
  return [...seen.values()].sort(
    (a, b) => rank(b.severity) - rank(a.severity) || a.name.localeCompare(b.name),
  );
}

/** `npm audit --json` answers `{ error }` when it could not reach the registry —
 *  that is "unknown", and must never read as "clean". */
export function auditError(report) {
  if (!report || typeof report !== "object") return "no readable report";
  if (report.error) {
    const e = report.error;
    return String(e.summary || e.code || e.detail || "npm audit failed");
  }
  if (!report.metadata?.vulnerabilities) return "report has no vulnerability counts";
  return null;
}

/**
 * @param {object} all  `npm audit --json`
 * @param {object} prod `npm audit --omit=dev --json`
 * @returns {{ failures: string[], notes: string[], counts: Record<string, number>, prodCounts: Record<string, number> }}
 */
export function evaluate(all, prod) {
  const counts = all.metadata.vulnerabilities;
  const prodCounts = prod.metadata.vulnerabilities;
  const failures = [];
  const notes = [];

  if (prodCounts.total > 0) {
    failures.push(
      `${prodCounts.total} advisor${prodCounts.total === 1 ? "y" : "ies"} in the production tree (${summary(prodCounts)}) — these ship`,
    );
  }
  const severe = (counts.high ?? 0) + (counts.critical ?? 0);
  if (severe > 0) {
    failures.push(`${severe} high/critical advisor${severe === 1 ? "y" : "ies"} anywhere in the tree`);
  }

  const devOnly = counts.total - prodCounts.total;
  if (devOnly > 0 && severe === 0) {
    notes.push(`${devOnly} lower-severity advisor${devOnly === 1 ? "y" : "ies"} in dev-only packages (${summary(counts)}) — not shipped`);
  }
  return { failures, notes, counts, prodCounts };
}

function summary(counts) {
  const parts = [...SEVERITIES].reverse().filter((s) => counts[s] > 0).map((s) => `${counts[s]} ${s}`);
  return parts.length ? parts.join(", ") : "none";
}
