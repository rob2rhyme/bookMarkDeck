import { NextResponse } from "next/server";
import { Client } from "@upstash/qstash";

export const runtime = "nodejs";

// Cancels a scheduled timer-end push (on pause / reset / foreground completion).
export async function POST(req: Request) {
  const token = process.env.QSTASH_TOKEN;
  if (!token) return NextResponse.json({ ok: false }, { status: 503 });

  let messageId: unknown;
  try {
    ({ messageId } = await req.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (typeof messageId !== "string" || !messageId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    const client = new Client({ token });
    await client.messages.delete(messageId);
  } catch {
    // Already delivered or gone — nothing to do.
  }
  return NextResponse.json({ ok: true });
}
