import LegalPageLayout from "@/components/LegalPageLayout";

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated="November 26, 2025">
      <section className="space-y-4 text-sm leading-relaxed text-slate-200">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Use of the Service</h2>
          <p>Bookmark Deck lets you save, organize, and optionally sync bookmarks and notes. Use it in compliance with applicable laws.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Accounts and Access</h2>
          <p>Sign-in is via Google. You are responsible for securing your Google account and device. If you enable sync, your bookmarks are tied to your Google account in Firebase.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Data Storage and Sync</h2>
          <p>
            Bookmarks are stored locally. If you enable sync, a copy is stored in Firebase Firestore linked to your Google account. There is no separate passphrase; access is controlled by your Google authentication and Firebase security rules.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Acceptable Use</h2>
          <p>Do not upload illegal content, malware, or attempt to access others’ data. Do not abuse or disrupt the service.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Availability and Changes</h2>
          <p>The service is provided “as is,” without guarantees of uptime or data recovery. Features may change or be discontinued.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Disclaimers and Liability</h2>
          <p>To the maximum extent allowed by law, we disclaim warranties and are not liable for indirect or consequential damages, including data loss.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Sensitive data warning</h2>
          <p>Do not store sensitive credentials or personal data (passwords, PINs, credit/debit card numbers, Social Security numbers) in Bookmark Deck. You are responsible for any loss or misuse of such data.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Termination</h2>
          <p>You may stop using the service at any time. We may suspend or terminate access for misuse or legal reasons.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Contact</h2>
          <p>
            For questions about these terms, email{" "}
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
