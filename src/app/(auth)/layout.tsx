import { DragonCursor } from "@/components/DragonCursor";

export default function AuthRoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative isolate min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <DragonCursor />
      <div className="relative z-10">{children}</div>
    </main>
  );
}
