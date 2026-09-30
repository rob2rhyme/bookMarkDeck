//src/utils/bookmarksToHtml.ts
import { Bookmark } from "@/types/bookmark";
import type { Folder } from "@/types/folder";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A Netscape bookmarks file — what every browser imports — written from the
 * real folder tree. Each bookmark is placed by its `folderId`; the stored
 * `folder` name is used only when there is no usable id (older records), since
 * renames and auto-organize never update it. Grouping by that name used to
 * export renamed folders under old names, flatten nesting, merge same-named
 * folders and drop empty ones.
 */
export function bookmarksToNetscapeHtml(bookmarks: Bookmark[], folders: Folder[] = []): string {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const nameKey = (name: string) => name.trim().toLowerCase();

  // Older records with a name but no usable id: a root folder of that name,
  // made up if there isn't one, so they still export inside a folder.
  const tree = [...folders];
  const labelFolder = new Map<string, string>();
  const folderOf = (b: Bookmark): string | null => {
    if (b.folderId && byId.has(b.folderId)) return b.folderId;
    const label = b.folder?.trim();
    if (!label) return null;
    const key = nameKey(label);
    if (!labelFolder.has(key)) {
      const root = folders.find((f) => f.parentId === null && nameKey(f.name) === key);
      const id = root?.id ?? `label:${key}`;
      if (!root) tree.push({ id, name: label, parentId: null });
      labelFolder.set(key, id);
    }
    return labelFolder.get(key)!;
  };

  const sorted = [...bookmarks].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const linksIn = new Map<string | null, Bookmark[]>();
  for (const b of sorted) {
    const at = folderOf(b);
    linksIn.set(at, [...(linksIn.get(at) ?? []), b]);
  }

  const treeIds = new Set(tree.map((f) => f.id));
  const childrenOf = (parentId: string | null) =>
    tree
      .filter((f) => (f.parentId && treeIds.has(f.parentId) ? f.parentId : null) === parentId)
      .sort(
        (a, b) =>
          (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
          a.name.localeCompare(b.name)
      );

  const lines: string[] = [];

  // Header
  lines.push(`<!DOCTYPE NETSCAPE-Bookmark-file-1>`);
  lines.push(`<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">`);
  lines.push(`<TITLE>Bookmark Deck Export</TITLE>`);
  lines.push(`<H1>Bookmark Deck Export</H1>`);
  lines.push(`<DL><p>`);

  const toUnix = (iso: string) =>
    Math.floor(new Date(iso).getTime() / 1000).toString();

  const writeBookmark = (b: Bookmark) => {
    const url = escapeHtml(b.url);
    const title = escapeHtml(b.title || b.url);
    const addDate = toUnix(b.createdAt);
    const tagsAttr =
      b.tags && b.tags.length > 0
        ? ` TAGS="${escapeHtml(b.tags.join(","))}"`
        : "";

    lines.push(
      `<DT><A HREF="${url}" ADD_DATE="${addDate}"${tagsAttr}>${title}</A>`
    );

    // Optionally include notes as a <DD> description
    if (b.note && b.note.trim().length > 0) {
      lines.push(`<DD>${escapeHtml(b.note.trim())}`);
    }
  };

  const written = new Set<string>();
  const writeFolder = (f: Folder) => {
    if (written.has(f.id)) return; // a parent cycle can't loop forever
    written.add(f.id);
    lines.push(`<DT><H3>${escapeHtml(f.name)}</H3>`, `<DL><p>`);
    for (const b of linksIn.get(f.id) ?? []) writeBookmark(b);
    for (const child of childrenOf(f.id)) writeFolder(child);
    lines.push(`</DL><p>`);
  };

  // Unfiled links first, then the tree, empty folders included.
  for (const b of linksIn.get(null) ?? []) writeBookmark(b);
  for (const f of childrenOf(null)) writeFolder(f);
  // Folders caught in a parent cycle are reachable from no root: write them
  // at the top level rather than lose them and their links.
  for (const f of tree) if (!written.has(f.id)) writeFolder(f);

  // Close root DL
  lines.push(`</DL><p>`);

  return lines.join("\n");
}
