"use client";

import { useState, type ReactNode } from "react";

import { Modal } from "@/components/Modal";
import { X } from "@/components/icons";
import { isValidPin } from "@/lib/appLock/appLock";
import { SECTION_LABEL_CLASS } from "@/components/ui/SectionLabel";

type AppLockModalProps = {
  open: boolean;
  enabled: boolean;
  hasBiometric: boolean;
  biometricAvailable: boolean;
  onEnablePin: (pin: string) => Promise<boolean>;
  onAddBiometric: () => Promise<boolean>;
  onRemoveBiometric: () => void;
  onDisable: () => void;
  onLockNow: () => void;
  onClose: () => void;
  /** The heading and blurb — My Stuff's by default; Filing words its own (it hides papers, not a page). */
  title?: string;
  description?: ReactNode;
  /** What "Lock now" is called, when it does more than lock (Filing also closes the vault). */
  lockNowLabel?: string;
};

const fieldClass =
  "w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-center text-lg tracking-[0.3em] text-slate-100 placeholder:tracking-normal placeholder:text-slate-500 focus:border-blue-400 focus:outline-none";

export function AppLockModal({
  open,
  enabled,
  hasBiometric,
  biometricAvailable,
  onEnablePin,
  onAddBiometric,
  onRemoveBiometric,
  onDisable,
  onLockNow,
  onClose,
  title = "Lock My Stuff",
  description = (
    <>
      A quick privacy screen so a passer-by can&apos;t browse your inventory on
      an unlocked device. It isn&apos;t encryption — your sign-in is still what
      keeps your data yours.
    </>
  ),
  lockNowLabel = "Lock now",
}: AppLockModalProps) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [changing, setChanging] = useState(false); // enabled + editing the PIN
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const showPinForm = !enabled || changing;
  const pinOk = isValidPin(pin) && pin === confirm;

  const resetForm = () => {
    setPin("");
    setConfirm("");
    setChanging(false);
    setMsg(null);
  };

  const close = () => {
    resetForm();
    onClose();
  };

  const savePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinOk || busy) return;
    setBusy(true);
    await onEnablePin(pin);
    setBusy(false);
    setPin("");
    setConfirm("");
    setChanging(false);
    setMsg(enabled ? "PIN updated." : "Lock is on.");
  };

  const addBiometric = async () => {
    setBusy(true);
    setMsg(null);
    const ok = await onAddBiometric();
    setBusy(false);
    setMsg(ok ? "Biometric unlock added." : "Couldn't add biometric unlock on this device.");
  };

  return (
    <Modal
      open={open}
      onClose={close}
      label={title}
      panelClassName="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-50">
          🔒 {title}
        </h2>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition hover:text-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">{description}</p>

      {showPinForm ? (
        <form onSubmit={savePin} className="mt-4 flex flex-col gap-2">
          <label className="block">
            <span className={`mb-1 block ${SECTION_LABEL_CLASS}`}>
              {enabled ? "New PIN" : "Choose a PIN"} (4–8 digits)
            </span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="••••"
              aria-label="New PIN"
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className={`mb-1 block ${SECTION_LABEL_CLASS}`}>
              Confirm PIN
            </span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="••••"
              aria-label="Confirm PIN"
              className={fieldClass}
            />
          </label>
          {confirm.length > 0 && pin !== confirm && (
            <p className="text-xs text-amber-300/90">PINs don&apos;t match yet.</p>
          )}
          <div className="mt-1 flex gap-2">
            <button
              type="submit"
              disabled={!pinOk || busy}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {enabled ? "Update PIN" : "Turn on lock"}
            </button>
            {changing && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:text-slate-100"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              onLockNow();
              close();
            }}
            className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            🔒 {lockNowLabel}
          </button>

          {biometricAvailable &&
            (hasBiometric ? (
              <button
                type="button"
                onClick={onRemoveBiometric}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500"
              >
                Remove biometric unlock
              </button>
            ) : (
              <button
                type="button"
                onClick={addBiometric}
                disabled={busy}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300 disabled:opacity-50"
              >
                👆 Add biometric unlock
              </button>
            ))}

          <button
            type="button"
            onClick={() => setChanging(true)}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500"
          >
            Change PIN
          </button>
          <button
            type="button"
            onClick={() => {
              onDisable();
              setMsg("Lock turned off.");
            }}
            className="rounded-lg border border-slate-800 px-4 py-2 text-sm font-medium text-red-300/90 transition hover:border-red-500/40 hover:bg-red-500/5"
          >
            Turn off lock
          </button>
        </div>
      )}

      {msg && <p className="mt-3 text-center text-xs text-slate-400">{msg}</p>}
    </Modal>
  );
}

export default AppLockModal;
