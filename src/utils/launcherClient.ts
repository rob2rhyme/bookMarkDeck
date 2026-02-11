//src/utils/launcherClient.ts
"use client";

const LAUNCHER_HOST =
  process.env.NEXT_PUBLIC_LAUNCHER_HOST?.trim() || "127.0.0.1";
const LAUNCHER_PORT = Number(process.env.NEXT_PUBLIC_LAUNCHER_PORT) || 47831;

const DEFAULT_TIMEOUT_MS = 1500;

type LauncherTarget = {
  localPath?: string;
  bundleId?: string;
  appUserModelId?: string;
};

function getBaseUrl() {
  return `http://${LAUNCHER_HOST}:${LAUNCHER_PORT}`;
}

function getHostPort() {
  return `${LAUNCHER_HOST}:${LAUNCHER_PORT}`;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function isConnectionError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("connection refused") ||
    message.includes("err_connection_refused") ||
    message.includes("load failed")
  );
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

export function ensureLauncherToken(): string {
  if (typeof window === "undefined") {
    throw new Error("Launcher token unavailable outside the browser.");
  }
  const token = process.env.NEXT_PUBLIC_BOOKMARKDECK_LAUNCHER_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "Launcher token missing. Set NEXT_PUBLIC_BOOKMARKDECK_LAUNCHER_TOKEN in .env.local and restart the dev server."
    );
  }
  return token;
}

export async function launcherHealth(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const url = `${getBaseUrl()}/health`;
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "GET",
        mode: "cors",
        cache: "no-store",
      },
      DEFAULT_TIMEOUT_MS
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function launcherOpen(target: LauncherTarget): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Native open is only available in the browser.");
  }
  const token = ensureLauncherToken();
  const url = `${getBaseUrl()}/open`;

  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "application/json",
          "X-BookmarkDeck-Token": token,
        },
        body: JSON.stringify(target),
      },
      DEFAULT_TIMEOUT_MS
    );

    if (res.status === 401) {
      throw new Error(
        "Launcher token mismatch. The web token (NEXT_PUBLIC_BOOKMARKDECK_LAUNCHER_TOKEN) must match the launcher token (BOOKMARKDECK_LAUNCHER_TOKEN used to start Electron)."
      );
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).trim();
      throw new Error(detail || "Launcher failed to open the app.");
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(
        `Launcher timed out. Is it running on ${getHostPort()}?`
      );
    }
    if (isConnectionError(error)) {
      throw new Error(
        "Launcher not reachable. Start the local launcher and try again."
      );
    }
    throw new Error("Launcher request failed.");
  }
}
