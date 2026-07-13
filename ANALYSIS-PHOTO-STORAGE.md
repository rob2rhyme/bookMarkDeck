# ANALYSIS — Photo storage for "My Stuff" (beyond Firebase)

Deep-research pass (2026-07-13) into where item/location photos should live.
Companion to `INVENTORY-ROADMAP.md`; defers to `CLAUDE.md` for the stack of
record. Every option's pricing was independently re-verified against official
pricing pages; figures marked **[uncertain]** could not be pinned live and
should be reconfirmed before budgeting.

## ⭐ Recommendation (the "next-up" storage decision)

**Cloudflare R2 + Cloudflare Images Transformations.** It replaces the Firebase
Storage plan for photos and — the headline — **removes the Blaze prerequisite
entirely**: Firebase Storage is the only part of the stack that forces Blaze;
Firestore + Firebase Auth stay on the free Spark plan. Photo *bytes* go to R2,
and only the object `key` is stored on the item in Firestore. Realistic bill at
this app's scale: **$0/mo for a long time** (10 GB storage, 1M writes / 10M
reads per month, and *all egress* free).

Runner-up: **Supabase Storage** (truly built-in transforms, no per-request
fees) — but egress isn't free, transforms effectively want the $25/mo Pro
project, the free project pauses after ~7 idle days, and it adds a third
backend. Honorable mention: **Backblaze B2 + Cloudflare** (cheapest raw
storage, free egress via the Bandwidth Alliance) — functionally equivalent to
R2 but two vendors instead of one.

## Verified comparison (as of 2026-07-13)

| Option | Storage $/GB-mo | Egress | Free tier | Image transforms | Auth-fit with Firebase Auth |
|---|---|---|---|---|---|
| **Cloudflare R2** ⭐ | $0.015 | **$0, all paths** | 10 GB + 1M Class A / 10M Class B ops/mo, no credit card | Cloudflare Images: 5,000 unique transforms/mo free, then $0.50/1k | Presigned PUT from a Next route; server owns the key |
| Backblaze B2 | $0.006 | $0.01/GB; $0 via Cloudflare/Bunny | 10 GB, 2,500 downloads/day | None native (front with Cloudflare) | S3-compatible presigned PUT |
| AWS S3 | $0.023 | $0.09/GB direct; $0 S3→CloudFront (1 TB/mo free CDN) | $200 new-account credits (expire ≤12 mo) | None native (Lambda + sharp, DIY) | Presigned PUT/POST (POST can hard-cap size) |
| Supabase Storage | ~$0.021 (Pro incl. 100 GB) | $0.03 cached / $0.09 uncached | 1 GB; **project pauses after ~7 days idle** | **Built-in** resize/WebP/AVIF; $5/1k origin images (100 free on Pro) | `service_role` server key mints signed upload URL (documented for external auth) |
| Vercel Blob | $0.023 | $0.05/GB | Hobby 1 GB + 10 GB transfer, hard cap | Separate Image Optimization product | `handleUpload` route + session check |
| ImageKit | $0.09 over 3 GB [3 GB uncertain] | $0.45/GB over 20 GB/mo free | 20 GB bandwidth, unlimited transforms | **Built-in, unlimited** URL transforms | Signed upload token (folder not signed — needs care) |
| Cloudinary | ~$0.40/GB credit [uncertain] | same credit bucket | 25 credits/mo; suspends on overage | Best-in-class + AI | Signed-params route |
| UploadThing | $0.08 | Free, unmetered | 2 GB storage | None (client resize only) | Typed file-route middleware runs the session check |
| Uploadcare | ~$0.35–0.50/GB [uncertain] | ~$0.50/GB [uncertain] | 1k ops, 1 GB, 5 GB traffic, 10 MB cap | Built-in URL transforms (ops-billed) | HMAC signature endpoint |

## Why R2 wins here

