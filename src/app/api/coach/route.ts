import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getServerSession } from "next-auth";

import { authConfig } from "@/auth/auth.config";

// Server-only AI coach for the habits feature. Two ops:
//   create — turn a natural-language intent into a structured habit draft
//   review — a short, grounded weekly reflection from pre-computed stats
// The ANTHROPIC_API_KEY lives only on the server; the route degrades to 503 when
// it's unset so the client can fall back to manual flows.

export const runtime = "nodejs";

const MODEL = "claude-opus-4-8";

// Flat schema (no unions) so structured outputs stays simple; the client maps
// it onto the Habit type.
const HABIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    emoji: { type: "string" },
    type: { type: "string", enum: ["binary", "measurable"] },
    unit: { type: "string" },
    target: { type: "integer" },
    scheduleType: { type: "string", enum: ["daily", "weekdays", "timesPerWeek"] },
    weekdays: { type: "array", items: { type: "integer" } },
    timesPerWeek: { type: "integer" },
    identity: { type: "string" },
  },
  required: ["name", "emoji", "type", "scheduleType"],
} as const;

function firstText(content: Anthropic.Messages.ContentBlock[]): string {
  for (const b of content) if (b.type === "text") return b.text;
  return "";
}

export async function POST(req: Request) {
  const session = await getServerSession(authConfig);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  let body: { op?: string; text?: unknown; existing?: unknown; stats?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey: key });

  try {
    if (body.op === "create") {
      const text = String(body.text ?? "").slice(0, 500).trim();
      if (!text) return NextResponse.json({ error: "empty" }, { status: 400 });
      const existing = Array.isArray(body.existing)
        ? body.existing.slice(0, 50).map((x) => String(x))
        : [];
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 700,
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: HABIT_SCHEMA },
        },
        system:
          "You design ONE habit from the user's intent. Pick a fitting emoji; choose 'measurable' only when a clear daily quantity + unit fits (e.g. cups, minutes, pages), otherwise 'binary'; choose a realistic schedule (daily, specific weekdays 0=Sun..6=Sat, or a sensible times-per-week count); and write a short identity phrase as the value only (no 'become someone who' prefix). Favor small, achievable habits.",
        messages: [
          {
            role: "user",
            content: `Intent: ${text}\n\nExisting habits to avoid duplicating: ${
              existing.join(", ") || "none"
            }`,
          },
        ],
      });
      let habit: unknown;
      try {
        habit = JSON.parse(firstText(res.content) || "{}");
      } catch {
        return NextResponse.json({ error: "parse" }, { status: 502 });
      }
      return NextResponse.json({ habit });
    }

    if (body.op === "review") {
      const stats = JSON.stringify(body.stats ?? {}).slice(0, 4000);
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 500,
        output_config: { effort: "low" },
        system:
          "You are a warm, concise habit coach. Using ONLY the numbers in the provided JSON, write a short weekly reflection under 120 words: celebrate one real win, name one habit that's slipping with one concrete, kind suggestion (shrink it, move its time, stack it), and end with a single encouraging line. Never invent statistics that aren't in the data. Plain text, no markdown headings.",
        messages: [
          { role: "user", content: `This week's habit stats (JSON):\n${stats}` },
        ],
      });
      return NextResponse.json({ review: firstText(res.content) });
    }

    return NextResponse.json({ error: "unknown op" }, { status: 400 });
  } catch (err) {
    console.error("[coach] error:", err);
    return NextResponse.json({ error: "coach failed" }, { status: 502 });
  }
}
