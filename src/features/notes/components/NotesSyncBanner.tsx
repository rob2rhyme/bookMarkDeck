"use client";

import { SyncBanner } from "@/components/SyncBanner";

// Shown only while this device isn't connected to sync — the same banner the
// other pillars show. Connected, it renders nothing: notes sync live.
export function NotesSyncBanner({
  email,
  connected,
  connecting,
  error,
  connect,
}: {
  email: string | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => void;
}) {
  return (
    <SyncBanner
      subject="notes"
      plural
      email={email}
      connected={connected}
      connecting={connecting}
      error={error}
      onConnect={connect}
      hideWhenConnected
      className="mx-3 sm:mx-0"
    />
  );
}
