# ANALYSIS — Subscription vs one-time native app (2026-11-04)

Owner question: *side-by-side of subscription vs a flat-price native app; what are
users ready to pay; check the niche first; give a solid recommendation.*
Companion to `MONETIZATION-PWA.md` (rails, built), `ANALYSIS-MOBILE-APP-STRATEGY.md`
(store path) and `INVENTORY-ROADMAP.md` §4. Market figures are 2026 list prices
from comparison roundups, cross-checked across two or more each.

## Recommendation

**Freemium annual subscription, one tier, ~$19.99/yr, sold on the web through a
merchant of record, plus a one-time "Supporter" unlock at ~3× annual (~$59).**
Do not sell a flat-price native app. Three blockers come before either:

1. **The app is single-owner by design.** `DEFAULT_ALLOWED_EMAILS` and the
   `isOwner` rule in `firestore.rules` allow two addresses. Nobody can pay until
   that becomes a multi-tenant model (sign-in gate, rules, every session-gated
   route reviewed as if a stranger holds a session).
2. **Vercel Hobby forbids commercial use.** Pro is $20/mo and is the first cost line.
3. **No users yet.** The median subscription app earns ~$72/mo a year after
   launch. Price for a calm niche business and measure before building more.

## Why not a flat native app

The Capacitor shell loads `server.url`; data is in Firestore; the pay-worthy
features (AI capture, push digests, cloud voice, scan storage) each bill you per
use. A flat price sells a perpetual claim on recurring costs. The one-time apps
that work (Streaks $5.99, Forest $3.99, GoodLinks $4.99, Nest Egg $6.99) are files
on a phone with zero marginal cost. Selling the unlock inside an iOS app also
means IAP + receipt validation + handing the entitlement to the web session —
none of which exists, all of which the shipped Lemon Squeezy path replaces.
The US external-link ruling (0% since April 2025, Apple proposing 15%/5% in Aug
2026, Supreme Court pending) is a bonus, not a plan.

## Market, pillar by pillar

| Pillar | Comparables | Price today | Read |
|---|---|---|---|
| Bookmarks / read later | Raindrop, Instapaper, Readwise, GoodLinks | Raindrop Pro $28/yr · Instapaper $59.99/yr · Readwise $9.99/mo · GoodLinks $4.99 once | Pocket shut down 2025. $28/yr is the ceiling for bookmarks alone |
| Habits | Streaks, Habitify, Productive | Streaks $5.99 once · Habitify $30–50/yr, lifetime $60–120 · Productive ~$24–30/yr | One-time only where there is no sync |
| Focus timer | Forest, Session, Focus To-Do, Opal | Forest $3.99 once · Focus To-Do $8–12 lifetime · Session ~$60/yr · Opal ~$99/yr | A $4 one-time category; a feature, not a product |
| Home inventory | Sortly, Itemtopia, Nest Egg, HomeZada | Sortly from $24/mo · Itemtopia $7.99/mo or $79.99/yr · Nest Egg $6.99 once · HomeZada from $9.99/mo | Clearest pay signal; Encircle ended its consumer app Dec 2025 |
| Filing | Warranty Keeper, receipt tools | Free · $5–18/mo per seat (business) | No settled consumer price; retention feature |
| Notes | Obsidian, Anytype, Capacities, Notion | Obsidian Sync $4/mo · Anytype $4–16/mo · Capacities $9.99/mo · Notion Plus $10/mo | Free until sync; sync is what sells |

The equivalent stack (Raindrop + Habitify + Itemtopia + Obsidian Sync) is about
**$186/yr**. Nobody sells the bundle. The pay-worthy pillar is **My Stuff**.

## Willingness to pay (RevenueCat 2026, Adapty 2026, via secondary coverage)

- Median revenue 12 months after launch ≈ **$72/mo**; median annual price ≈ **$34.80**.
- 12-month retention of annual subscribers ≈ **28%** (≈72% don't renew) → LTV of
  an annual sub ≈ 1.4× first payment; floor for any lifetime price.
- **Productivity retains 85.6% yearly**, second only to Health & Fitness, with
  **36% monthly reactivation** — favour annual, make re-subscribing one tap.
- **23% of apps** sell lifetime beside subscription; one-time/lifetime share of
  models rose 6.4% → 10.3% (2023–25). Lifetime priced 2–12× annual; 2.5–4× is the norm.
- Subscription fatigue 41–73% depending on survey; 47% cancelled one in 2026.
  It shows as churn, not refusal to pay → low annual + a one-time door.
- Trials of 17+ days convert ~70% better than short ones.

## Side by side

| | Freemium annual (web billing) | One-time flat native app |
|---|---|---|
| Fit with cost structure | Strong — metered costs paid each year | Poor — perpetual claim on recurring costs |
| Platform cut | ~5% + 50¢ (MoR); $19.99 nets ~$18.50 | 15–30% IAP; $29.99 nets ~$25.50 |
| Rails in repo | Built (`/api/billing/*`, `entitlement.ts`, quotas) | Not built (StoreKit/Play receipts, validation, web handoff) |
| Store risk | None (PWA + web checkout) | Guideline 4.2; Play 12 testers × 14 days |
| Revenue shape | Compounding, reactivation | Front-loaded, updates unpaid |
| 1,000 payers | ≈ $18.5k yr 1, ≈ $5.2k renewals yr 2 + new cohort | ≈ $25.5k yr 1, $0 yr 2 while they still use servers |
| Household later | Second tier slots in | No path but a second purchase |

## Pricing sheet

| Tier | Price | Includes | Why |
|---|---|---|---|
| Free | $0 | Everything that exists today; 5 AI captures + 3 insights/mo | Wedge vs Sortly 100 / Itemtopia 20 item caps. Never claw back |
| Premium | $19.99/yr (or $2.49/mo as a trial door) | Unlimited AI capture/insights, live offers, push digests, scan storage, cloud voice | Under the $34.80 median, 1/9 of the $186 stack |
| Supporter | $59 once | Premium for life | ~3× annual, above the 1.4× LTV floor |
| Household (later) | ~$39.99/yr | Shared inventory/filing | Only when payers ask by name |

## Sequence

1. Open the door (allowlist → sign-in + deny list; rules to `uid` + verified
   email; decide on a dedicated Firebase project; re-run rule assertions).
2. Vercel Pro, Upstash, Lemon Squeezy store with two variants. Stripe is folding
   LS into Managed Payments (GA Apr 2026) — signups open, plan a migration.
3. Position as private home inventory with a life hub; ship AI capture gated
   with billing as one unit; Play first, then Apple, as distribution.
4. Review at six months: under 50 payers → keep as a personal tool with a tip jar.

## What would change this

- A true local-first build (the Expo plan) with user-chosen backup has near-zero
  marginal cost and could carry a $9.99–14.99 one-time price, sync as the add-on.
- If the US external-link ruling holds, the store listing is nearly free to
  monetize — still build on web billing, the only rail that works either way.
- If AI costs rise, the quota and the annual price are the levers; a flat price has neither.
