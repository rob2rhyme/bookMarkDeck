// src/utils/googleDriveSync.ts
// Minimal client-only Google Drive helper using OAuth token client and fetch.

import { decryptJson, encryptJson } from "./crypto";
import { Bookmark } from "@/types/bookmark";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SCOPES = "https://www.googleapis.com/auth/drive.appdata";
const FILE_NAME = "bookmarkdeck.json";

type DriveFile = { id: string; modifiedTime?: string };
type EncryptedPayload = { iv: string; ciphertext: string };
type TokenResponse = { access_token?: string; error?: string };

type TokenClientConfig = {
  client_id: string;
  scope: string;
  prompt: "consent" | "none";
  callback: (resp: TokenResponse) => void;
};

type GoogleIdentity = {
  accounts: {
    oauth2: {
      initTokenClient: (config: TokenClientConfig) => {
        requestAccessToken: () => void;
      };
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

async function loadGis(): Promise<GoogleIdentity> {
  if (typeof window === "undefined") {
    throw new Error("Google Drive sync is client-only.");
  }

  if (window.google?.accounts?.oauth2) {
    return window.google;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google identity script."));
    document.head.appendChild(script);
  });

  const google = window.google;
  if (!google?.accounts?.oauth2) {
    throw new Error("Google identity client not available.");
  }
  return google;
}

async function getAccessToken(prompt: "consent" | "none" = "consent"): Promise<string> {
  const google = await loadGis();
  if (!CLIENT_ID) {
    throw new Error("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID");
  }

  return new Promise((resolve, reject) => {
    type TokenResponse = { access_token?: string; error?: string };
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      prompt,
      callback: (resp: TokenResponse) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error || "No access token"));
          return;
        }
        resolve(resp.access_token);
      },
    });
    client.requestAccessToken();
  });
}

async function findExistingFile(token: string): Promise<DriveFile | null> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(
      FILE_NAME
    )}'+and+'appDataFolder'+in+parents+and+trashed=false&spaces=appDataFolder&fields=files(id,modifiedTime)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.files?.[0] ?? null;
}

async function downloadFile(
  token: string,
  fileId: string
): Promise<EncryptedPayload | null> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  return res.json();
}

async function uploadFile(
  token: string,
  payload: EncryptedPayload,
  existingId?: string
): Promise<DriveFile> {
  const metadata = {
    name: FILE_NAME,
    parents: ["appDataFolder"],
  };

  const boundary = "bookmarkdeck_boundary_" + Math.random().toString(36).slice(2);
  const delimiter = `--${boundary}`;
  const closeDelimiter = `--${boundary}--`;

  const bodyParts = [
    delimiter,
    'Content-Type: application/json; charset=UTF-8',
    "",
    JSON.stringify(metadata),
    delimiter,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(payload),
    closeDelimiter,
    "",
  ].join("\r\n");

  const method = existingId ? "PATCH" : "POST";
  const uploadUrl = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

  const res = await fetch(uploadUrl, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: bodyParts,
  });

  if (!res.ok) {
    throw new Error("Failed to upload to Drive");
  }
  return res.json();
}

export type CloudBookmarks = { bookmarks: Bookmark[]; modifiedAt?: string };

export async function downloadBookmarksFromDrive(
  passphrase: string
): Promise<CloudBookmarks | null> {
  const token = await getAccessToken("consent");
  const file = await findExistingFile(token);
  if (!file) return null;

  const encrypted = await downloadFile(token, file.id);
  if (!encrypted) return null;

  const decrypted = await decryptJson<CloudBookmarks>(passphrase, encrypted);
  return { ...decrypted, modifiedAt: file.modifiedTime };
}

export async function uploadBookmarksToDrive(
  passphrase: string,
  bookmarks: Bookmark[]
): Promise<void> {
  const token = await getAccessToken("consent");
  const existing = await findExistingFile(token);
  const payload = await encryptJson(passphrase, {
    bookmarks,
    updatedAt: new Date().toISOString(),
  });
  await uploadFile(token, payload, existing?.id);
}
