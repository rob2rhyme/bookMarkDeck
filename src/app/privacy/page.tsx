//src/app/privacy/page.tsx
import LegalPageLayout from "@/components/LegalPageLayout";

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="February 12, 2026">
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
          <li>Google account identity data used by authentication (for sign-in and sync access control).</li>
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

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Native launcher and device-local fields</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Native app launching is optional and requires a locally running launcher helper.</li>
          <li>
            Launcher pairing token is read from local environment configuration and is not synced through
            Bookmark Deck cloud sync.
          </li>
          <li>
            Native-only shortcut targeting fields (for example local path, macOS bundle ID, Windows
            AppUserModelId) are intended to remain device-local and are not persisted to Firestore.
          </li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">How we use the data</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Render and organize bookmarks, folders, tags, notes, and shortcuts.</li>
          <li>Support optional sync and restore workflows across your signed-in devices.</li>
          <li>Provide optional native launch actions through your local helper service.</li>
        </ul>

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
