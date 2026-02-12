"use client";

import { useEffect } from "react";

import { ScrollToTopFab } from "@/components/ScrollToTopFab";

export function GlobalClientUI() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js");
      } catch {
        // Silent fail: app should still work without offline cache.
      }
    };
    register();
  }, []);

  return <ScrollToTopFab />;
}
