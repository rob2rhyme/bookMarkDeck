import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authConfig } from "@/auth/auth.config";
import { HabitsRoute } from "@/features/habits/components/HabitsRoute";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Habits" };

export default async function HabitsPage() {
  const session = await getServerSession(authConfig);

  if (!session) {
    redirect("/login");
  }

  return <HabitsRoute />;
}
