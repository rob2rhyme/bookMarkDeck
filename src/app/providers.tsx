"use client";

import { SessionProvider } from "next-auth/react";

import { ToastProvider } from "@/components/toast/ToastProvider";
import { AppearanceProvider } from "@/lib/appearanceSettings";
import { CursorSettingsProvider } from "@/lib/cursorSettings";
import { HabitsViewProvider } from "@/lib/habitsViewSettings";

// Isolate client-only providers so the root layout can stay a Server Component.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <AppearanceProvider>
          <CursorSettingsProvider>
            <HabitsViewProvider>{children}</HabitsViewProvider>
          </CursorSettingsProvider>
        </AppearanceProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
