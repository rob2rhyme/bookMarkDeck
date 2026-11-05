# BREACH-PLAN — what to do if user data may have been exposed (2026-11-05)

`SECURITY-LAUNCH-PLAN.md` §5.3. Written before it is needed, because a plan that existed is
evidence of reasonable care, and because the first hour of an incident is the wrong time to
work out which secret signs which thing out. Internal runbook: the user-facing promise is
the last bullet of the privacy page's "Security notes". **Not legal advice** — the notice
rules below are the common shape; counsel decides what applies to a real incident.

Keep incident records (timeline, evidence, decisions) **somewhere private, not in this
repository**.

## 0. Before an incident — set these up now

| Do | Why | Where |
|---|---|---|
| Turn on **Data Access audit logs** for the Cloud Firestore API (Data Read + Data Write) | They are **off by default**. Without them there is no record of which documents were read, and "which users were affected" can't be answered | Cloud console → IAM & Admin → Audit Logs → Cloud Firestore API. They cost money at volume; set log retention to what you can afford |
| **Point-in-time recovery** on Firestore, and the scheduled export (§3.3) | Recovering from deletion or tampering | Firestore → Disaster recovery |
| **MFA / hardware keys** on Google, GitHub, Vercel, Cloudflare, Upstash, Lemon Squeezy, Anthropic, OpenAI | Most breaches of a one-person service start at an operator account | Each account's security settings |
| Note where each provider's **logs** live and **how long they are kept** | Vercel keeps runtime logs only briefly on Hobby — export them at once in an incident | §2 below |
| Keep this file and a list of every account above **reachable offline** | An incident may lock you out of the place you'd read it | — |

**Gaps, stated:** there is no in-app announcement banner (users can only be reached by email),
no self-serve account deletion, and no list of users' emails outside Firebase Authentication's
user list. Single-owner today, so none bites yet; each matters before strangers sign up.

## 1. Contain — the first hour

Decide what kind of incident it is, then do the narrowest thing that stops it. Preserve
evidence (export logs, screenshot dashboards) **before** rotating where that costs minutes,
not hours.

