import { Folder } from "@/types/folder";

export function buildFolderPathLabel(
  folderId: string,
  folderById: Map<string, Folder>
): string {
  const path: string[] = [];
  const visited = new Set<string>();
  let cursorId: string | null = folderId;

  while (cursorId) {
    if (visited.has(cursorId)) break;
    visited.add(cursorId);
    const node = folderById.get(cursorId);
    if (!node) break;
    path.push(node.name);
    cursorId = node.parentId;
  }

  return path.reverse().join(" / ");
}

export function makeFolderOptions(
  folders: Folder[]
): Array<{ id: string; name: string; label: string }> {
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  return folders
    .map((folder) => ({
      id: folder.id,
      name: folder.name,
      label: buildFolderPathLabel(folder.id, folderById),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}
