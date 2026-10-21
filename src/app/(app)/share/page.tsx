import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authConfig } from "@/auth/auth.config";
import { ShareReceiver } from "@/components/ShareReceiver";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Save link" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// The installed app's Share-sheet target (manifest `share_target`): another app
// hands over title/text/url here and the link is offered for saving.
export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string | string[]; text?: string | string[]; url?: string | string[] }>;
}) {
  const params = await searchParams;
  const session = await getServerSession(authConfig);
  if (!session) {
    const query = new URLSearchParams({
      title: first(params.title),
      text: first(params.text),
      url: first(params.url),
    });
    redirect(`/login?callbackUrl=${encodeURIComponent(`/share?${query}`)}`);
  }
  return (
    <ShareReceiver
      sharedTitle={first(params.title)}
      sharedText={first(params.text)}
      sharedUrl={first(params.url)}
    />
  );
}
