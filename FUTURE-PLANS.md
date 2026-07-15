# FUTURE-PLANS.md — deferred decisions & pending items

The single place for things the owner has **deliberately deferred**. When one is
picked up, move it out of here (into a PR / the relevant roadmap doc). Larger
feature roadmaps stay where they are — `INVENTORY-ROADMAP.md` (My Stuff Phases
2–4 + commercialization) and `FOCUS-INTEGRATION.md` (gated backlog B1–B9);
this file is for owner-level decisions and small cleanups, not feature planning.

_Last reviewed: 2026-07-15._

## Owner console/config actions (no code change needed)

1. **Firebase OAuth safelist — fully zero-click login.** Deferred by owner
   decision (2026-07-15): leaving the setting as is for now. Today one Google
   sign-in connects all pillars after a single "Sign in to sync" tap when the
   silent bridge is rejected; safelisting removes even that tap. When ready:
   Firebase console → Authentication → Sign-in method → Google → *Safelist
   client IDs from external projects* → paste the next-auth `GOOGLE_CLIENT_ID`
   → Save. Details in `CLAUDE.md` → *Auth — dual-layer*.
2. **Paid UPCitemdb tier (optional).** Staying on the free keyless trial
   (~100 lookups/day, thinner store offers) by choice. To upgrade later:
   subscribe at upcitemdb.com, then set `UPC_LOOKUP_URL`
   (`https://api.upcitemdb.com/prod/v1/lookup`) + `UPC_LOOKUP_KEY` in Vercel
   and redeploy — no code change. Misconfig auto-falls back to the trial.

## Code cleanups (kept intentionally for now)

3. **Retired "Simple" habits dashboard.** `/habits` renders only the Classic
   dashboard; `SimpleHabitsDashboard.tsx`, `HabitsViewToggle.tsx`, and
   `SyncStatusChip` are unused by the route. Owner decision (2026-07-15):
   keep as is; delete in a future cleanup pass.
4. **Hidden Apple/Microsoft login buttons.** Present in
   `src/app/(auth)/login/page.tsx` with `className="hidden …"` — only Google is
   live. Keep until (if ever) those providers are added; otherwise remove in
   the same cleanup pass.

## Small doc/tooling follow-ups

5. **`npm run audit` script** (the one unshipped piece of FOCUS-INTEGRATION
   Phase 0b — headers and `.env.example` are done).
6. **`/habits/guide` freshness pass** — accurate today; give it the same
   user-friendly review the main guide got when Habits next changes.

## Verification still worth a minute

7. **On-device smoke test** after any deploy that touches auth or the item
   sheet: fresh open → no pillar asks "Sign in to sync"; My Stuff → add item →
   add details → no sideways pan, footer clear of the bottom nav.
