//src/utils/launcherClient.ts
"use client";

const TOKEN_KEY = "bookmarkdeck:launcherToken:v1";

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

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
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
  const existing = window.localStorage.getItem(TOKEN_KEY);
  if (existing && existing.trim()) return existing.trim();
  const entered = window.prompt(
    "Enter the Bookmark Deck launcher token to pair this device:"
  );
  if (!entered || !entered.trim()) {
    throw new Error("Launcher token is required to open native apps.");
  }
  window.localStorage.setItem(TOKEN_KEY, entered.trim());
  return entered.trim();
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
      throw new Error("Launcher rejected the token. Check your pairing token.");
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(detail || "Launcher failed to open the app.");
    }
  } catch (error) {
    const message = toErrorMessage(
      error,
      "Failed to reach the launcher. Is it running on this device?"
    );
    if (message.toLowerCase().includes("abort")) {
      throw new Error("Launcher timed out. Is it running on 127.0.0.1?");
    }
    throw new Error(message);
  }
}
