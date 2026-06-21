"use client";

import { SessionProvider } from "next-auth/react";

import { ToastProvider } from "@/components/toast/ToastProvider";

// Isolate client-only providers so the root layout can stay a Server Component.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>{children}</ToastProvider>
    </SessionProvider>
  );
}
