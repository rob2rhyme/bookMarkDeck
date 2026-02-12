import Link from "next/link";

import { ArrowLeft } from "@/components/icons";

type Props = {
  title: string;
  lastUpdated?: string;
  children: React.ReactNode;
};

export function LegalPageLayout({ title, lastUpdated, children }: Props) {
  return (
    <div className="mx-auto w-full max-w-4xl px-1 sm:px-2">
      <section className="rounded-2xl border border-slate-800/70 bg-slate-950/35 p-6 shadow-2xl ring-1 ring-white/5 backdrop-blur-md sm:p-8">
        <div className="mb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/50 px-3 py-1.5 text-xs font-semibold text-slate-100 ring-1 ring-white/5 backdrop-blur transition hover:border-blue-400/50 hover:bg-slate-900/70 active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </Link>
        </div>

        <div className="border-b border-slate-800/60 pb-4">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50">{title}</h1>
          {lastUpdated && (
            <p className="mt-1 text-sm text-slate-400">Last updated: {lastUpdated}</p>
          )}
        </div>

        <div className="mt-6 text-slate-200">{children}</div>
      </section>
    </div>
  );
}

export default LegalPageLayout;
