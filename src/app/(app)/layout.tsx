import { AppShell } from "@/components/AppShell";
import { FirebaseSyncBridge } from "@/components/FirebaseSyncBridge";
import { GlobalClientUI } from "@/app/GlobalClientUI";

export default function AppRoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* One Google login → one Firebase session shared by every pillar, so no
          app asks you to "Sign in to sync" on its own. */}
      <FirebaseSyncBridge />
      <AppShell>{children}</AppShell>
      <GlobalClientUI />
    </>
  );
}
