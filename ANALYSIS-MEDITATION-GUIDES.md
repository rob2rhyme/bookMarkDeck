# ANALYSIS — Meditation Guides

Deep analysis for adding **Meditation Guides** to Bookmark Deck. Companion to
`FOCUS-INTEGRATION.md`; defers to `CLAUDE.md` for the stack of record. No code
written yet — this is the scoping pass requested before build.

## 1. What it is

A small, calm **guided-breathing + meditation** surface inside the Focus hub:

- **Guided breathing** — animated pacer (expand/hold/contract) for patterns like
  Box (4-4-4-4), 4-7-8, and Coherence (5-5). Web-Audio cues, no video/asset deps.
- **Timed sits** — a plain silent/ambient timer (2/5/10/15 min) with a start and
  end chime, mirroring the Pomodoro timer's mechanics.
- **A short guide library** — a handful of bundled, offline text scripts
  (body-scan, breath-focus, gratitude) shown as readable steps. No streaming
  audio, no third-party SDK — bundled like the quiz/quote banks.
- **A record** — each completed session logs to history so it shows up in the
  hub's sense of "what I did today," alongside focus blocks.

## 2. Fit against the north star

> *Bookmarks feed the work · focus is the work · stats are the proof.*

Meditation is the **recovery half of focus** — the calm that makes deep work
sustainable. It strengthens the existing hub rather than widening scope:
breathing before a Pomodoro, a reset between blocks, a wind-down after. It reuses
the hub's timer/sound/notify/journal machinery almost wholesale, so it's
*connection, not breadth*. **Verdict: strong fit.** This belongs in `/focus`
(or a sibling `/focus`-style route), not as a standalone pillar.

## 3. Reuse map (this is mostly assembly, not invention)

| Need | Reuse what exists |
| --- | --- |
| Accurate, backgroundable timer | `useFocusTimer` (timestamp-based) — generalize, or a thin `useBreathTimer` modeled on it |
| Chimes | `features/focus/lib/sound.ts` (Web Audio) |
| End-of-session notification | `features/focus/lib/notify.ts` + existing `sw.js` push |
| Settings (durations, sound, default pattern) | `useFocusSettings` — add a `meditation` block |
| History / "what I did" | `activity/{id}` unified log (new type `"meditation"`) |
| Per-day mood pairing | existing `focusJournal` mood — optionally prompt after a sit |
| Section placement | new `SectionNav` entry + a `MeditationCard` in `FocusDashboard` |
| Offline content | bundled scripts array, same pattern as `lib/quiz/*` |

No new dependency, no second timer engine, no audio assets.

## 4. Data model (Firestore)

Per the data rules in `CLAUDE.md` (per-user subcollections, `setDoc(..., {merge})`,
console-managed rules — there is **no `firestore.rules` file** in the repo):

- **`users/{uid}/meditationSessions/{id}`** — `{ minutes, pattern, kind:
  "breath" | "sit" | "guide", day: "YYYY-MM-DD", createdAt }`. Mirrors
  `focusSessions` so stats code can treat it the same way.
- **`focusSettings/settings`** — extend with
  `{ meditation: { defaultPattern, defaultMinutes, soundEnabled } }` (no new doc).
- **`activity/{id}`** — reuse with `type: "meditation"` so it lands in the
  existing ActivityHistory/timeline with delete+undo for free.

**Console rule to add** (owner-scoped, matching the existing pattern — paste into
the Firebase console; we cannot diff a file that doesn't exist here):

```
match /users/{uid}/meditationSessions/{doc} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

## 5. Components & hooks (proposed)

- `features/focus/hooks/useMeditation.ts` — owns timer + pattern state
  (hydration-safe: defaults first, `localStorage`/Firestore in `useEffect`),
  exposes `start/stop/skipPhase`, logs a session on completion. Follows the
  "hooks own state, components are presentational" rule.
- `features/focus/components/MeditationCard.tsx` — pattern picker, the breathing
  pacer (a CSS-transform circle honoring `prefers-reduced-motion`), timer
  controls, and a collapsible guide library.
- `features/focus/lib/breathing.ts` — pure pattern definitions + phase math
  (unit-testable, like `lib/mood.ts` / `lib/topics.ts`).
- `features/focus/lib/meditationContent.ts` — the bundled guide scripts.
- Wire into `FocusDashboard` (one new section + `SectionNav` chip) and
  `useFocusStats` (count meditation minutes into the day's record, kept separate
  from focus minutes so the daily focus goal stays honest).

## 6. Effort & phasing

Small-to-medium; ships in calm slices (one PR each, `feature/` branch → verify
= `typecheck` + `test` + `build` + manual smoke):

1. **Breathing pacer + pattern lib** (pure lib + card, no persistence) — half day.
   Unit-test `lib/breathing.ts`.
2. **Timed sit + chimes/notify + session logging** (reuse timer/sound/notify) —
   half day.
3. **History + settings + stats wiring** (`meditationSessions`, activity type,
   settings block) — half day. Add the console rule.
4. *(optional)* **Guide library** + post-sit mood prompt — half day.

## 7. Risks & mitigations

- **Motion sensitivity** — the pacer must respect `prefers-reduced-motion`
  (already a project guardrail); offer a numeric/text fallback.
- **Goal accounting** — don't fold meditation minutes into the focus daily goal;
  keep them a separate metric or the "on track" math lies.
- **Scope creep** — resist streaming audio / large content packs (asset weight,
  licensing). Bundled text + Web-Audio tones only, matching the offline ethos.
- **Timer accuracy when backgrounded** — already solved by the timestamp-based
  approach in `useFocusTimer`; reuse it rather than `setInterval` counting.

## 8. Recommendation

**Build it, scoped tight, inside the focus hub.** It is high-fit, low-dependency,
and ~90% assembly of existing primitives (timer, sound, notify, settings,
activity, journal). Start with Phase 1 (breathing pacer + pure pattern lib) as a
self-contained, removable slice — it proves the UX with zero persistence risk
before touching Firestore.
