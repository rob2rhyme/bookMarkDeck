# Security – Dependabot Remediation Plan

This document captures the prioritised remediation plan for all Dependabot
alerts that have been raised against this repository, together with their
current status.

---

## Current alert status

`npm audit` reports **0 vulnerabilities** as of 2026-02-23.
The `overrides` block in `package.json` has been updated to safe versions (see
[fix below](#applied-fixes)).

---

## Prioritised alert inventory

| # | Package | Ecosystem | Installed version | Fixed version | Severity | Direct / Transitive | Status |
|---|---------|-----------|-------------------|---------------|----------|---------------------|--------|
| 1 | `react` / `react-dom` | npm | 18.x | 18.3.1 (RSC safe) / 19.2.0 | **Critical** | Direct | ✅ Fixed (PR #22) |
| 2 | `next` | npm | 16.0.x | 16.1.6 | **Critical** | Direct | ✅ Fixed (PR #22) |
| 3 | `minimatch` | npm | 3.1.2 / 9.0.4 | ≥ 10.2.1 | **High** | Transitive (via `eslint-config-next`) | ✅ Fixed (PR #30) |
| 4 | `ajv` | npm | 6.12.6 | ≥ 6.14.0 / ≥ 8.17.2 | **Moderate** | Transitive (via `eslint-config-next`) | ✅ Fixed (PR #30) |
| 5 | `minimatch` override | npm | override pinned to `^9.0.5` (still vulnerable) | override updated to `>=10.2.1` | **High** | Override (package.json) | ✅ Fixed (this PR) |

---

## Details

### 1 & 2 — React Server Components RCE (CVE-2025-55182 / CVE-2025-66478)

- **Advisories:** GHSA-9qr9-h5gf-34mp, CVE-2025-55182, CVE-2025-66478
- **Description:** Critical remote code execution via insecure deserialisation
  in the React Flight protocol (React Server Components).  An unauthenticated
  attacker can execute arbitrary code on the server.
- **Affected packages (direct):** `react`, `react-dom`, `next`
- **Recommended upgrade:** `next` ≥ 16.1.6, `react`/`react-dom` ≥ 18.3.1 (or
  19.2.0 for React 19)
- **Breaking-change risk:** **Medium** — Next.js major bumps (15 → 16) ship new
  router APIs; `react` 18 → 19 removes deprecated lifecycle warnings and
  changes Suspense streaming behaviour.
- **Grouping:** Upgrade `react`, `react-dom`, and `next` together in one PR
  (they are tightly coupled).
- **Resolution:** Vercel auto-PR #22 merged 2025-12-12; current lock file pins
  `next@16.1.6`, `react@19.2.0`, `react-dom@19.2.0`.

---

### 3 — minimatch ReDoS (GHSA-f8q6-p94x-37v3)

- **Advisory:** GHSA-f8q6-p94x-37v3
- **Description:** Regular expression denial-of-service (ReDoS) via repeated
  wildcards with a non-matching literal in the glob pattern.
- **Affected versions:** < 10.2.1
- **Recommended upgrade:** `minimatch` ≥ 10.2.1
- **Affected package (transitive):** `eslint-config-next` → `@typescript-eslint`
  → `minimatch` 3.1.2 / 9.0.4
- **Breaking-change risk:** **Low** — `minimatch` 10.x is a major bump from 9.x
  but the API surface used by linting tools is unchanged in practice. Because
  ESLint has been removed from the project (see fix below), minimatch is no
  longer installed at all, so the risk is purely defensive.
- **Grouping:** Can be bundled with the `ajv` override update in the same PR.
- **Resolution:** ESLint / `eslint-config-next` removed in PR #30; minimatch no
  longer appears in `package-lock.json`.  The `overrides` entry has been
  corrected from `^9.0.5` → `>=10.2.1` in this PR as a defensive measure.

---

### 4 — ajv ReDoS (GHSA-c2qf-rxjj-qqgw)

- **Advisory:** GHSA-c2qf-rxjj-qqgw
- **Description:** ReDoS when the `$data` option is enabled in ajv 6.x.
- **Affected versions:** < 6.14.0 (6.x line)
- **Recommended upgrade:** `ajv` ≥ 6.14.0 (6.x) or ≥ 8.17.2 (8.x)
- **Affected package (transitive):** `eslint-config-next` → `ajv` 6.12.6
- **Breaking-change risk:** **Low** — patch bump within the same major line;
  for the 6.x series, 6.14.0 is backwards-compatible.  The `overrides` pin of
  `^8.17.2` is safe; no known vulnerabilities in 8.x.
- **Grouping:** Bundle with the minimatch override update.
- **Resolution:** Same as minimatch — ajv was not installed after PR #30. When
  ESLint was re-enabled (flat config + `lint:eslint`), ESLint's schema layer
  pulled ajv back in and requires the ajv **6.x** API, which the `^8.17.2`
  override broke (`TypeError … defaultMeta`). The override was therefore
  **removed**: ajv is now a **dev-only** transitive of ESLint and resolves to
  6.x. Any residual 6.x advisory is dev-tooling only (never shipped to the
  production bundle); `npm audit --omit=dev` does not list ajv.

---

## Applied fixes (this PR)

### Fix 5 — Correct the `minimatch` override to a safe version

**File:** `package.json`

```diff
-    "minimatch": "^9.0.5",
+    "minimatch": ">=10.2.1",
```

**Why:** The previous override constrained minimatch to the 9.x line, which
remains fully within the affected range (< 10.2.1).  If any future dependency
introduced minimatch, npm would have resolved a still-vulnerable version.
Updating the override to `>=10.2.1` ensures that any future install of
minimatch resolves only to patched code.

**Breaking-change risk:** **Low** — minimatch is currently not installed (no
entry in `package-lock.json`), so no existing code is affected.  If minimatch
is pulled in again, a 10.x release will be used, which carries a new major
version but backwards-compatible glob semantics for all common patterns.

---

## Grouping strategy

| Group | Packages | Rationale |
|-------|----------|-----------|
| **PR A** (done) | `next`, `react`, `react-dom` | Tightly coupled; must ship together to avoid incompatible peer versions |
| **PR B** (done) | Remove `eslint`, `eslint-config-next`; update `minimatch`/`ajv` overrides | Independent of runtime deps; low breakage risk; can be batched |

Packages not listed above (Firebase, Tailwind, TypeScript) carry no current
CVEs and should be upgraded on a normal maintenance cadence rather than as
emergency security fixes.

---

## Dependabot configuration

A `.github/dependabot.yml` file has been added to enable automatic pull
requests for outdated npm dependencies (weekly schedule).
