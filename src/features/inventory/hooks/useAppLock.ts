"use client";

import { useAppLock as useSharedAppLock } from "@/lib/appLock/useAppLock";

// My Stuff's lock: the shared device lock under its own key, unchanged since it lived here.
const STORAGE_BASE = "bookmarkdeck:inventory:lock:v1";

export function useAppLock(email: string | null | undefined) {
  return useSharedAppLock(STORAGE_BASE, email);
}
