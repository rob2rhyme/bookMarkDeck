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

## Launcher not reachable

- **Symptom:** App shortcut open shows `Launcher not reachable. Start the local launcher and try again.`
- **Cause:** Launcher server is not running, wrong host/port/protocol, or blocked locally.
- **Fix checklist:**

1. Start launcher (`launcher-desktop/`):

```bash
cd launcher-desktop
BOOKMARKDECK_LAUNCHER_TOKEN=test123 npm run start
```

2. Configure matching web token (`.env.local` in repo root):

```bash
NEXT_PUBLIC_BOOKMARKDECK_LAUNCHER_TOKEN=test123
```

3. (Optional) Pin launcher host/port/protocol:

```bash
NEXT_PUBLIC_LAUNCHER_HOST=127.0.0.1
NEXT_PUBLIC_LAUNCHER_PORT=47831
NEXT_PUBLIC_LAUNCHER_PROTOCOL=http
```

4. Restart web app:

```bash
npm run dev
```

5. Verify launcher health:

```bash
curl -i http://127.0.0.1:47831/health
```

## Launcher token mismatch

- **Symptom:** Native open fails with token mismatch message.
- **Cause:** Web token and launcher runtime token differ.
- **Fix:** Ensure both are identical:
  - Launcher runtime: `BOOKMARKDECK_LAUNCHER_TOKEN=...`
  - Web env: `NEXT_PUBLIC_BOOKMARKDECK_LAUNCHER_TOKEN=...`

## CSP / local launcher checks

```bash
curl -sD - http://localhost:3000/ -o /dev/null | tr -d '\r' | grep -i '^content-security-policy'
lsof -nP -iTCP:47831 -sTCP:LISTEN
```

## Production launcher over HTTPS

1. Generate certs with `mkcert` in `launcher-desktop/`.
2. Start launcher server with key/cert paths.
3. Set matching token in production web env.
4. Never commit private keys/certs.
