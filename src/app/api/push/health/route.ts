import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Reports which push-related env vars are configured — booleans only, never the
// values. Lets you confirm the background-push setup without firing a timer.
export async function GET() {
  const has = (v?: string) => Boolean(v && v.length > 0);

  const vars = {
    QSTASH_TOKEN: has(process.env.QSTASH_TOKEN),
    QSTASH_CURRENT_SIGNING_KEY: has(process.env.QSTASH_CURRENT_SIGNING_KEY),
    QSTASH_NEXT_SIGNING_KEY: has(process.env.QSTASH_NEXT_SIGNING_KEY),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: has(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    VAPID_PRIVATE_KEY: has(process.env.VAPID_PRIVATE_KEY),
    VAPID_SUBJECT: has(process.env.VAPID_SUBJECT), // optional (has a default)
  };

  // Everything required for the closed-app push to fire (VAPID_SUBJECT optional).
  const ready =
    vars.QSTASH_TOKEN &&
    vars.QSTASH_CURRENT_SIGNING_KEY &&
    vars.QSTASH_NEXT_SIGNING_KEY &&
    vars.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    vars.VAPID_PRIVATE_KEY;

  return NextResponse.json({ ready, vars });
}
