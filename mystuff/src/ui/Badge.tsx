import { Text, View } from "react-native";

type Tone = "neutral" | "good" | "warn" | "bad" | "accent";

const TONE: Record<Tone, string> = {
  neutral: "bg-raised text-muted",
  good: "bg-good/15 text-good",
  warn: "bg-warn/15 text-warn",
  bad: "bg-bad/15 text-bad",
  accent: "bg-accent/15 text-accent",
};

/**
 * Small status pill (e.g. "Low stock", "Warranty ending").
 *
 * Tone is never the ONLY carrier of meaning — the label always says what the
 * state is, so the badge still reads correctly without colour perception.
 */
export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const [bg, fg] = TONE[tone].split(" ");
  return (
    <View className={`rounded-pill px-2 py-0.5 ${bg}`}>
      <Text className={`text-[11px] font-medium ${fg}`}>{label}</Text>
    </View>
  );
}
