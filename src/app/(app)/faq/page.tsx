//src/app/faq/page.tsx
import Link from "next/link";

import LegalPageLayout from "@/components/LegalPageLayout";

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
    <LegalPageLayout title="FAQ" lastUpdated="July 15, 2026">
      <section className="space-y-5 text-sm leading-relaxed text-slate-200">
        <Q q="Do I need an account to use Bookmark Deck?">
          <p>
            You sign in once with Google — that&apos;s the only account there
            is. Everything you add is saved on your device instantly, and that
            same sign-in also connects cloud sync for every pillar (Bookmarks,
            Focus, Habits, My Stuff) so your data can follow you to another
            device.
          </p>
        </Q>

        <Q q="Why don't I see “Sign in to sync” buttons anymore?">
          <p>
            One Google sign-in now connects sync for all five pillars
            automatically — no per-app taps. If the silent connection ever
            can&apos;t complete (rare), the button reappears and a single tap
            reconnects everything at once.
          </p>
        </Q>

        <Q q="What syncs automatically, and what's manual?">
          <p>
            <strong>Focus, Habits, and My Stuff</strong> save to your account
            automatically while you&apos;re signed in.{" "}
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
            merge by id — restoring never duplicates.
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
          <p>No. There are no analytics, tracking, or ad SDKs in the app.</p>
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
              deleting.
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
            walks through all five pillars in plain language, and{" "}
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
