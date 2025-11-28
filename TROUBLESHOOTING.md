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
