"use client";

import { PinUnlockForm } from "@/components/appLock/PinUnlockForm";

type AppLockGateProps = {
  hasBiometric: boolean;
  biometricAvailable: boolean;
  onUnlockPin: (pin: string) => Promise<boolean>;
  onUnlockBiometric: () => Promise<boolean>;
  onReset: () => void;
};

/**
 * Full-area unlock screen for My Stuff. Shown in place of the dashboard while
 * locked. PIN entry with an optional biometric shortcut, and an honest reset
 * escape hatch (clears the lock and reveals — the copy says so). The form itself
 * is shared (`PinUnlockForm`); this is the page around it.
 */
export function AppLockGate(props: AppLockGateProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-2xl">
        🔒
      </div>
      <h2 className="mt-4 text-lg font-semibold text-slate-100">My Stuff is locked</h2>
      <p className="mt-1 max-w-xs text-sm text-slate-500">
        Enter your PIN to open your inventory on this device.
      </p>
      <PinUnlockForm
        {...props}
        resetCopy="Resetting turns off the lock and reveals your inventory. Your items aren't deleted. Continue?"
      />
    </div>
  );
}

export default AppLockGate;
