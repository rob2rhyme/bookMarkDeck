// Shared by the /api/tts route and the browser: what a cloud narration request may
// ask for. The route re-validates everything — the client's copy is for the picker.

export type CloudVoiceId =
  | "coral"
  | "sage"
  | "alloy"
  | "nova"
  | "shimmer"
  | "ash"
  | "ballad"
  | "echo"
  | "fable"
  | "onyx"
  | "verse";

export const CLOUD_VOICES: { id: CloudVoiceId; label: string }[] = [
  { id: "coral", label: "Coral — warm" },
  { id: "sage", label: "Sage — calm" },
  { id: "alloy", label: "Alloy — neutral" },
  { id: "nova", label: "Nova — bright" },
  { id: "shimmer", label: "Shimmer — soft" },
  { id: "ash", label: "Ash — low" },
  { id: "ballad", label: "Ballad — gentle" },
  { id: "echo", label: "Echo — clear" },
  { id: "fable", label: "Fable — storyteller" },
  { id: "onyx", label: "Onyx — deep" },
  { id: "verse", label: "Verse — expressive" },
];

export const DEFAULT_CLOUD_VOICE: CloudVoiceId = "coral";

export const isCloudVoice = (v: unknown): v is CloudVoiceId =>
  typeof v === "string" && CLOUD_VOICES.some((o) => o.id === v);

/** One request is one sentence or short step; nothing a person narrates needs more. */
export const TTS_MAX_CHARS = 500;

/** The model's speaking speed, as a multiplier. The pace choices map onto these. */
export const TTS_SPEED_MIN = 0.7;
export const TTS_SPEED_MAX = 1.2;

export const clampSpeed = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0.9;
  return Math.round(Math.min(TTS_SPEED_MAX, Math.max(TTS_SPEED_MIN, n)) * 100) / 100;
};

/**
 * How the voice is asked to sound. Fixed on the server, never taken from the
 * client: it is what keeps the key a meditation narrator rather than a general
 * text-to-speech service.
 */
export const NARRATOR_INSTRUCTIONS =
  "You are a calm, warm meditation guide. Speak softly and slowly, with a gentle, unhurried " +
  "tone and natural pauses. Never rush, never sound cheerful or like an announcer.";

export const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
