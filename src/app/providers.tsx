"use client";

import { SessionProvider } from "next-auth/react";
import { useSyncExternalStore } from "react";

import { AppearanceApplier } from "@/components/AppearanceApplier";
import { ToastProvider } from "@/components/toast/ToastProvider";
import { AppearanceProvider } from "@/lib/appearanceSettings";
import { CursorSettingsProvider } from "@/lib/cursorSettings";
import { HabitsViewProvider } from "@/lib/habitsViewSettings";

function onConnectivity(change: () => void) {
  window.addEventListener("online", change);
  window.addEventListener("offline", change);
  return () => {
    window.removeEventListener("online", change);
    window.removeEventListener("offline", change);
  };
}

// Isolate client-only providers so the root layout can stay a Server Component.
export function Providers({ children }: { children: React.ReactNode }) {
  // next-auth refetches the session whenever the tab becomes visible. Offline
  // that fetch fails, the page's session becomes null and stays null (a null
  // session is never refetched on focus), and every pillar loses its account:
  // water cups taken then were recorded nowhere. So not while offline.
  const online = useSyncExternalStore(
    onConnectivity,
    () => navigator.onLine,
    () => true
  );
  return (
    <SessionProvider refetchOnWindowFocus={online}>
      <ToastProvider>
        <AppearanceProvider>
          {/* Sits with the provider it reads from, not in GlobalClientUI, so
              appearance reaches every route group. GlobalClientUI is mounted
              only by (app)/layout.tsx, which left /login, /error and /not-found
              without the font/scale variables — and, once theming landed,
              without the theme-color sync for a manual light/dark override. */}
          <AppearanceApplier />
          <CursorSettingsProvider>
            <HabitsViewProvider>{children}</HabitsViewProvider>
          </CursorSettingsProvider>
        </AppearanceProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
