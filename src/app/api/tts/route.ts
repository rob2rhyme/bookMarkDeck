import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import {
  DEFAULT_CLOUD_VOICE,
  DEFAULT_TTS_MODEL,
  NARRATOR_INSTRUCTIONS,
  TTS_MAX_CHARS,
  clampSpeed,
  isCloudVoice,
} from "@/features/focus/lib/cloudVoiceConfig";
import { createRateLimiter } from "@/lib/rateLimit";
import { withinFreeQuota } from "@/lib/entitlement";

export const runtime = "nodejs";
export const maxDuration = 30;

const SPEECH_URL = "https://api.openai.com/v1/audio/speech";

// Every request is billed. The client caches each phrase (in memory and on the
// device), so a session costs one request per distinct line; these only stop a
// runaway loop or a scripted caller.
const limited = createRateLimiter(60_000, 60);
const MONTHLY_CAP = 5_000; // per account; fails open without Redis, like the other quotas

/**
 * Cloud narration for the meditation guide: text in, MP3 out, via OpenAI's speech
 * API. Opt-in at the deployment — with no OPENAI_API_KEY the route answers 503 and
 * the app keeps using the device's own voice. Session-gated, length-capped, and
 * the voice's manner is fixed here, so the key can't be used as a general
 * text-to-speech service. The narration text is the app's fixed guide wording
 * (breath cues, guided-meditation steps), never personal data.
 */
export async function POST(req: NextRequest) {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!jwt) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "tts_unconfigured" }, { status: 503 });
  }

  if (limited(String(jwt.sub ?? jwt.email ?? "anon"))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: { text?: unknown; voice?: unknown; speed?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "missing_text" }, { status: 400 });
  if (text.length > TTS_MAX_CHARS) {
    return NextResponse.json({ error: "too_long" }, { status: 413 });
  }
  const voice = isCloudVoice(body.voice) ? body.voice : DEFAULT_CLOUD_VOICE;

  if (!(await withinFreeQuota(String(jwt.email ?? ""), "tts", MONTHLY_CAP))) {
    return NextResponse.json({ error: "quota_exceeded" }, { status: 429 });
  }

  try {
    const res = await fetch(SPEECH_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.TTS_MODEL?.trim() || DEFAULT_TTS_MODEL,
        input: text,
        voice,
        instructions: NARRATOR_INSTRUCTIONS,
        response_format: "mp3",
        speed: clampSpeed(body.speed),
      }),
    });
    if (!res.ok) {
      // Don't relay the provider's error body: it can echo request details.
      return NextResponse.json({ error: "tts_failed" }, { status: 502 });
    }
    const audio = await res.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        // The same text, voice and speed always give the same line; let the
        // browser keep it.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "tts_failed" }, { status: 502 });
  }
}

/** Is cloud narration available on this deployment? Lets the picker hide itself. */
export async function GET(req: NextRequest) {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!jwt) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ configured: Boolean(process.env.OPENAI_API_KEY?.trim()) });
}
