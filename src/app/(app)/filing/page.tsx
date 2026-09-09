import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authConfig } from "@/auth/auth.config";
import { FilingDashboard } from "@/features/filing/components/FilingDashboard";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Filing" };

export default async function FilingPage() {
  const session = await getServerSession(authConfig);
  if (!session) redirect("/login");
  return <FilingDashboard />;
}
