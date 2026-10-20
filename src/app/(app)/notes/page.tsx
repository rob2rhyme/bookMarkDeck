import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authConfig } from "@/auth/auth.config";
import { NotesDashboard } from "@/features/notes/components/NotesDashboard";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Notes" };

export default async function NotesPage() {
  const session = await getServerSession(authConfig);
  if (!session) redirect("/login");
  return <NotesDashboard />;
}
