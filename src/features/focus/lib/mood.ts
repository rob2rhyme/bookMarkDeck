// Emotional status options for the daily journal.

export type MoodKey =
  | "great"
  | "good"
  | "okay"
  | "low"
  | "stressed"
  | "tired";

export const MOODS: { key: MoodKey; label: string; emoji: string }[] = [
  { key: "great", label: "Great", emoji: "😄" },
  { key: "good", label: "Good", emoji: "🙂" },
  { key: "okay", label: "Okay", emoji: "😐" },
  { key: "low", label: "Low", emoji: "😟" },
  { key: "stressed", label: "Stressed", emoji: "😣" },
  { key: "tired", label: "Tired", emoji: "😴" },
];

export const MOOD_BY_KEY: Record<MoodKey, { label: string; emoji: string }> =
  MOODS.reduce(
    (acc, m) => {
      acc[m.key] = { label: m.label, emoji: m.emoji };
      return acc;
    },
    {} as Record<MoodKey, { label: string; emoji: string }>
  );

export function isMoodKey(value: unknown): value is MoodKey {
  return (
    typeof value === "string" && MOODS.some((m) => m.key === value)
  );
}
