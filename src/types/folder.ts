export type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
};
