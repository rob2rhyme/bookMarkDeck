// Bottom snackbar for delete-undo — mirrors the web app's 6-second window.

import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useInventory } from "@/data/inventoryStore";
import { useTheme } from "@/ui/theme";
import { radius, spacing } from "@/ui/tokens";

export function UndoToast() {
  const { undo, dismissUndo } = useInventory();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  if (!undo) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: insets.bottom + 64,
        alignItems: "center",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.lg,
          backgroundColor: palette.bgElement,
          borderColor: palette.borderStrong,
          borderWidth: 1,
          borderRadius: radius.pill,
          paddingHorizontal: spacing.lg,
          paddingVertical: 10,
          maxWidth: 360,
        }}
      >
        <Text
          numberOfLines={1}
          style={{ color: palette.text, fontSize: 14, flexShrink: 1 }}
        >
          {undo.label}
        </Text>
        <Pressable
          onPress={() => {
            undo.run();
            dismissUndo();
          }}
        >
          <Text
            style={{ color: palette.accentText, fontSize: 14, fontWeight: "700" }}
          >
            Undo
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
