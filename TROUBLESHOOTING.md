# Troubleshooting

## Baseline browser mapping warning

- **Symptom:** Lint/build prints:
  - `[baseline-browser-mapping] The data in this module is over two months old...`
- **Impact:** Non-fatal. Commands still succeed.
- **Fix (optional):**
  ```bash
  npm i baseline-browser-mapping@latest -D
  ```

## Git push errors

- **Symptom:** `git push` fails with `fatal: No configured push destination`.
- **Cause:** No Git remote is configured.
- **Fix:**
  ```bash
  git remote add origin <YOUR_REPO_URL>
  git push -u origin <branch>
  ```

## Vercel / build TypeScript failures

- **Symptom:** `npm run build` fails during type checking.
- **Fix:**
  ```bash
  npm run typecheck
  npm run build
  ```
  If the error references bookmark normalization, confirm the latest `useBookmarks` typing changes are present.

## Google sign-in: "Access blocked" / `Error 400: redirect_uri_mismatch`

- **Symptom:** Google shows *"Access blocked: This app's request is invalid"* with
  `Error 400: redirect_uri_mismatch`.
- **Cause:** The `redirect_uri` the app sent is not registered — byte-for-byte — on the
  OAuth client whose ID was in the request. Google compares exact strings: scheme, host,
  `www`, port, path, and trailing slash all count.

### First: read the actual values, don't guess

Open on the *deployed* site (works while signed out — that's the point):

```
https://<your-domain>/api/auth-diagnostics
```

It prints the exact URIs to register and flags common misconfigurations.

### If this used to work and suddenly broke

**Check `NEXTAUTH_URL` first.** This is what caused the July 2026 outage, and it is the
cheapest thing to rule out.

When `NEXTAUTH_URL` is unset, next-auth derives the callback host from the Vercel
environment instead of from a fixed value. The deployment then sends whichever host Vercel
reports — `<project>.vercel.app`, or a per-deployment preview host — rather than the custom
domain you actually browse and registered. Google compares the URI byte-for-byte, so an
unregistered host fails even though the "obvious" callback is registered correctly.

Fix: pin it in Vercel → Settings → Environment Variables → **Production**, then redeploy.

```bash
NEXTAUTH_URL=https://<your-canonical-domain>   # no trailing slash
```

With it pinned, the same registered callback goes out no matter which host serves the
request, and switching between the vercel.app and custom domains can't resurface this.

**Progress marker:** if the Google error is replaced by a Vercel `404: NOT_FOUND` /
`DEPLOYMENT_NOT_FOUND`, the mismatch is *solved* — Google accepted the URI and redirected.
You are now landing on a hostname with no deployment behind it (commonly a stale
`<project>.vercel.app` alias after a project rename). Same fix: pin `NEXTAUTH_URL` to the
live domain.

#### Secondary cause: the Firebase provider's client

Worth checking only if the URIs and `NEXTAUTH_URL` are all correct. The cross-app login
sync (`f58377c`) introduced a README step — *"whitelist your Google OAuth client ID on the
Firebase project's Google provider"* — that points the Firebase Google provider's **Web SDK
configuration** at your `GOOGLE_CLIENT_ID` instead of the client Firebase generated.

Firebase's *own* generated client has `https://<project>.firebaseapp.com/__/auth/handler`
pre-registered automatically; yours does not. So after that step, `signInWithPopup` /
`signInWithRedirect` (the "Sign in to sync" fallback in `ensureFirebaseGoogleAuth`) send
your client ID with that handler URI, and Google rejects it until you add it.

Keep the whitelisting — it is what makes the silent `signInWithCredential` bridge work at
all (`bridgeFirebaseFromIdToken` returns `null` when the client isn't whitelisted, dropping
you onto the interactive popup). Just add the handler URI too, per the checklist below.

> Note: the account shown pre-selected on Google's error page is **not** a signal about
> which flow failed — Google displays your signed-in account there regardless.

### This app has TWO Google redirect URIs

Both are needed and they are easy to confuse — the dual-layer auth (see `CLAUDE.md`)
means **either one** can produce the identical error screen:

| Flow | Redirect URI | Client ID used |
| --- | --- | --- |
| next-auth (session) | `https://<your-domain>/api/auth/callback/google` | `GOOGLE_CLIENT_ID` |
| Firebase Auth (Firestore) | `https://<project>.firebaseapp.com/__/auth/handler` | whichever client is set on the **Firebase console** Google provider |

Registering only the first is the most common reason this error persists after a "fix".
Firebase auto-registers its handler on the client it generates for you — but once you
whitelist your own `GOOGLE_CLIENT_ID` on the Firebase Google provider (needed for the
zero-click bridge), that handler URI must be added to *your* client too.

### Checklist

1. Set env vars on the host (Vercel → Settings → Environment Variables):
   ```bash
   NEXTAUTH_URL=https://<your-domain>   # no trailing slash
   NEXTAUTH_SECRET=<secret>
   GOOGLE_CLIENT_ID=<id>
   GOOGLE_CLIENT_SECRET=<secret>
   ```
   Leaving `NEXTAUTH_URL` unset on Vercel means the callback host is derived from the Vercel
   environment, which is how an unregistered `<project>.vercel.app` or per-deployment preview
   host ends up in the request. Pin it.
2. In Google Cloud Console → **APIs & Services → Credentials**, open the OAuth client whose
   ID matches `clientId` from the diagnostics route — not a similarly named one.

   > **Two projects, one client.** The OAuth client (`BookmarkDeck`) lives in the
   > **Bookmark Deck** GCP project; Firestore and Firebase Auth live in
   > **`unified-project-440e5`**, which has its own auto-generated client. Redirect URIs are
   > a property of the *client*, not the project — so both URIs below go on the client whose
   > ID is in `GOOGLE_CLIENT_ID`, in the Bookmark Deck project. `unified-project-440e5`'s
   > credentials page is not where you edit these, and the Firebase env vars pointing at
   > `unified-project-440e5` are correct — do not "fix" them to match the other name.

   Add under **Authorized redirect URIs** (not JavaScript origins):
   ```
   https://<your-domain>/api/auth/callback/google
   https://<project>.firebaseapp.com/__/auth/handler
   ```
   Add your origin under **Authorized JavaScript origins** as well, for Drive sync's token
   client and the Firebase popup:
   ```
   https://<your-domain>
   ```
3. Save, then **redeploy**. Google's changes can take a few minutes to propagate; a stale
   error often clears after a hard refresh in a fresh/incognito window.

### Still stuck?

Read the failing URL itself. On the Google error page, click **error details** — it shows the
`redirect_uri` and `client_id` actually sent. Diff that against what is registered on that
exact client; the mismatch is always visible there.
