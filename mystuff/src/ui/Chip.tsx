import { Pressable, Text } from "react-native";

/** Selectable pill — used for item kinds, filters, tags. */
export function Chip({
  label,
  selected,
  onPress,
  emoji,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  emoji?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      // 36px is below the 44px minimum for a standalone target, so chips are
      // given generous horizontal padding and always appear in a row where the
      // whole row is scrollable — never as the only way to complete a task.
      className={[
        "flex-row items-center gap-1.5 rounded-pill border px-3.5 py-2 active:opacity-80",
        selected
          ? "border-accent bg-accent/10"
          : "border-line bg-raised",
      ].join(" ")}
    >
      {emoji ? <Text className="text-[13px]">{emoji}</Text> : null}
      <Text
        className={[
          "text-[13px]",
          selected ? "font-semibold text-accent" : "text-muted",
        ].join(" ")}
      >
        {label}
      </Text>
    </Pressable>
  );
}
