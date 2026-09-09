import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authConfig } from "@/auth/auth.config";
import { InventoryDashboard } from "@/features/inventory/components/InventoryDashboard";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "My Stuff" };

export default async function InventoryPage() {
  const session = await getServerSession(authConfig);

  if (!session) {
    redirect("/login");
  }

  return <InventoryDashboard />;
}
