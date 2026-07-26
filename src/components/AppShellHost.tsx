"use client";

import { useSession } from "next-auth/react";
import { AppShell } from "@/components/AppShell";
import { useInventoryReminderCount } from "@/features/inventory/hooks/useInventoryReminderCount";

// Composition layer: supplies the inventory nav badge to the (feature-agnostic)
// AppShell. This is the ONLY place outside src/features/inventory that imports
// the feature — so extracting "My Stuff" means editing this host, not the
// shared AppShell. (Decoupling step C1, MYSTUFF-DECOUPLING-READINESS.md.)
export function AppShellHost({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const inventoryReminders = useInventoryReminderCount(session?.user?.email);
  return (
    <AppShell navBadges={{ "/inventory": inventoryReminders }}>
      {children}
    </AppShell>
  );
}
