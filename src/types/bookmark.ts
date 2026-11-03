//src/types/bookmark.ts
/** A passage the reader marked in a saved page. Text only: the page itself is never stored. */
export type BookmarkHighlight = {
  id: string;
  text: string;
  createdAt: string;
};

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
  /** Passages marked in the reader view (see `@/utils/highlights`). */
  highlights?: BookmarkHighlight[];
};
