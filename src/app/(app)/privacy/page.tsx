//src/app/privacy/page.tsx
import LegalPageLayout from "@/components/LegalPageLayout";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="November 5, 2026">
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
            Photos and attachments, when that storage is configured, in a Cloudflare R2 bucket. Item
            photos sit under unguessable public addresses: anyone holding one can open the file, so
            they are not covered by the database&rsquo;s sign-in rules. Filing scans are different —
            they are encrypted on your device before upload (unless you turn that off for a scan),
            and the app reads them only through short-lived addresses issued to you after sign-in.
          </li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Services that receive data</h2>
        <p>
          Bookmark Deck runs on other companies&rsquo; services. Each one below receives only what is
          listed, and only when you use the feature named. None of them is used for advertising or
          analytics.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Google</strong> — signs you in (Google sign-in and Firebase Authentication),
            stores your synced data (Firebase Firestore), and, if you use them, your Tasks and
            Calendar (see &ldquo;Google account data&rdquo;). Bookmark and shortcut icons are loaded
            by your browser from Google&rsquo;s icon service, which receives the site&rsquo;s
            domain (for example <code>example.com</code>, not the full address) along with your
            browser&rsquo;s usual request details. If Google has no icon, your browser asks the site
            itself for one.
          </li>
          <li>
            <strong>Vercel</strong> — hosts the app and its server functions, so it receives every
            request your browser makes to Bookmark Deck (your IP address, browser and the page or
            function asked for), as any web host does, and keeps request logs under its own terms.
          </li>
          <li>
            <strong>Cloudflare (R2 storage)</strong> — stores item photos and attachments, and
            Filing scans (encrypted on your device by default; see below).
          </li>
          <li>
            <strong>Upstash</strong> — two services. Its database keeps your email address with
            your plan status (if you buy Premium) and monthly usage counts for the AI features and
            the Natural voice; usage counts expire after about 40 days. Its scheduler (QStash)
            holds a reminder you turn on until it is due: the notification&rsquo;s title and text,
            the page it opens, and your browser&rsquo;s push address. A Filing reminder never names
            a confidential paper, and a PIN-locked My Stuff sends counts only, never item names.
          </li>
          <li>
            <strong>Your browser&rsquo;s push service</strong> (Google, Mozilla, Apple or Microsoft,
            depending on the browser) — delivers those reminders. The notification is encrypted for
            your browser, so the push service sees only that one was sent, and when.
          </li>
          <li>
            <strong>Anthropic</strong> — only if you use AI capture or AI insights in My Stuff. AI
            capture sends the one photo you choose and your currency. AI insights sends counts and
            your category, location and tag names — never item names, serial numbers or notes.
          </li>
          <li>
            <strong>OpenAI</strong> — only the meditation cue wording, if you choose the Natural
            voice (see above).
          </li>
          <li>
            <strong>Product databases</strong> (UPCitemdb, Open Food Facts, Open Beauty Facts, Open
            Products Facts and Open Library) — when you scan or type a barcode, our server sends
            them that number and nothing else. Product and cover pictures they return are loaded by
            your browser from them.
          </li>
          <li>
            <strong>jsDelivr</strong> — reading a label or receipt loads the text-recognition engine
            from this public code host. The photo is read on your device and is not sent anywhere.
          </li>
          <li>
            <strong>Lemon Squeezy</strong> — only if you buy Premium. It is the seller of record and
            takes your payment under its own privacy policy; we pass it your email address to start
            checkout. We receive your email, plan and subscription dates — never card details.
          </li>
          <li>
            <strong>Websites you read or save</strong> — when the app fetches a page&rsquo;s title or
            its text for reader view, the website sees a request from our server, not from you.
          </li>
        </ul>
        <p>
          Anthropic and OpenAI state in their API terms that what is sent through their APIs is not
          used to train their models by default.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Locked notes and locked papers (end-to-end encrypted)</h2>
        <p>
          A note you lock, and the reference and note of a Filing paper you lock, are encrypted on your
          device (AES-256-GCM) before they are saved, with a key that only your passphrase or your
          recovery code can unlock — one passphrase for both. What you lock never reaches our servers
          or the database in readable form, and nobody — including whoever stores your data — can read
          it without one of those two. Lose both and the locked text cannot be recovered by anyone.
          Titles and tags of locked notes, and a locked paper&rsquo;s title, dates, folder, tags,
          aliases and reminders, stay readable so lists, search and reminders work. A Filing scan you add
          is encrypted the same way by default, and its file name is sealed with it; the scan&rsquo;s
          type and size stay readable. A scan you choose to add unencrypted, and any added before this
          existed, is stored as it is. Text saved before you locked something may remain in older
          backups or exports. A locked paper is also &ldquo;confidential&rdquo;: an optional PIN on this
          device hides it from the lists and search, and its name is never put in a notification,
          the CSV, or a calendar file. That PIN is a privacy screen, not encryption. Everything else
          in the app is protected by sign-in and database rules, not by end-to-end encryption.
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
          <li>
            Cloud data remains until you delete it in the app. A deletion reaches the cloud as you
            make it, or the next time you connect — except bookmarks and shortcuts, which reach it
            when you press Sync to cloud. Bookmark backups keep the newest 7.
          </li>
          <li>
            Photos, attachments and Filing scans are removed from storage when you delete them, or
            the item or paper they belong to — once the few seconds in which you can undo have
            passed, and, if your device is offline then, the next time it connects.
          </li>
          <li>
            A note&rsquo;s history is deleted with the note. The deletion log keeps the titles of the
            last 100 deleted notes.
          </li>
          <li>
            Monthly usage counts expire after about 40 days. A scheduled reminder is kept until it is
            delivered or you turn it off. Your plan status is kept while you have an account.
          </li>
          <li>
            To delete everything we hold about you — your synced data, files, plan status and usage
            counts — email us at the address below. There is no self-serve button for this yet.
            Lemon Squeezy keeps the payment records tax law requires it to keep. You can also revoke
            Bookmark Deck&rsquo;s access to your Google account at any time (see above).
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
          <li>
            If we learn of a breach that affects your data, we will tell you by email without undue
            delay — what happened, what data was involved and what to do — and notify the
            authorities where the law requires.
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
