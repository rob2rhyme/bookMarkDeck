"use client";

import { CommandPalette } from "@/components/CommandPalette";
import { InstallPrompt } from "@/components/InstallPrompt";
import { NotificationBanner } from "@/components/NotificationBanner";
import { Onboarding } from "@/components/Onboarding";
import { ScrollToTopFab } from "@/components/ScrollToTopFab";

export function GlobalClientUI() {
  return (
    <>
      <ScrollToTopFab />
      <InstallPrompt />
      <CommandPalette />
      <NotificationBanner />
      <Onboarding />
    </>
  );
}
