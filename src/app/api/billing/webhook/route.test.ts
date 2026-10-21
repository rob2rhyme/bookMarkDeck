import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";

// This route is exempt from the session middleware (Lemon Squeezy calls it with
// no cookie), so its signature check is the ONLY thing standing between the
// internet and a write to someone's entitlement. Pinned here at route level;
// e2e/machine.spec.ts pins that the middleware lets it through at all.
vi.mock("@/lib/entitlement", () => ({ setEntitlement: vi.fn(), getEntitlement: vi.fn(async () => null) }));
import { getEntitlement, setEntitlement } from "@/lib/entitlement";
import { POST } from "./route";

const SECRET = "ls-test-secret";
const sign = (raw: string) => createHmac("sha256", SECRET).update(raw).digest("hex");

function req(body: unknown, signature?: string | null): NextRequest {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const headers: Record<string, string> = {};
  const sig = signature === undefined ? sign(raw) : signature;
  if (sig !== null) headers["x-signature"] = sig;
  return new Request("https://app.example.com/api/billing/webhook", {
    method: "POST",
    headers,
    body: raw,
  }) as unknown as NextRequest;
}

const EVENT = {
  meta: { event_name: "subscription_created", custom_data: { email: "a@example.com" } },
  data: { attributes: { status: "active", renews_at: "2026-10-29T00:00:00Z" } },
};

beforeEach(() => {
  vi.mocked(setEntitlement).mockReset();
  vi.mocked(getEntitlement).mockReset().mockResolvedValue(null);
  vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", SECRET);
});
afterEach(() => vi.unstubAllEnvs());

describe("billing webhook route", () => {
  it("401 and writes nothing on a forged signature", async () => {
    const res = await POST(req(EVENT, "ab".repeat(32)));
    expect(res.status).toBe(401);
    expect(setEntitlement).not.toHaveBeenCalled();
  });

  it("401 and writes nothing with no signature header", async () => {
    const res = await POST(req(EVENT, null));
    expect(res.status).toBe(401);
    expect(setEntitlement).not.toHaveBeenCalled();
  });

  it("401 when the body was altered after signing", async () => {
    const res = await POST(req({ ...EVENT, tampered: true }, sign(JSON.stringify(EVENT))));
    expect(res.status).toBe(401);
    expect(setEntitlement).not.toHaveBeenCalled();
  });

  it("401 when the secret is not configured, even for a 'valid' signature", async () => {
    vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", "");
    const res = await POST(req(EVENT));
    expect(res.status).toBe(401);
    expect(setEntitlement).not.toHaveBeenCalled();
  });

  it("grants pro for a correctly signed active subscription", async () => {
    const res = await POST(req(EVENT));
    expect(res.status).toBe(200);
    expect(setEntitlement).toHaveBeenCalledWith("a@example.com", {
      pro: true,
      status: "active",
      until: "2026-10-29T00:00:00Z",
    });
  });

  it("revokes pro on subscription_expired", async () => {
    const expired = { ...EVENT, meta: { ...EVENT.meta, event_name: "subscription_expired" } };
    await POST(req(expired));
    expect(vi.mocked(setEntitlement).mock.calls[0][1].pro).toBe(false);
  });

  it("400 on a signed but unparseable body", async () => {
    const res = await POST(req("{not json"));
    expect(res.status).toBe(400);
    expect(setEntitlement).not.toHaveBeenCalled();
  });

  describe("out-of-order deliveries", () => {
    const at = (updated_at: string, event_name: string, status: string) => ({
      meta: { event_name, custom_data: { email: "a@example.com" } },
      data: { attributes: { status, updated_at } },
    });

    it("ignores an event older than the stored state (a late retry can't hand pro back)", async () => {
      vi.mocked(getEntitlement).mockResolvedValue({ pro: false, status: "expired", updatedAt: "2026-10-20T12:00:00Z" });
      const res = await POST(req(at("2026-10-01T12:00:00Z", "subscription_updated", "active")));
      expect(res.status).toBe(200);
      expect(setEntitlement).not.toHaveBeenCalled();
    });

    it("applies a newer event and records when it happened", async () => {
      vi.mocked(getEntitlement).mockResolvedValue({ pro: true, status: "active", updatedAt: "2026-10-01T12:00:00Z" });
      await POST(req(at("2026-10-20T12:00:00Z", "subscription_expired", "expired")));
      expect(setEntitlement).toHaveBeenCalledWith("a@example.com", {
        pro: false,
        status: "expired",
        until: undefined,
        updatedAt: "2026-10-20T12:00:00Z",
      });
    });
  });
});
