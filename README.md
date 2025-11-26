# 📘 **Bookmark Deck**

_A simple, elegant, privacy-first bookmark manager built with Next.js + Tailwind._

---

## 🌟 Overview

**Bookmark Deck** is a fast, modern bookmark manager that stores everything _locally_ on your device — no accounts, no syncing, no servers. Designed with a clean card layout and a premium serif typeface, it offers a calm and beautiful way to organize your frequently used sites.

---

## ✨ Features

### 🔖 Bookmark Management

- Add bookmarks with title, URL, folder, tags, and notes
- Inline editing with a clean “pencil → save → cancel” UX
- Import browser bookmark `.html` files
- Export bookmarks back to **Netscape-compliant HTML**
- Local-only data — **100% private**

### 🗂️ Organization

- Search by **title / URL / notes / tags / folder**
- Filter by folder
- Filter by tag
- Tag chips with inline styling
- Folder chips for organizing content

### 🧭 UI & UX

- Smooth card layout
- Inline editing mode with save/cancel
- Undo **Delete** and Undo **Clear All**
- Responsive grid layout
- Clean serif brand font: **Cormorant Garamond**
- Accent handwritten font: **Neucha**

### 📄 PDF & HTML

- Export to:
  - JSON
  - Browser-compatible bookmark HTML
- Import `.html` bookmark files from Chrome, Firefox, Safari

---

## 🏗️ Tech Stack

- **Next.js 14** (App Router)
- **React 18**
- **Tailwind CSS** (v4 inline config)
- **next/font** for optimized Google Fonts
- **LocalStorage** for data persistence
- **TypeScript** throughout

---

## 📁 Project Structure

```
bookmarkdeck/
├── public/
│   ├── icons/                 # Optional: exported logo/icon assets
│   ├── favicon.ico
│   └── ...other static files
│
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Root layout with Google Fonts + global providers
│   │   ├── page.tsx           # Main Bookmark Deck UI
│   │   ├── globals.css        # Global styles + Tailwind inline theme
│   │   └── (optional routes)  # e.g., /about /settings if needed
│   │
│   ├── components/
│   │   ├── BookmarkCard.tsx   # Fully editable card with pencil/save/cancel/undo
│   │   └── Icon.tsx           # (optional) icon component pack
│   │
│   ├── hooks/
│   │   └── useBookmarks.ts    # LocalStorage persistence + Undo system
│   │
│   ├── utils/
│   │   ├── parseBookmarkHtml.ts   # Import browser bookmarks (.html)
│   │   ├── bookmarksToHtml.ts     # Export back to Netscape-style bookmark HTML
│   │   └── types.ts               # (optional) shared TS types
│   │
│   └── types/
│       └── bookmark.ts        # Bookmark interface definition
│
├── .gitignore
├── next.config.js
├── package.json
├── tsconfig.json
├── postcss.config.js          # Auto-included for Tailwind
├── tailwind.config.js         # (optional if using Tailwind v4 inline)
│
└── README.md                  # Generated project documentation

```

---

## 🚀 Installation & Development

### 1. Clone the repo

```bash
git clone https://github.com/YOUR-USERNAME/bookmarkdeck.git
cd bookmarkdeck
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run the dev server

```bash
npm run dev
```

Open **http://localhost:3000**

---

## 📦 Build for Production

```bash
npm run build
npm start
```

---

## 🎨 Fonts

This app uses **two Google Fonts**, optimized with `next/font/google`:

- **Cormorant Garamond** — main serif brand font
- **Neucha** — accent handwritten font (`class="font-hand"`)

Loaded in `layout.tsx` like:

```ts
const bookmarkdeck = Cormorant_Garamond({
  variable: "--font-bookmarkdeck",
  subsets: ["latin"],
});
const bookmarkdeckHand = Neucha({
  variable: "--font-bookmarkdeck-hand",
  subsets: ["latin"],
});
```

---

## 💾 Data Storage

Data is stored locally in the browser (`localStorage`) using a unified key:

```
bookmarkdeck:v1
```

All content stays on the user’s device.
No cloud, no server, no tracking.

---

## 🔄 Undo System

Both:

- **Undo Delete**
- **Undo Clear All**

are implemented with a previous-state snapshot that restores the exact bookmark list.

---

## 📤 Import & Export

### Import

The app supports browser bookmark `.html` files.
Uses Netscape-format parser in:

```
src/utils/parseBookmarkHtml.ts
```

### Export

Exports back to a browser-importable `.html` bookmark file using:

```
src/utils/bookmarksToHtml.ts
```

---

## 🖼️ Logo

The Bookmark Deck logo uses:

- Clean serif text
- Optional standalone bookmark icon variant
- Full SVG/PNG assets are available if needed

---

## 🛣️ Roadmap

- [ ] Create a Firebase project and enable Firestore.
- [ ] Add a Web app; copy apiKey, authDomain, projectId, appId.
- [ ] Use existing NextAuth Google identity as the user id (e.g., session.user.email).
- [ ] Pick data model: either a single doc users/<userId>/data with bookmarks array + updatedAt (+ optional version), or subcollection users/<userId>/bookmarks for large sets.
- [ ] Add Firebase SDK deps: firebase/app, firebase/firestore.
- [ ] Create src/lib/firebase.ts to init Firebase from env vars.
- [ ] Replace Drive helpers with Firestore:
- [ ] fetchBookmarks(userId): read doc, return bookmarks or [].
- [ ] saveBookmarks(userId, bookmarks): set doc with bookmarks + updatedAt.
- [ ] Update useBookmarks to sync via Firestore using session.user.email/id; decide merge vs overwrite when pulling.
- [ ] Security rules: restrict read/write to the same user (request.auth.uid == userId with Firebase Auth) or enforce via a server API if using NextAuth only.
- [ ] Env/config: add Firebase keys to .env.local (use NEXT_PUBLIC_FIREBASE_* for client-side); don’t commit secrets.
---
## force deploy vercel
```
vercel deploy --prod --force --yes
```

---

## 📝 License

MIT License — free to use, modify, and distribute.
