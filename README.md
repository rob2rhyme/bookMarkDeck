# Bookmark Deck

Bookmark Deck is a privacy-first bookmark manager built with Next.js (App Router), TypeScript, and Tailwind.

It supports local-first bookmark management, optional Firebase sync, route-based folder pages, bookmark bulk actions, and optional native app launching through a local desktop helper.

## Overview

Bookmark Deck is designed for fast, personal bookmark organization:

- Primary storage is local browser storage.
- Optional cloud sync uses your Google sign-in and Firebase Firestore.
- Folders are label-based (`bookmark.folder`) rather than a separate database table.
- UI uses a shared app shell across pages (global header/footer/cursor + global scroll-to-top FAB).
- PWA foundation is enabled (manifest + service worker registration + offline page).

## Key Features

### Bookmarks

- Add, edit, and delete bookmarks.
- Bookmark fields: title, URL, icon, folder label, tags, note.
- Pin/unpin favorites.
- Usage tracking (`hits`, `lastUsedAt`) for trending sorting.
- Import browser bookmark HTML (Netscape format).
- Export bookmark HTML.
- Undo after delete / bulk delete / clear-all (snapshot restore).

### Search and Filters

- Search by title, URL, note, folder, or tag.
- Filters for favorites and entries with notes.

### Folders

- Folder cards on Home route to dedicated folder pages.
- Home emphasizes named folders; unstaged bookmarks still exist and remain route-accessible.
- Local-only empty folders are supported via `localStorage`.

### Folder Pages (Route-Based)

- `/folders/unstaged` for bookmarks with no folder label.
- `/folders/[folderKey]` for named folders.
- Folder key normalization uses `trim().toLowerCase()`.

### Bulk Select (Bookmarks)

On folder pages (`/folders/*`):

- Select mode with multi-select checkboxes.
- Bulk actions: Move, Delete, Select all, Clear, Cancel.
- Move supports:
  - existing folders,
  - `Unstaged` (sets `folder: undefined`),
  - `New folder…` flow.

### Cloud Sync and Backups

- Optional sync via Firebase Firestore.
- Bookmark snapshots are kept in cloud backups (up to 7 latest backups).
- Backup payload can include both bookmarks and shortcuts.
- Download backup JSON from the app.

### App Shortcuts and Native Launcher

- App shortcuts support web URLs and optional native targets (local path / bundle ID / AUMID).
- Shortcut cards expose target badges (`Web` / `Native`) and launcher requirement hints.
- Native launching requires a local launcher service (`launcher-desktop`).
- Token-based handshake is required between web app and launcher.
- If launcher is offline, UI reports: `Launcher not reachable`.

### UI System

- Shared SVG icon set in `src/components/icons.tsx`.
- Tooltip wrapper for icon actions in bookmark cards.
- Press micro-interactions (`active:scale-95`) on icon buttons.
- Optional haptic tap utility (`src/utils/haptics.ts`) for coarse pointers.
- Global scroll-to-top FAB mounted from app layout.

### PWA and Offline

- App manifest: `public/manifest.webmanifest`.
- Service worker: `public/sw.js` (registered in `src/app/GlobalClientUI.tsx`).
- Offline fallback route: `/offline`.
- Cache policy is intentionally narrow:
  - static same-origin assets use cache-first,
  - navigations use network-first with offline fallback,
  - `/api/*` is excluded from service-worker caching.

## Folder Navigation Model

Folder labels are normalized for routing and matching by:

```ts
folderKey = value.trim().toLowerCase();
```

This means folder routing is case-insensitive. Display labels come from merged bookmark folders plus local-only folders.

Canonical routes:

- `/folders/unstaged`
- `/folders/[folderKey]`

## Deprecated Behavior

- Legacy full-screen folder modal overlay in Home is deprecated.
- Route-based folder pages are the canonical navigation experience.
- Scroll-to-top is no longer Home-only; it is global.

## Enhancement Roadmap (A→Z)

This section is the implementation plan for upcoming premium enhancements.

### A. Foundation and Shell Consistency

1. Keep App Router global shell (`AppShell`) as the single source for header/footer/background cursor.
2. Keep `ScrollToTopFab` global via `GlobalClientUI`.
3. Keep unstaged support in data and route, without making it the primary Home CTA.

Acceptance:
- One global header/footer on every route.
- Folder pages match Home visual chrome.

### B. PWA Hardening

1. Add install prompt UX and status indicator.
2. Version/cache-bust service worker strategy.
3. Add richer offline page guidance for sync-dependent actions.
4. Define explicit no-cache list for sensitive endpoints.

Acceptance:
- Installable app in supported browsers.
- Predictable offline behavior across route navigations.

### C. Drag-and-Drop Bookmark Reordering

