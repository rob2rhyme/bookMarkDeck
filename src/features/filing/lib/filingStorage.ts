// SERVER ONLY — the storage settings every /api/filing route shares, kept in one place so
// the three routes (presign, read, delete) can never disagree about which bucket they mean.
//
// A new file, not another export of ./r2: that module is a deliberate COPY of inventory's,
// and `copiedModules.test.ts` holds the pair to the same exports.

import { presignR2Put } from "@/features/filing/lib/r2";

export type FilingStorage = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

type Env = Record<string, string | undefined>;

/**
 * Filing's bucket: `R2_FILING_BUCKET` when set, else the shared `R2_BUCKET`. A separate
 * bucket is how Filing scans get a PRIVATE one while inventory photos stay on a public
 * bucket (photos are shown as plain `<img src>`); nothing in the code cares which.
 * Reads go through a signed URL either way, so neither choice changes how a scan opens.
 */
export function filingStorage(env: Env = process.env): FilingStorage | null {
  const accountId = env.R2_ACCOUNT_ID;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  const bucket = env.R2_FILING_BUCKET || env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

/** How long a signed read URL lives: long enough to fetch one scan, too short to share. */
export const READ_URL_SECONDS = 120;

export function presignFilingGet(storage: FilingStorage, key: string, now = new Date()): string {
  return presignR2Put({ ...storage, key, now, method: "GET", expiresSeconds: READ_URL_SECONDS });
}
