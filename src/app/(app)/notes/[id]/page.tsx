import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authConfig } from "@/auth/auth.config";
import { NoteEditorScreen } from "@/features/notes/components/NoteEditor";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Note" };

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authConfig);
  if (!session) redirect("/login");
  const { id } = await params;
  return <NoteEditorScreen id={id} />;
}
