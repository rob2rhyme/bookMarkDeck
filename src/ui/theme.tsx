import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { loadSettings, saveSettings } from "@/data/storage";
import { palettes, type Palette, type ResolvedScheme } from "@/ui/tokens";

export type ThemeMode = "system" | "dark" | "light";

type ThemeContextValue = {
  palette: Palette;
  scheme: ResolvedScheme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  palette: palettes.dark,
  scheme: "dark",
  mode: "system",
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    let alive = true;
    loadSettings().then((s) => {
      if (alive && s.themeMode) setModeState(s.themeMode);
    });
    return () => {
      alive = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void saveSettings({ themeMode: next });
  }, []);

  const scheme: ResolvedScheme =
    mode === "system" ? (systemScheme === "light" ? "light" : "dark") : mode;

  const value = useMemo(
    () => ({ palette: palettes[scheme], scheme, mode, setMode }),
    [scheme, mode, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
