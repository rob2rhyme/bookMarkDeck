//src/app/terms/page.tsx
import LegalPageLayout from "@/components/LegalPageLayout";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated="October 21, 2026">
      <section className="space-y-4 text-sm leading-relaxed text-slate-200">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Service scope</h2>
          <p>
            Bookmark Deck lets you manage bookmarks and shortcuts, focus work, habits, a home inventory,
            paper filing and notes, with Firebase sync tied to your Google account.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Accounts and access</h2>
          <p>
            Bookmark Deck is a private, single-owner app. Sign-in is with Google, and only the
            owner&rsquo;s Google account is allowed; any other account is refused, both at sign-in and
            by the database. Sessions end after 14 days without use. You are responsible for account and
            device security. Every app page requires sign-in except the guide, FAQ and legal pages.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Data handling</h2>
          <p>
            Data is local-first in your browser. If you use sync, a cloud copy is stored in Firestore. Cloud
            backup snapshots are retained in limited history for restore purposes. Notes keep a short
            history of what happened to each note, without its text.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Acceptable use</h2>
          <p>
            Do not use the service for unlawful activity, malware distribution, unauthorized access attempts,
            or service abuse.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Availability and changes</h2>
          <p>
            The service is provided as-is. Features, UI flows, and storage behavior may evolve over time,
            including route-based navigation and sync tooling.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Disclaimers and liability</h2>
          <p>
            To the maximum extent permitted by law, we disclaim warranties and are not liable for indirect,
            incidental, or consequential damages, including data loss.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Sensitive information</h2>
          <p>
            Do not store highly sensitive credentials (passwords, PINs, payment card data, government IDs)
            in Bookmark Deck content fields. Locked notes are end-to-end encrypted, but a forgotten
            passphrase and a lost recovery code mean their text cannot be recovered by anyone — keep your
            recovery code somewhere safe.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Termination</h2>
          <p>
            You may stop using Bookmark Deck at any time. Access may be limited for abuse, legal reasons,
            or security risks.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Contact</h2>
          <p>
            Questions: <a className="text-blue-300 underline" href="mailto:support@bmarkdeck.rob2rhyme.app">support@bmarkdeck.rob2rhyme.app</a>
          </p>
        </div>
      </section>
    </LegalPageLayout>
  );
}
