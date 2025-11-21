// src/app/login/page.tsx
"use client";

import Link from "next/link";
import { useState } from "react";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState<
    null | "google" | "apple" | "microsoft"
  >(null);

  const handleClick = (provider: "google" | "apple" | "microsoft") => {
    // TODO: hook up real auth later
    setIsLoading(provider);
    setTimeout(() => setIsLoading(null), 800);
  };

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      {/* Background subtle glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 top-10 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute bottom-0 right-[-6rem] h-80 w-80 rounded-full bg-sky-400/15 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        {/* Top bar */}
        <header className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="Bookmark Deck logo"
              className="h-9 w-9 rounded-lg object-cover shadow-sm"
            />
            <span className="text-sm font-semibold tracking-tight text-slate-100">
              Bookmark Deck
            </span>
          </div>

          <Link
            href="/"
            className="text-xs font-medium text-slate-400 underline-offset-4 hover:text-slate-100 hover:underline"
          >
            Back to bookmarks
          </Link>
        </header>

        {/* Content */}
        <div className="flex flex-1 items-center justify-center">
          <div className="grid w-full max-w-3xl gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            {/* Left: copy / hero */}
            <section className="hidden flex-col justify-center md:flex">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
                Sign in to sync your{" "}
                <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-cyan-400 bg-clip-text text-transparent">
                  Bookmark Deck
                </span>
                .
              </h1>
              <p className="mt-3 text-sm text-slate-400 sm:text-[15px]">
                Keep your frequently used sites in sync across devices, back up
                your collections, and pick up where you left off—securely.
              </p>

              <div className="mt-6 flex items-center gap-3 text-[11px] text-slate-500">
                <div className="h-px flex-1 bg-slate-800" />
                <span>Secure, private, easy to disconnect anytime</span>
                <div className="h-px flex-1 bg-slate-800" />
              </div>
            </section>

            {/* Right: auth card */}
            <section className="flex items-center justify-center">
              <div className="w-full max-w-md rounded-3xl border border-slate-800/70 bg-slate-950/70 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.75)] backdrop-blur-xl sm:p-7">
                <div className="mb-5 text-center">
                  <h2 className="text-lg font-semibold text-slate-50">
                    Log in to your account
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Choose a provider to continue. We never see your passwords.
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Google */}
                  <button
                    type="button"
                    onClick={() => handleClick("google")}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-sm">
                      {/* simple Google G */}
                      <span className="text-lg">🟢</span>
                    </span>
                    <span>
                      {isLoading === "google"
                        ? "Connecting to Google…"
                        : "Continue with Google"}
                    </span>
                  </button>

                  {/* Apple */}
                  <button
                    type="button"
                    onClick={() => handleClick("apple")}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-3 py-2.5 text-sm font-medium text-slate-50 ring-1 ring-slate-700 transition hover:bg-slate-800 hover:ring-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  >
                    <span className="flex h-5 w-5 items-center justify-center">
                      <span className="text-lg"></span>
                    </span>
                    <span>
                      {isLoading === "apple"
                        ? "Connecting to Apple…"
                        : "Continue with Apple"}
                    </span>
                  </button>

                  {/* Microsoft */}
                  <button
                    type="button"
                    onClick={() => handleClick("microsoft")}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-500/90 px-3 py-2.5 text-sm font-medium text-slate-50 shadow-sm transition hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-sky-700/80 text-[11px]">
                      ☐
                    </span>
                    <span>
                      {isLoading === "microsoft"
                        ? "Connecting to Microsoft…"
                        : "Continue with Microsoft"}
                    </span>
                  </button>
                </div>

                {/* Divider */}
                <div className="my-4 flex items-center gap-3 text-[11px] text-slate-500">
                  <div className="h-px flex-1 bg-slate-800" />
                  <span>or</span>
                  <div className="h-px flex-1 bg-slate-800" />
                </div>

                {/* Optional helper text */}
                <p className="text-[11px] leading-relaxed text-slate-500">
                  By continuing, you agree to the{" "}
                  <span className="cursor-pointer text-slate-300 underline-offset-2 hover:underline">
                    Terms of Service
                  </span>{" "}
                  and{" "}
                  <span className="cursor-pointer text-slate-300 underline-offset-2 hover:underline">
                    Privacy Policy
                  </span>
                  .
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
