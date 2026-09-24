import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

// VAPID_SUBJECT is deliberately absent: it is optional (the route has a default)
// and so must not affect `ready`.
const REQUIRED = [
  "QSTASH_TOKEN",
  "QSTASH_CURRENT_SIGNING_KEY",
  "QSTASH_NEXT_SIGNING_KEY",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
] as const;

const ALL = [...REQUIRED, "VAPID_SUBJECT"] as const;

function configure(set: readonly string[]) {
  for (const k of ALL) vi.stubEnv(k, set.includes(k) ? `value-for-${k}` : "");
}

beforeEach(() => configure([]));
afterEach(() => vi.unstubAllEnvs());

describe("push health route", () => {
  it("ready:false with nothing configured", async () => {
    const json = await (await GET()).json();
    expect(json.ready).toBe(false);
    expect(json.vars).toEqual(
      Object.fromEntries(ALL.map((k) => [k, false]))
    );
  });

  it("ready:true with the five required vars, VAPID_SUBJECT left unset", async () => {
    configure(REQUIRED);
    const json = await (await GET()).json();
    expect(json.ready).toBe(true);
    expect(json.vars.VAPID_SUBJECT).toBe(false);
  });

  it.each(REQUIRED)("ready:false when %s alone is missing", async (missing) => {
    configure(REQUIRED.filter((k) => k !== missing));
    const json = await (await GET()).json();
    expect(json.ready).toBe(false);
    expect(json.vars[missing]).toBe(false);
  });

  // The route's whole contract: "booleans only, never the values". A diagnostics
  // endpoint that leaks a signing key would be worse than no endpoint.
  it("never puts a configured value in the response", async () => {
    const secret = "s3cret-qstash-token-do-not-leak";
    configure(REQUIRED);
    vi.stubEnv("QSTASH_TOKEN", secret);

    const text = await (await GET()).text();
    expect(text).not.toContain(secret);
    expect(text).not.toContain("value-for-");
    expect(JSON.parse(text).vars.QSTASH_TOKEN).toBe(true);
  });
});
