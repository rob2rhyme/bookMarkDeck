# Bookmark Deck — Full-Stack QA Audit Report

_Adapted to the app's real architecture: a Next.js 16 App Router PWA whose user
data CRUD happens **client-side directly against Firestore**. There is no
server DB, SQL, payments, or transactional email, so the generic template's
SQL/Stripe/email sections are N/A; the real trust boundary is **Firestore rules
+ Firebase Auth + a handful of secret-holding API routes**._

Status legend: ✅ fixed this pass · ⚠️ open / owner action · 🔎 unverified (needs
live deploy or real credentials).

---

## 0. What was fixed this pass

Shipped on `claude/full-stack-qa-test-5083zx`, each verified with
`typecheck + test + build` (and Playwright for the E2E):

| Commit | Area | Summary |
|--------|------|---------|
| harden headers/URL/docs | Frontend/Infra | `X-Frame-Options: DENY` + `Permissions-Policy`; `normalizeUrl()` blocks `javascript:`/`data:` and fixes bare-host relative opens; login dead-button class fix; doc-drift + `.env.example` + dead-`launcher-desktop` cleanups |
| crypto salt | Security | Per-payload random PBKDF2 salt with legacy fallback (backward-compatible) |
| AI rate limit | API | Per-user throttle on `ai-capture`/`insights` (Anthropic cost abuse) |
| test infra | Test | jsdom Vitest project + unit/hook/API(IDOR)/Playwright tests (419 vitest + 4 e2e) |
| ESLint | DevOps | ESLint enabled (non-blocking) + E2E CI job; ajv-override conflict resolved |
| deps | Security | `npm audit fix` cleared 3 critical + most high vulns (lockfile-only) |

Test suite grew from **384 → 419** passing tests (59 files) + a 4-test Playwright
public-surface suite.

---

## 1. Bug / issue table

| ID | Layer | Sev | Location | Issue | Status |
|----|-------|-----|----------|-------|--------|
| B1 | Infra/DB | Critical | deployed Firestore rules | Cross-user isolation depends on the **console-deployed** ruleset; repo `firestore.rules` is correct but no CI deploys it | ⚠️🔎 verify console / add deploy step (CLAUDE.md now documents the caveat) |
| B2 | API | Medium | `middleware.ts` | Matcher doesn't exclude `/api`; `/api/push/fire` (QStash) + `/api/push/health` may be blocked by `withAuth` | 🔎 verify at runtime, then exclude `/api/push/*` |
| B3 | Frontend | Medium | bookmark add/open | Raw URL stored/opened → `javascript:` renders as link; bare host opens relative | ✅ `normalizeUrl()` |
| B4 | Frontend/a11y | Medium | `HomePageClient` + folder pages | ~13 hand-rolled modals lack focus-trap (vs the shared `Modal`) | ⚠️ Phase 2a |
| B5 | Frontend | Low | `login/page.tsx` | `hidden flex` conflict on dead Apple/MS buttons | ✅ removed `flex` |
| B6 | Frontend | Low | app-wide | No `not-found.tsx`, no route `loading.tsx` | ⚠️ Phase 2a |
| B7 | Frontend/a11y | Low | `layout.tsx` | `viewport.maximumScale: 1` (zoom restriction) | ⚠️ verify on device |
| B8 | Frontend | Low | `HabitsDashboard` | Delete uses native `window.confirm` | ⚠️ Phase 2a |
| B9 | Build/Deps | Low | `package.json` | Capacitor CLI v8 vs core v6; `@types/node` v25 vs CI Node 20; `express` prod dep (launcher only) | ⚠️ owner |
| B10 | DevOps | Low | dependabot/eslint | dead `/launcher-desktop` references | ✅ removed |
| B11 | Deps | Critical→High | lockfile | 9 npm-audit vulns vs SECURITY.md's "0" | ✅ down to 2 high (next/sharp, no stable fix) |

---

## 2. Security findings (worst first)

