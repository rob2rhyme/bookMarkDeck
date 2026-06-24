"use client";

// Which /habits layout to show: the beginner-first "simple" view or the full
// "classic" dashboard. Local-only (per device), hydration-safe, modeled on
// src/lib/cursorSettings.tsx. Both views share the same data — this only picks
// the presentation, so switching back and forth is lossless.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type HabitsView = "simple" | "classic";

export const DEFAULT_HABITS_VIEW: HabitsView = "simple";

const KEY = "bd:habits-view:v1";

export function normalizeHabitsView(raw: unknown): HabitsView {
  return raw === "classic" ? "classic" : "simple";
}

type HabitsViewContextValue = {
  view: HabitsView;
  setView: (v: HabitsView) => void;
  hydrated: boolean;
};

const HabitsViewContext = createContext<HabitsViewContextValue | null>(null);

export function HabitsViewProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [view, setViewState] = useState<HabitsView>(DEFAULT_HABITS_VIEW);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setViewState(normalizeHabitsView(raw));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const setView = useCallback((v: HabitsView) => {
    const next = normalizeHabitsView(v);
    setViewState(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ view, setView, hydrated }),
    [view, setView, hydrated]
  );

  return (
    <HabitsViewContext.Provider value={value}>
      {children}
    </HabitsViewContext.Provider>
  );
}

export function useHabitsView(): HabitsViewContextValue {
  const ctx = useContext(HabitsViewContext);
  if (!ctx) {
    return { view: DEFAULT_HABITS_VIEW, setView: () => {}, hydrated: false };
  }
  return ctx;
}
