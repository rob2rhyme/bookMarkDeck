# SECURITY-LAUNCH-PLAN — what to do before strangers' data lands here (2026-11-04)

Owner questions: *security, database storage and leak-proofing once the app takes
money; and the liability when users store sensitive information (filing papers,
credentials) that is later exposed.* Companion to `ANALYSIS-MONETIZATION-MODEL.md`
(the model that makes this necessary), `QA-AUDIT-REPORT.md` §2 (the last audit)
and `SECURITY.md` (dependency remediation). Read against the code as of this date.

Two principles run through every item: **you cannot leak what the server never
held in readable form**, and **you cannot be sued for a promise you never made**.
Nothing is leak-proof; the goal is to shrink what the server can see, what it
holds, and who can reach it, then watch what is left.

## 1. Where the code stands

Already strong, and worth protecting as the app changes:

- **Access control.** One recursive owner rule under `users/{uid}`
  (`firestore.rules`), 66 emulator assertions, CI deploys the ruleset and reads it
  back, and `src/lib/firestorePaths.test.ts` refuses any path not rooted at a uid.
- **Server secrets stay server-side.** Google access tokens never reach the
  browser; R2 keys are server-derived with a per-user prefix
  (`isOwnedInventoryPath` / `isOwnedFilingPath`); the QStash and Lemon Squeezy
  webhooks verify signatures; `/api/link-title` and `/api/reader` are fenced
  against SSRF at connect time and on every redirect.
- **Notes has the right encryption model** (`features/notes/lib/vault.ts`):
  per-note AES-256-GCM, a vault key wrapped by passphrase and by a recovery code,
  PBKDF2 at 600k with bounds on the stored count, ciphertext bound to the note id,
  and a write path that throws if a locked body ever leaves the client in the clear.
- **Hygiene.** No API route logs user data, no analytics SDK, CSP names its script
  hosts, HSTS and `frame-ancestors 'none'` are set, Drive backups use random salts,
  `npm audit` is part of the merge routine.

What opening sign-in exposes, worst first:

| # | Finding | Why it matters once users are strangers |
|---|---|---|
| 1 | **Filing and inventory attachments sit on a public bucket** (`R2_PUBLIC_BASE_URL`). | A passport or policy scan is readable by anyone holding its URL. Keys are unguessable, but URLs leak through history, referrers, screenshots and support threads. |
| 2 | **The session cookie carries every user's Google refresh token** (JWT strategy, `auth.config.ts`). | One leaked `NEXTAUTH_SECRET` exposes Tasks and Calendar access for all users until each token is revoked. Every user grants those scopes at sign-in whether or not they use Google sync. |
| 3 | **Most data is plaintext to the operator.** Bookmarks, inventory, habits and filing records are readable in the console and under subpoena. Filing's `reference` field is documented as "policy no., account no., case no."; its `confidential` flag changes nothing cryptographically. | The product invites exactly the data the Terms forbid. |
| 4 | **Rules trust the email, not the schema.** No field types, no size caps, no server-controlled disable. | Any account can write 1 MiB per document at the owner's cost; a bad actor cannot be switched off without editing the ruleset. |
| 5 | **Rate limits are per serverless instance** (`src/lib/rateLimit.ts`, the presign throttle). | They reset on every cold start, so the AI, presign and push caps are advisory until Upstash Ratelimit replaces them. |
| 6 | **Shared Firebase project** (`unified-project-440e5`). | Another app's IAM, billing and incidents are this app's. |
| 7 | **No account-deletion path.** | Paying customers have a right to erasure; the client cannot recursively delete subcollections it cannot list. |
| 8 | **Third-party processors.** Photos to Anthropic, cue text to OpenAI, page fetches through the server. | Each needs naming in the privacy policy with the no-training API terms confirmed. |
| 9 | Lower: `/api/auth-diagnostics` is public (reconnaissance aid); CSP still allows inline scripts where Next.js 16 supports nonces; one human account holds Google, Vercel, Cloudflare, Upstash and Lemon Squeezy. | A hardware security key on each account is the cheapest control in this file. |

## 2. Make the server unable to read it

The measures that change the outcome of an exposure.

1. ~~**Encrypt Filing's sensitive fields on the device.**~~ *(done for a paper's `reference` and `note`, per paper and opt-in, 2026-11-05 — `lib/lock.ts`, the Notes vault moved to `@/lib/vault`. `Party.note` and folder and place notes need no lock today: no screen or hook has ever written one, so they hold no text — a form for them must ship with the lock.)* Reuse the Notes vault
   (`vault.ts`, `vaultSession.ts`, `useVaults.ts`): one account key wrapped by
   passphrase and recovery code. Encrypt `FilingDocument.reference`, `note`,
   obligation notes and `Party.note`. Leave `title`, dates, `folderId`, due dates
   and tags in the clear so lists, search, badges and reminders keep working. A
   Firestore dump then yields "2023 Form 1040, due March" and nothing usable.
   Same invariant as Notes: `sanitize`/`toFirestore` throws on a plaintext
   sensitive field for a locked record.
