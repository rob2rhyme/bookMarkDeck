import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@upstash/qstash", () => ({ Client: vi.fn() }));

import { getServerSession } from "next-auth";
import { Client } from "@upstash/qstash";
import { POST } from "./route";

let del: ReturnType<typeof vi.fn>;

function req(body: unknown): Request {
  return new Request("https://app.example.com/api/push/cancel", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(getServerSession).mockReset();
  vi.mocked(getServerSession).mockResolvedValue({ user: {} } as never);
  del = vi.fn().mockResolvedValue(undefined);
  // Regular function, not an arrow: the route calls `new Client(...)`.
  vi.mocked(Client).mockImplementation(function () {
    return { messages: { delete: del } } as unknown as InstanceType<typeof Client>;
  } as never);
  vi.stubEnv("QSTASH_TOKEN", "qs-token");
});

afterEach(() => vi.unstubAllEnvs());

describe("push cancel route", () => {
  it("401 when logged out", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as never);
    const res = await POST(req({ messageId: "msg_1" }));
    expect(res.status).toBe(401);
    expect(del).not.toHaveBeenCalled();
  });

  it("503 when QSTASH_TOKEN is unset", async () => {
    vi.stubEnv("QSTASH_TOKEN", "");
    const res = await POST(req({ messageId: "msg_1" }));
    expect(res.status).toBe(503);
    expect(del).not.toHaveBeenCalled();
  });

  it("400 on an unparseable body", async () => {
    const res = await POST(req("{not json"));
    expect(res.status).toBe(400);
    expect(del).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined],
    ["a number", 7],
    ["an empty string", ""],
  ])("400 when messageId is %s", async (_label, messageId) => {
    const res = await POST(req({ messageId }));
    expect(res.status).toBe(400);
    expect(del).not.toHaveBeenCalled();
  });

  it("deletes the message and reports ok", async () => {
    const res = await POST(req({ messageId: "msg_42" }));
    expect(del).toHaveBeenCalledWith("msg_42");
    expect(await res.json()).toEqual({ ok: true });
  });

  // Cancelling a message that already fired (or was never there) is a normal
  // race, not an error the client should see.
  it("still reports ok when the delete throws", async () => {
    del.mockRejectedValue(new Error("not found"));
    const res = await POST(req({ messageId: "msg_gone" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
