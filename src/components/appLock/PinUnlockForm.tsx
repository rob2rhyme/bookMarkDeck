"use client";

// The PIN (and optional biometric) entry, with an honest "forgot it" escape hatch. Shared by
// My Stuff's full-page gate and Filing's unlock dialog: the chrome around it differs, the
// form does not.

import { useEffect, useRef, useState } from "react";

import { isValidPin } from "@/lib/appLock/appLock";

export type PinUnlockFormProps = {
  hasBiometric: boolean;
  biometricAvailable: boolean;
  onUnlockPin: (pin: string) => Promise<boolean>;
  onUnlockBiometric: () => Promise<boolean>;
  onReset: () => void;
  /** Said before the reset is confirmed — it must state what is revealed and that nothing is deleted. */
  resetCopy: string;
};

export function PinUnlockForm({
  hasBiometric,
  biometricAvailable,
  onUnlockPin,
  onUnlockBiometric,
  onReset,
  resetCopy,
}: PinUnlockFormProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const showBiometric = hasBiometric && biometricAvailable;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const tryBiometric = async () => {
    setBusy(true);
    setError(false);
    const ok = await onUnlockBiometric();
    setBusy(false);
    if (!ok) inputRef.current?.focus();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidPin(pin) || busy) {
      setError(true);
      return;
    }
    setBusy(true);
    const ok = await onUnlockPin(pin);
    setBusy(false);
    if (ok) {
      setPin("");
      setError(false);
    } else {
      setError(true);
      setPin("");
      inputRef.current?.focus();
    }
  };

  return (
    <>
      {showBiometric && (
        <button
          type="button"
          onClick={tryBiometric}
          disabled={busy}
          className="mt-5 flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          👆 Unlock with biometrics
        </button>
      )}

      <form onSubmit={submit} className="mt-5 flex w-full max-w-[15rem] flex-col gap-2">
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, "").slice(0, 8));
            setError(false);
          }}
          placeholder="••••"
          aria-label="PIN"
          aria-invalid={error}
          className={`w-full rounded-lg border bg-slate-950/60 px-3 py-2 text-center text-lg tracking-[0.4em] text-slate-100 placeholder:tracking-normal focus:outline-none ${
            error ? "border-red-500/60 focus:border-red-400" : "border-slate-700 focus:border-blue-400"
          }`}
        />
        {error && <p className="text-xs text-red-300">That PIN didn&apos;t match. Try again.</p>}
        <button
          type="submit"
          disabled={busy || !isValidPin(pin)}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>

      <div className="mt-6 text-xs text-slate-600">
        {confirmingReset ? (
          <span className="flex flex-col items-center gap-2">
            <span className="max-w-xs text-slate-500">{resetCopy}</span>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={onReset}
                className="rounded-full border border-red-500/40 px-3 py-1 font-medium text-red-300 transition hover:bg-red-500/10"
              >
                Reset &amp; reveal
              </button>
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                className="rounded-full border border-slate-700 px-3 py-1 text-slate-300 transition hover:text-slate-100"
              >
                Cancel
              </button>
            </span>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingReset(true)}
            className="underline decoration-slate-700 underline-offset-2 transition hover:text-slate-400"
          >
            Forgot your PIN?
          </button>
        )}
      </div>
    </>
  );
}
