import LegalPageLayout from "@/components/LegalPageLayout";

export default function FaqPage() {
  return (
    <LegalPageLayout title="FAQ">
      <section className="space-y-5 text-sm leading-relaxed text-slate-200">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">What does sync do?</h2>
          <p>If enabled, it encrypts your bookmarks client-side with your passphrase and stores them in your Google Drive appData folder. No other Drive files are accessed.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Why do I need a passphrase for sync?</h2>
          <p>It encrypts/decrypts your bookmarks. We never see or store it, so keep it safe.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">What happens if I lose my passphrase?</h2>
          <div className="space-y-2">
            <p>We cannot recover or decrypt your synced data without it (passphrase never leaves your device).</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>If you still have bookmarks locally: export them (or keep them), set a new passphrase, and “Sync to Drive” to overwrite the old encrypted file.</li>
              <li>If you don’t have local bookmarks: start fresh and set a new passphrase for future syncs.</li>
              <li>To clear the old encrypted copy: delete the Bookmark Deck file in Drive appData or overwrite by syncing an empty/cleared set, then set a new passphrase and re-sync.</li>
            </ul>
            <p>We’re happy to walk you through exporting, clearing, and re-syncing, but lost passphrases make old cloud data unrecoverable.</p>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Do you store my data on your servers?</h2>
          <p>No. Data lives in your browser (localStorage) and, if you opt in, in your own Drive appData folder.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">How do I remove my data?</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Local: use “Delete All Bookmarks” or clear site data.</li>
            <li>Drive: delete the Bookmark Deck file in Drive’s hidden app data or overwrite via sync.</li>
            <li>Revoke access: remove the app in your Google account permissions.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">What permissions do you request from Google?</h2>
          <p>`drive.appdata` (to read/write a single app-specific file) and basic profile/email for sign-in.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Why do I see an “app not verified” warning?</h2>
          <p>The OAuth app may still be in testing; add your account as a tester or wait until verification completes.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Who do I contact for help?</h2>
          <p>
            Email{" "}
            <a className="text-blue-300 underline" href="mailto:support@example.com">
              support@example.com
            </a>
            .
          </p>
        </div>
      </section>
    </LegalPageLayout>
  );
}
