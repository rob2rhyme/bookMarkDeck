import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";

import { useTheme } from "@/ui/theme";

function TabIcon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ fontSize: 20, color }}>{glyph}</Text>;
}

export default function TabsLayout() {
  const { palette } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: palette.bgRaised },
        headerTintColor: palette.text,
        tabBarStyle: {
          backgroundColor: palette.bgRaised,
          borderTopColor: palette.border,
        },
        tabBarActiveTintColor: palette.accentText,
        tabBarInactiveTintColor: palette.textFaint,
        sceneStyle: { backgroundColor: palette.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Items",
          tabBarIcon: ({ color }) => <TabIcon glyph="📦" color={color} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: "Insights",
          tabBarIcon: ({ color }) => <TabIcon glyph="📈" color={color} />,
        }}
      />
      <Tabs.Screen
        name="wishlist"
        options={{
          title: "Wishlist",
          tabBarIcon: ({ color }) => <TabIcon glyph="♡" color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color }) => <TabIcon glyph="⋯" color={color} />,
        }}
      />
    </Tabs>
  );
}
