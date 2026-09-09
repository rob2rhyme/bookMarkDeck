//src/app/privacy/page.tsx
import LegalPageLayout from "@/components/LegalPageLayout";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="June 25, 2026">
      <section className="space-y-3 text-sm leading-relaxed text-slate-200">
        <p>
          Bookmark Deck is local-first. Your bookmarks are stored in your browser by default.
          If you choose to sync, a cloud copy is stored in Firebase Firestore under your Google
          account.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">What data we process</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Bookmarks and optional metadata you enter (tags, notes, folder labels, icon values).</li>
          <li>Shortcut entries you create (name, URL, icon).</li>
          <li>Focus-hub data you create (focus sessions, tasks, journal notes and dreams, hydration, mood).</li>
          <li>Google account identity data used by authentication (for sign-in and sync access control).</li>
          <li>
            Google Tasks and Google Calendar data accessed on your behalf when you use the to-do and
            agenda features (see “Google account data” below).
          </li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Where data is stored</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Local browser storage (`localStorage`) on your device, including bookmark lists, folder labels,
            and local shortcut state.
          </li>
          <li>
            Optional Firestore cloud storage when you use sync. Bookmark backups keep recent snapshots
            (up to 7), including bookmark payloads and cloud-safe shortcut data.
          </li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">How we use the data</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Render and organize bookmarks, folders, tags, notes, and shortcuts.</li>
          <li>Support optional sync and restore workflows across your signed-in devices.</li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Google account data</h2>
        <p>
          When you sign in with Google and use the to-do and agenda features, Bookmark Deck requests
          permission to access the following Google data on your behalf:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Basic profile</strong> (<code>openid</code>, <code>email</code>,{" "}
            <code>profile</code>) — to sign you in and scope your data to your account.
          </li>
          <li>
            <strong>Google Tasks</strong> (<code>auth/tasks</code>) — to mirror and manage your
            to-do items.
          </li>
          <li>
            <strong>Google Calendar events</strong> (<code>auth/calendar.events</code>) — to create
            timed to-dos as calendar events.
          </li>
          <li>
            <strong>Google Calendar, read-only</strong> (<code>auth/calendar.readonly</code>) — to
            show your upcoming events alongside your to-dos.
          </li>
        </ul>
        <p>
          This data stays in your own Google account. Bookmark Deck accesses it only while you are
          signed in, acting on your behalf, to provide the features above. Your Google access and
          refresh tokens are held only in your encrypted session cookie — we do not store them in a
          server database.
        </p>
        <p>
          Bookmark Deck’s use and transfer of information received from Google APIs to any other app
          will adhere to the{" "}
          <a
            className="text-blue-300 underline"
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. We do not sell this data, use it for advertising,
          or transfer it except as needed to provide the features you request or as required by law.
          We do not use this data to train generalized AI/ML models.
        </p>
        <p>
          You can revoke Bookmark Deck’s access to your Google account at any time at{" "}
          <a
            className="text-blue-300 underline"
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noopener noreferrer"
          >
            myaccount.google.com/permissions
          </a>
          .
        </p>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Analytics and tracking</h2>
        <p>
          Bookmark Deck does not currently include analytics or ad-tracking SDKs in the app code.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Retention and deletion</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Local data remains until you delete entries, use clear actions, or clear browser site data.</li>
          <li>Cloud data remains until overwritten or removed through sync operations.</li>
          <li>
            You can remove cloud bookmark data by deleting locally and syncing to cloud, then optionally
            revoking app access in your Google account.
          </li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Security notes</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Cloud access depends on your Google account + Firebase security rules.</li>
          <li>Protect your device and Google account credentials.</li>
          <li>Do not store highly sensitive secrets in bookmark notes.</li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Contact</h2>
        <p>
          Questions: <a className="text-blue-300 underline" href="mailto:support@bmarkdeck.rob2rhyme.app">support@bmarkdeck.rob2rhyme.app</a>
        </p>
      </section>
    </LegalPageLayout>
  );
}
