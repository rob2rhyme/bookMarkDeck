"use client";

import { SessionProvider } from "next-auth/react";

import { AppearanceApplier } from "@/components/AppearanceApplier";
import { ToastProvider } from "@/components/toast/ToastProvider";
import { AppearanceProvider } from "@/lib/appearanceSettings";
import { CursorSettingsProvider } from "@/lib/cursorSettings";

// Isolate client-only providers so the root layout can stay a Server Component.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <AppearanceProvider>
          {/* Sits with the provider it reads from, not in GlobalClientUI, so
              appearance reaches every route group. GlobalClientUI is mounted
              only by (app)/layout.tsx, which left /login, /error and /not-found
              without the font/scale variables — and, once theming landed,
              without the theme-color sync for a manual light/dark override. */}
          <AppearanceApplier />
          <CursorSettingsProvider>
            {children}
          </CursorSettingsProvider>
        </AppearanceProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
