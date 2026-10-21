# FUTURE-PLANS.md — deferred decisions & pending items

The single place for things the owner has **deliberately deferred**. When one is
picked up, move it out of here (into a PR / the relevant roadmap doc). Larger
feature roadmaps stay where they are — `INVENTORY-ROADMAP.md` (My Stuff Phases
2–4 + commercialization) and `FOCUS-INTEGRATION.md` (gated backlog B1–B9);
this file is for owner-level decisions and small cleanups, not feature planning.

_Last reviewed: 2026-07-16._

## Owner console/config actions (no code change needed)

0. **Turn on AI capture.** Shipped fully wired but dormant, and the **✨ AI add
   button is hidden** (owner decision 2026-07-16). To go live, two steps:
   (a) add `ANTHROPIC_API_KEY` (console.anthropic.com) in Vercel env;
   (b) in `InventoryDashboard.tsx`, swap the AI-add button's `hidden` class
   back to `flex` (the comment above it marks the spot), then redeploy. The
   `/guide` section is written as "coming soon" — flip its title/last sentence
   to live wording at the same time. Default model is `claude-haiku-5-5`
   (cheapest vision tier, about a tenth of a cent per scan); set
   `AI_CAPTURE_MODEL=claude-opus-5-5` (roughly 1–3 cents a scan) for max
   accuracy. Both routes take the model from `aiModel()` in
   `src/features/inventory/lib/aiCapture.ts`. Later, when opening it
   to paying users: add a per-user quota + billing gate (Track C in
   `ANALYSIS-MOBILE-APP-STRATEGY.md` §3 — billing lands *with* the metered
   feature).

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

## Feature work parked by owner decision

2a. **Affiliate-tagged live offers (parked 2026-07-16 — "AI capture instead
    for now").** The plan when picked up: (i) a pure `withAffiliateTag(url)`
    rewriter applied to fetched offers (FTC disclosure line + never silently
    rewrite user-typed links); (ii) free retailer offer feeds via the eBay
    Browse API (EPN campaign id in the `X-EBAY-C-ENDUSERCTX` header) and the
    Best Buy API (also gives "in stock nearby" via its Stores API); (iii)
    Amazon last — its Creators API (successor to PA-API, retired 2026-05)
    requires an Associates account with **10+ qualifying sales in the trailing
    30 days**, so start with plain tagged Amazon search links until volume
    exists. Owner currently has an Amazon Associates account only.

## Small doc/tooling follow-ups

5. **`npm run audit` script** (the one unshipped piece of FOCUS-INTEGRATION
   Phase 0b — headers and `.env.example` are done).

## Verification still worth a minute

7. **On-device smoke test** after any deploy that touches auth or the item
   sheet: fresh open → no pillar asks "Sign in to sync"; My Stuff → add item →
   add details → no sideways pan, footer clear of the bottom nav.
