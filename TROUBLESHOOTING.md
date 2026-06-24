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

## Google sign-in `redirect_uri_mismatch`

- **Symptom:** OAuth fails with `redirect_uri_mismatch`.
- **Cause:** OAuth callback URL and env values are not aligned.
- **Fix:**
  1. Set env vars:
     ```bash
     NEXTAUTH_URL=https://<your-domain>
     NEXTAUTH_SECRET=<secret>
     GOOGLE_CLIENT_ID=<id>
     GOOGLE_CLIENT_SECRET=<secret>
     ```
  2. In Google Cloud OAuth client, add:
     ```
     https://<your-domain>/api/auth/callback/google
     ```
  3. Redeploy.
