import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { createHash, randomUUID } from "node:crypto";

import { filingStorage } from "@/features/filing/lib/filingStorage";
import { presignR2Put } from "@/features/filing/lib/r2";
import { SEAL_OVERHEAD } from "@/lib/vault/vault";

export const runtime = "nodejs";

// Presign a direct browser PUT to Cloudflare R2 for a scan attached to a paper.
// Inert (enabled:false) until every R2_* env var is set, so the feature simply
// doesn't offer itself rather than failing. Session-gated, and the object key is
// composed SERVER-SIDE from the session identity, so a client cannot target
// another user's prefix.
//
// Filing accepts PDFs as well as images — a scan is usually one or the other —
// which is the substantive difference from the inventory photo route.
// Deliberately NOT accepted: SVG and HTML. Both execute script when served from
// the public bucket domain, and the bucket is a different origin from the app.
//
// A SEALED upload (`encrypted: true`) is a scan the browser already encrypted: the body
// is `iv ‖ ciphertext`, so it is stored — and its type SIGNED — as octet-stream whatever
// it was, and the original type is validated here only so SVG/HTML stay refused. The
// route never sees the bytes either way. Nothing here needs R2_PUBLIC_BASE_URL any more:
// scans are read through a signed URL (./read), so the bucket they sit in can be private.
const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

// A presigned PUT cannot carry a size condition — S3 only supports that on POST
// policies — so this is a declared-size check, not an enforced one. It stops the
// honest oversized upload; the throttle below is what limits a dishonest one.
const MAX_BYTES = 20 * 1024 * 1024;
// A sealed scan is its original bytes plus the IV and GCM tag.
const MAX_SEALED_BYTES = MAX_BYTES + SEAL_OVERHEAD;

// Per-user issuance throttle (per server instance). Since size can't be signed,
// issuance is the real choke point against scripted presign→PUT cost abuse.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const issued = new Map<string, number[]>();

function throttled(sub: string): boolean {
  const now = Date.now();
  const recent = (issued.get(sub) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    issued.set(sub, recent);
    return true;
  }
  recent.push(now);
  issued.set(sub, recent);
  return false;
}

export async function POST(req: NextRequest) {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!jwt?.sub) {
    return NextResponse.json({ enabled: false, error: "unauthorized" }, { status: 401 });
  }

  const storage = filingStorage();
  if (!storage) {
    return NextResponse.json({ enabled: false });
  }

  let body: { documentId?: string; contentType?: string; size?: number; encrypted?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine — the defaults below apply */
  }

  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  const ext = EXT[contentType];
  // The type is SIGNED below, so the PUT can't then smuggle something else.
  if (!ext) {
    return NextResponse.json({ enabled: true, error: "unsupported_type" }, { status: 400 });
  }

  const sealed = body.encrypted === true;
  const size = typeof body.size === "number" ? body.size : 0;
  if (size > (sealed ? MAX_SEALED_BYTES : MAX_BYTES)) {
    return NextResponse.json(
      { enabled: true, error: "too_large", maxBytes: MAX_BYTES },
      { status: 413 }
    );
  }

  if (throttled(String(jwt.sub))) {
    return NextResponse.json({ enabled: true, error: "rate_limited" }, { status: 429 });
  }

  const documentId =
    (typeof body.documentId === "string" ? body.documentId : "")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 64) || "misc";

  // Stable per-user segment derived from the session subject — never client-supplied.
  const userSeg = createHash("sha256").update(String(jwt.sub)).digest("hex").slice(0, 16);
  // A sealed object is just bytes: no extension that a type could be guessed from.
  const key = `filing/${userSeg}/${documentId}/${randomUUID()}.${sealed ? "bin" : ext}`;
  const uploadContentType = sealed ? "application/octet-stream" : contentType;

  const uploadUrl = presignR2Put({
    ...storage,
    key,
    now: new Date(),
    expiresSeconds: 300,
    contentType: uploadContentType,
  });

  return NextResponse.json({
    enabled: true,
    uploadUrl,
    // The client must send exactly this as Content-Type: it is signed.
    uploadContentType,
    path: key,
    maxBytes: MAX_BYTES,
  });
}
