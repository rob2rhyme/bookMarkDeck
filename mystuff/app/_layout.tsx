import "../global.css";

import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { paletteFor } from "@/ui/theme";
import { DataProvider } from "@/data/provider";

export default function RootLayout() {
  // `userInterfaceStyle: automatic` in app.json means this follows the system,
  // and NativeWind drives the `.dark` class that global.css keys off — so light
  // and dark ship together rather than light being a retrofit.
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const p = paletteFor(scheme);

  const navTheme = {
    ...(scheme === "dark" ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === "dark" ? DarkTheme : DefaultTheme).colors,
      background: p.canvas,
      card: p.surface,
      text: p.ink,
      border: p.line,
      primary: p.accent,
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={navTheme}>
        <DataProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="add"
              options={{ presentation: "modal", headerShown: true, title: "Add item" }}
            />
            <Stack.Screen
              name="item/[id]"
              options={{ headerShown: true, title: "Item" }}
            />
          </Stack>
        </DataProvider>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
