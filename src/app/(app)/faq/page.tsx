//src/app/faq/page.tsx
import Link from "next/link";

import LegalPageLayout from "@/components/LegalPageLayout";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "FAQ" };

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-50">{q}</h2>
      <div className="mt-1 space-y-2">{children}</div>
    </div>
  );
}

export default function FaqPage() {
  return (
    <LegalPageLayout title="FAQ" lastUpdated="October 21, 2026">
      <section className="space-y-5 text-sm leading-relaxed text-slate-200">
        <Q q="Do I need an account to use Bookmark Deck?">
          <p>
            You sign in once with Google — that&apos;s the only account there
            is. Everything you add is saved on your device instantly, and that
            same sign-in also connects cloud sync for every pillar (Bookmarks,
            Focus, Habits, My Stuff, Filing and Notes) so your data can follow
            you to another device. Bookmark Deck is private to its owner: only
            the owner&apos;s Google account can sign in, and any other account
            is told it can&apos;t.
          </p>
        </Q>

        <Q q="Why don't I see “Sign in to sync” buttons anymore?">
          <p>
            One Google sign-in now connects sync for every pillar
            automatically — no per-app taps. If the silent connection ever
            can&apos;t complete (rare), the button reappears and a single tap
            reconnects everything at once.
          </p>
        </Q>

        <Q q="What syncs automatically, and what's manual?">
          <p>
            <strong>Focus, Habits, My Stuff, Filing and Notes</strong> save to
            your account automatically while you&apos;re signed in.{" "}
            <strong>Bookmarks &amp; shortcuts</strong> sync only when you press{" "}
            <em>Sync to cloud</em> / <em>Sync from cloud</em> on the home page —
            explicit by design, so nothing overwrites without you asking.
          </p>
        </Q>

        <Q q="Are there backups?">
          <p>
            Yes. Bookmark cloud sync keeps your <strong>last 7 snapshots</strong>,
            each restorable in-app or downloadable as JSON. Focus, Habits, and
            My Stuff each export a full JSON backup (plus CSV), and imports
            merge by id — restoring never duplicates. Notes has its own{" "}
            <em>Backup</em> button: a JSON backup you can restore (locked notes
            stay encrypted in it) and a Markdown export for reading elsewhere.
          </p>
        </Q>

        <Q q="Are my notes encrypted?">
          <p>
            Notes you <strong>lock</strong> are encrypted on your device before
            they&apos;re saved, so their text never reaches the cloud in a
            readable form. Only your notes passphrase or your recovery code can
            open them — nobody else, including whoever stores your data. Lose
            both and the locked text is gone for good, so keep the recovery
            code somewhere safe. Titles and tags stay readable so you can still
            find locked notes. Unlocked notes, like the rest of your data, are
            protected by your sign-in rather than by encryption.
          </p>
          <p>
            The same goes for a <strong>Filing paper&apos;s reference and
            note</strong> if you lock them: one passphrase opens both. A
            paper&apos;s title, dates, folder, tags and reminders stay
            readable. Scans you attach are encrypted too, by default, with the
            same passphrase.
          </p>
        </Q>

        <Q q="What does a note's History show?">
          <p>
            When a note was created, edited, pinned, tagged, locked, unlocked
            or restored — never what it said. If the same note was edited on
            two devices while one was offline, both versions are kept: the
            other one appears as a <em>(conflicted copy)</em> tagged{" "}
            <code>#conflict</code>. Saves less than 30 minutes apart
            count as one edit. <em>Insights</em> on the Notes page adds totals,
            your most-used tags and a recent-activity list that includes
            deleted notes (by title). It&apos;s all worked out on your device
            and shown only to you.
          </p>
        </Q>

        <Q q="How do folders work?">
          <p>
            Folders are real, nestable containers — a folder can hold
            subfolders and bookmarks, to any depth. Every folder has its own
            page: <code>/folders/unstaged</code> holds bookmarks without a
            folder, and each named folder gets its own route with breadcrumbs
            and search across its whole subtree.
          </p>
        </Q>

        <Q q="How do I move or delete many bookmarks at once?">
          <p>
            On any folder page, press <strong>Select</strong> to enter bulk
            mode — pick multiple bookmarks, then move them (to any folder,
            Unstaged, or a brand-new folder) or delete them. Deletes offer a
            brief <strong>Undo</strong>.
          </p>
        </Q>

        <Q q="Do the camera features upload my photos?">
          <p>
            No. In My Stuff, barcode scanning, label reading, and receipt
            scanning all run <strong>on your device</strong> — the camera image
            never leaves your browser. Item photos are compressed locally
            before they save.
          </p>
        </Q>

        <Q q="Does the app work offline?">
          <p>
            Yes — it&apos;s installable as an app, and because everything is
            local-first you can read and edit your data offline; changes sync
            next time you&apos;re online and signed in. An offline page appears
            if you navigate somewhere new without a connection.
          </p>
        </Q>

        <Q q="Do you run analytics or ads?">
          <p>
            No. There are no analytics, tracking, or ad SDKs in the app. Notes
            Insights and History are your own records, kept in your account and
            shown only to you.
          </p>
        </Q>

        <Q q="How do I delete my data?">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Local:</strong> delete items in-app, or clear the
              site&apos;s data in your browser.
            </li>
            <li>
              <strong>Cloud:</strong> delete locally, then sync — the cloud
              copy follows. Bookmarks: press <em>Sync to cloud</em> after
              deleting. Your other devices drop it the next time they sync
              <em> from</em> the cloud — do that before uploading from them,
              since an upload makes the cloud match that device.
            </li>
            <li>
              <strong>Account access:</strong> revoke Bookmark Deck at{" "}
              myaccount.google.com/permissions.
            </li>
          </ul>
        </Q>

        <Q q="Where can I learn what everything does?">
          <p>
            The{" "}
            <Link href="/guide" className="text-blue-300 hover:text-blue-200">
              Guide
            </Link>{" "}
            walks through every pillar in plain language, and{" "}
            <Link
              href="/habits/guide"
              className="text-blue-300 hover:text-blue-200"
            >
              How habits work
            </Link>{" "}
            goes deeper on streak rules. Privacy details live in{" "}
            <Link href="/privacy" className="text-blue-300 hover:text-blue-200">
              Privacy
            </Link>
            .
          </p>
        </Q>
      </section>
    </LegalPageLayout>
  );
}
