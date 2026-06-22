// src/app/(app)/habits/guide/page.tsx
import Link from "next/link";

import LegalPageLayout from "@/components/LegalPageLayout";

export default function HabitsGuidePage() {
  return (
    <LegalPageLayout title="Habits — Guide" lastUpdated="June 21, 2026">
      <p className="text-sm leading-relaxed text-slate-300">
        Habits is the third pillar of Bookmark Deck — after your{" "}
        <strong>bookmarks</strong> (resources) and{" "}
        <strong>focus</strong> sessions (the work), habits are the record of
        consistency: small, repeatable wins that show who you&apos;re becoming.
        It&apos;s calm by design — no shame, no leaderboards. A broken streak is
        a fresh start, not a failure.
      </p>
      <p className="mt-3">
        <Link
          href="/habits"
          className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
        >
          Open Habits →
        </Link>
      </p>

      {/* ------------------------------------------------------- USER GUIDE -- */}
      <h2 className="mt-8 border-b border-slate-800/60 pb-2 text-xl font-semibold text-slate-50">
        Using Habits
      </h2>

      <section className="mt-4 space-y-6 text-sm leading-relaxed text-slate-200">
        <div>
          <h3 className="text-base font-semibold text-slate-50">Create a habit</h3>
          <p className="mt-1">
            Tap <strong>+ New habit</strong> (or pick from the starter templates
            on first run). For each habit you choose:
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-300">
            <li>
              <strong>Type</strong> — <em>Yes / no</em> (a simple one-tap habit) or{" "}
              <em>Measurable</em> (a value toward a daily target, e.g. 8 cups, 20
              minutes). Measurable habits get a target, unit, and a +/- step.
            </li>
            <li>
              <strong>Schedule</strong> — <em>Every day</em>,{" "}
              <em>Specific days</em> (choose weekdays), or{" "}
              <em>× / week</em> (a flexible weekly target you can hit on any
              days).
            </li>
            <li>
              <strong>Identity</strong> (optional) — &ldquo;become someone
              who…&rdquo;. Every check-in is a small vote for that identity.
            </li>
            <li>
              <strong>Icon &amp; colour</strong> — a quick visual anchor.
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-base font-semibold text-slate-50">Log your day</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-300">
            <li>
              <strong>Complete</strong> — tap the ring on a habit. Measurable
              habits use the <strong>+ / −</strong> buttons to count up; the ring
              fills toward the target.
            </li>
            <li>
              <strong>Skip</strong> — tap <em>Skip</em> for a planned rest day.
              Skips are <strong>neutral</strong>: they never break a streak and
              never count against you.
            </li>
            <li>
              <strong>Note &amp; time</strong> — tap the note icon to add a short
              note (&ldquo;felt great&rdquo;) and an optional time. They show on
              the card and in the day detail.
            </li>
            <li>
              Completed habits drop into a <em>Done &amp; skipped</em> group so
              the list stays focused on what&apos;s left.
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-base font-semibold text-slate-50">Streaks</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-300">
            <li>
              Your <strong>current streak</strong> is forgiving — today not being
              done yet doesn&apos;t break it; only a missed scheduled day does.
            </li>
            <li>
              Days the habit isn&apos;t scheduled (and skipped days) are skipped
              over, so a Mon–Fri habit keeps its streak across the weekend.
            </li>
            <li>
              <em>× / week</em> habits track a <strong>weekly</strong> streak —
              hit your weekly target to keep the chain.
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-base font-semibold text-slate-50">Analysis dashboard</h3>
          <p className="mt-1">Scroll down on the Habits page for:</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-300">
            <li><strong>Summary</strong> — habits, active streaks, best streak, total check-ins.</li>
            <li><strong>This week</strong> — a bar per day showing how much you completed; page back through previous weeks.</li>
            <li><strong>Best days</strong> — your completion rate by weekday over the last 12 weeks.</li>
            <li><strong>By habit</strong> — each habit&apos;s 30-day completion rate and current streak.</li>
            <li><strong>Consistency heatmap</strong> — a year of check-ins; tap any day to see exactly what you did, including notes.</li>
          </ul>
        </div>

        <div>
          <h3 className="text-base font-semibold text-slate-50">Manage &amp; connect</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-300">
            <li><strong>Edit / archive / delete</strong> from the <em>All habits</em> list. Archiving keeps the history; restore anytime.</li>
            <li><strong>Start a focus session</strong> — the timer icon hands the habit off to the Focus hub to work on it now.</li>
            <li><strong>Sync</strong> — habits save on your device instantly and sync to your account when connected, so they follow you across devices. Habit data is private to you.</li>
          </ul>
        </div>
      </section>

      {/* -------------------------------------------------- DEVELOPER GUIDE -- */}
      <h2 className="mt-10 border-b border-slate-800/60 pb-2 text-xl font-semibold text-slate-50">
        How it works (for developers)
      </h2>

      <section className="mt-4 space-y-6 text-sm leading-relaxed text-slate-200">
        <div>
          <h3 className="text-base font-semibold text-slate-50">Isolation</h3>
          <p className="mt-1">
            The feature is self-contained under{" "}
            <code>src/features/habits/</code> plus the{" "}
            <code>/habits</code> route, mirroring the focus feature. Shared-file
            touches are additive only: a nav entry in{" "}
            <code>AppShell.tsx</code>, a <code>Repeat</code> icon in{" "}
            <code>icons.tsx</code>, and two members on the focus{" "}
            <code>ActivityType</code> union. Removing the feature = delete the
            folder, the route, and those few additive lines.
          </p>
        </div>

        <div>
          <h3 className="text-base font-semibold text-slate-50">Data model (Firestore)</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-300">
            <li><code>users/&#123;uid&#125;/habits/&#123;habitId&#125;</code> — habit definitions.</li>
            <li><code>users/&#123;uid&#125;/habitEntries/&#123;habitId&#125;_&#123;YYYY-MM-DD&#125;</code> — one per-day log (deterministic id ⇒ idempotent, offline-safe). Holds <code>status</code> (done/skipped), <code>count</code>, optional <code>note</code> + <code>at</code>.</li>
            <li>No new security rule — the repo&apos;s recursive owner rule (<code>match /users/&#123;uid&#125;/&#123;document=**&#125;</code>) already scopes it. See <code>src/features/habits/FIRESTORE_RULES.md</code>.</li>
          </ul>
        </div>

        <div>
          <h3 className="text-base font-semibold text-slate-50">Streak engine (derive, don&apos;t store)</h3>
          <p className="mt-1">
            <code>lib/streak.ts</code> computes all stats purely from the entry
            log + schedule — streaks are never a stored counter that can drift.
            <code> isDueOn()</code> decides scheduling; a day is a success when an
            entry is <code>done</code> and its <code>count</code> meets the
            target. Day keys are local <code>YYYY-MM-DD</code> via{" "}
            <code>lib/day.ts</code> (DST-safe). Covered by{" "}
            <code>lib/streak.test.ts</code> and <code>lib/insights.test.ts</code>.
          </p>
        </div>

        <div>
          <h3 className="text-base font-semibold text-slate-50">State &amp; sync</h3>
          <p className="mt-1">
            <code>hooks/useHabits.ts</code> owns state: hydration-safe{" "}
            <code>localStorage</code> cache, optimistic writes, and a live{" "}
            <code>onSnapshot</code> (entries windowed to ~13 months) through{" "}
            <code>data/habitData.ts</code>. <code>hooks/useHabitSync.ts</code>{" "}
            reflects the Firebase auth session. Pure helpers:{" "}
            <code>serialize.ts</code>, <code>insights.ts</code>,{" "}
            <code>templates.ts</code>, <code>format.ts</code>.
          </p>
        </div>

        <div>
          <h3 className="text-base font-semibold text-slate-50">Components</h3>
          <p className="mt-1">
            <code>HabitsDashboard</code> composes <code>HabitCard</code> +{" "}
            <code>HabitRing</code>, <code>CreateHabitModal</code>,{" "}
            <code>LogDetailModal</code> (note/time/status),{" "}
            <code>HabitOnboarding</code> (templates), and{" "}
            <code>InsightsPanel</code> (charts + heatmap).
          </p>
        </div>

        <div>
          <h3 className="text-base font-semibold text-slate-50">Verify &amp; extend</h3>
          <p className="mt-1">
            Verify with <code>npm run typecheck</code>, <code>npm test</code>,
            and <code>npm run build</code>, plus a manual smoke check. Deferred
            for later passes: per-habit push reminders (reuse the focus{" "}
            <code>push.ts</code> infra) and the AI &ldquo;coach&rdquo; layer (a
            server-only <code>/api/coach</code> route).
          </p>
        </div>
      </section>
    </LegalPageLayout>
  );
}
