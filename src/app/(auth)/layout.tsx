export default function AuthRoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No decorative cursor overlay here: it's a logged-in personalization
  // ("Saved on this device") and the heavy default sprite renders as a broken
  // placeholder on the login page's cold-cache first paint.
  return (
    <main className="relative isolate min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="relative z-10">{children}</div>
    </main>
  );
}
