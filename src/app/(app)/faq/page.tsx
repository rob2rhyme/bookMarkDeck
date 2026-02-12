//src/app/faq/page.tsx
import LegalPageLayout from "@/components/LegalPageLayout";

export default function FaqPage() {
  return (
    <LegalPageLayout title="FAQ" lastUpdated="February 12, 2026">
      <section className="space-y-5 text-sm leading-relaxed text-slate-200">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">How are folders represented?</h2>
          <p>
            Folders are label-based. A bookmark belongs to a folder through its `folder` string value.
            Route pages use normalized keys (`trim().toLowerCase()`).
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">What are the folder routes?</h2>
          <p>
            Use <code>/folders/unstaged</code> for bookmarks without a folder, and
            <code> /folders/[folderKey]</code> for named folders.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">How does bookmark bulk select work?</h2>
          <p>
            On folder pages, press <strong>Select</strong> to choose multiple bookmarks, then move or delete in bulk.
            Move supports existing folders, <strong>Unstaged</strong>, or creating a new folder.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">What does sync do?</h2>
          <p>
            Sync stores cloud copies in Firebase Firestore under your Google-authenticated account so you can pull
            data on another device.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Are backups included?</h2>
          <p>
            Yes. Cloud sync keeps recent backup snapshots (up to 7). You can download backup JSON from the UI.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Do native app shortcuts sync?</h2>
          <p>
            Cloud sync stores shortcut name/URL/icon. Native-only target fields are device-local by design and are
            not synced to Firestore.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Do I need the local launcher?</h2>
          <p>
            Only for opening native desktop apps from shortcut cards. Web URLs work without it.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Why do I see “Launcher not reachable”?</h2>
          <p>
            The local helper is not running, not reachable on configured host/port/protocol, or token values do not
            match. See <code>TROUBLESHOOTING.md</code>.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">Do you run analytics?</h2>
          <p>No analytics SDK is currently integrated in the app code.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-50">How do I delete my data?</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Local: delete items in-app, use clear actions, or clear browser site data.</li>
            <li>Cloud: delete locally, then run sync-to-cloud to overwrite cloud copies.</li>
            <li>Account access: revoke app access from Google account permissions.</li>
          </ul>
        </div>
      </section>
    </LegalPageLayout>
  );
}
