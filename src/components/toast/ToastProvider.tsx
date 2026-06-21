"use client";

// Unified toast system. A single provider holds the queue; `useToast()` exposes
// `toast()` / `dismiss()` anywhere in the tree, and <ToastHost> renders the
// stack (bottom-center, above modals). Replaces ad-hoc inline notifications.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type ToastVariant = "default" | "success" | "error";

type ToastAction = { label: string; onClick: () => void };

export type Toast = {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
  duration: number; // ms; 0 = sticky
};

type ToastOptions = {
  variant?: ToastVariant;
  action?: ToastAction;
  duration?: number;
};

type ToastContextValue = {
  toast: (message: string, opts?: ToastOptions) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 4;
const DEFAULT_DURATION = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message: string, opts: ToastOptions = {}) => {
      const id = crypto.randomUUID();
      const duration = opts.duration ?? DEFAULT_DURATION;
      const entry: Toast = {
        id,
        message,
        variant: opts.variant ?? "default",
        action: opts.action,
        duration,
      };
      setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), entry]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration)
        );
      }
      return id;
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fail soft: a missing provider shouldn't crash a feature. No-op toasts.
    return { toast: () => "", dismiss: () => {} };
  }
  return ctx;
}

const VARIANT_STYLE: Record<ToastVariant, string> = {
  default: "border-slate-700 bg-slate-900/95 text-slate-100",
  success: "border-emerald-600/50 bg-slate-900/95 text-emerald-100",
  error: "border-red-600/50 bg-slate-900/95 text-red-100",
};

function ToastHost({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-5 z-[80] flex flex-col items-center gap-2 px-4"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex w-full max-w-sm items-center justify-between gap-3 rounded-xl border px-4 py-2.5 shadow-lg backdrop-blur ${VARIANT_STYLE[t.variant]}`}
        >
          <span className="min-w-0 text-sm">{t.message}</span>
          <div className="flex shrink-0 items-center gap-2">
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  onDismiss(t.id);
                }}
                className="text-sm font-medium text-blue-300 transition hover:text-blue-200"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss"
              className="text-slate-500 transition hover:text-slate-300"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
