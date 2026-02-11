# Troubleshooting

## Git push errors
- **Symptom:** Running `git push` fails with `fatal: No configured push destination` (or similar).
- **Cause:** This repository has no Git remote configured (`git remote -v` returns empty).
- **Fix:** Add the intended remote before pushing:
  ```bash
  git remote add origin <YOUR_REPO_URL>
  git push -u origin work
  ```

## Vercel deployment failing
- **Symptom:** Vercel (or `npm run build`) exits during the TypeScript check with a `Type error: Type 'unknown' is not assignable to type 'number | undefined'` from `src/hooks/useBookmarks.ts`.
- **Cause:** The bookmark normalization logic read `hits`/`lastUsedAt` from parsed JSON as `unknown`, so the type check could not confirm they were numbers/strings.
- **Fix:** The normalization now explicitly narrows these values before assigning defaults, allowing `next build` to complete.
- **Verify locally:**
  ```bash
  npm run build
  ```

## Google sign-in shows `redirect_uri_mismatch`
- **Symptom:** Google sign-in fails with `Error 400: redirect_uri_mismatch` or "This app's request is invalid" during OAuth consent.
- **Cause:** The Google OAuth client does not have the deployed callback URL whitelisted, or `NEXTAUTH_URL` is missing so NextAuth sends an incorrect redirect URI.
- **Fix:**
  1. Set the production URL for NextAuth (also works for Vercel previews):
     ```bash
     # .env
     NEXTAUTH_URL=https://<your-domain>
     NEXTAUTH_SECRET=<generated-secret>
     GOOGLE_CLIENT_ID=<from Google Cloud>
     GOOGLE_CLIENT_SECRET=<from Google Cloud>
     ```
  2. In Google Cloud Console → Credentials → OAuth 2.0 Client IDs, add the redirect URI:
     ```
     https://<your-domain>/api/auth/callback/google
     ```
  3. Redeploy after updating environment variables.

## Local Launcher
- **Start launcher (from `launcher-desktop/`):**
  ```bash
  cd /Users/noah-novah/Desktop/CODING/bookMarkDeck/launcher-desktop
  BOOKMARKDECK_LAUNCHER_TOKEN=test123 npm start
  ```
- **Configure web app token (from repo root):**
  ```bash
  cd /Users/noah-novah/Desktop/CODING/bookMarkDeck
  echo 'NEXT_PUBLIC_BOOKMARKDECK_LAUNCHER_TOKEN=test123' >> .env.local
  ```
- **Restart Next dev server after env changes (from repo root):**
  ```bash
  cd /Users/noah-novah/Desktop/CODING/bookMarkDeck
  npm run dev
  ```
- **Optional: verify health (from repo root):**
  ```bash
  cd /Users/noah-novah/Desktop/CODING/bookMarkDeck
  curl -i http://127.0.0.1:47831/health
  ```
- **Optional: verify open works (from repo root):**
  ```bash
  cd /Users/noah-novah/Desktop/CODING/bookMarkDeck
  curl -i -X POST http://127.0.0.1:47831/open \
    -H "Content-Type: application/json" \
    -H "X-BookmarkDeck-Token: test123" \
    -d '{"bundleId":"com.apple.Safari"}'
  ```

## CSP / Local Launcher
- **A) Start Next dev server (repo root):**
  ```bash
  cd /Users/noah-novah/Desktop/CODING/bookMarkDeck
  npm run dev
  ```
- **B) Confirm CSP header is present on `/login` and `/` (repo root):**
  ```bash
  cd /Users/noah-novah/Desktop/CODING/bookMarkDeck
  curl -sD - http://localhost:3000/login -o /dev/null | tr -d '\r' | grep -i '^content-security-policy' || echo "NO CSP on /login"
  curl -sD - http://localhost:3000/ -o /dev/null | tr -d '\r' | grep -i '^content-security-policy' || echo "NO CSP on /"
  ```
- **C) Confirm launcher is reachable (repo root):**
  ```bash
  cd /Users/noah-novah/Desktop/CODING/bookMarkDeck
  lsof -nP -iTCP:47831 -sTCP:LISTEN || echo "NOT LISTENING on 47831"
  curl -i http://127.0.0.1:47831/health
  ```
- **D) If needed, start launcher (`launcher-desktop`):**
  ```bash
  cd /Users/noah-novah/Desktop/CODING/bookMarkDeck/launcher-desktop
  BOOKMARKDECK_LAUNCHER_TOKEN=test123 npm start
  ```
