# ANALYSIS — Taking My Stuff mobile: app strategy, gaps, monetization, packaging

Companion to `ANALYSIS-MYSTUFF-NEXTLEVEL.md` (feature benchmark) and
`INVENTORY-ROADMAP.md` (§4 monetization reality, §5 GTM). This answers four
owner questions (2026-07-16): *mobile-app approach · gaps/strengths vs
competitors + fill feasibility · monetization · one app vs four.*

## 1. The mobile-app approach (three paths, one recommendation)

| Path | What it is | Cost | Risk | Verdict |
|---|---|---|---|---|
| **A. PWA (today)** | Installable from Safari/Chrome; already shipped | $0 | No store presence; iOS push limits | Keep — it's the free tier of distribution |
| **B. Capacitor shell** | Thin native wrapper loading the live site (already scaffolded: `capacitor.config.ts`, `CAPACITOR_IOS.md`, `nativeNotify.ts`) | $99/yr Apple + review effort | **Guideline 4.2 rejection** if it's "just a website in a box" | **Recommended — with the 4.2 hardening below** |
| **C. Native rewrite** | Swift/Kotlin or React Native rebuild | Months of work, two codebases | Kills the calm/shared-code brand | Skip |

**Path B is 60% built already** — the shell + a native time-sensitive-alert
plugin exist for the Focus timer. What stands between it and App Store
approval is Apple's **Guideline 4.2 (minimum functionality)**: reviewers
reject wrappers that mirror a website, and famously test in **Airplane Mode**
— a `server.url` shell shows a blank page offline today.

**4.2 hardening checklist (feasible, ~1–2 weeks):**
1. **Offline shell**: cache the app shell in the wrapper (Capacitor local
   assets or SW warm-up) so Airplane Mode shows the local-first UI, not a
   browser error. The app is *already* local-first — the data story is done;
   only the shell bootstrap needs to survive offline.
