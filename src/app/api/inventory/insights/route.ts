import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import Anthropic from "@anthropic-ai/sdk";

import { extractJson } from "@/features/inventory/lib/aiCapture";
import { createRateLimiter } from "@/lib/rateLimit";
import { billingConfigured, isPro, withinFreeQuota } from "@/lib/entitlement";

export const runtime = "nodejs";
export const maxDuration = 30;

// AI observation runs are heavier than a scan and only needed occasionally;
// a tight per-user cap keeps authenticated abuse from burning credits.
const limited = createRateLimiter(60_000, 10);

// Free AI insight runs per month before Premium is required (billing-gated only).
const FREE_AI_INSIGHTS = 3;

// Aggregate inventory stats → a handful of warm, specific observations about
// the owner's interests and how they're shifting. Same opt-in scheme as AI
// capture: dormant until ANTHROPIC_API_KEY is set, session-gated, and the
// payload is aggregates only (category/tag labels — never item names/serials).
const MODEL = process.env.AI_CAPTURE_MODEL?.trim() || "claude-haiku-4-5";

const PROMPT = [
  "You are analyzing aggregate statistics from one person's private home-inventory app.",
  "The JSON below has their category/location/tag mixes, keeping-vs-returned status split,",
  "warranty outlook, and acquisitions per quarter by category.",
  "Write 4–6 interesting, specific observations about their interests and how those",
  "interests appear to shift over time (psychological reads are welcome but keep them",
  "kind, grounded in the numbers, and never diagnostic). One sentence each, warm and",
  "plain-spoken, reference actual numbers/labels from the data.",
  'Reply with ONLY a JSON object shaped exactly {"facts": string[]} — no markdown fences, no prose.',
].join(" ");

export async function POST(req: NextRequest) {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!jwt) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "ai_unconfigured" }, { status: 503 });
  }

  if (limited(String(jwt.sub ?? jwt.email ?? "anon"))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  if (billingConfigured()) {
    const email = String(jwt.email ?? "");
    if (
      !(await isPro(email)) &&
      !(await withinFreeQuota(email, "insights", FREE_AI_INSIGHTS))
    ) {
      return NextResponse.json(
        { ok: false, error: "upgrade_required" },
        { status: 402 }
      );
    }
  }

  let body: { summary?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const summary = JSON.stringify(body.summary ?? {});
  if (summary.length < 10 || summary.length > 50_000) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey, timeout: 25_000, maxRetries: 1 });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      messages: [{ role: "user", content: `${PROMPT}\n\n${summary}` }],
    });
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const raw = extractJson(text) as { facts?: unknown } | null;
    const facts = Array.isArray(raw?.facts)
      ? raw.facts
          .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
          .map((f) => f.trim().slice(0, 300))
          .slice(0, 6)
      : [];
    if (facts.length === 0) {
      return NextResponse.json({ ok: false, error: "ai_failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, facts });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ ok: false, error: "ai_unconfigured" }, { status: 503 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }
    return NextResponse.json({ ok: false, error: "ai_failed" }, { status: 502 });
  }
}
