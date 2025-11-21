//src/types/bookmark.ts
export type Bookmark = {
  id: string;            // uuid or timestamp
  title: string;
  url: string;
  note: string;
  folder?: string;       // optional (from imported bookmark folders)
  createdAt: string;     // ISO string
  tags: string[];        // NEW: tags for filtering
};

