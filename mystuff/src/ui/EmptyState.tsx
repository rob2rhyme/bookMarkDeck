import { Text, View } from "react-native";

import { Button } from "./Button";

/**
 * Empty states TEACH — they say what this screen is for and give the one next
 * action, rather than just reporting "nothing here". This is a core part of the
 * beginner-friendly brief.
 */
export function EmptyState({
  emoji,
  title,
  body,
  actionLabel,
  onAction,
}: {
  emoji: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="items-center gap-3 px-8 py-12">
      <Text className="text-4xl" accessibilityElementsHidden importantForAccessibility="no">
        {emoji}
      </Text>
      <Text className="text-center text-base font-semibold text-ink">{title}</Text>
      <Text className="text-center text-[14px] leading-5 text-muted">{body}</Text>
      {actionLabel && onAction ? (
        <View className="mt-2">
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}
