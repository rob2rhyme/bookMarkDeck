// src/app/(auth)/login/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";

import { useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const [isLoading, setIsLoading] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  const handleClick = (provider: string) => {
    setIsLoading(provider);
    signIn(provider, { callbackUrl: "/" }).finally(() => setIsLoading(null));
  };

  // Until we know the user is signed *out*, don't flash the login form — show a
  // neutral splash. Already-signed-in users (common on the iOS PWA, which can
  // land here on cold start) see this briefly, then the effect redirects home.
  if (status !== "unauthenticated") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 text-slate-400">
        <div className="animate-bd-scale-in">
          <Image
            src="/logo.png"
            alt=""
            width={60}
            height={60}
            className="h-[60px] w-[60px] rounded-2xl shadow-lg shadow-blue-950/40 animate-bd-breathe"
            priority
          />
        </div>
        <span className="animate-bd-fade-in text-sm tracking-wide">Loading…</span>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen text-slate-50">
      {/* Background subtle glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 top-10 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute bottom-0 right-[-6rem] h-80 w-80 rounded-full bg-sky-400/15 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        {/* Top bar */}
        <header className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Bookmark Deck logo"
              width={36}
              height={36}
              className="h-9 w-9 rounded-lg object-cover shadow-sm"
              priority
            />
            <span className="text-sm font-semibold tracking-tight text-slate-100">
              Bookmark Deck
            </span>
          </div>

          <Link
            href="/faq"
            className="text-xs font-medium text-slate-400 underline-offset-4 hover:text-slate-100 hover:underline"
          >
            Need help?
          </Link>
        </header>

        {/* Content */}
        <div className="flex flex-1 items-center justify-center">
          <div className="grid w-full max-w-3xl gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            {/* Left: copy / hero */}
            <section className="flex flex-col justify-center text-center md:text-left">
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
                    disabled={isLoading !== null}
                  >
                    {/* Google G — clean inline SVG */}
                    <span className="flex h-5 w-5 items-center justify-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 48 48"
                        width="20"
                        height="20"
                      >
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.59 13.35 17.74 9.5 24 9.5z"
                        />
                        <path
                          fill="#4285F4"
                          d="M46.47 24.55c0-1.57-.14-3.08-.39-4.55H24v9.02h12.65c-.55 2.96-2.17 5.47-4.63 7.17l7.35 5.71C43.33 37.27 46.47 31.36 46.47 24.55z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M10.54 28.41A14.47 14.47 0 0 1 9.5 24c0-1.53.26-3 .74-4.41l-7.98-6.19A23.89 23.89 0 0 0 0 24c0 3.85.92 7.49 2.56 10.59l7.98-6.18z"
                        />
                        <path
                          fill="#34A853"
                          d="M24 48c6.64 0 12.25-2.19 16.33-5.94l-7.35-5.71c-2.04 1.37-4.66 2.19-8.98 2.19-6.26 0-11.41-3.85-13.47-9.22l-7.98 6.18C6.51 42.63 14.62 48 24 48z"
                        />
                      </svg>
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
                    className="hidden flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-3 py-2.5 text-sm font-medium text-slate-50 ring-1 ring-slate-700 transition hover:bg-slate-800 hover:ring-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                    disabled={isLoading !== null}
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
                    className="hidden flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-500/90 px-3 py-2.5 text-sm font-medium text-slate-50 shadow-sm transition hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                    disabled={isLoading !== null}
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
                  <Link
                    href="/terms"
                    className="cursor-pointer text-slate-300 underline-offset-2 hover:underline"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    className="cursor-pointer text-slate-300 underline-offset-2 hover:underline"
                  >
                    Privacy Policy
                  </Link>
                  .
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
