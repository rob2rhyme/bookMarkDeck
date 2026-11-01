import { NextResponse, type NextRequest } from "next/server";

import { verifyWebhookSignature } from "@/lib/lemonsqueezy";
import { getEntitlement, setEntitlement } from "@/lib/entitlement";

export const runtime = "nodejs";

// Lemon Squeezy webhook. Signature-verified (like the QStash push/fire route),
// so it is intentionally NOT session-gated — the caller is LS, not a user.
// Reconciles the user's entitlement from the subscription/order event.
const ACTIVE_STATUSES = new Set(["active", "on_trial", "paid", "cancelled"]);

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get("x-signature");
  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let body: {
    meta?: { event_name?: string; custom_data?: { email?: string } };
    data?: { attributes?: Record<string, unknown> };
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const attrs = body.data?.attributes ?? {};
  const eventName = String(body.meta?.event_name ?? "");
  const email = String(
    body.meta?.custom_data?.email ?? (attrs.user_email as string) ?? ""
  );
  // Nothing to key on — ack so LS doesn't retry a webhook we can't use.
  if (!email) return NextResponse.json({ ok: true });

  const status = String(attrs.status ?? "");
  // A subscription in an active/trial/grace status is pro; a one-time order is
  // pro too; an expired subscription is not.
  const pro =
    eventName === "order_created" ||
    (ACTIVE_STATUSES.has(status) && eventName !== "subscription_expired");
  const until = String(attrs.renews_at ?? attrs.ends_at ?? "") || undefined;

  // Lemon Squeezy retries failed deliveries and doesn't promise order, so a late
  // retry of an old "active" update could land after "expired" and hand pro back
  // for good. Apply an event only if it is at least as new as what is stored.
  const updatedAt =
    typeof attrs.updated_at === "string" && !Number.isNaN(Date.parse(attrs.updated_at))
      ? attrs.updated_at
      : undefined;
  if (updatedAt) {
    const current = await getEntitlement(email);
    if (current?.updatedAt && Date.parse(current.updatedAt) > Date.parse(updatedAt)) {
      return NextResponse.json({ ok: true, stale: true });
    }
  }

  await setEntitlement(email, { pro, status, until, ...(updatedAt ? { updatedAt } : {}) });
  return NextResponse.json({ ok: true });
}
