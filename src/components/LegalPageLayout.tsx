"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

type Props = {
  title: string;
  lastUpdated?: string;
  children: React.ReactNode;
};

export function LegalPageLayout({ title, lastUpdated, children }: Props) {
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 240);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <main className="relative flex min-h-screen flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-10">
        <header className="mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="Bookmark Deck logo"
                width={36}
                height={36}
                className="h-9 w-9 rounded-lg object-cover shadow-sm"
                priority
              />
              <span className="text-base font-semibold text-slate-100">Bookmark Deck</span>
            </Link>
            <Link
              href="/"
              className="rounded-full bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 shadow hover:bg-slate-700"
            >
              ← Back to Home
            </Link>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            {lastUpdated && (
              <p className="mt-1 text-sm text-slate-400">Last updated: {lastUpdated}</p>
            )}
          </div>
        </header>

        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-6 shadow-lg">
          {children}
        </div>

        <footer className="mt-8 flex w-full flex-col items-center gap-2 text-sm text-slate-300">
          <div className="flex w-full max-w-4xl items-center gap-3 text-[11px] text-slate-500">
            <span className="h-px flex-1 bg-slate-800" />
            <span className="shrink-0">Info</span>
            <span className="h-px flex-1 bg-slate-800" />
          </div>
          <div className="flex items-center gap-4">
            <Link className="hover:text-blue-300" href="/privacy">
              Privacy Policy
            </Link>
            <Link className="hover:text-blue-300" href="/terms">
              Terms of Service
            </Link>
            <Link className="hover:text-blue-300" href="/faq">
              FAQ
            </Link>
          </div>
          <div className="text-xs text-slate-500">
            © {new Date().getFullYear()} Bookmark Deck. All rights reserved.
          </div>
        </footer>
      </div>

      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Scroll to top"
          className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 shadow-lg shadow-black/30 backdrop-blur-md transition-all duration-300 hover:scale-110 hover:border-blue-400/40 hover:bg-white/10 hover:shadow-blue-500/20"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
            className="h-6 w-6"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M5 11l7-7 7 7" />
          </svg>
        </button>
      )}
    </main>
  );
}

export default LegalPageLayout;
