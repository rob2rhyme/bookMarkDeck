//src/types/bookmark.ts
export type Bookmark = {
  id: string;
  title: string;
  url: string;
  icon?: string;
  note?: string;
  folderId?: string | null;
  folder?: string;
  tags?: string[];
  createdAt: string;
   hits?: number;
   lastUsedAt?: string;
  /**
   * Whether this bookmark is favorited / pinned.
   * Persisted in localStorage so it survives refreshes.
   */
  pinned?: boolean;
};
