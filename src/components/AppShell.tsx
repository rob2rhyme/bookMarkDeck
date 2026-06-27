"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

import { AppearanceSettingsPanel } from "@/components/AppearanceSettingsPanel";
import { CursorOverlay } from "@/components/CursorOverlay";
import { CursorSettingsPanel } from "@/components/CursorSettingsPanel";
import { Bookmark, Repeat, Search, Timer } from "@/components/icons";
import { OPEN_COMMAND_PALETTE_EVENT } from "@/components/CommandPalette";

const DESTINATIONS = [
  { href: "/", label: "Bookmarks", Icon: Bookmark },
  { href: "/focus", label: "Focus", Icon: Timer },
  { href: "/habits", label: "Habits", Icon: Repeat },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const avatarSrc = session?.user?.image ?? null;
  const avatarLabel = session?.user?.name ?? session?.user?.email ?? "Account";

  // Which top-level pillar are we on? (Bookmarks is the default "/" home.)
  const activeHref =
    DESTINATIONS.find((d) => d.href !== "/" && pathname?.startsWith(d.href))
      ?.href ?? "/";
  // Desktop header shows the pillars you're NOT currently on.
  const otherTabs = DESTINATIONS.filter((d) => d.href !== activeHref);

  // Account dropdown menu (holds Cursor settings + Sign out).
  const [menuOpen, setMenuOpen] = useState(false);
  const [cursorOpen, setCursorOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <main className="relative isolate flex min-h-screen flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <CursorOverlay />
      <CursorSettingsPanel
        open={cursorOpen}
        onClose={() => setCursorOpen(false)}
      />
      <AppearanceSettingsPanel
        open={appearanceOpen}
        onClose={() => setAppearanceOpen(false)}
      />
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-0 pb-24 pt-8 sm:px-6 sm:pb-12 lg:px-8 lg:pt-12">
        <header className="mb-8 flex flex-col gap-4 px-3 sm:mb-10 sm:px-0">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <Link href="/" className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                <Image
                  src="/logo.png"
                  alt="Bookmark Deck logo"
                  width={56}
                  height={56}
                  className="h-11 w-11 rounded-md object-cover sm:h-14 sm:w-14"
                  priority
                />
                <h1 className="text-xl font-semibold tracking-tight sm:text-4xl">
                  Bookmark Deck
                </h1>
              </Link>
              {session && (
                <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                  {/* Top nav tabs are redundant with the mobile bottom nav, so
                      they only show from sm up. */}
                  {otherTabs.map((tab) => (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      aria-label={tab.label}
                      className="hidden items-center gap-1.5 rounded-full border border-slate-800/70 bg-slate-900/70 p-2 text-xs font-medium text-slate-200 shadow-sm transition hover:border-blue-400 hover:text-blue-300 sm:inline-flex sm:px-3 sm:py-1.5 sm:text-sm"
                    >
                      <tab.Icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </Link>
                  ))}
                  <div className="relative" ref={menuRef}>
                    <button
                      type="button"
                      onClick={() => setMenuOpen((v) => !v)}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      className="flex items-center gap-2 rounded-full border border-slate-800/70 bg-slate-900/70 px-2 py-1 shadow-sm transition hover:border-slate-600 sm:gap-3 sm:px-3 sm:py-1.5"
                    >
                      <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-slate-800 text-[11px] font-semibold text-slate-100 ring-1 ring-white/5 sm:h-9 sm:w-9 sm:text-sm">
                        {avatarSrc ? (
                          <Image
                            src={avatarSrc}
                            alt={avatarLabel}
                            width={36}
                            height={36}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span>{avatarLabel.charAt(0).toUpperCase()}</span>
                        )}
                      </span>
                      <span className="hidden max-w-[100px] truncate text-[10px] font-medium text-slate-200 sm:inline sm:max-w-[180px] sm:text-xs">
                        {avatarLabel}
                      </span>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className={`h-4 w-4 text-slate-400 transition ${
                          menuOpen ? "rotate-180" : ""
                        }`}
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    {menuOpen && (
                      <div
                        role="menu"
                        className="animate-bd-scale-in absolute right-0 z-30 mt-2 w-52 origin-top-right overflow-hidden rounded-xl border border-slate-800 bg-slate-900 py-1 shadow-xl"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            setAppearanceOpen(true);
                          }}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-200 transition hover:bg-slate-800"
                        >
                          🅰 Appearance…
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            setCursorOpen(true);
                          }}
                          className="flex w-full items-center gap-2 border-t border-slate-800/60 px-4 py-2.5 text-left text-sm text-slate-200 transition hover:bg-slate-800"
                        >
                          🐟 Cursor settings…
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => signOut({ callbackUrl: "/login" })}
                          className="flex w-full items-center gap-2 border-t border-slate-800/60 px-4 py-2.5 text-left text-sm text-slate-200 transition hover:bg-slate-800"
                        >
                          ↩ Sign out
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <p className="mt-1 max-w-xl text-sm text-slate-400">
              All your frequently used sites in one place — fast, simple, and
              private.
            </p>
          </div>
        </header>

        <div className="flex flex-1 flex-col">{children}</div>

        <footer className="mt-12 mt-auto flex w-full flex-col items-center gap-2 px-3 text-sm text-slate-400 sm:px-0">
          <div className="flex w-full max-w-5xl items-center gap-3 text-[11px] text-slate-500">
            <span className="h-px flex-1 bg-slate-800" />
            <span className="shrink-0">Info</span>
            <span className="h-px flex-1 bg-slate-800" />
          </div>
          <div className="flex items-center gap-4">
            <Link className="hover:text-blue-300" href="/privacy">
              Privacy
            </Link>
            <Link className="hover:text-blue-300" href="/terms">
              Terms
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

      {/* Mobile bottom nav — primary destinations + search (⌘K). */}
      {session && (
        <nav
          aria-label="Primary"
          style={{ minHeight: "var(--bottom-nav-h)" }}
          className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-800/70 bg-slate-950/95 backdrop-blur sm:hidden"
        >
          {DESTINATIONS.map((tab) => {
            const active = tab.href === activeHref;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium transition ${
                  active ? "text-blue-300" : "text-slate-400"
                }`}
              >
                <tab.Icon className="h-6 w-6" />
                {tab.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))
            }
            className="flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium text-slate-400 transition hover:text-slate-200"
          >
            <Search className="h-6 w-6" />
            Search
          </button>
        </nav>
      )}
    </main>
  );
}
