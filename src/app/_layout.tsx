import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavThemeProvider,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";

import { InventoryProvider } from "@/data/inventoryStore";
import { UndoToast } from "@/ui/UndoToast";
import { ThemeProvider, useTheme } from "@/ui/theme";

function AppShell() {
  const { palette, scheme } = useTheme();
  const navTheme = scheme === "dark" ? DarkTheme : DefaultTheme;
  return (
    <NavThemeProvider
      value={{
        ...navTheme,
        colors: {
          ...navTheme.colors,
          background: palette.bg,
          card: palette.bgRaised,
          text: palette.text,
          border: palette.border,
          primary: palette.accent,
        },
      }}
    >
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: palette.bgRaised },
            headerTintColor: palette.text,
            contentStyle: { backgroundColor: palette.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="item/form"
            options={{ presentation: "modal", title: "Item" }}
          />
          <Stack.Screen name="item/[id]" options={{ title: "Item" }} />
        </Stack>
        <UndoToast />
      </View>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <InventoryProvider>
        <AppShell />
      </InventoryProvider>
    </ThemeProvider>
  );
}