2. ~~**Encrypt attachments before upload, and make the bucket private.**~~ *(code done 2026-11-05 for Filing scans — `lib/scanCrypto.ts`, `POST /api/filing/attachment/read`, optional `R2_FILING_BUCKET`; **the Cloudflare half is the owner's** — see "Owner steps for §2.2" below. Inventory photos are NOT covered: they are shown as plain `<img src>` from the public bucket.)* Client-side
   AES-GCM (key from the same vault) before the presigned PUT; a private bucket;
   a short-lived presigned GET issued by a session-gated route that checks
   `isOwned*Path`. The signed content-type and the SVG/HTML refusal stay.
3. **Give `confidential` teeth.** Confidential = encrypted fields, hidden behind
   the PIN/biometric lock (`appLock.ts` pattern), excluded from push text, CSV
   export and ⌘K results.
4. **Move Google tokens out of the cookie.** Request `tasks`/`calendar` scopes
   incrementally when a user enables Google sync; keep refresh tokens server-side
   (Upstash, keyed by uid, encrypted with a server key) and read them in the
   `/api/google/*` routes. The cookie keeps identity only.
5. ~~**Never log or send sensitive fields anywhere.**~~ *(done 2026-11-05: `src/lib/apiLogging.test.ts`; the push/AI/TTS half is still a rule, not a test)* Push digests carry counts and
   titles only (the PIN-locked inventory digest already does); the AI and TTS
   routes never see Filing content; no `console.*` of request bodies in `src/app/api`
   (currently true; add a source-scan test so it stays true).

### Owner steps for §2.2 (Cloudflare — no code)

The code encrypts and reads scans without a public bucket, but only **you** can close the
public one. Do these in the Cloudflare dashboard (R2), same account as today:

1. **CORS on the bucket Filing uses** — add `GET` (the `PUT` rule is already there) from
   your app origin(s), allowed header `Content-Type`. Without `GET`, opening an *encrypted*
   scan fails in the browser ("Couldn't fetch that scan") because the ciphertext is
   fetched by script. A scan stored unencrypted still opens (it loads in a new tab).
2. **Make Filing's objects unreachable from the public address.** Either:
   - **(a) one bucket, custom domain (simplest, nothing to move):** if `R2_PUBLIC_BASE_URL`
     is a *custom domain* (not `r2.dev`), add a WAF custom rule on that hostname that
     **blocks** requests whose URI path starts with `/filing/`. Item photos (`/inventory/…`)
     keep working; Filing scans become reachable only through the signed URLs the app
     issues (those use the S3 endpoint, which the rule doesn't touch). With an `r2.dev`
     address this is not possible — use (b).
   - **(b) a separate private bucket:** create a bucket with **public access off** and CORS
     as in step 1; give your R2 API token access to it; set `R2_FILING_BUCKET=<its name>`
     in Vercel and redeploy. **Copy the existing `filing/` prefix across first**
     (`rclone copy r2:old-bucket/filing r2:new-bucket/filing`, or the dashboard), or old
     scans stop opening. New scans go to the new bucket straight away.
3. **Re-encrypt old scans** — open a paper's **Scans** and press **Encrypt** on any scan
   that shows it. (Each is fetched, sealed on your device, re-uploaded, and the plaintext
   object deleted.) Until you do, those objects are readable by anyone holding their old
   public address unless step 2 is in place.
4. **Check it** — open `https://<your public domain>/filing/anything` (a made-up key): with
   2(a) it must be blocked, not "not found"; then open a real scan in the app and confirm
   it still opens.

## 3. Lock the door, not just the room

1. **Rules rewrite for multi-tenant.** `isOwner` becomes `request.auth.uid == uid
   && email_verified`; add per-collection field validation (`request.resource.data`
   types, string length caps, array size caps) and a `users/{uid}` size guard;
   add `admin/users/{uid}` (writable only by Admin SDK) with a `disabled` flag
   the owner rule checks. Re-run the 66 assertions and add cross-account and
   disabled-account cases. CI already deploys and reads back.
2. **Firebase App Check** (reCAPTCHA Enterprise on web, Play Integrity in the
   shell) so only this app can use the public Firebase config.
3. **Dedicated Firebase project** with its own IAM, budget alerts, **point-in-time
   recovery** on, and a daily scheduled export to a locked Cloud Storage bucket
   with retention lock.
4. **Upstash Ratelimit** in place of `createRateLimiter` and the presign throttle.
   Per-user and per-IP, shared across instances.
5. **Account deletion route** (`/api/account/delete`, session-gated, re-auth
   required): Admin SDK recursive delete of `users/{uid}`, Firebase Auth user,
   R2 prefix, Redis entitlement and quota keys, Lemon Squeezy customer flag. The
   one place the Admin SDK earns its way into the repo; service account scoped to
   that project only, in Vercel env, never in the client bundle.
6. **Harden the edges.** `auth-diagnostics` dev-only; nonce-based CSP via
   middleware; Vercel Pro firewall rules on `/api/*`; hardware keys and MFA on
   every operator account; secret rotation runbook (`NEXTAUTH_SECRET`, R2 keys,
   LS webhook secret, VAPID pair) with the user-visible effect of each written down.

## 4. Refuse to be a password manager

Liability follows the promise. Make the scope unmistakable in the UI, not only in the Terms.

1. ~~**Detect and refuse credential-shaped input**~~ *(done 2026-11-05: `@/lib/credentialGuard`, wired into bookmark notes, Filing reference/note, reminder labels and inventory notes; `e2e/credential-guard.spec.ts`)* in Filing `reference`/`note`,
   inventory notes and bookmark notes: a `password:`/`pwd`/`pin:` label, a card
   number passing Luhn, a nine-digit SSN pattern, a CVV beside a card. Inline
   refusal, nothing saved: "Bookmark Deck is not a password manager. Store this
   in one." Pure `looksLikeCredential(text)` helper with tests; the Terms clause
   becomes enforced behaviour.
2. ~~**Keep `bookmarkLink` to the URL.**~~ *(done: the link dialog's copy)* The form says the login belongs in
   Bitwarden or 1Password.
3. ~~**State the duty of care in the Filing guide**~~ *(done, as it stands today: not encrypted, so say so)*: unencrypted fields are readable
   by the operator; encrypted fields are unrecoverable without passphrase or
   recovery code; the user chooses knowingly.

## 5. Reduce what a lawsuit can reach

Technical measures reduce harm; these reduce exposure to the owner personally.

1. **Form an entity before the first stranger signs up.** A single-member LLC;
   operate the Vercel, Firebase, Cloudflare, Upstash and Lemon Squeezy accounts
   under it. The difference between the company being sued and the owner.
2. **Rewrite the Terms for a paid service.** Keep as-is and consequential-damages
   language; add a liability cap at fees paid in the trailing twelve months; an
   acceptable-use clause forbidding credentials and regulated data; an explicit
   statement that the service is not HIPAA, PCI-DSS or FINRA compliant;
   arbitration with class-action waiver where enforceable; governing law. One
   lawyer read; a template is not enough for a product that stores identity documents.
3. **Write the breach plan before it is needed.** US state laws: notice within
   30–60 days; GDPR: 72 hours to the regulator. Decide who is told, how users are
   reached (email from the entity, in-app banner), how sessions are revoked
   (rotate `NEXTAUTH_SECRET`), how affected objects are identified (R2 access
   logs, Firestore audit logs). A plan that existed is evidence of reasonable care.
4. **Cyber liability insurance.** Modest at this scale; insurers ask for
   encryption at rest, MFA on admin accounts and a breach plan — a second reason
   to have all three.
5. **Keep an evidence trail.** PITR, exports, Dependabot and audit history, rules
   verification in CI, a changelog of security-relevant changes. "We had controls
   and here is the record" is most of the defence.
6. **Age-gate and geo-scope.** Adults only; decide whether to sell outside the
   home jurisdiction in year one. Each new privacy regime is a new duty.
7. **Privacy policy update.** Name Anthropic, OpenAI, Upstash, QStash, Cloudflare
   R2, Lemon Squeezy and Google as processors with what each receives; state the
   encryption boundary for Notes and Filing; state retention and the deletion route.

## 6. Order of work

| When | Do | Cost |
|---|---|---|
| Before opening sign-in | §3.1 rules rewrite · §3.3 dedicated project + PITR · §2.2 private bucket · §2.4 tokens out of the cookie · §5.1 entity · §5.2 Terms | Days to two weeks; one lawyer read |
| Before the first paid signup | §2.1 Filing field encryption · §2.3 confidential flag · §4.1 credential refusal · §3.5 deletion route · §5.3 breach plan · §5.4 insurance · §5.7 privacy policy | Two to four weeks; reuses the Notes vault |
| Before advertising | §3.2 App Check · §3.4 Upstash Ratelimit · §3.6 edges · §5.6 age-gate | A week, mostly config |
| Ongoing | `npm audit` before every merge · rules assertions on every rules change · annual Terms and policy review · rotate secrets on any operator-account incident | — |

## 7. Known limits, stated honestly

- A web app cannot defend against a hostile server to its own users: the server
  can ship a bundle that exfiltrates a passphrase. The mitigations are
  reproducible builds and a public changelog, not cryptography. Say so.
- End-to-end encryption trades recoverability for confidentiality. A lost
  passphrase and recovery code is lost data; the Terms and the setup copy must
  say so before the first encrypted field is written.
- Field validation in rules caps abuse per document, not per account; a
  budget alert on the dedicated project is the backstop.
- Last-writer-wins sync (see `CLAUDE.md`) means a compromised device can
  overwrite another device's data; the backups and PITR are the recovery, not the prevention.
