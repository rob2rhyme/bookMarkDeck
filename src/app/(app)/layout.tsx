import { AppShell } from "@/components/AppShell";
import { GlobalClientUI } from "@/app/GlobalClientUI";

export default function AppRoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <GlobalClientUI />
    </>
  );
}
