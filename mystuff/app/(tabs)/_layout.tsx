import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useColorScheme } from "nativewind";

import { paletteFor, HIT_SLOP_MIN } from "@/ui/theme";

// Emoji tab icons keep the scaffold dependency-free; they are swapped for a
// proper icon set during the UI pass. `accessibilityElementsHidden` keeps them
// decorative — the tab label is the accessible name.
function TabIcon({ glyph }: { glyph: string }) {
  return (
    <Text style={{ fontSize: 20 }} accessibilityElementsHidden importantForAccessibility="no">
      {glyph}
    </Text>
  );
}

export default function TabsLayout() {
  const { colorScheme } = useColorScheme();
  const p = paletteFor(colorScheme === "dark" ? "dark" : "light");

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: p.surface },
        headerTitleStyle: { color: p.ink },
        tabBarStyle: {
          backgroundColor: p.surface,
          borderTopColor: p.line,
          minHeight: HIT_SLOP_MIN + 12,
        },
        tabBarActiveTintColor: p.accent,
        tabBarInactiveTintColor: p.faint,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Items",
          tabBarIcon: () => <TabIcon glyph="📦" />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: "Insights",
          tabBarIcon: () => <TabIcon glyph="📈" />,
        }}
      />
      <Tabs.Screen
        name="wishlist"
        options={{
          title: "Wishlist",
          tabBarIcon: () => <TabIcon glyph="♡" />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: () => <TabIcon glyph="⋯" />,
        }}
      />
    </Tabs>
  );
}
