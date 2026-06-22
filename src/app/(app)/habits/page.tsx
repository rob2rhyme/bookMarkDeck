import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authConfig } from "@/auth/auth.config";
import { HabitsDashboard } from "@/features/habits/components/HabitsDashboard";

export default async function HabitsPage() {
  const session = await getServerSession(authConfig);

  if (!session) {
    redirect("/login");
  }

  return <HabitsDashboard />;
}
