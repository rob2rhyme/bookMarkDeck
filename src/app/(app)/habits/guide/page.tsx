// src/app/(app)/habits/guide/page.tsx
import Link from "next/link";

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
          <h2 className="text-base font-semibold text-slate-50">
            Add your first habit
          </h2>
          <p className="mt-1">
            Tap <strong>+ New habit</strong> and just type a name — that&apos;s
            enough. Everything else (icon, colour, type, schedule, reminder) is
            tucked under <em>Add details</em> with sensible defaults, so you can
            start in seconds and fine-tune later. Or pick a ready-made one from
            the templates on first run.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-slate-50">
            Yes/no vs. measurable
          </h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-300">
            <li>
              <strong>Yes / no</strong> — one tap: did it or not (e.g.
              &ldquo;Meditate&rdquo;). Tap <strong>Done</strong> to check it off.
            </li>
            <li>
              <strong>Measurable</strong> — count toward a daily target (e.g. 8
              cups, 20 minutes). Use the <strong>− / +</strong> buttons; the ring
              fills as you go.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-base font-semibold text-slate-50">
            Skip vs. undo
          </h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-300">
            <li>
              <strong>Skip</strong> (in the ⋯ menu) is for a planned rest day.
              Skips are <strong>neutral</strong> — they never break a streak and
              never count against you.
            </li>
            <li>
              <strong>Undo</strong> reverses an accidental tap and clears
              today&apos;s entry entirely, as if it never happened.
            </li>
            <li>
              Add a <strong>note or time</strong> from the ⋯ menu — it shows on
              the card and in the day detail.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-base font-semibold text-slate-50">Streaks</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-300">
            <li>
              Your <strong>current streak</strong> is forgiving — today not being
              done <em>yet</em> doesn&apos;t break it; only a missed scheduled day
              does.
            </li>
            <li>
              Unscheduled days and skipped days are stepped over, so a Mon–Fri
              habit keeps its streak across the weekend.
            </li>
            <li>
              <strong>Times-a-week</strong> habits track a weekly streak — hit
              your weekly target to keep the chain.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-base font-semibold text-slate-50">
            Insights &amp; history
          </h2>
          <p className="mt-1">
            Charts stay hidden until you&apos;ve logged a few days (no wall of
            zeros). Once they appear, expand <em>Insights &amp; history</em> for
            your weekly bars, best weekdays, per-habit 30-day rate, and a
            year-long consistency heatmap — tap any day to see exactly what you
            did. Prefer the all-in-one layout? Switch to <strong>Classic</strong>
            from the toggle at the top.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-slate-50">
            Sync &amp; managing
          </h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-300">
            <li>
              <strong>Sync is automatic.</strong> Habits save on your device
              instantly; when you&apos;re signed in they sync to your account and
              follow you across devices. The chip up top shows the live status.
              Your habit data is private to you.
            </li>
            <li>
              <strong>Edit, archive, or delete</strong> from the ⋯ menu next to
              each habit in <em>Your habits</em>. Archiving keeps the history;
              restore anytime from the Classic view.
            </li>
            <li>
              <strong>Start a focus session</strong> from the ⋯ menu — it hands
              the habit to the Focus hub to work on now, and checks it off when
              you finish.
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
