"use client";

import { useEffect } from "react";

import { useToast } from "@/components/toast/ToastProvider";
import { SAVE_FAILED } from "@/features/notes/hooks/useNotes";

/** Shows a toast when the cloud refuses a note for good (useNotes' SAVE_FAILED). */
export function useSaveFailedToast() {
  const { toast } = useToast();
  useEffect(() => {
    const onFailed = (e: Event) => {
      const title = (e as CustomEvent<{ title?: string }>).detail?.title?.trim();
      toast(
        title
          ? `Couldn't save “${title}” — the cloud refused it.`
          : "Couldn't save a note — the cloud refused it.",
        { variant: "error" }
      );
    };
    window.addEventListener(SAVE_FAILED, onFailed);
    return () => window.removeEventListener(SAVE_FAILED, onFailed);
  }, [toast]);
}
