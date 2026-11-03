// src/app/(app)/habits/guide/page.tsx
import Link from "next/link";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Habits guide" };

export default function HabitsGuidePage() {
  return (
    <div className="mx-auto max-w-2xl py-2">
      <Link
        href="/habits"
        className="text-xs text-slate-400 underline-offset-2 transition hover:text-slate-200 hover:underline"
      >
        ← Back to Habits
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-50">
        How habits work
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">
        Habits are the record of consistency — small, repeatable wins that show
        who you&apos;re becoming. It&apos;s calm by design: no shame, no
        leaderboards. A broken streak is a fresh start, not a failure. Most of
        what you need is explained right where you tap — this is the longer
        version.
      </p>
      <p className="mt-4">
        <Link
          href="/habits"
          className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
        >
          Open Habits →
        </Link>
      </p>

      <section className="mt-8 space-y-6 text-sm leading-relaxed text-slate-200">
        <div>
          <h2 className="text-base font-semibold text-slate-50">Add your first habit</h2>
          <p className="mt-1">
            Tap <strong>+ New habit</strong> and just type a name — that&apos;s enough. New habits start as a daily yes/no. An <em>Area</em> (Health, Work…) groups them, and everything else — icon, colour, build or quit, type, schedule, reminder — is under <em>Add details</em> with sensible defaults. Starting from nothing? Pick a few ready-made habits from the templates offered on first run, or <strong>Browse templates</strong> while the list is empty.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-50">Checking off: yes/no vs. measurable</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-300">
            <li>
              <strong>Yes / no</strong> — tap the ring beside the habit to check it off; tap again to un-check.
            </li>
            <li>
              <strong>Measurable</strong> — count toward a daily target (e.g. 8 cups, 20 minutes) with the <strong>− / +</strong> buttons, and the ring fills as you go. Tapping the ring jumps straight to the target.
            </li>
            <li>
              <strong>Quit / reduce</strong> habits flip it round: a day counts when you stay at or under your daily limit.
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-50">Skip, undo and notes</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-300">
            <li>
              <strong>Skip today</strong> (in the ⋮ menu) is for a planned rest day. Skips are <strong>neutral</strong> — they never break a streak or pull down your rate. Tap <em>undo</em> on the card to take a skip back.
            </li>
            <li>
              <strong>↩ Undo</strong> appears on the card right after you change it and reverses that last tap — handy for a mis-tap or one + too many.
            </li>
            <li>
              <strong>Note / time</strong> (⋮ menu) adds a note or the time you did it. It shows on the card, and the 🗒 link in <em>All habits</em> opens every note for that habit. Change the date there to log a past day.
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-50">Streaks</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-300">
            <li>
              Your <strong>current streak</strong> (🔥) is forgiving — today not being done <em>yet</em> doesn&apos;t break it; only a missed scheduled day does.
            </li>
            <li>
              Unscheduled days and skipped days are stepped over, so a Mon–Fri habit keeps its streak across the weekend.
            </li>
            <li>
              <strong>Times-a-week</strong> habits track a weekly streak — hit your weekly target to keep the chain; the week in progress never counts against you.
            </li>
            <li>
              <strong>Strength</strong> (💪) is a slower, kinder measure: one missed day dents it rather than wiping it out.
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-50">Insights & history</h2>
          <p className="mt-1">
            <em>Analysis</em> (under <em>Insights</em> in the section bar) shows your totals at a glance; tap <strong>Show charts &amp; breakdown</strong> for the weekly bars (tap a bar to see that day), your best weekdays, each habit&apos;s 30-day rate (tap one for its streaks and last 14 days), and the <em>Consistency</em> calendar — tap any day to see what you logged, remove a log, or fill in a day you forgot. <em>Habits × Focus</em> shows how your focus time differs on days you do each habit, once you have focus sessions to compare.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-50">Habits that track themselves</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-300">
            <li>
              Some habits fill in from the rest of the app: <strong>water</strong> follows Focus&apos;s cup counter (both ways — a cup logged in either place counts in both), and <strong>journal</strong>, <strong>meditation</strong>, <strong>focus minutes</strong>, <strong>resets</strong> and <strong>items decluttered</strong> in My Stuff mark progress for you.
            </li>
            <li>
              Templates come linked, and a habit whose name fits (&ldquo;Meditate&rdquo;, &ldquo;Deep work&rdquo;…) links itself. See or change it under <em>Add details → Focus sync</em>; <strong>Unlink</strong> stops it.
            </li>
            <li>
              <strong>Start focus</strong> (⋮ menu in <em>All habits</em>) hands the habit to the Focus hub. Finish a session and the habit checks itself off when you come back to Habits that day.
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-50">Reminders, areas & search</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-300">
            <li>
              Set a <strong>reminder</strong> time under <em>Add details</em> for a gentle nudge on scheduled days — and tap <strong>+ Add another time</strong> for up to four a day (a morning prompt and an evening last call, say). Finishing the habit silences the rest of that day&apos;s reminders. The first time, tap <strong>Turn on reminders</strong> to let this device show notifications.
            </li>
            <li>
              Not now? Tap <strong>Snooze 1 hour</strong> on the notification and it comes back — and goes quiet if you finish the habit in the meantime. Android and desktop browsers show the button; iPhones don&apos;t, so there it just opens the app.
            </li>
            <li>
              <strong>Health data</strong> (under the list): import an Apple Health <code>export.zip</code> (Health app → your picture → Export All Health Data — pick the ZIP as it is), a Google Takeout Fit download, or a simple CSV, and link habits to <em>steps</em>, <em>exercise minutes</em>, <em>sleep</em> or <em>mindful minutes</em> with a bar of your choice (&ldquo;Walk&rdquo; = 8,000 steps). Days that reach it are marked done. The file is read in your browser and never uploaded, the numbers aren&apos;t kept, days you&apos;ve already logged are never touched, and <em>Undo</em> takes the marks back. It&apos;s an import, not a live feed — repeat it whenever you like.
            </li>
            <li>
              Filter <em>All habits</em> by <strong>area</strong>, or search by name — tap ✓ in the results to log it straight away.
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-50">Sync & managing</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-300">
            <li>
              <strong>Your habits save on this device instantly</strong> and sync to your account so they follow you to other devices. If sync isn&apos;t connected you&apos;ll see <em>Your habits stay on this device</em> with a <em>Sign in to sync</em> button — one tap connects it, and anything logged meanwhile goes up then. Your habit data is private to you.
            </li>
            <li>
              <strong>Edit, archive or delete</strong> from the ⋮ menu in <em>All habits</em>. Archiving keeps the history: <strong>Show archived</strong> lists them, with <strong>Restore</strong> to bring one back.
            </li>
            <li>
              <strong>Export</strong> your habits as CSV or JSON, and <strong>Import</strong> a JSON backup — importing only adds what&apos;s missing and never overwrites what&apos;s here.
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
