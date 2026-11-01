"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { Bookmark as BookmarkIcon, Check, ExternalLink } from "@/components/icons";
import { FIELD_CLASS } from "@/components/ui/Field";
import { useBookmarks } from "@/hooks/useBookmarks";
import { makeFolderOptions } from "@/utils/folderOptions";
import { isUnsafeUrl } from "@/utils/normalizeUrl";
import { parseSharedLink, sameLink } from "@/utils/sharedLink";

const UNSTAGED = "__unstaged__";

/**
 * A link shared in from another app: confirm the title, pick a folder, save.
 * Saves to this device like any other new bookmark — bookmark cloud sync stays
 * the explicit "Sync to cloud" it is everywhere else.
 */
export function ShareReceiver({
  sharedTitle,
  sharedText,
  sharedUrl,
}: {
  sharedTitle: string;
  sharedText: string;
  sharedUrl: string;
}) {
  const { data: session } = useSession();
  const userId = session?.user?.email ?? null;
  const { bookmarks, folders, hydrated, addBookmark } = useBookmarks(userId);

  const shared = useMemo(
    () => parseSharedLink({ title: sharedTitle, text: sharedText, url: sharedUrl }),
    [sharedTitle, sharedText, sharedUrl]
  );
  const [title, setTitle] = useState(shared?.title ?? "");
  const [folderId, setFolderId] = useState(UNSTAGED);
  const [saved, setSaved] = useState(false);

  const folderOptions = useMemo(() => makeFolderOptions(folders), [folders]);
  const existing = useMemo(
    () => (shared ? bookmarks.find((b) => sameLink(b.url, shared.url)) : undefined),
    [bookmarks, shared]
  );
  const existingFolder = existing?.folderId
    ? folders.find((f) => f.id === existing.folderId)?.name
    : undefined;
  // The session's account must be the one whose cache is loaded, or the save
  // would land in the wrong (or no) account's list.
  const ready = hydrated && Boolean(userId);

  const save = () => {
    if (!shared || !ready || isUnsafeUrl(shared.url)) return;
    const target = folderId === UNSTAGED ? null : folderId;
    addBookmark({
      title: title.trim() || shared.title,
      url: shared.url,
      note: "",
      folderId: target,
      folder: target ? folders.find((f) => f.id === target)?.name : undefined,
      tags: [],
    });
    setSaved(true);
  };

  return (
    <div className="mx-auto max-w-md py-4">
      <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-50">
        <BookmarkIcon className="h-5 w-5 text-blue-400" />
        Save link
      </h1>

      {!shared ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
          <p>That share didn&apos;t include a web link, so there&apos;s nothing to save.</p>
          <Link href="/" className="inline-block text-blue-300 hover:text-blue-200">
            Go to your bookmarks →
          </Link>
        </div>
      ) : saved ? (
        <div className="mt-4 space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="flex items-center gap-2 text-sm text-slate-100">
            <Check className="h-4 w-4 text-emerald-400" />
            Saved to Bookmark Deck.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
            >
              Go to bookmarks
            </Link>
            <a
              href={shared.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-600"
            >
              Open link <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      ) : (
        <form
          className="mt-4 space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <p className="break-all text-xs text-slate-400">{shared.url}</p>

          {existing && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Already in your deck{existingFolder ? ` (in ${existingFolder})` : ""}. Saving again
              adds a second copy.
            </p>
          )}

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-400">Title</span>
            <input
              className={FIELD_CLASS}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-400">Folder</span>
            <select
              className={FIELD_CLASS}
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
            >
              <option value={UNSTAGED}>Unstaged</option>
              {folderOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!ready}
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {existing ? "Save again" : "Save bookmark"}
            </button>
            <Link href="/" className="px-3 py-2 text-sm text-slate-400 hover:text-slate-200">
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
