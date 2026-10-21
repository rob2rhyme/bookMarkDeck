import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import webpush from "web-push";

export const runtime = "nodejs";

// Called by QStash at the timer's end time. Verifies the QStash signature, then
// sends the Web Push notification (the service worker renders it).
export async function POST(req: Request) {
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@bmarkdeck.rob2rhyme.app";
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (!privateKey || !publicKey || !currentSigningKey || !nextSigningKey) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const bodyText = await req.text();
  const signature = req.headers.get("upstash-signature") ?? "";

  const receiver = new Receiver({ currentSigningKey, nextSigningKey });
  const valid = await receiver
    .verify({ signature, body: bodyText })
    .catch(() => false);
  if (!valid) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let data: {
    subscription?: webpush.PushSubscription;
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
    snooze?: boolean;
  };
  try {
    data = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!data.subscription) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  try {
    await webpush.sendNotification(
      data.subscription,
      JSON.stringify({
        title: data.title ?? "Bookmark Deck",
        body: data.body ?? "",
        url: data.url ?? "/focus",
        tag: data.tag,
        ...(data.snooze === true ? { snooze: true } : {}),
      })
    );
  } catch {
    // Subscription may be expired/revoked — don't trigger a QStash retry storm.
    return NextResponse.json({ ok: false, delivered: false });
  }
  return NextResponse.json({ ok: true });
}
