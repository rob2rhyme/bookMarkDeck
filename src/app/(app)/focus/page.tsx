import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authConfig } from "@/auth/auth.config";
import { FocusDashboard } from "@/features/focus/components/FocusDashboard";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Focus" };

export default async function FocusPage() {
  const session = await getServerSession(authConfig);

  if (!session) {
    redirect("/login");
  }

  return <FocusDashboard />;
}
