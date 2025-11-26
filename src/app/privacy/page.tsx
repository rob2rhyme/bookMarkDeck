import LegalPageLayout from "@/components/LegalPageLayout";

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="November 26, 2025">
      <section className="space-y-3 text-sm leading-relaxed text-slate-200">
        <p>
          Bookmark Deck stores your bookmarks locally and, if you opt in, syncs them to Firebase
          Firestore using your Google login. Each Google account keeps its own data.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">What we collect</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Bookmarks and optional notes you add.</li>
          <li>Google account info (ID, email) for authentication via Google Sign-In.</li>
          <li>Bookmark data stored in Firestore when you enable sync.</li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">How we use data</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Show and manage your bookmarks and notes.</li>
          <li>Sync between devices (only if you enable sync) using your Google account.</li>
          <li>We do not sell or share your data with third parties.</li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Where data lives</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Locally in your browser (localStorage), namespaced per signed-in Google account.</li>
          <li>Optionally in Firebase Firestore, tied to your Google account.</li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Retention and deletion</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Local data stays on your device until you clear it or remove site data.</li>
          <li>Cloud data remains in Firestore until you delete or overwrite it via sync.</li>
          <li>Remove cloud data by deleting bookmarks locally and running “Sync to cloud,” or contact support to purge.</li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Your controls</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Clear local data in-app (Delete All Bookmarks) or via browser site data.</li>
          <li>Overwrite/remove your cloud copy by syncing after deleting bookmarks.</li>
          <li>Revoke access in your Google account permissions.</li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Security</h2>
        <p>
          Access to cloud data is restricted by Firebase security rules and your Google sign-in.
          We do not currently apply additional end-to-end encryption in Firestore; protect access
          by keeping your Google account secure.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-slate-50">Sensitive data warning</h2>
        <p>
          Do not store sensitive credentials or personal data (e.g., passwords, PINs, credit/debit card numbers,
          Social Security numbers). Loss or misuse of such data is your responsibility, and the developer is not
          liable for storing it in this app.
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
