import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authConfig } from "@/auth/auth.config";
import { NotesDashboard } from "@/features/notes/components/NotesDashboard";
import { normalizeTag } from "@/features/notes/lib/tags";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Notes" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; tag?: string | string[] }>;
}) {
  const session = await getServerSession(authConfig);
  if (!session) redirect("/login");
  const { q, tag } = await searchParams;
  return <NotesDashboard initialQuery={first(q) ?? ""} initialTag={normalizeTag(first(tag) ?? "")} />;
}