| ID | Sev | Location | Exploit | Status / Remediation |
|----|-----|----------|---------|----------------------|
| S1 | Critical | deployed Firestore rules | If the live console ruleset is looser than the repo file, any authed user can read/write other users' data (all CRUD is client-side) | ⚠️🔎 **Verify the console ruleset**; deploy `firestore.rules` via CI. Repo rule is correct. |
| S2 | Critical→resolved | next-auth ≤4.24.14 + tar/websocket-driver | Known CVEs | ✅ patched within 4.x by `npm audit fix` |
| S3 | High | `next`/`sharp` | SSRF/DoS in Server Actions / image opt (several low-applicability to this app) | ⚠️ no stable fix (needs 16.3 stable); tracked |
| S4 | Medium | `src/utils/crypto.ts` | Static shared PBKDF2 salt → precomputation | ✅ per-payload random salt |
| S5 | Medium | `middleware.ts` | Push webhook possibly blocked (availability) | 🔎 verify + exclude `/api/push/*` |
| S6 | Low | `ai-capture`/`insights` | Authenticated Anthropic cost abuse | ✅ per-user rate limit |
| S7 | Low–Med | `next.config.ts` CSP | `script-src 'unsafe-inline'` + `https:` wildcards | ⚠️ documented nonce trade-off; `X-Frame-Options` + `Permissions-Policy` now added |
| — | ✅ Verified strong | — | Server-only Google token never reaches browser; R2 keys server-derived + per-user prefix-isolated; QStash webhook signature-verified; inputs clamped; **no secrets committed** | — |

---

## 3. UX friction log

- `/guide` (and until now, help pages) are **auth-walled** — a prospect can't see what the product does before signing up. ⚠️ Phase 2a.
- Mixed sync mental model: "saves automatically" copy **and** manual "Sync to cloud" buttons **and** "Connect to sync" chips coexist across Focus/Habits/Inventory.
- Inconsistent destructive-action confirms (native `window.confirm` in Habits vs custom modals elsewhere).
- No custom 404 → mistyped deep links hit a generic page with no way home. ⚠️ Phase 2a.
- **Strength:** genuinely good empty states + undo toasts across pillars.

---

## 4. Design & engagement + conversion

**Premium wins:** cohesive dark slate/blue token system; real focus-trap `Modal`
(with iOS scroll-lock + focus restore); rich empty states; ⌘K palette; installable
PWA with offline shell. **Top-5 conversion moves:** (1) unblock `/guide`+`/faq` pre-signup;
(2) fully zero-click one-login→all-pillars bridge; (3) custom 404; (4) consistent
confirm+undo; (5) surface the (built, dormant) AI capture as the premium hook.
Full cross-pillar engagement analysis lives in `ENGAGEMENT-ROADMAP.md` (Phase 2).

---

## 5. Performance summary

🔎 **Unverified** — no deploy/credentials, so Lighthouse, p95, and load tests
could not run. Static notes: `reactCompiler: true`; no route `loading.tsx`
skeletons; heavy client bundles on `/inventory` (Tesseract WASM OCR + barcode) —
verify code-splitting. N+1/index items are N/A (per-user Firestore doc reads,
no server queries).

---

## 6. Scorecard (0–10)

| Dimension | Score | Justification |
|-----------|-------|---------------|
| Functionality | 8 | Broad, coherent; core flows intact in code (runtime 🔎) |
| API robustness | 8 | Consistent auth-gating, clamped inputs, signature-verified webhook, now AI rate-limited |
| Data integrity | 6 | Correct owner-scoped rules in repo, but console state unverifiable (S1) |
| Security | 7.5 | Strong token separation + secret hygiene; salt fixed, deps triaged; residual next/next-auth + console-rule verification |
| Performance | N/A | Not measurable here (🔎) |
| UI consistency | 7 | Strong tokens; modal/confirm patterns still inconsistent |
| Beginner-friendliness | 7 | Great empty states; hurt by auth-walled help + generic 404 |
| Premium feel | 8 | Calm, cohesive, PWA-installable |
| Accessibility | 6 | 413 aria usages + real focus-trap primitive; sparse form labels, empty alts, `maximumScale:1` |
| Deployability | 7 | Clean CI (now +eslint/+e2e non-blocking); test coverage materially improved |

---

## 7. Priority roadmap

- **Fix now:** ⚠️ S1 verify+deploy Firestore console rules · 🔎 B2/S5 middleware `/api/push/fire` · ⚠️ S3 track next 16.3-stable.
- **Fix soon:** Phase 2a trust/UX (guide/faq, 404, modal consistency) · engagement wins (streak-at-risk nudges, milestone badges, weekly recap) — see `ENGAGEMENT-ROADMAP.md`.
- **Nice to have:** B7 viewport zoom · B9 version skew · CSP wildcard tightening.

## 8. Coverage statement

**Verified (static + build/test/audit + Playwright public surface):** full route/API/data inventory; auth & token flow; Firestore rule coverage vs code; headers/CSP; dependency audit; test additions; a11y markup patterns; the shipped fixes above.
**NOT verified (🔎):** live Google OAuth + the authenticated app / Firestore sync; the live Firestore **console ruleset** (the top security fact); the middleware/webhook block (B2/S5); Lighthouse/perf; p95/load; cross-browser Safari/Edge; on-device camera/pinch-zoom — all need real credentials or a deployment absent from the sandbox.
