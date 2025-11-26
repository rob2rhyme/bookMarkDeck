import LegalPageLayout from "@/components/LegalPageLayout";

export default function FaqPage() {
  return (
    <LegalPageLayout title="FAQ">
      <section className="space-y-5 text-sm leading-relaxed text-slate-200">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">What does sync do?</h2>
          <p>If enabled, it stores your bookmarks in Firebase Firestore tied to your Google login so they’re available on any browser/device you sign into.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Do I need a passphrase?</h2>
          <p>No. Access is controlled by your Google sign-in and Firebase security rules. Keep your Google account secure.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Is my data encrypted?</h2>
          <p>Local data lives in your browser. Cloud data sits in Firestore and is protected by your Google authentication and Firebase rules; we do not add extra end-to-end encryption in the cloud.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Do you store my data on your servers?</h2>
          <p>No. Data lives in your browser (localStorage) and, if you opt in, in our Firebase Firestore project scoped to your Google account.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">How do I remove my data?</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Local: use “Delete All Bookmarks” or clear site data.</li>
            <li>Cloud: delete bookmarks locally and run “Sync to cloud” to overwrite, or contact support to purge.</li>
            <li>Revoke access: remove the app in your Google account permissions.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">When should I sync?</h2>
          <p>Any time you add, edit, delete, or import bookmarks, click “Sync to cloud” so those changes are saved to your Google-linked Firestore data.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Can I store sensitive info?</h2>
          <p>No. Do not store passwords, PINs, credit/debit card numbers, Social Security numbers, or other sensitive credentials. You are responsible for any loss or misuse of such data.</p>
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
