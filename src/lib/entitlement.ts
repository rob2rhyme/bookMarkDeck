// Server-side entitlement store (Upstash Redis), keyed by the user's email (the
// app's session identifier). Billing is OPT-IN: when the Upstash/LS env is unset
// the store is disabled and the app behaves exactly as before — no paywall.
// (See MONETIZATION-PWA.md.)

import { Redis } from "@upstash/redis";

export type Entitlement = {
  pro: boolean;
  status?: string; // Lemon Squeezy subscription status
  until?: string; // ISO — current period end / renewal
  /** ISO — the Lemon Squeezy `updated_at` this state came from; orders webhooks. */
  updatedAt?: string;
};

let _redis: Redis | null = null;
function redis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!_redis) _redis = new Redis({ url, token });
  return _redis;
}

/**
 * Whether billing/entitlement is configured. When false, NO paywall applies —
 * metered routes serve everyone as they did before billing existed.
 */
export function billingConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL &&
      process.env.UPSTASH_REDIS_REST_TOKEN &&
      process.env.LEMONSQUEEZY_WEBHOOK_SECRET
  );
}

const entKey = (email: string) => `entitlement:${email.toLowerCase()}`;

export async function getEntitlement(
  email: string
): Promise<Entitlement | null> {
  const r = redis();
  if (!r || !email) return null;
  try {
    return (await r.get<Entitlement>(entKey(email))) ?? null;
  } catch {
    return null;
  }
}

export async function setEntitlement(
  email: string,
  ent: Entitlement
): Promise<void> {
  const r = redis();
  if (!r || !email) return;
  try {
    await r.set(entKey(email), ent);
  } catch {
    /* best effort — a failed write just means the next webhook reconciles */
  }
}

export async function isPro(
  email: string | null | undefined
): Promise<boolean> {
  if (!email) return false;
  const ent = await getEntitlement(email);
  return Boolean(ent?.pro);
}

/**
 * Monthly free allowance for a metered feature (non-pro users only). Increments
 * a per-user, per-month counter and returns whether this call is within `limit`.
 * Fails OPEN (returns true) if the store is unavailable — never block a legit
 * user on a Redis hiccup.
 */
export async function withinFreeQuota(
  email: string,
  feature: string,
  limit: number
): Promise<boolean> {
  const r = redis();
  if (!r || !email) return true;
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(
    now.getUTCMonth() + 1
  ).padStart(2, "0")}`;
  const key = `quota:${feature}:${email.toLowerCase()}:${month}`;
  try {
    const count = await r.incr(key);
    if (count === 1) await r.expire(key, 60 * 60 * 24 * 40); // ~40 days
    return count <= limit;
  } catch {
    return true;
  }
}
