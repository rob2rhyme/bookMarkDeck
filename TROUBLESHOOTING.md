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
