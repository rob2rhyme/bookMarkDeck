"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

import { AppearanceSettingsPanel } from "@/components/AppearanceSettingsPanel";
import { UpgradeButton } from "@/components/UpgradeButton";
import { useEntitlement } from "@/hooks/useEntitlement";
import { CursorOverlay } from "@/components/CursorOverlay";
import { CursorSettingsPanel } from "@/components/CursorSettingsPanel";
import { Bookmark, Cabinet, Package, Repeat, Search, Timer } from "@/components/icons";
import {
  COMMAND_PALETTE_STATE_EVENT,
  OPEN_COMMAND_PALETTE_EVENT,
} from "@/components/CommandPalette";

// `short` is used ONLY by the mobile bottom nav. A fifth pillar makes six cells
// there (~53px at 320px) and the padding/font are already at their minimum, so
// the long labels would clip — see ANALYSIS-FILING-LOG.md §11.
const DESTINATIONS = [
  { href: "/", label: "Bookmarks", short: "Saved", Icon: Bookmark },
  { href: "/focus", label: "Focus", Icon: Timer },
  { href: "/habits", label: "Habits", Icon: Repeat },
  { href: "/inventory", label: "My Stuff", short: "Stuff", Icon: Package },
  { href: "/filing", label: "Filing", Icon: Cabinet },
] as const;

export function AppShell({
  children,
  navBadges = {},
}: {
  children: React.ReactNode;
  // Per-pillar nav badge counts keyed by href (e.g. { "/inventory": 3 }).
  // Supplied by AppShellHost so this shell stays feature-agnostic.
  navBadges?: Record<string, number>;
}) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const avatarSrc = session?.user?.image ?? null;
  const avatarLabel = session?.user?.name ?? session?.user?.email ?? "Account";
  const entitlement = useEntitlement();

  // Which top-level pillar are we on? (Bookmarks is the default "/" home.)
  const activeHref =
    DESTINATIONS.find((d) => d.href !== "/" && pathname?.startsWith(d.href))
      ?.href ?? "/";
  // Desktop header shows the pillars you're NOT currently on.
  const otherTabs = DESTINATIONS.filter((d) => d.href !== activeHref);

  // Hide the mobile bottom nav while a text field is focused. The on-screen
  // keyboard covers the `fixed bottom-0` bar, leaving "dead" tabs behind it
  // (the reported unresponsiveness while searching). No effect on desktop —
  // the bar is `sm:hidden` anyway.
  const [editing, setEditing] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const isEditable = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable);
    const onFocusIn = (e: FocusEvent) => {
      if (isEditable(e.target)) setEditing(true);
    };
    const onFocusOut = () => {
      // Defer so focus hopping between fields doesn't flicker the bar.
      setTimeout(() => setEditing(isEditable(document.activeElement)), 0);
    };
    const onPalette = (e: Event) => {
      setPaletteOpen(Boolean((e as CustomEvent<{ open: boolean }>).detail?.open));
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener(COMMAND_PALETTE_STATE_EVENT, onPalette);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener(COMMAND_PALETTE_STATE_EVENT, onPalette);
    };
  }, []);

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
    <main className="relative isolate flex min-h-screen flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50 max-sm:overflow-x-clip">
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
                  {otherTabs.map((tab) => {
                    const reminders = navBadges[tab.href] ?? 0;
                    return (
                      <Link
                        key={tab.href}
                        href={tab.href}
                        aria-label={
                          reminders > 0
                            ? `${tab.label}, ${reminders} need attention`
                            : tab.label
                        }
                        className="hidden items-center gap-1.5 rounded-full border border-slate-800/70 bg-slate-900/70 p-2 text-xs font-medium text-slate-200 shadow-sm transition hover:border-blue-400 hover:text-blue-300 sm:inline-flex sm:px-3 sm:py-1.5 sm:text-sm"
                      >
                        <tab.Icon className="h-4 w-4" />
                        <span className="hidden sm:inline">{tab.label}</span>
                        {reminders > 0 && (
                          <span
                            aria-hidden
                            className="rounded-full bg-amber-500/25 px-1.5 text-[10px] font-semibold tabular-nums text-amber-200"
                          >
                            {reminders}
                          </span>
                        )}
                      </Link>
                    );
                  })}
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
                        className="animate-bd-scale-in absolute right-0 z-50 mt-2 w-52 origin-top-right overflow-hidden rounded-xl border border-slate-800 bg-slate-900 py-1 shadow-xl"
                      >
                        {entitlement.configured && !entitlement.pro && (
                          <UpgradeButton
                            role="menuitem"
                            label="✨ Upgrade to Premium"
                            className="flex w-full items-center gap-2 border-b border-slate-800/60 px-4 py-2.5 text-left text-sm text-blue-300 transition hover:bg-slate-800"
                          />
                        )}
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
            {/* The tagline is home-page copy; on phones it costs two lines on
                every pillar before the content starts, so it's sm+ only. */}
            <p className="mt-1 hidden max-w-xl text-sm text-slate-400 sm:block">
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
            <Link className="hover:text-blue-300" href="/guide">
              Guide
            </Link>
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

      {/* Mobile bottom nav — primary destinations + search (⌘K). Hidden while a
          text field is focused (keyboard would cover it) or the command palette
          is open (its overlay would leave the tabs visible-but-dead on iOS). */}
      {session && !editing && !paletteOpen && (
        <nav
          aria-label="Primary"
          style={{ minHeight: "var(--bottom-nav-h)" }}
          className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-800/70 bg-slate-950/95 backdrop-blur sm:hidden"
        >
          {DESTINATIONS.map((tab) => {
            const active = tab.href === activeHref;
            const reminders = navBadges[tab.href] ?? 0;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                aria-label={
                  reminders > 0
                    ? `${tab.label}, ${reminders} need attention`
                    : undefined
                }
                className={`flex min-w-0 flex-1 flex-col items-center gap-1 px-0.5 py-2.5 text-[10px] font-medium leading-tight transition ${
                  active ? "text-blue-300" : "text-slate-400"
                }`}
              >
                <span className="relative">
                  <tab.Icon className="h-6 w-6" />
                  {reminders > 0 && (
                    <span
                      aria-hidden
                      className="absolute -right-1.5 -top-1 min-w-[14px] rounded-full bg-amber-500 px-1 text-center text-[9px] font-bold leading-[14px] text-slate-950"
                    >
                      {reminders}
                    </span>
                  )}
                </span>
                <span className="w-full truncate text-center">
                  {"short" in tab ? tab.short : tab.label}
                </span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))
            }
            className="flex min-w-0 flex-1 flex-col items-center gap-1 px-0.5 py-2.5 text-[10px] font-medium leading-tight text-slate-400 transition hover:text-slate-200"
          >
            <Search className="h-6 w-6" />
            <span className="w-full truncate text-center">Search</span>
          </button>
        </nav>
      )}
    </main>
  );
}