| Suspected | First moves |
|---|---|
| **A server secret leaked** (in a commit, a log, a screenshot) | Rotate it — §3 table. Check the provider's usage page for calls you didn't make |
| **An operator account taken over** (Google, GitHub, Vercel, Cloudflare…) | Change the password, sign out all its sessions, check MFA wasn't changed, revoke unknown OAuth apps and API tokens. Then treat every secret that account could read as leaked (§3) |
| **GitHub specifically** | Anyone who can push to `main` can **deploy Firestore rules** (CI deploys on merge) and ship code to every user. Check recent commits and merged PRs, the Actions runs, and `npm run check:rules` (is production running the repo's ruleset?) |
| **A malicious bundle shipped** (a bad dependency, a tampered deploy) | Vercel → Deployments → **Instant Rollback** to the last known-good build. Locked notes, papers and scans are end-to-end encrypted *only if the bundle is honest*: a passphrase typed while the bad bundle was live may be exposed. A passphrase reset re-wraps the vault's key but does **not** change it — so if the key itself could have been taken, say so plainly: anything locked under it must be treated as exposed |
| **A bug letting one user read another's data** | Fix and deploy the fix. A deny-all ruleset (`npm run deploy:rules` with a `firestore.rules` that allows nothing) stops access at once, but has a cost: **a write refused by the rules is dropped by the offline queue**, so edits users make to existing records during the lockdown can be lost. Use it when the exposure is ongoing and serious, not as a reflex |
| **Firestore access by a stolen Firebase session** | Firebase Auth → Users → disable the account (no new tokens) — the current token stays valid **up to an hour**. Rotating `NEXTAUTH_SECRET` does *not* end a Firebase session; they are separate systems |

## 2. Assess — what happened, to whom, and to what

Answer, in writing: when it started, when it was found, how, which accounts, which data, and
whether that data was encrypted with a key the attacker did not have.

| Source | Shows | Kept |
|---|---|---|
| Firestore Data Access audit logs | Document reads and writes, by identity | Only if turned on beforehand (§0) |
| Firebase Authentication users | Accounts, sign-in times, providers | Until deleted |
| Vercel logs | Requests to pages and API routes | Briefly — export immediately |
| GitHub security log, Actions history | Pushes, merges, secret use, rules deploys | Account-dependent |
| Cloudflare audit log, R2 metrics | Account changes; bucket activity | Check what your plan records per object — it may not be per-object |
| Upstash, Lemon Squeezy, Anthropic, OpenAI dashboards | Usage and billing spikes, keys used | Provider-dependent |

**Encrypted data.** Locked notes, locked papers' reference and note, and encrypted scans are
end-to-end encrypted; the operator never holds the key. Many breach laws treat encrypted data
as not "breached" when the key wasn't compromised — which is exactly the question the
malicious-bundle row above can't answer in your favour. Titles, tags, dates, item records,
bookmarks and habits are **not** encrypted.

## 3. Secrets: what rotating each one does to users

Rotate at the provider, set the new value in Vercel (all environments that use it),
**redeploy**, then revoke the old one.

| Secret | Who can do what with it | What users notice when it's rotated |
|---|---|---|
| `NEXTAUTH_SECRET` | Mint a session cookie for any allowed email | **Everyone is signed out** of the app and signs in again (which also restores Tasks/Calendar access — the Google refresh token rode in the cookie). Firebase sessions are not affected |
| `GOOGLE_CLIENT_SECRET` | Act as the app in Google's OAuth flow | Nothing, if rotated through Google Cloud's second-secret overlap |
| `FIREBASE_SERVICE_ACCOUNT` (GitHub secret) | **Rewrite production Firestore rules** | Nothing. Delete the key in Cloud console → Service Accounts, make a new one, update the GitHub secret, run `npm run check:rules` |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Read, write and delete every photo and scan | Uploads and scan opening fail until the redeploy lands |
| `VAPID_PRIVATE_KEY` (+ public key) | Send notifications to subscribed browsers | **All reminders stop** until each device turns them on again (subscriptions are tied to the key) |
| `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | Queue messages; forge deliveries to `/api/push/fire` | Reminders already queued may not deliver. Roll the signing keys in Upstash (current/next) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Read emails with plan status; change entitlements | AI features and Premium checks fall back until redeploy |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Forge billing events (grant Premium) | Nothing; Lemon Squeezy retries deliveries |
| `LEMONSQUEEZY_API_KEY` | Act on the store | Checkout fails until redeploy |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `UPC_LOOKUP_KEY` | Spend on your account | The feature is off until redeploy |

The Firebase web config (`NEXT_PUBLIC_FIREBASE_*`) is public by design — not a secret. The
rules are what protect the data.

## 4. Notify

| Who | When | How |
|---|---|---|
| **Affected users** | Without undue delay once you know what happened and to whom. US state laws commonly set an outer limit of 30–60 days; some also require notice to the state attorney general above a number of residents | Email from the business address. Say: what happened, when, what data, what was encrypted and what wasn't, what you have done, what they should do (change passphrase, revoke Google access at myaccount.google.com/permissions, watch for phishing), and how to reach you |
| **Data protection authority** | Within **72 hours** of becoming aware, if EU/UK residents are affected and there is a risk to them (GDPR Art. 33) — a late notice must say why it is late | The authority of the main establishment |
| **Lemon Squeezy, Google, Cloudflare, Upstash** | When their systems or their users' data are involved, or their terms require it — check each provider's terms; Google's API terms are worth reading first | Provider's security contact |
| **Insurer** | Per the policy, usually immediately — before admitting liability or paying anyone | Policy's claims line |
| **Counsel** | First, if one is retained | — |

Write down **why** each notify/don't-notify decision was made, with the date. That record is
the evidence, whichever way it went.

## 5. Recover and record

- Fix the cause; verify the fix (a test that fails without it, in the usual way).
- Restore anything altered from point-in-time recovery or the scheduled export.
- Restore the normal ruleset if a deny-all was deployed (merging to `main` does it).
- Write the post-incident record: timeline, cause, data and users affected, actions and
  their times, notifications sent, what changes so it can't recur. Keep it private.
- Add a line to the security changelog (§5.5 of the launch plan) — not the details, the fact.