2. **Native capabilities beyond Safari**: already have one (time-sensitive
   timer alerts). Add 2–3 cheap ones: native barcode scanning via the camera
   plugin (faster than ZXing-WASM), share-sheet target ("share a product page
   into My Stuff/Wishlist"), home-screen quick actions (Add item / Where is…),
   and local notifications for warranty/return dates (no server needed —
   schedule on-device from the Attention data).
3. **App-like navigation**: the bottom nav + full-screen sheets shipped this
   month already read native; keep the store build free of browser chrome.

Android/Play is materially laxer on wrappers — same shell ships there with
less risk ($25 one-time).

## 2. Competitive position — strong vs lacking (2026 refresh)

Market anchors (verified 2026-07): Sortly from **$24/mo** (free tier capped at
100 items), Itemtopia **$19.99/yr** (free ≤20 items), HomeZada from
**$9.99/mo** (broad home-management suite + AI). The July-13 benchmark in
`ANALYSIS-MYSTUFF-NEXTLEVEL.md` still holds; this week's shipping moved four
rows:

**Now ahead of the field (new since the benchmark):**
- **Price comparison** (manual links + live barcode offers, sortable, on items
  *and* wishlist, savings vs paid/estimate) — **no competitor in the research
  set has compare-before-you-buy**. This is a genuinely novel wedge: every
  incumbent frames inventory as *insurance paperwork*; we frame it as
  *smarter buying + calm ownership*.
- **Per-item life history** (status, lending with condition out→in, usage,
  trending) — richer than Spullio's lending or Sortly's audit trail.
- **Item sharing** (native share sheet) — light social loop none of them has.
- **Undo-everywhere, full-screen mobile sheets, one-login sync** — polish
  parity with native apps.

**Still ahead (unchanged):** privacy/on-device capture (OCR, barcode, receipt
scan never leave the device) · generous free (unlimited items vs 20–100-item
caps) · no-lock-in CSV/JSON · cross-pillar hub (bookmarks/focus/habits) —
*unique, nobody can copy it without building four apps.*

**Lacking vs competitors → fill feasibility:**

| Gap | Field leader | Feasibility to fill | Call |
|---|---|---|---|
| AI photo→item(s) recognition | Scanlily, Itemtopia | Cloud vision per scan; conflicts with privacy default. Ship **opt-in + quota-gated premium** | Fill *as the premium tier* |
| Push-when-closed reminders (warranty/returns) | HomeZada | **Cheaper than the roadmap assumed**: the QStash web-push rail built for the timer can schedule these today; the native shell adds on-device local notifications for free | Fill — low cost, high retention |
| Household / multi-user | HomeZada, Spullio | Biggest fork (multi-owner Firestore model + rules rewrite). Defer until *paying* users ask | Hold (P3) |
| Insurance RCV/ACV, carrier PDFs | Encircle | Insurance-SaaS surface + liability; off-brand | Skip (keep the simple PDF) |
| Video walk-through capture | Scanlily | Heavy pipeline, cloud cost | Skip for now |
| App Store distribution itself | *all of them* | Path B above | **This is the actual biggest gap** — it's distribution, not features |

Honest read: the feature matrix is already strong enough; **the gap that
matters is that competitors are in the stores and we aren't.** A store
listing + native niceties moves the needle more than any single feature.

## 3. Monetization — recommended strategy

`INVENTORY-ROADMAP.md` §4's finding stands: users pay for **(a) AI capture,
(b) peace-of-mind reminders, (c) household, (d) storage** — not for the
catalog itself. Strategy that fits this app's brand and cost structure:

**Freemium annual subscription, one tier, anchored low.**
- **Free = everything that exists today**, unlimited items, forever. The
  generous free tier *is* the acquisition wedge against Sortly's 100-item and
  Itemtopia's 20-item caps — never claw it back (trust is the brand).
- **Premium ≈ $19.99/yr** (match Itemtopia; 1/12th of Sortly's entry; well
  under HomeZada). Gate only things with **recurring cost or net-new infra**:
  1. **AI photo→item capture** (the #1 pay-worthy feature; per-scan cloud cost
     makes it *naturally* premium — never ship ungated)
  2. **Live price comparison, real-time tier** (paid UPC/offer API; free tier
     keeps trial lookups + saved links)
  3. **Push-when-closed reminders** (warranty/upkeep/returns)
  4. **Photo storage at scale** (R2 beyond a free allowance)
  5. Later: household sharing (would justify a higher family tier)
- **Why subscription over one-time**: items 1–2–4 are metered third-party
  costs; a one-time price bleeds forever. If a one-time option is wanted, a
  "Supporter" unlock can cover only the *non-metered* extras.
- **Sequencing (Track C rule)**: billing lands *with* the first metered
  feature (AI capture), not after. Stripe + entitlement gates + quotas ship
  as one unit.

Realistic expectation-setting: this is a **calm lifestyle business**, not a
VC category. Consumer home-inventory is niche; the win condition is a few
thousand happy subscribers on near-zero marginal cost, fed by the free tier
and the store listing.

## 4. One app or four?

**Ship one binary, market it inventory-first.** Reasons:

1. **The hub is the moat.** Item⇄bookmark⇄focus⇄habit links are the only
   thing in the benchmark marked *unique*. Four separate binaries would
   amputate the differentiator and the one-login sync story.
2. **Four apps = 4× review surface, 4× maintenance, 4× ASO work** on a
   solo-owner codebase that is deliberately one Next.js deploy.
3. **But store positioning should be single-purpose.** App Store discovery
   rewards a focused promise. List it around the pay-worthy pillar —
   *"My Stuff — private home inventory"* (name/keywords/screenshots lead with
   inventory + price comparison), with Focus/Habits/Bookmarks presented as
   the built-in "life hub" bonus. One app, one wedge, five pillars inside.
4. **Escape hatch kept**: pillars are `src/features/*` isolated by design; if
   a pillar ever deserves its own listing, it can be extracted then. Don't
   pre-pay that cost.

## 5. Recommended sequence (smallest path to a store listing)

1. Harden the Capacitor shell for 4.2 (offline bootstrap + native barcode +
   share-target + local notifications) — *1–2 weeks*.
2. Ship to **Google Play first** (cheap, lax review) as the dress rehearsal;
   then Apple.
3. In parallel: wire warranty/return reminders onto the existing QStash push
   rail (free retention win, also strengthens the 4.2 case).
4. Only after the listing is live and retention is visible: build AI capture
   + Stripe as one gated unit (the premium tier), per Track C.
5. Revisit household sharing when subscribers ask for it by name.

---

*Market anchors: Sortly pricing (sortly.com/pricing), Itemtopia and HomeZada
pricing via 2026 comparison roundups (homeproofvault.com, saveor.com,
clubofthings.app), Apple Guideline 4.2 wrapper-rejection patterns
(mobiloud.com, code2native.com, technetexperts.com). Feature benchmark:
`ANALYSIS-MYSTUFF-NEXTLEVEL.md`; monetization reality: `INVENTORY-ROADMAP.md`
§4; native shell: `CAPACITOR_IOS.md`.*
