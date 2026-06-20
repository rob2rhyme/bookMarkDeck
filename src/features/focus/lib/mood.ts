// Emotional status options for the daily journal. Framework-free data; the
// premium face icons live in components/MoodIcon.tsx (keyed by `key`).

export type MoodKey =
  | "great"
  | "good"
  | "excited"
  | "calm"
  | "okay"
  | "tired"
  | "low"
  | "anxious"
  | "stressed";

export type Mood = {
  key: MoodKey;
  label: string;
  emoji: string; // fallback (notifications, plain-text contexts)
  tint: string; // tailwind text-color class — the icon uses currentColor
};

export const MOODS: Mood[] = [
  { key: "great", label: "Great", emoji: "😄", tint: "text-emerald-400" },
  { key: "good", label: "Good", emoji: "🙂", tint: "text-lime-400" },
  { key: "excited", label: "Excited", emoji: "🤩", tint: "text-fuchsia-400" },
  { key: "calm", label: "Calm", emoji: "😌", tint: "text-teal-400" },
  { key: "okay", label: "Okay", emoji: "😐", tint: "text-amber-400" },
  { key: "tired", label: "Tired", emoji: "😴", tint: "text-violet-400" },
  { key: "low", label: "Low", emoji: "😟", tint: "text-sky-400" },
  { key: "anxious", label: "Anxious", emoji: "😰", tint: "text-yellow-400" },
  { key: "stressed", label: "Stressed", emoji: "😣", tint: "text-orange-400" },
];

export const MOOD_BY_KEY: Record<MoodKey, Mood> = MOODS.reduce(
  (acc, m) => {
    acc[m.key] = m;
    return acc;
  },
  {} as Record<MoodKey, Mood>
);

export function isMoodKey(value: unknown): value is MoodKey {
  return typeof value === "string" && MOODS.some((m) => m.key === value);
}
