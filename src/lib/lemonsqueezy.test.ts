import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature, checkoutConfigured } from "./lemonsqueezy";

const SECRET = "test-webhook-secret";
const sign = (body: string) =>
  createHmac("sha256", SECRET).update(body).digest("hex");

describe("verifyWebhookSignature", () => {
  beforeEach(() => vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", SECRET));
  afterEach(() => vi.unstubAllEnvs());

  it("accepts a correct signature", () => {
    const body = JSON.stringify({ meta: { event_name: "order_created" } });
    expect(verifyWebhookSignature(body, sign(body))).toBe(true);
  });

  it("rejects a signature for different content", () => {
    expect(verifyWebhookSignature("{}", sign("different"))).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(verifyWebhookSignature("{}", null)).toBe(false);
  });

  it("rejects when the secret is unset (fails closed)", () => {
    vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", "");
    const body = "{}";
    expect(verifyWebhookSignature(body, sign(body))).toBe(false);
  });
});

describe("checkoutConfigured", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is false when unset", () => {
    vi.stubEnv("LEMONSQUEEZY_API_KEY", "");
    vi.stubEnv("LEMONSQUEEZY_STORE_ID", "");
    vi.stubEnv("LEMONSQUEEZY_VARIANT_ID", "");
    expect(checkoutConfigured()).toBe(false);
  });

  it("is true when all three vars are set", () => {
    vi.stubEnv("LEMONSQUEEZY_API_KEY", "k");
    vi.stubEnv("LEMONSQUEEZY_STORE_ID", "1");
    vi.stubEnv("LEMONSQUEEZY_VARIANT_ID", "2");
    expect(checkoutConfigured()).toBe(true);
  });
});
