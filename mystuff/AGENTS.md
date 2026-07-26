# My Stuff — native app

Expo SDK 57 · React Native 0.86 · React 19.2 · Expo Router · NativeWind 4.

**Expo changes fast — read the versioned docs at
https://docs.expo.dev/versions/v57.0.0/ before writing code.**

## Ground rules

- `src/lib/*` is the ported business logic from the web app. It is **pure and
  framework-free by design** — no React, no DOM, no platform APIs. Keep it that
  way so it stays testable and portable; put platform code in `src/data`,
  `src/backup` or `src/ui`.
- Its tests came across unchanged. **They must stay green** — that is the
  correctness proof of the port.
- Style with the semantic tokens (`bg-surface`, `text-ink`, `border-line`), never
  raw palette values, so light and dark stay in lockstep.
- Every input goes through the `Field` primitive so a visible label is
  structural, not optional.
- `PARITY-CHECKLIST.md` is the contract. Update it as features land.

## Checks

```bash
npm run typecheck
npm test
```
