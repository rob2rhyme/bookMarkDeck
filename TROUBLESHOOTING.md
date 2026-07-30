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
   Leaving `NEXTAUTH_URL` unset on Vercel falls back to the *per-deployment* host, which
   changes every deploy and can never be registered.
2. In Google Cloud Console → **APIs & Services → Credentials**, open the OAuth client whose
   ID matches `clientId` from the diagnostics route — not a similarly named one. Add under
   **Authorized redirect URIs** (not JavaScript origins):
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
