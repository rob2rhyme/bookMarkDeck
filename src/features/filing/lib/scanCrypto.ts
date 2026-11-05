// Sealing a scan on the device before it is uploaded, and opening it after it is fetched.
// WebCrypto only; pure apart from that. The vault (src/lib/vault) holds the key.
//
// The object is `iv ‖ AES-GCM(ciphertext+tag)`, bound to the attachment id so a sealed
// scan can't be swapped onto another attachment's pointer and open as its own. It is
// stored as application/octet-stream whatever it is, so the storage layer never has a
// type to serve it as — it can't execute and can't be previewed — and the real type
// stays on the pointer (`contentType`), where the app checks it against the allow-list
// again before it hands the decrypted bytes to anything.

import { openBytes, openText, sealBytes, sealText, SEAL_OVERHEAD, type SealedText } from "@/lib/vault/vault";
import { ACCEPTED_TYPES } from "@/features/filing/lib/attachments";
import type { FilingAttachment } from "@/features/filing/lib/types";

/** Context for the bytes; changing it strands every sealed scan. */
export const SCAN_CONTEXT = "filing-scan";
/** Context for the sealed file name. */
export const SCAN_NAME_CONTEXT = "filing-scan-name";

/** What a sealed scan's pointer shows while the vault is closed. */
export const LOCKED_SCAN_NAME = "Locked scan";

export type SealedScan = {
  /** The bytes to upload. */
  blob: Blob;
  /** Goes on the pointer's `enc`. */
  enc: { kid: string; name: SealedText };
};

export async function sealScan(input: {
  file: File;
  key: CryptoKey;
  kid: string;
  attachmentId: string;
}): Promise<SealedScan> {
  const { file, key, kid, attachmentId } = input;
  const bytes = await sealBytes(key, SCAN_CONTEXT, attachmentId, await file.arrayBuffer());
  const name = await sealText(key, kid, SCAN_NAME_CONTEXT, attachmentId, file.name.slice(0, 120));
  return { blob: new Blob([bytes], { type: "application/octet-stream" }), enc: { kid, name } };
}

/** The size of what is actually stored, for the presign route's declared-size check. */
export const sealedSize = (originalSize: number): number => originalSize + SEAL_OVERHEAD;

export async function openScanName(key: CryptoKey, a: Pick<FilingAttachment, "id" | "enc">): Promise<string | null> {
  if (!a.enc) return null;
  try {
    return await openText(key, SCAN_NAME_CONTEXT, a.id, a.enc.name);
  } catch {
    return null;
  }
}

export type OpenedScan = { blob: Blob; name: string; contentType: string };

/**
 * Open a sealed scan's downloaded bytes. The result is typed by the pointer's ORIGINAL
 * type only if that is one Filing accepts; anything else becomes octet-stream, so a
 * tampered pointer can't turn decrypted bytes into something a browser would render
 * as a page.
 */
export async function openScan(input: {
  sealed: ArrayBuffer;
  key: CryptoKey;
  attachment: Pick<FilingAttachment, "id" | "contentType" | "enc" | "name">;
}): Promise<OpenedScan> {
  const { sealed, key, attachment } = input;
  const bytes = await openBytes(key, SCAN_CONTEXT, attachment.id, sealed);
  const name = (await openScanName(key, attachment)) ?? attachment.name;
  const known = (ACCEPTED_TYPES as readonly string[]).includes(attachment.contentType);
  const contentType = known ? attachment.contentType : "application/octet-stream";
  return { blob: new Blob([bytes], { type: contentType }), name, contentType };
}
