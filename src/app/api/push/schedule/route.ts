import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Client } from "@upstash/qstash";

import { authConfig } from "@/auth/auth.config";

export const runtime = "nodejs";

// Schedules a QStash-delayed call to /api/push/fire at the timer's end time.
// The push subscription + content travel in the message body (no server-side
// storage needed), so this works without the Firebase Admin SDK.
export async function POST(req: Request) {
  const session = await getServerSession(authConfig);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
    tag?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { subscription, delaySec, title, body, url, tag } = payload;

  // A valid Web Push subscription is an object with an https endpoint string.
  if (!isValidSubscription(subscription)) {
    return NextResponse.json(
      { error: "invalid subscription" },
      { status: 400 }
    );
  }

  // Clamp the delay into a sane window: no negatives, capped at 24h so a bad
  // client can't queue a far-future message.
  const MAX_DELAY_SEC = 24 * 60 * 60;
  const delay = Math.min(
    MAX_DELAY_SEC,
    Math.max(0, Math.round(Number(delaySec) || 0))
  );

  // Cap notification text (well under the push payload limit) and keep the
  // click-through to a same-site relative path.
  const safeTitle = clampText(title, 120) || "Time's up";
  const safeBody = clampText(body, 300);
  const safeUrl = safeRelativeUrl(url);
  const safeTag = safeNotificationTag(tag);

  const origin = new URL(req.url).origin;
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
    // QStash cannot reach localhost — skip silently in local dev.
    return NextResponse.json({ messageId: null, skipped: "local" });
  }

  try {
    const client = new Client({ token });
    const res = await client.publishJSON({
      url: `${origin}/api/push/fire`,
      body: {
        subscription,
        title: safeTitle,
        body: safeBody,
        url: safeUrl,
        tag: safeTag,
      },
      delay,
    });
    return NextResponse.json({ messageId: res.messageId });
  } catch {
    return NextResponse.json({ error: "schedule failed" }, { status: 502 });
  }
}

/** A Web Push subscription: object with an https `endpoint` string. */
function isValidSubscription(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const endpoint = (value as { endpoint?: unknown }).endpoint;
  return typeof endpoint === "string" && endpoint.startsWith("https://");
}

/** Trim to a string and hard-cap its length; non-strings become "". */
function clampText(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/** A short, plain identifier, or the timer's tag — the one every push used to
 *  share, so an old client that sends none behaves exactly as before. */
function safeNotificationTag(value: unknown): string {
  return typeof value === "string" && /^[\w:.-]{1,64}$/.test(value)
    ? value
    : "bmd-focus-timer";
}

/** Keep click-through targets to same-site relative paths; default to /focus. */
function safeRelativeUrl(value: unknown): string {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value.slice(0, 512);
  }
  return "/focus";
}
