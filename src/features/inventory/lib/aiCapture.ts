// AI photo capture ("snap it → what is this?"): pure helpers shared by the
// session-gated /api/inventory/ai-capture route and the capture modal. No
// React/Firebase/SDK imports — see aiCapture.test.ts.

/** What the vision model returns for a recognized product. */
export type AiProduct = {
  name: string;
  brand?: string;
  category?: string;
  estPrice?: number; // rough current price in the requested currency
  description?: string;
};

/**
 * The model both AI routes call: AI_CAPTURE_MODEL if set, else the current
 * Haiku — the cheapest vision tier. One default for both, so they can't drift.
 */
export const DEFAULT_AI_MODEL = "claude-haiku-5-5";
export function aiModel(env: string | undefined = process.env.AI_CAPTURE_MODEL): string {
  return env?.trim() || DEFAULT_AI_MODEL;
}

/**
 * Current models think before they answer, and that thinking counts against
 * max_tokens. These are short extraction jobs, so effort stays low and the cap
 * leaves room for the thinking as well as the JSON — only tokens used are billed.
 */
export const AI_REQUEST = { maxTokens: 4000, effort: "low" } as const;

/** Longest photo edge sent for identification — keeps a scan ~1–2K image
 *  tokens (fractions of a cent on the default model) without hurting accuracy. */
export const AI_CAPTURE_MAX_EDGE = 1200;

/** Hard cap on the data-URL string the route accepts (~1.1 MB decoded). */
export const AI_CAPTURE_MAX_CHARS = 1_500_000;

export type AiImagePart = {
  mediaType: "image/webp" | "image/jpeg" | "image/png";
  data: string; // raw base64, no data: prefix
};

/** Split a compressed photo `data:` URL into the media type + base64 payload
 *  the vision API wants. Null when it isn't a base64 webp/jpeg/png image. */
export function splitImageDataUrl(dataUrl: string): AiImagePart | null {
  const m = /^data:(image\/(?:webp|jpeg|png));base64,/.exec(dataUrl);
  if (!m) return null;
  const data = dataUrl.slice(m[0].length);
  if (!data || /[^A-Za-z0-9+/=]/.test(data)) return null;
  return { mediaType: m[1] as AiImagePart["mediaType"], data };
}

/** The identification prompt. Asks for bare JSON so parsing stays trivial;
 *  extractJson below still tolerates a fenced or chatty reply. */
export function captureInstructions(currency: string): string {
  return [
    "Identify the single main product in this photo for a home-inventory app.",
    "Reply with ONLY a JSON object (no markdown fences, no prose) shaped exactly:",
    '{"name": string, "brand": string|null, "category": string|null, "estPrice": number|null, "description": string|null}',
    "- name: short product name; include brand and model when visible.",
    '- category: one or two words, e.g. "Electronics", "Kitchen", "Tools".',
    `- estPrice: rough current typical price in ${currency}, or null if unsure.`,
    "- description: one short sentence — what it is and anything notable.",
    'If no product is recognizable, reply {"name": ""}.',
  ].join("\n");
}

/** Pull the first JSON object out of a model reply — tolerates ``` fences and
 *  surrounding prose. Null when nothing parses. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const clip = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : undefined;
};

/** Validate + normalize the model's JSON into an AiProduct. Null when there is
 *  no usable product (empty name = "nothing recognizable"). */
export function parseAiProduct(raw: unknown): AiProduct | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const name = clip(r.name, 120);
  if (!name) return null;
  const price =
    typeof r.estPrice === "number" && Number.isFinite(r.estPrice) && r.estPrice > 0
      ? Math.round(r.estPrice * 100) / 100
      : undefined;
  return {
    name,
    brand: clip(r.brand, 60),
    category: clip(r.category, 40),
    estPrice: price,
    description: clip(r.description, 300),
  };
}
