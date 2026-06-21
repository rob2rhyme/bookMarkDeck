"use client";

import { SessionProvider } from "next-auth/react";

import { ToastProvider } from "@/components/toast/ToastProvider";
import { CursorSettingsProvider } from "@/lib/cursorSettings";

// Isolate client-only providers so the root layout can stay a Server Component.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <CursorSettingsProvider>{children}</CursorSettingsProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
