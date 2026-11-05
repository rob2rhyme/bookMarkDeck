import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { createHash } from "node:crypto";

import { filingStorage } from "@/features/filing/lib/filingStorage";
import { isOwnedFilingPath, presignR2Put } from "@/features/filing/lib/r2";

export const runtime = "nodejs";

// Best-effort R2 object cleanup — called when an attachment or its paper is
// removed so the bucket doesn't accumulate orphans. Session-gated, and every
// key must sit inside the caller's own `filing/{userSeg}/` prefix (the same
// server-derived segment the presign route writes under), so one user can never
// delete another's objects — nor, because the predicate is scoped to `filing/`,
// anything belonging to another pillar. The DELETE itself runs server-side against a
// presigned URL from the same tested SigV4 signer. No-op until R2 is
// configured. Deliberately tolerant: a failed delete only leaves an orphan.
const MAX_PATHS = 25;

export async function POST(req: NextRequest) {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!jwt?.sub) {
    return NextResponse.json({ enabled: false, error: "unauthorized" }, { status: 401 });
  }

  const storage = filingStorage();
  if (!storage) {
    return NextResponse.json({ enabled: false });
  }

  let body: { paths?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* fall through to bad_request below */
  }
  const raw = Array.isArray(body.paths) ? body.paths : null;
  if (!raw) {
    return NextResponse.json({ enabled: true, error: "bad_request" }, { status: 400 });
  }

  const userSeg = createHash("sha256").update(String(jwt.sub)).digest("hex").slice(0, 16);
  const paths = [
    ...new Set(raw.filter((p): p is string => typeof p === "string")),
  ]
    .filter((p) => isOwnedFilingPath(p, userSeg))
    .slice(0, MAX_PATHS);

  let deleted = 0;
  await Promise.all(
    paths.map(async (key) => {
      const url = presignR2Put({
        ...storage,
        key,
        now: new Date(),
        expiresSeconds: 60,
        method: "DELETE",
      });
      try {
        const res = await fetch(url, { method: "DELETE" });
        // R2 returns 204 for deletes (also for already-gone keys).
        if (res.ok || res.status === 404) deleted += 1;
      } catch {
        /* best-effort */
      }
    })
  );

  return NextResponse.json({ enabled: true, deleted });
}
