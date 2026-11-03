"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/Modal";
import { X } from "@/components/icons";
import { Select } from "@/components/ui/Field";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { pushSupported, requestPushPermission, usePushPermission } from "@/lib/push";
import type { InventorySettings } from "@/features/inventory/lib/types";
import { nativeRemindersAvailable, requestNativeReminderPermission } from "@/features/inventory/lib/nativeReminders";

const HOURS = Array.from({ length: 24 }, (_, h) => h);

const hourLabel = (h: number) => {
  const suffix = h < 12 ? "am" : "pm";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:00 ${suffix}`;
};

export function RemindersModal({
  open,
  onClose,
  settings,
  onChange,
  localReminders,
}: {
  open: boolean;
  onClose: () => void;
  settings: InventorySettings;
  onChange: (patch: Partial<InventorySettings>) => void;
  /** The on-device (native app) reminders' per-device switch. */
  localReminders?: { on: boolean; set: (on: boolean) => void };
}) {
  const canPush = pushSupported();
  const permission = usePushPermission();
  // Offered only inside the native app, where the plugin exists; asked once.
  const [native, setNative] = useState(false);
  const [localDenied, setLocalDenied] = useState(false);
  useEffect(() => {
    let alive = true;
    void nativeRemindersAvailable().then((ok) => alive && setNative(ok));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Modal
      open={open}
      onClose={onClose}
      label="Reminders"
      panelClassName="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-50">🔔 Reminders</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <label className="mt-4 flex items-start gap-3">
        <input
          type="checkbox"
          checked={settings.pushEnabled}
          disabled={!canPush}
          onChange={async (e) => {
            const on = e.target.checked;
            // Ask here, in the click — never from the digest's page-load effect.
            if (on) await requestPushPermission();
            onChange({ pushEnabled: on });
          }}
          className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500"
        />
        <span className="min-w-0">
          <span className="text-sm font-medium text-slate-200">Daily summary notification</span>
          <span className="mt-0.5 block text-[12px] text-slate-500">
            {canPush
              ? "One notification a day for warranties ending, use-by dates, upkeep, renewals, overdue loans and low stock — not one per item."
              : "Not available in this browser, or notifications aren’t set up on this deployment."}
          </span>
        </span>
      </label>

      {native && localReminders && (
        <label className="mt-5 flex items-start gap-3 border-t border-slate-800 pt-4">
          <input
            type="checkbox"
            checked={localReminders.on}
            onChange={async (e) => {
              const on = e.target.checked;
              setLocalDenied(false);
              if (!on) return localReminders.set(false);
              // Ask here, in the tap — never when the page loads.
              if (await requestNativeReminderPermission()) localReminders.set(true);
              else setLocalDenied(true);
            }}
            className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500"
          />
          <span className="min-w-0">
            <span className="text-sm font-medium text-slate-200">Remind me on this phone</span>
            <span className="mt-0.5 block text-[12px] text-slate-500">
              A notification at 9:00 for each date: 2 weeks before a warranty ends, 3 days before a
              use-by or renewal, the day before upkeep, and the day a loan is due. Set on the phone
              itself, so it works offline and weeks ahead.
            </span>
            {localDenied && (
              <span className="mt-1 block text-[12px] text-amber-300/90">
                Notifications are off for this app. Allow them in Settings, then try again.
              </span>
            )}
          </span>
        </label>
      )}

      {settings.pushEnabled && canPush && (
        <div className="mt-3 pl-7">
          {/* The setting syncs across devices; permission is per device. */}
          {permission === "default" && (
            <button
              type="button"
              onClick={() => void requestPushPermission()}
              className="mb-3 rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
            >
              Allow notifications on this device
            </button>
          )}
          {permission === "denied" && (
            <p className="mb-3 text-[12px] text-amber-300/90">
              Notifications are blocked for this site on this device. Allow them in your
              browser&rsquo;s site settings to get the summary here.
            </p>
          )}
          <SectionLabel>Send it around</SectionLabel>
          <Select
            value={String(settings.pushHour)}
            onChange={(e) => onChange({ pushHour: Number(e.target.value) })}
            aria-label="Notification hour"
            className="mt-1"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </Select>
          <p className="mt-2 text-[12px] text-slate-500">
            Scheduled when you open My Stuff, up to a day ahead. If you don&rsquo;t open the
            app for a while the summary pauses until you do — the badge and the Attention
            panel are always current.
          </p>
        </div>
      )}
    </Modal>
  );
}
