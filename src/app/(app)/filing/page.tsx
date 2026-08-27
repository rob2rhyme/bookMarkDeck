import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authConfig } from "@/auth/auth.config";
import { FilingDashboard } from "@/features/filing/components/FilingDashboard";

export default async function FilingPage() {
  const session = await getServerSession(authConfig);
  if (!session) redirect("/login");
  return <FilingDashboard />;
}
