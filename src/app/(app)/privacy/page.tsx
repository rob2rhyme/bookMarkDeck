//src/app/privacy/page.tsx
import LegalPageLayout from "@/components/LegalPageLayout";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="October 21, 2026">
      <section className="space-y-3 text-sm leading-relaxed text-slate-200">
        <p>
          Bookmark Deck is local-first. Your data is stored in your browser first, and a cloud copy
          is kept in Firebase Firestore under your Google account when you sync. It is a private,
          single-owner app: only its owner&rsquo;s Google account can sign in, and the database
          refuses every other account.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">What data we process</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Bookmarks and optional metadata you enter (tags, notes, folder labels, icon values).</li>
          <li>Shortcut entries you create (name, URL, icon).</li>
          <li>Focus-hub data you create (focus sessions, tasks, journal notes and dreams, hydration, mood).</li>
          <li>
            Habits, My Stuff (home inventory) and Filing records you create, including optional photos
            and scanned attachments.
          </li>
          <li>
            Health files you choose to import for habits (an Apple Health export, Google Fit data or a
            CSV) are read inside your browser and are never uploaded. Only the days they mark a habit
            done — and which kind of data each habit is linked to — are saved; the steps, sleep and
            other figures in the file are not kept.
          </li>
          <li>
            Notes you write: title, text, tags, pinned state and timestamps. Each note also keeps a short
            history of what happened to it and when (created, edited, pinned, tagged, locked, restored)
            — never its text — and deleted notes are listed by title in a deletion log (the newest 100).
          </li>
          <li>Google account identity data used by authentication (for sign-in and sync access control).</li>
          <li>
            Google Tasks and Google Calendar data accessed on your behalf when you use the to-do and
            agenda features (see “Google account data” below).
          </li>
          <li>
            The web address of a link you add without a title, or open in reader view: the server
            opens that one page to read its title or its text. A title is saved on the bookmark; the
            reader&rsquo;s text is shown and not kept — only the passages you highlight are saved, on that
            bookmark. Private and local network addresses are never fetched. Type a title yourself
            and nothing is fetched until you press Read.
          </li>
          <li>
            Meditation cue wording (for example “Breathe in.”) sent to OpenAI to be turned into speech,
            only if you choose the Natural voice and the deployment has a narration key. Only the
            words of the cue are sent — no name, email or account data — and the audio is kept on your
            device afterwards. The default device voice sends nothing anywhere.
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
          <li>
            Photos and attachments, when that storage is configured, in a Cloudflare R2 bucket under
            unguessable addresses. Anyone holding such an address can open the file, so they are not
            covered by the database&rsquo;s sign-in rules.
          </li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Locked notes and locked papers (end-to-end encrypted)</h2>
        <p>
          A note you lock, and the reference and note of a Filing paper you lock, are encrypted on your
          device (AES-256-GCM) before they are saved, with a key that only your passphrase or your
          recovery code can unlock — one passphrase for both. What you lock never reaches our servers
          or the database in readable form, and nobody — including whoever stores your data — can read
          it without one of those two. Lose both and the locked text cannot be recovered by anyone.
          Titles and tags of locked notes, and a locked paper&rsquo;s title, dates, folder, tags,
          aliases and reminders, stay readable so lists, search and reminders work. Scans attached to
          a paper are not encrypted. Text saved before you locked something may remain in older
          backups or exports. Everything else in the app is protected by sign-in and database rules,
          not by end-to-end encryption.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">How we use the data</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Render and organize bookmarks, folders, tags, notes, and shortcuts.</li>
          <li>
            Show insights about your own notes (counts, activity per week, tags). These are worked out
            on your device when you open them and are not stored or sent anywhere.
          </li>
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
            timed to-dos as calendar events, keep them in step, and to add or delete events on
            your own primary calendar when you ask in the agenda.
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
          server database. The session ends after 14 days without using the app.
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
          Bookmark Deck does not include analytics or ad-tracking SDKs. Notes history and insights
          are records of your own activity, kept in your own account and shown only to you.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Retention and deletion</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Local data remains until you delete entries, use clear actions, or clear browser site data.</li>
          <li>Cloud data remains until overwritten or removed through sync operations.</li>
          <li>
            You can remove cloud bookmark data by deleting locally and syncing to cloud, then optionally
            revoking app access in your Google account.
          </li>
          <li>
            A note&rsquo;s history is deleted with the note. The deletion log keeps the titles of the
            last 100 deleted notes.
          </li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Security notes</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Cloud access depends on your Google account and Firebase security rules, which admit only
            the owner&rsquo;s verified Google account, and only to its own data.
          </li>
          <li>Protect your device and Google account credentials.</li>
          <li>
            Do not store highly sensitive secrets in bookmark notes or unlocked notes; use a locked note
            (or lock a Filing paper&rsquo;s reference and note) if you must keep one here.
          </li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Contact</h2>
        <p>
          Questions: <a className="text-blue-300 underline" href="mailto:support@bmarkdeck.rob2rhyme.app">support@bmarkdeck.rob2rhyme.app</a>
        </p>
      </section>
    </LegalPageLayout>
  );
}