1. Implement folder-page drag reorder with `@dnd-kit/core` + `@dnd-kit/sortable`.
2. Disable drag while `selectMode` or card editing is active.
3. Persist folder order state device-locally (and optionally cloud-sync later).
4. Add drag handle affordance and accessible keyboard fallback.

Acceptance:
- Reorder persists after refresh.
- No conflicts with bulk select/edit/delete flows.

### D. Platform-Aware Shortcuts UX

1. Expand shortcut capability badges and states.
2. Add inline launcher troubleshooting CTA.
3. Improve failure copy and retry path for local launcher checks.

Acceptance:
- Users can immediately see which shortcuts require launcher.
- Native failures are actionable without guesswork.

### E. Icon Library for Bookmarks and Shortcuts

1. Add icon-picker modal with curated SVG icon tokens.
2. Keep URL icon input as optional advanced mode.
3. Store icon token keys for local consistency.

Acceptance:
- Users can assign consistent icons without external URLs.
- Keyboard/mobile accessible picker.

### F. Search, Tags, and Bulk UX Expansion

1. Add saved filters and advanced search chips.
2. Add bulk tag assignment/removal flows.
3. Improve batch feedback and undo messaging precision.

### G. Sync and Backup Enhancements

1. Add backup restore chooser directly in UI.
2. Expose sync conflict notes/timestamps more clearly.
3. Add optional backup export automation settings.

### H. Performance and Reliability

1. Virtualize large bookmark grids where needed.
2. Reduce icon/favicon layout shift.
3. Add targeted client-side error boundaries for folder pages.

### I. Security and Hardening

1. Tighten CSP rules for production once launcher endpoint strategy is finalized.
2. Document launcher token rotation flow.
3. Add optional integrity checks for local launcher responses.

### J. QA and Release

1. Add route-level manual QA scripts for folder flows.
2. Add smoke tests for bulk move/delete and undo.
3. Run release checklist for `typecheck`, `lint`, `build`, and offline regression.

## Project Structure

```txt
src/
  app/
    layout.tsx                  # Root layout
    GlobalClientUI.tsx          # Global client-only UI mount (FAB + SW registration)
    page.tsx                    # Home page
    folders/
      unstaged/page.tsx         # Unstaged folder route
      [folderKey]/page.tsx      # Named folder route
    offline/page.tsx            # Offline fallback route
    privacy/page.tsx
    terms/page.tsx
    faq/page.tsx
  components/
    AppShell.tsx                # Shared chrome (header/footer/dragon cursor/frame)
    HomePageClient.tsx          # Home-specific content
    BookmarkCard.tsx
    ShortcutCard.tsx
    ScrollToTopFab.tsx          # Global FAB
    icons.tsx                   # Shared SVG icons
    DragonCursor.tsx
  hooks/
    useBookmarks.ts
    useShortcuts.ts
  utils/
    haptics.ts
    parseBookmarkHtml.ts
    bookmarksToHtml.ts
    launcherClient.ts
    firestoreBookmarks.ts
    firestoreShortcuts.ts
```

## Scripts

### Web app

- `npm run dev` - start Next.js dev server
- `npm run build` - production build
- `npm run start` - run production server
- `npm run typecheck` - TypeScript validation
- `npm run lint` - ESLint

### Desktop launcher (`launcher-desktop/`)

- `npm run start` - start Electron launcher app
- `npm run server` - start launcher HTTP/HTTPS server
- `npm run dev` - alias for launcher server

## Launcher Setup Notes

1. Start launcher with token (in `launcher-desktop/`):

```bash
BOOKMARKDECK_LAUNCHER_TOKEN=your-token npm run start
```

2. Set matching web token (repo root `.env.local`):

```bash
NEXT_PUBLIC_BOOKMARKDECK_LAUNCHER_TOKEN=your-token
```

3. Optional connection settings:

```bash
NEXT_PUBLIC_LAUNCHER_HOST=127.0.0.1
NEXT_PUBLIC_LAUNCHER_PORT=47831
NEXT_PUBLIC_LAUNCHER_PROTOCOL=http
```

For HTTPS deployments and deeper launcher diagnostics, see `TROUBLESHOOTING.md`.

## Known Issues / Notes

- `baseline-browser-mapping` warning may appear during lint/build when the dataset is stale. It is non-fatal.
  - Suggested update: `npm i baseline-browser-mapping@latest -D`
- Current PWA service worker is intentionally conservative and does not cache `/api/*`.
- Browsers cannot open local desktop apps directly.
  - Native open requires the local launcher helper running on the device.
- Security note:
  - Launcher pairing token must match between launcher process and web env.
  - Keep this token device-local; do not share it publicly.

## Privacy Summary

- Local data: browser `localStorage`.
- Optional cloud data: Firebase Firestore under your Google-authenticated account.
- No in-app analytics/tracking SDK is currently used.

## License

MIT
