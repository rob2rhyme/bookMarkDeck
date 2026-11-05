#!/usr/bin/env node
/**
 * `npm run audit` — is the dependency tree acceptable to merge?
 *
 * Advisories land without a code change, so this is run before merging anything
 * (CLAUDE.md → Dependency security note), not only when touching dependencies.
 * Bare `npm audit` is not enough: the standing dev-only moderates make it exit
 * non-zero forever, which teaches everyone to ignore it. This applies the
 * repo's actual policy (see `audit-policy.mjs`) and says why it failed.
 *
 *   exit 0  nothing that ships, nothing high/critical
 *   exit 1  the policy failed
 *   exit 2  could not audit (registry unreachable, bad output) — unknown, not clean
 *
 * Not wired into CI on purpose: a new advisory would turn every unrelated PR
 * red. CI would need a schedule, not a gate — that is the owner's call.
 */
import { spawnSync } from "node:child_process";
import { advisories, auditError, evaluate } from "./audit-policy.mjs";

const run = (args) => {
  const r = spawnSync("npm", ["audit", ...args, "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  // npm audit exits non-zero whenever it finds anything; the JSON is the answer.
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
};

const all = run([]);
const prod = run(["--omit=dev"]);

for (const [label, report] of [["full tree", all], ["production tree", prod]]) {
  const err = auditError(report);
  if (err) {
    console.error(`? could not audit the ${label}: ${err}`);
    console.error("  This is not a pass. Check the network and try again.");
    process.exit(2);
  }
}

const { failures, notes, counts, prodCounts } = evaluate(all, prod);

console.log(`production: ${prodCounts.total} advisories · whole tree: ${counts.total}`);
for (const a of advisories(all)) {
  console.log(`  ${a.severity.padEnd(8)} ${a.name} — ${a.title}${a.url ? ` (${a.url})` : ""}`);
}
for (const n of notes) console.log(`• ${n}`);

if (failures.length) {
  for (const f of failures) console.error(`✗ ${f}`);
  console.error("  Fix with `npx -y npm@11 update <pkg>` and read the lockfile diff (npm 10 rewrites it wholesale).");
  process.exit(1);
}
console.log("✓ nothing in the production tree, nothing high or critical");
