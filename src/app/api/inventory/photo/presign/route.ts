import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { createHash, randomUUID } from "node:crypto";

import { presignR2Put } from "@/features/inventory/lib/r2";

export const runtime = "nodejs";

// Presign a direct browser PUT to Cloudflare R2 for an item photo/attachment.
// Inert (enabled:false) until all R2_* env vars are set — the app falls back to
// the data:-URL storage until then. Session-gated, and the object key is
// composed server-side from the session identity so a client can't target
// another user's prefix.
const EXT: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

// Per-user issuance throttle (per server instance). R2 presigned PUTs can't
// carry a size condition, so issuance is the choke point against scripted
// presign→PUT cost abuse. Generous for real use: a burst of photo + attachment
// uploads stays well under it.
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

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBase = process.env.R2_PUBLIC_BASE_URL;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) {
    return NextResponse.json({ enabled: false });
  }

  let body: { itemId?: string; contentType?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  const contentType =
    typeof body.contentType === "string" ? body.contentType : "image/webp";
  const ext = EXT[contentType];
  // Images only — and the type is SIGNED below, so the PUT can't smuggle
  // anything else (e.g. text/html served off the public bucket domain).
  if (!ext) {
    return NextResponse.json(
      { enabled: true, error: "unsupported_type" },
      { status: 400 }
    );
  }
  if (throttled(String(jwt.sub))) {
    return NextResponse.json(
      { enabled: true, error: "rate_limited" },
      { status: 429 }
    );
  }
  const itemId =
    (typeof body.itemId === "string" ? body.itemId : "")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 64) || "misc";

  // Stable per-user segment from the session subject — never client-supplied.
  const userSeg = createHash("sha256").update(String(jwt.sub)).digest("hex").slice(0, 16);
  const key = `inventory/${userSeg}/${itemId}/${randomUUID()}.${ext}`;

  const uploadUrl = presignR2Put({
    accountId,
    bucket,
    key,
    accessKeyId,
    secretAccessKey,
    now: new Date(),
    expiresSeconds: 300,
    contentType,
  });

  return NextResponse.json({
    enabled: true,
    uploadUrl,
    publicUrl: `${publicBase.replace(/\/$/, "")}/${key}`,
    path: key,
  });
}
