"use client";

import { InstallPrompt } from "@/components/InstallPrompt";
import { ScrollToTopFab } from "@/components/ScrollToTopFab";

export function GlobalClientUI() {
  return (
    <>
      <ScrollToTopFab />
      <InstallPrompt />
    </>
  );
}