1. **Egress is the dominant cost for browsed photos, and R2's is $0 at any
   volume** — S3 API, custom domain, and CDN paths alike. Every alternative
   either charges $0.03–0.45/GB or requires a partner CDN to zero it out.
2. **Thumbnails without a build step.** Store one compressed WebP original;
   derive sizes on delivery via `/cdn-cgi/image/width=320,format=auto/<key>`.
   5,000 unique transforms/mo free; variants edge-cache ~30 days, so repeat
   views never re-bill.
3. **Clean fit with the dual-auth model.** Cloudflare knows nothing about our
   users; a Next.js Route Handler *is* the security rule: verify the session,
   have the **server** compose `users/{uid}/inventory/{itemId}/{photoId}.webp`,
   sign a ~60-second PUT URL with `@aws-sdk/s3-request-presigner`
   (works against R2 unchanged: `region: "auto"` + the
   `<accountid>.r2.cloudflarestorage.com` endpoint). The client never chooses
   the key. Use the Firebase-ID-token verify path (client sends its token from
   `ensureFirebaseGoogleAuth`; server verifies with `firebase-admin`
   `verifyIdToken()` → `decoded.uid`) so R2 keys align with the Firestore
   `users/{uid}` doc ids.

### The one gotcha

R2 presigned uploads **cannot hard-cap size at the signing layer** (no
`content-length-range` on presigned POST). Enforce in three tiers:
1. reject on the client-declared byte size at mint time;
2. client compresses to WebP first (canvas → ~1600px long edge, q≈0.82 — it
   knows the exact byte count, and re-drawing strips EXIF/GPS as a privacy
   bonus);
3. `HEAD` the object after upload; `DELETE` + reject if oversize **before**
   persisting the Firestore pointer.

Content-type *is* enforceable (signed `ContentType` header).

## Does this skip Blaze? When would Firebase Storage still win?

**Yes — Spark plan holds.** Choose Firebase Storage (and accept Blaze) only if
one declarative `storage.rules` block (per-request `request.auth.uid`, size,
and content-type enforcement at the storage layer, zero new vendors) is worth
more than free egress + free tier + no presign route to own. At this app's
cost-sensitivity, the trade favors R2.

## Migration path from the current `ItemPhoto` shape

Current: `{ id, url, path?, w?, h? }` (URL-only; deliberately Storage-ready).

- **Types:** `path` becomes the canonical R2 object key. `url` becomes
  *derived*, not stored: `https://<cdn-domain>/cdn-cgi/image/width=…,format=auto/<path>`.
  Keep `w`/`h` (captured from the canvas at compress time — avoids layout shift).
- **Data layer:** persist `{ id, path, w, h }` only after the PUT succeeds
  *and* the post-upload HEAD size check passes (no dangling/oversize pointers).
- **Hook:** add `addPhoto(file, itemId)` — compress → `POST /api/uploads/photo`
  → presigned PUT → write pointer; expose a `photoUrl(path, width)` helper.
- **New route:** `src/app/api/uploads/photo/route.ts` — `getServerSession` →
  verify Firebase ID token (`firebase-admin`, server-only dep) → validate
  contentType/size/itemId (path-traversal guard) → sign `PutObjectCommand`
  (`expiresIn: 60`).
- **Config (one-time, server-only env):** `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, Firebase Admin service-account creds.
  Bucket CORS: `PUT` from the app origin only. `next.config.ts`: add the R2
  custom domain to `images.remotePatterns` + CSP `img-src`/`connect-src`.
  Bucket stays **private**; all reads go through the custom-domain
  transform/CDN layer. No sharp, no Worker, no Lambda.

## Manual (dashboard) steps when this ships

1. Create a Cloudflare account + R2 bucket; add a custom domain; enable Image
   Transformations on the zone.
2. Mint an R2 API token scoped to the bucket; set the env vars above in
   Vercel + `.env.local`.
3. Create a Firebase service account key (Admin SDK) for ID-token verification;
   set as server env.
4. Set bucket CORS (PUT from the production + localhost origins).
