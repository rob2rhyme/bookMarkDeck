"use client";

import { useSession } from "next-auth/react";

import { DragonCursor } from "@/components/DragonCursor";
import { FishCursor } from "@/components/FishCursor";
import { useCursorStyle } from "@/hooks/useCursorStyle";

// Renders the user's chosen decorative cursor overlay (synced via focus
// settings). Defaults to the dragon, so existing behaviour is unchanged.
export function CursorOverlay() {
  const { data: session } = useSession();
  const style = useCursorStyle(session?.user?.email);

  if (style === "off") return null;
  if (style === "fish") return <FishCursor />;
  return <DragonCursor />;
}

export default CursorOverlay;
