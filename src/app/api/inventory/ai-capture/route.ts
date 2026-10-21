import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import Anthropic from "@anthropic-ai/sdk";

import {
  AI_CAPTURE_MAX_CHARS,
  AI_REQUEST,
  aiModel,
  captureInstructions,
  extractJson,
  parseAiProduct,
  splitImageDataUrl,
} from "@/features/inventory/lib/aiCapture";
import { createRateLimiter } from "@/lib/rateLimit";
import { billingConfigured, isPro, withinFreeQuota } from "@/lib/entitlement";

export const runtime = "nodejs";
export const maxDuration = 30;

// Vision calls cost real money per request; cap per-user abuse. Generous for
// real scanning (a burst of items) but blocks scripted credit-burn.
const limited = createRateLimiter(60_000, 15);

// Free AI captures per month before Premium is required (only when billing is
// configured; otherwise there's no paywall).
const FREE_AI_CAPTURES = 5;

// Photo → "what is this?" via Claude vision. Opt-in: does nothing until the
// deployment sets ANTHROPIC_API_KEY (absent → ai_unconfigured; the modal
// explains). Session-gated (not an open proxy) and size-capped so the key
// can't be farmed for free vision calls. Model is env-swappable; the default
// is the cheapest vision tier (aiModel) — well under a cent per scan — per the
// AI-capture cost analysis (set AI_CAPTURE_MODEL to change, no code edit).
const MODEL = aiModel();

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
      !(await withinFreeQuota(email, "ai-capture", FREE_AI_CAPTURES))
    ) {
      return NextResponse.json(
        { ok: false, error: "upgrade_required" },
        { status: 402 }
      );
    }
  }

  let body: { image?: unknown; currency?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const image = typeof body.image === "string" ? body.image : "";
  if (image.length > AI_CAPTURE_MAX_CHARS) {
    return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
  }
  const img = splitImageDataUrl(image);
  if (!img) {
    return NextResponse.json({ ok: false, error: "bad_image" }, { status: 400 });
  }
  const currency =
    typeof body.currency === "string" && body.currency.trim()
      ? body.currency.trim().slice(0, 8)
      : "USD";

  const client = new Anthropic({ apiKey, timeout: 25_000, maxRetries: 1 });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: AI_REQUEST.maxTokens,
      output_config: { effort: AI_REQUEST.effort },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: img.mediaType, data: img.data },
            },
            { type: "text", text: captureInstructions(currency) },
          ],
        },
      ],
    });
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const product = parseAiProduct(extractJson(text));
    if (!product) return NextResponse.json({ ok: true, found: false });
    return NextResponse.json({ ok: true, found: true, product });
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
