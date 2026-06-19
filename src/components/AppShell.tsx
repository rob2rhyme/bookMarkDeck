"use client";

import Image from "next/image";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

import { DragonCursor } from "@/components/DragonCursor";
import { Timer } from "@/components/icons";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const avatarSrc = session?.user?.image ?? null;
  const avatarLabel = session?.user?.name ?? session?.user?.email ?? "Account";

  return (
    <main className="relative isolate flex min-h-screen flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <DragonCursor />
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-12 pt-8 sm:px-6 lg:px-8 lg:pt-12">
        <header className="mb-8 flex flex-col gap-4 sm:mb-10">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <Link href="/" className="flex items-center gap-2.5 sm:gap-3">
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
                <div className="flex items-center gap-2 sm:gap-3">
                  <Link
                    href="/focus"
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-800/70 bg-slate-900/70 px-3 py-1.5 text-xs font-medium text-slate-200 shadow-sm transition hover:border-blue-400 hover:text-blue-300 sm:text-sm"
                  >
                    <Timer className="h-4 w-4" />
                    Focus
                  </Link>
                  <div className="flex items-center gap-2 rounded-full border border-slate-800/70 bg-slate-900/70 px-2 py-1 shadow-sm sm:gap-3 sm:px-3 sm:py-1.5">
                  <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-slate-800 text-[11px] font-semibold text-slate-100 ring-1 ring-white/5 sm:h-9 sm:w-9 sm:text-sm">
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
                  </div>
                  <span className="max-w-[100px] truncate text-[10px] font-medium text-slate-200 sm:max-w-[180px] sm:text-xs">
                    {avatarLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-blue-500 transition hover:border-blue-400 hover:text-blue-300"
                    aria-label="Sign out"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/80 bg-white/15 shadow-inner shadow-black/30">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        className="h-5 w-5"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          d="M12 3v8M8.5 6.5a6 6 0 1 0 7 0"
                        />
                      </svg>
                    </span>
                  </button>
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

        <footer className="mt-12 mt-auto flex w-full flex-col items-center gap-2 text-sm text-slate-400">
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
    </main>
  );
}
