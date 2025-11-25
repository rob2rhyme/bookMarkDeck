import LegalPageLayout from "@/components/LegalPageLayout";

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="November 25, 2025">
      <section className="space-y-3 text-sm leading-relaxed text-slate-200">
        <p>
          Bookmark Deck stores your bookmarks locally and, if you opt in, syncs an encrypted
          copy to your Google Drive appData folder. Your encryption passphrase never leaves
          your device.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">What we collect</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Bookmarks and optional notes you add.</li>
          <li>Google account info (ID, email) for authentication via Google Sign-In.</li>
          <li>Encrypted bookmark data in your Google Drive appData folder if you enable sync.</li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">How we use data</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Show and manage your bookmarks and notes.</li>
          <li>Sync between devices (only if you enable sync). Payloads are encrypted client-side.</li>
          <li>We do not sell or share your data with third parties.</li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Where data lives</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Locally in your browser (localStorage).</li>
          <li>Optionally in your Google Drive appData folder as an encrypted JSON file.</li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Retention and deletion</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Local data stays on your device until you clear it or remove site data.</li>
          <li>Drive data remains until you delete or overwrite it via sync.</li>
          <li>Remove Drive data by deleting the app’s file in Drive’s hidden app data or by syncing an empty set.</li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Your controls</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Clear local data in-app (Delete All Bookmarks) or via browser site data.</li>
          <li>Delete the Drive file from appData or overwrite via sync.</li>
          <li>Revoke access in your Google account permissions.</li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Security</h2>
        <p>
          Sync payloads are encrypted client-side with your passphrase. We do not store or see
          the passphrase and cannot recover it if lost.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Contact</h2>
        <p>
          For questions or requests, email{" "}
          <a className="text-blue-300 underline" href="mailto:support@example.com">
            support@example.com
          </a>
        </p>
      </section>
    </LegalPageLayout>
  );
}
