"use client";

// Asking for the vault: a page that wants to lock something calls `ensure()` and gets
// back "yes, a vault is open now" — after the user has set one up (first time) or
// unlocked it, in the shared dialog, if that was needed. Notes drives the same two
// forms by hand inside its editor; this is the reusable shape for the rest.

import { useCallback, useRef, useState, type ReactNode } from "react";

import { Modal } from "@/components/Modal";
import { SetupForm, UnlockForm, type VaultSubject } from "@/components/vault/VaultForms";
import { createVault } from "@/lib/vault/vault";
import { addKeys } from "@/lib/vault/vaultSession";
import type { useVaults } from "@/lib/vault/useVaults";

type Vaults = ReturnType<typeof useVaults>;

export function useVaultAccess(
  vault: Vaults,
  subject: VaultSubject,
  /** Heading above the unlock form, e.g. "Unlock to lock this paper". */
  unlockTitle = "Unlock your vault"
): { ensure: () => Promise<boolean>; dialog: ReactNode } {
  const [step, setStep] = useState<"setup" | "unlock" | null>(null);
  const waiter = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    setStep(null);
    waiter.current?.(ok);
    waiter.current = null;
  }, []);

  const { ready, vaults, primaryKid } = vault;
  const ensure = useCallback((): Promise<boolean> => {
    // Until the cloud answers, a vault set up on another device may be on its way;
    // creating a second one meanwhile would split what is locked.
    if (!ready) return Promise.resolve(false);
    if (primaryKid()) return Promise.resolve(true);
    waiter.current?.(false);
    return new Promise<boolean>((resolve) => {
      waiter.current = resolve;
      setStep(vaults.length === 0 ? "setup" : "unlock");
    });
  }, [ready, vaults.length, primaryKid]);

  const createAndUnlock = async (passphrase: string) => {
    const { record, recoveryCode, key } = await createVault(passphrase);
    await vault.putVault(record);
    addKeys([[record.id, key]]);
    return recoveryCode;
  };

  const dialog = (
    <Modal open={step !== null} onClose={() => settle(false)} labelledBy="vault-title">
      {step === "setup" ? (
        <SetupForm subject={subject} onCreate={createAndUnlock} onDone={() => settle(true)} />
      ) : step === "unlock" ? (
        <UnlockForm
          intro={
            <h2 id="vault-title" className="text-lg font-semibold text-slate-50">
              {unlockTitle}
            </h2>
          }
          onUnlock={async (p) => {
            await vault.unlock(p);
            settle(true);
          }}
          onRecover={async (c, p) => {
            await vault.recover(c, p);
            settle(true);
          }}
        />
      ) : null}
    </Modal>
  );

  return { ensure, dialog };
}
