// Lemon Squeezy helpers: create a hosted checkout, and verify webhook signatures.
// Merchant-of-record billing for the PWA — LS remits global tax. (MONETIZATION-PWA.md.)

import { createHmac, timingSafeEqual } from "node:crypto";

export function checkoutConfigured(): boolean {
  return Boolean(
    process.env.LEMONSQUEEZY_API_KEY &&
      process.env.LEMONSQUEEZY_STORE_ID &&
      process.env.LEMONSQUEEZY_VARIANT_ID
  );
}

/**
 * Create a hosted checkout for `email`, tagged with the user's email as custom
 * data so the webhook can tie the payment back to the account. Returns the
 * checkout URL, or null if unconfigured / the API call fails.
 */
export async function createCheckoutUrl(email: string): Promise<string | null> {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const variantId = process.env.LEMONSQUEEZY_VARIANT_ID;
  if (!apiKey || !storeId || !variantId) return null;

  try {
    const res = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: { email, custom: { email } },
          },
          relationships: {
            store: { data: { type: "stores", id: String(storeId) } },
            variant: { data: { type: "variants", id: String(variantId) } },
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const url: unknown = json?.data?.attributes?.url;
    return typeof url === "string" ? url : null;
  } catch {
    return null;
  }
}

/** Verify the X-Signature HMAC-SHA256 of the raw request body. */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null | undefined
): boolean {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  try {
    const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
    const a = Buffer.from(digest, "hex");
    const b = Buffer.from(signature, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
