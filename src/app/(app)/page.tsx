import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authConfig } from "@/auth/auth.config";
import HomePageClient from "@/components/HomePageClient";

export default async function HomePage() {
  const session = await getServerSession(authConfig);

  if (!session) {
    redirect("/login");
  }

  return <HomePageClient />;
}
