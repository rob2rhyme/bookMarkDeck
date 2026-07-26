import { Pressable, Text, View } from "react-native";
import type { ReactNode } from "react";

import { HIT_SLOP_MIN } from "./theme";

/** Tappable row with a title, optional detail, and a trailing slot. */
export function ListRow({
  title,
  detail,
  trailing,
  onPress,
  accessibilityHint,
}: {
  title: string;
  detail?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      accessibilityHint={accessibilityHint}
      style={{ minHeight: HIT_SLOP_MIN }}
      className="flex-row items-center justify-between gap-3 rounded-card px-3 py-2.5 active:bg-raised"
    >
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[15px] text-ink">
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={1} className="text-[12px] text-muted">
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing ? <View className="shrink-0">{trailing}</View> : null}
    </Pressable>
  );
}
