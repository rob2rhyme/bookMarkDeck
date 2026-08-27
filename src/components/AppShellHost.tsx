"use client";

import { useSession } from "next-auth/react";
import { AppShell } from "@/components/AppShell";
import { useFilingReminderCount } from "@/features/filing/hooks/useFilingReminderCount";
import { useInventoryReminderCount } from "@/features/inventory/hooks/useInventoryReminderCount";

// Composition layer: supplies the feature nav badges to the (feature-agnostic)
// AppShell. This is the ONLY place outside src/features/* that imports a
// feature — so extracting a pillar means editing this host, not the shared
// AppShell. (Decoupling step C1, MYSTUFF-DECOUPLING-READINESS.md.)
//
// Both badge hooks read their pillar's localStorage cache only, never Firestore,
// so mounting them in the shell adds no data-layer weight to every page.
export function AppShellHost({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const email = session?.user?.email;
  const inventoryReminders = useInventoryReminderCount(email);
  const filingReminders = useFilingReminderCount(email);
  return (
    <AppShell
      navBadges={{ "/inventory": inventoryReminders, "/filing": filingReminders }}
    >
      {children}
    </AppShell>
  );
}
