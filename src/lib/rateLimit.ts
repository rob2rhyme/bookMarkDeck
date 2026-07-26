// In-memory per-key sliding-window rate limiter (per server instance).
//
// Used to cap authenticated cost-abuse on the paid AI routes: the endpoints are
// session-gated and size-capped, but without a per-user limit a logged-in user
// could script calls and burn Anthropic credits. Mirrors the inline throttle in
// the R2 presign route. Not a distributed limiter — good enough as a per-region
// choke point; a hard global cap belongs at the billing/quota layer.

export function createRateLimiter(windowMs: number, maxPerWindow: number) {
  const hits = new Map<string, number[]>();
  return function limited(key: string): boolean {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= maxPerWindow) {
      hits.set(key, recent);
      return true;
    }
    recent.push(now);
    hits.set(key, recent);
    return false;
  };
}
