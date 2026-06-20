import { NextResponse } from "next/server";
import { Client } from "@upstash/qstash";

export const runtime = "nodejs";

// Schedules a QStash-delayed call to /api/push/fire at the timer's end time.
// The push subscription + content travel in the message body (no server-side
// storage needed), so this works without the Firebase Admin SDK.
export async function POST(req: Request) {
  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "push not configured" }, { status: 503 });
  }

  let payload: {
    subscription?: unknown;
    delaySec?: number;
    title?: string;
    body?: string;
    url?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { subscription, delaySec, title, body, url } = payload;
  if (!subscription) {
    return NextResponse.json({ error: "missing subscription" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
    // QStash cannot reach localhost — skip silently in local dev.
    return NextResponse.json({ messageId: null, skipped: "local" });
  }

  try {
    const client = new Client({ token });
    const res = await client.publishJSON({
      url: `${origin}/api/push/fire`,
      body: { subscription, title, body, url },
      delay: Math.max(0, Math.round(Number(delaySec) || 0)),
    });
    return NextResponse.json({ messageId: res.messageId });
  } catch {
    return NextResponse.json({ error: "schedule failed" }, { status: 502 });
  }
}
