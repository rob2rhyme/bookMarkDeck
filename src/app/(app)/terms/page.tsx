//src/app/terms/page.tsx
import LegalPageLayout from "@/components/LegalPageLayout";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated="February 12, 2026">
      <section className="space-y-4 text-sm leading-relaxed text-slate-200">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Service scope</h2>
          <p>
            Bookmark Deck lets you manage bookmarks, folders, tags, notes, and shortcuts, with optional
            Firebase sync tied to your Google account.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Accounts and access</h2>
          <p>
            Sign-in is handled with Google authentication. You are responsible for account and device security.
            Protected app routes require authentication.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Data handling</h2>
          <p>
            Data is local-first in your browser. If you use sync, a cloud copy is stored in Firestore. Cloud
            backup snapshots are retained in limited history for restore purposes.
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
            in Bookmark Deck content fields.
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
