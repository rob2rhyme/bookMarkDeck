"use client";

// The Filing PIN lock's face: one line saying what it is doing about confidential papers, and
// the dialog that opens them. A privacy screen for a passer-by — NOT encryption (the paper's
// title is plaintext in storage; its reference and note are sealed by the vault passphrase,
// which is a separate thing). See lib/confidential.ts for what is and is not hidden.

import { useState } from "react";

import { Modal } from "@/components/Modal";
import { PinUnlockForm } from "@/components/appLock/PinUnlockForm";

const BAR = "mx-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 text-[13px] sm:mx-0";
const BUTTON =
  "shrink-0 rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-blue-400 hover:text-blue-300";

export function ConfidentialBar({
  ready,
  enabled,
  locked,
  count,
  hasBiometric,
  biometricAvailable,
  onUnlockPin,
  onUnlockBiometric,
  onReset,
  onLockNow,
  onManage,
}: {
  /** The lock's settings have been read; before that we don't know whether one exists. */
  ready: boolean;
  /** A PIN has been set. */
  enabled: boolean;
  /** The lock is on right now, so confidential papers are hidden. */
  locked: boolean;
  /** How many confidential papers exist (hidden or not). */
  count: number;
  hasBiometric: boolean;
  biometricAvailable: boolean;
  onUnlockPin: (pin: string) => Promise<boolean>;
  onUnlockBiometric: () => Promise<boolean>;
  onReset: () => void;
  onLockNow: () => void;
  onManage: () => void;
}) {
  const [unlocking, setUnlocking] = useState(false);
  const papers = `${count} confidential paper${count === 1 ? "" : "s"}`;

  // Unlocking closes the dialog; clearing `unlocking` too, or the next lock would pop it open again.
  const unlockPin = async (pin: string) => {
    const ok = await onUnlockPin(pin);
    if (ok) setUnlocking(false);
    return ok;
  };
  const unlockBiometric = async () => {
    const ok = await onUnlockBiometric();
    if (ok) setUnlocking(false);
    return ok;
  };

  const unlockDialog = (
    <Modal
      open={unlocking && locked}
      onClose={() => setUnlocking(false)}
      label="Unlock confidential papers"
      panelClassName="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <div className="flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950 text-xl">
          🔒
        </div>
        <h2 className="mt-3 text-lg font-semibold text-slate-100">Unlock confidential papers</h2>
        <p className="mt-1 max-w-xs text-sm text-slate-500">
          Enter your PIN to show {papers} on this device. Their reference and note stay sealed until you
          unlock your vault.
        </p>
        <PinUnlockForm
          hasBiometric={hasBiometric}
          biometricAvailable={biometricAvailable}
          onUnlockPin={unlockPin}
          onUnlockBiometric={unlockBiometric}
          onReset={() => {
            onReset();
            setUnlocking(false);
          }}
          resetCopy="Resetting turns off the PIN and shows your confidential papers. Nothing is deleted. Continue?"
        />
      </div>
    </Modal>
  );

  if (!ready) return null;

  if (!enabled) {
    if (count === 0) return null;
    return (
      <div className={`${BAR} border-slate-800 bg-slate-900/40 text-slate-400`}>
        <span aria-hidden>🔒</span>
        <span className="min-w-0 flex-1">
          {papers} — set a PIN to hide {count === 1 ? "it" : "them"} from the list when you step away.
        </span>
        <button type="button" onClick={onManage} className={BUTTON}>
          Set a PIN
        </button>
      </div>
    );
  }

  if (locked) {
    if (count === 0) return null;
    return (
      <>
        <div className={`${BAR} border-blue-500/30 bg-blue-500/5 text-slate-300`} role="status">
          <span aria-hidden>🔒</span>
          <span className="min-w-0 flex-1">{papers} hidden.</span>
          <button type="button" onClick={() => setUnlocking(true)} className={BUTTON}>
            Unlock
          </button>
        </div>
        {unlockDialog}
      </>
    );
  }

  return (
    <div className={`${BAR} border-slate-800 bg-slate-900/40 text-slate-400`} role="status">
      <span aria-hidden>🔓</span>
      <span className="min-w-0 flex-1">
        {count > 0 ? `${papers} showing.` : "PIN lock is on. Confidential papers will be hidden when it locks."}
      </span>
      <button type="button" onClick={onLockNow} className={BUTTON}>
        Lock now
      </button>
    </div>
  );
}
