# Monetizing Bookmark Deck as a PWA

_How to charge for the app when it ships as an installable PWA (no app-store
billing). The model your docs already chose — freemium annual subscription
(~$19.99/yr) gating only metered-cost features — is right; a PWA changes the
**rails and margins**, not the model. No billing/entitlement code exists today._

## PWA changes the economics, mostly in your favor

| | PWA (web billing) | App Store / Play |
|---|---|---|
| Platform cut | ~0% (processor fee ~3–5%) | 15–30% |
| $19.99/yr nets | ~$18.80–19.30 | ~$14–17 |
| Payment rail | Any (Stripe / Paddle / Lemon Squeezy) | Apple/Google IAP only |
| Billing ops | You own (tax, dunning, portal) | Store handles |

You keep almost all the revenue but own the plumbing — worth it **if you offload
tax** (below). Note: **installed-PWA push works on iOS 16.4+**, so the premium
push-when-closed reminders are deliverable without the store.

## 1. Payment rail — the real PWA decision

- **Merchant-of-record (Lemon Squeezy / Paddle) — recommended for a solo owner.**
  They become the seller and remit **global VAT/sales tax**, handle invoicing,
  dunning, chargebacks. ~5% + fixed. Removes the biggest hidden cost of selling
  worldwide as an individual.
- **Stripe (+ Stripe Tax + Billing)** — lower fee (~2.9%+30¢), more control, but
  **you** are merchant of record and liable for tax filing everywhere. Graduate
  to this once volume justifies the ops.

All three provide a hosted **customer portal** — link it from the Account menu.

## 2. Entitlement architecture (reuses infra you already run)

Data is client-side Firestore, so a client-written `isPro` flag is worthless.
The **only** true enforcement point is the six server API routes. Recommended
path avoids net-new Firebase Admin SDK:

```
Checkout (hosted)  →  /api/billing/webhook  →  Upstash Redis: entitlement[uid]
   (LS/Paddle/Stripe)   (signature-verified,        │  = { pro, until, scanQuota }
                          like push/fire)            │
                                    next-auth jwt callback reads it → token.pro
                                    metered routes check token.pro BEFORE spending
                                    on Anthropic / UPC / R2
```

Why it fits: **Upstash is already a dependency** (QStash) — reuse Redis as the
entitlement store; **every metered route already calls `getToken()`** — add
`token.pro` in the next-auth `jwt` callback and gate on it (~5 lines/route); the
webhook mirrors the existing signature-verified `push/fire` route. Client reads
`session.pro` for UI gating only; the server JWT is the real gate. Free-tier
metering = a Redis scan counter → N free AI scans, then `402` with an upgrade
prompt, capping your Anthropic/UPC bill.

## 3. What to gate vs keep free (per your roadmap — never claw back)

- **Free forever** (the acquisition wedge vs Sortly's 100-item / Itemtopia's
  20-item caps): unlimited items, all four pillars, manual price links, ledgers,
  insights, exports, local + own-cloud backup, on-device capture.
- **Premium (~$19.99/yr)** — meter only marginal cost / net-new infra:
  1. AI photo capture + AI insights (Anthropic) — **already built**, dormant.
  2. Real-time price offers (paid UPC API) — free keeps trial + saved links.
  3. Push-when-closed reminders (QStash).
  4. Photo storage at scale (R2 beyond a free allowance).
  5. Later: household → a higher family tier.

## 4. Models beyond subscription (fit the calm brand)

- **Primary:** annual subscription (items 1–4 are metered — a one-time price
  bleeds forever).
- **One-time "Supporter" unlock** for *non-metered* extras (themes, advanced
  app-lock) — for subscription-averse users.
- Donations / "buy me a coffee". **Avoid ads** — they'd destroy the
  private/on-device positioning that is the moat.

## 5. Sequencing (Track-C rule)

Ship billing **with** the first metered feature as one unit: Lemon Squeezy/Stripe
+ the Upstash entitlement gate + a free-scan quota + un-hiding AI capture. Don't
ship AI capture ungated (you'd bleed API cost); don't build billing with nothing
to sell.

**New code (~4 files):** `/api/billing/checkout`, `/api/billing/webhook`,
`lib/entitlement.ts` (server), `useEntitlement()` (client) + a `token.pro` check
in the six metered routes. Realistic expectation (per your docs): a calm niche
lifestyle business — a few thousand happy subscribers at near-zero marginal cost.
