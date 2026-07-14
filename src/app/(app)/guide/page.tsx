// src/app/(app)/guide/page.tsx — the site guide: what every pillar does and how.
import Link from "next/link";

const SECTIONS = [
  { id: "start", label: "Getting started" },
  { id: "bookmarks", label: "Bookmarks" },
  { id: "folders", label: "Folders" },
  { id: "focus", label: "Focus" },
  { id: "habits", label: "Habits" },
  { id: "stuff", label: "My Stuff" },
  { id: "sync", label: "Sync & privacy" },
  { id: "personalize", label: "Make it yours" },
  { id: "shortcuts", label: "Tips & shortcuts" },
] as const;

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-6">
      <h2 className="text-lg font-semibold text-slate-50">{title}</h2>
      <div className="mt-2 space-y-4">{children}</div>
    </div>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
      <div className="mt-1 space-y-2 text-slate-300">{children}</div>
    </div>
  );
}

const K = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded border border-slate-700 bg-slate-800/80 px-1.5 py-0.5 font-mono text-[11px] text-slate-200">
    {children}
  </kbd>
);

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-2xl px-3 py-2 sm:px-0">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
        Bookmark Deck guide
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">
        Bookmark Deck is a calm, private home for your online life — and the
        life around it. Four pillars share one roof: <strong>Bookmarks</strong>{" "}
        (the sites and apps you use), <strong>Focus</strong> (the work you do),{" "}
        <strong>Habits</strong> (the consistency you build), and{" "}
        <strong>My Stuff</strong> (the things you own). Everything is
        local-first and syncs to your own account when you ask it to. This page
        is the long version of how it all works.
      </p>

      {/* Contents */}
      <nav aria-label="Guide contents" className="mt-5 flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-300 transition hover:border-blue-400 hover:text-blue-300"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <section className="mt-8 space-y-10 text-sm leading-relaxed">
        <Section id="start" title="Getting started">
          <p className="text-slate-300">
            Sign in with Google on the login page — that&apos;s the only
            account you need. You land on <strong>Bookmarks</strong> (the home
            page); the other pillars are one tap away in the header pills, or
            in the bottom bar on your phone. Everything you add is saved on
            your device instantly; syncing it to your account is always
            explicit and always yours (see{" "}
            <a href="#sync" className="text-blue-300 hover:text-blue-200">
              Sync &amp; privacy
            </a>
            ).
          </p>
          <p className="text-slate-300">
            The fastest way around is the command palette: press <K>⌘K</K> (or{" "}
            <K>Ctrl K</K>) anywhere to jump between pillars, add a bookmark, or
            search every bookmark you have — <K>↑</K>/<K>↓</K> to navigate,{" "}
            <K>↵</K> to open.
          </p>
        </Section>

        <Section id="bookmarks" title="Bookmarks — the home page">
          <Sub title="Links and app shortcuts">
            <p>
              <strong>Bookmarks</strong> are full cards: title, URL, icon,
              folder, tags, and a private note. <strong>App shortcuts</strong>{" "}
              are a separate, simpler row of launcher tiles (name + URL + icon,
              no folders or tags) for the handful of apps you open constantly.
              Add either from the top of the page — a shortcut&apos;s icon
              fills in automatically from the site&apos;s favicon, or paste an
              emoji or image URL.
            </p>
          </Sub>
          <Sub title="Adding and editing links">
            <p>
              <strong>＋ Add Link</strong> asks for a URL (title optional), a
              folder (or Unstaged), and comma-separated tags — existing tags
              appear as one-tap chips. On each card you can pin it (★), open it
              (which counts usage), edit everything including the note, or
              delete it (with Undo). Notes are hidden behind{" "}
              <code>••••••••</code> by default — tap the eye to reveal. Handy
              for login hints and &ldquo;why did I save this?&rdquo; context.
            </p>
            <p>
              The <strong>⏱ &ldquo;Work on this in Focus&rdquo;</strong> button
              on a card seeds a Focus task from that bookmark and takes you to
              the timer — the bookmark feeds the work, and the time you spend
              shows up later under <em>Top resources</em> in Focus analysis.
            </p>
          </Sub>
          <Sub title="Finding things">
            <p>
              The search box matches title, URL, note, folder, and tags; the
              filter narrows to <em>Favorites only</em> or{" "}
              <em>Only with notes</em>. Results sort pinned-first, then newest.{" "}
              <strong>Trending</strong> surfaces your six most-opened bookmarks
              automatically with usage badges — no setup.
            </p>
          </Sub>
          <Sub title="Import, export & backups">
            <p>
              <strong>📥 Import</strong> accepts a browser bookmarks file
              (Netscape HTML) or a Bookmark Deck JSON backup, shows a preview
              (new links / new shortcuts / duplicates skipped), and merges by
              URL — nothing existing is overwritten. <strong>📤 Export</strong>{" "}
              writes a standard HTML file any browser can import. Cloud sync
              also keeps your last <strong>7 snapshots</strong>, each
              restorable in-app or downloadable as JSON.
            </p>
          </Sub>
        </Section>

        <Section id="folders" title="Folders — collections that nest">
          <Sub title="Folder pages">
            <p>
              Folders nest — a folder can hold subfolders and bookmarks. Each
              folder page has breadcrumbs, its own search (which spans the
              whole subtree when subfolders exist), a{" "}
              <em>Comfort / Compact</em> view toggle, and actions to rename,
              add a subfolder, or delete. Deleting a folder moves its bookmarks
              to <strong>Unstaged</strong> (the home for links without a
              folder); a folder with subfolders can&apos;t be deleted until
              they&apos;re moved.
            </p>
            <p>
              <strong>Select</strong> turns on bulk mode: pick multiple
              bookmarks, then move them (to any folder, Unstaged, or a new
              folder) or delete them — with Undo.
            </p>
          </Sub>
          <Sub title="Folder management & auto-organize">
            <p>
              <strong>Manage</strong> (from the Folders section header) shows
              the full tree: search by name or path, sort A–Z or by size,
              collapse/expand, and per-folder rename, move (re-parent), merge
              (pour one folder&apos;s bookmarks into another), or delete.{" "}
              <strong>✨ Auto-organize</strong> proposes a full plan — nesting
              related folders under category parents, refiling loose bookmarks,
              merging duplicate names — with live coverage stats and per-category
              toggles before you apply anything.
            </p>
          </Sub>
        </Section>

        <Section id="focus" title="Focus — the work hub">
          <Sub title="Timer">
            <p>
              A settings-driven Pomodoro: <em>Focus</em>, <em>Short break</em>,
              and <em>Long break</em> modes (a long break arrives after your
              configured number of focus blocks), plus a{" "}
              <strong>Stopwatch</strong> for open-ended sessions. Set an
              optional <em>intention</em> before you start; when a block ends
              you can jot a quick reflection. Breaks and the next focus block
              can auto-start. The timer is timestamp-based, so it stays
              accurate in a background tab, survives navigating away, and rings
              a chime plus a system notification even if the tab is closed.
            </p>
          </Sub>
          <Sub title="Tasks vs. to-dos">
            <p>
              <strong>Tasks</strong> are what the timer works on: pick one
              &ldquo;active&rdquo; task and its focus minutes accumulate
              against it. <strong>To-dos</strong> are your checklist, in two
              tabs: <em>Personal</em> (unfinished items roll over to the next
              day, and can mirror to Google Tasks/Calendar) and <em>Project</em>{" "}
              (app-private, never mirrored). To-dos take a note and a due date
              with a live countdown; in Project to-dos, list lines in the note
              become a checkable mini-checklist — the to-do completes itself
              when every line is checked.
            </p>
          </Sub>
          <Sub title="Journal, moods & dreams">
            <p>
              Log a mood for the day (nine to choose from) and as many
              timestamped notes as you like — you&apos;re prompted after each
              focus block, and you can backdate entries. Flip a note to{" "}
              <strong>🌙 Dream</strong> to record dreams with lucid/nightmare
              flags, vividness, and tags; once you&apos;ve logged one, a dream
              panel appears with recall streaks, a heatmap, and a searchable
              timeline.
            </p>
          </Sub>
          <Sub title="Analysis">
            <p>
              Daily-goal progress with an on-track pace line, day streak, a
              7-day chart with week-by-week navigation, a mood trend, your
              focus rhythm by hour, top intentions, weekly top tasks, and{" "}
              <em>Top resources</em> — time attributed to the bookmarks you
              focused from. Forgot to log? <strong>＋ Log a past session</strong>{" "}
              backfills a day and counts toward your streak.
            </p>
          </Sub>
          <Sub title="Wellbeing extras (all optional, toggled in settings)">
            <p>
              <strong>Hydration</strong>: a cup counter with gentle reminders
              on your interval. <strong>Meditation</strong>: guided breathing
              patterns (Box, 4-7-8, Coherence and more), quiet timed sits,
              optional voice guidance and ambient sound, plus a small library
              of step-by-step guided meditations. <strong>&ldquo;Let
              them&rdquo;</strong>: a 60-second reset — name what&apos;s
              pulling at you, let it go, choose one thing you control, and
              optionally start a focus block on it.
            </p>
          </Sub>
          <Sub title="Need a push?">
            <p>
              Rotating quotes tuned to your interests, a code tip and daily
              challenge if you&apos;re code-leaning, and a quick quiz that pays
              points into a Scores history (topics, accuracy, streaks).
              Interests, quiz difficulty, and an optional{" "}
              <strong>✝️ Bible mode</strong> (verses + Bible trivia) live in
              Focus settings.
            </p>
          </Sub>
          <Sub title="Google sync & your data">
            <p>
              Turn on <em>Sync with Google</em> in Focus settings to push
              personal to-dos to Google Tasks (timed ones get Calendar events)
              and see your agenda alongside — sign out and back in once to
              grant access. Your focus data exports as{" "}
              <strong>Sessions CSV</strong> or a full <strong>JSON backup</strong>,
              and imports merge by id, so restoring never duplicates.
            </p>
          </Sub>
        </Section>

        <Section id="habits" title="Habits — the record of consistency">
          <p className="text-slate-300">
            Calm by design: no shame, no leaderboards. Add a habit with just a
            name — icon, colour, type, schedule, and reminders are optional
            details with sensible defaults. Habits can be{" "}
            <strong>yes/no</strong> (one tap) or <strong>measurable</strong>{" "}
            (count toward a target with − / + steppers), scheduled every day,
            on specific days, or times-a-week, and aimed at building or
            quitting.
          </p>
          <p className="text-slate-300">
            Streaks are forgiving: today not being done <em>yet</em>{" "}
            doesn&apos;t break one — only a missed scheduled day does, and
            skips (planned rest days) are neutral. Insights unlock after a few
            days of logging: weekly bars, best weekdays, per-habit 30-day
            rates, and a year heatmap where any day can be tapped to backfill.
            A habit&apos;s ⋯ menu can <strong>start a focus session</strong> —
            finishing the block checks the habit off. Habits sync
            automatically when you&apos;re signed in, and export/import as
            CSV/JSON. The full explainer lives at{" "}
            <Link
              href="/habits/guide"
              className="text-blue-300 hover:text-blue-200"
            >
              How habits work
            </Link>
            .
          </p>
        </Section>

        <Section id="stuff" title="My Stuff — what you own">
          <Sub title="Add & organize">
            <p>
              A name is enough to add an item — category, tags, quantity,
              purchase details, serial, condition, estimated value,{" "}
              <strong>photos</strong> (snap them with your camera, upload
              files, or paste URLs — each is compressed on your device before
              it saves; the first one is the card cover), and notes all fold
              away under <em>Add details</em> for later. Organize items into{" "}
              <strong>nestable locations</strong> — rooms, shelves, boxes —
              and browse in grid, list, or <strong>shelf</strong> view, which
              groups everything by where it lives with a per-spot count and
              value. While naming a new item, a gentle &ldquo;you may already
              own this&rdquo; hint helps before you buy a duplicate.
            </p>
            <p>
              Tap any item&apos;s photo or name to open its{" "}
              <strong>detail view</strong> — photo carousel (tap again for
              full-screen, with paging), the facts at a glance, warranty
              countdown, links, notes, and attached receipts — with one Edit
              button when something needs changing.
            </p>
          </Sub>
          <Sub title="Find it — and find where it is">
            <p>
              Search spans name, category, maker, model, serial, barcode,
              project, notes, tags, and links; a location filter narrows to one
              room or the unassigned pile. When you just need to know{" "}
              <em>where</em> something is, <strong>Where is it?</strong> is a
              forgiving quick-find — type &ldquo;where&apos;s my passport&rdquo;
              and it answers with the full location path (Bedroom › Desk
              drawer), or <em>With Alex</em> if it&apos;s lent out.
            </p>
          </Sub>
          <Sub title="Links & projects — connective tissue">
            <p>
              Every item can <strong>link to its online life</strong>: attach
              bookmarks from your library — the manual, the product page, the
              warranty portal — and open them from the item&apos;s card. An item
              can also be tied to a <strong>Focus project</strong>, so the thing
              and the work you do with it stay connected.
            </p>
          </Sub>
          <Sub title="What it&apos;s worth — and depreciation">
            <p>
              The <strong>value panel</strong> totals your catalogue by category
              and location, and adds a <strong>resale estimate</strong>: what
              you paid versus what it&apos;s worth now, with the percentage
              retained and a five-year <strong>depreciation curve</strong>. The
              estimate is a straight-line, category-aware guide (electronics
              fall fast, furniture slowly) — an appraisal it is not, and your own
              value estimate always overrides it.
            </p>
          </Sub>
          <Sub title="Warranty, upkeep & lending">
            <p>
              The <strong>attention panel</strong> flags what needs a look:
              warranties ending within 30 days or already gone, and{" "}
              <strong>maintenance</strong> due or coming up. The count also rides
              as a badge on the <em>My Stuff</em> nav tab, so it reaches you from
              any pillar. Lent something out? <strong>On loan</strong> is the
              ledger of who has what and when it&apos;s due back — overdue in
              red — with a one-tap <em>Returned</em> when it comes home.
            </p>
          </Sub>
          <Sub title="Kits & collections">
            <p>
              Give related items the same <strong>Collection / kit</strong> name
              — a camera bag, a board-game shelf, a first-aid kit — and{" "}
              <strong>Kits</strong> gathers each set with its piece count and
              total value, so you can see the whole thing at a glance and spot a
              missing part.
            </p>
          </Sub>
          <Sub title="Declutter">
            <p>
              Tag anything you&apos;re moving on — <strong>donate, sell, give
              away, or toss</strong>. The <strong>Declutter</strong> pile groups
              them by intent with an estimated recoup for the sells, and a
              one-tap <em>Let go</em> when it&apos;s gone. Name a habit like
              &ldquo;declutter&rdquo; or &ldquo;donate&rdquo; and it ticks off
              automatically each time you release something.
            </p>
          </Sub>
          <Sub title="Barcode, photos & your data">
            <p>
              On a supporting browser (Chromium), <strong>Scan</strong> reads an
              item&apos;s barcode from the camera — or type it and press{" "}
              <strong>Look up</strong>. Either way, a match auto-fills the empty
              fields (name, make, model, category, price, photo); your own
              entries are never overwritten. You can also{" "}
              <strong>Scan a receipt</strong> (beta, entirely on your device) to
              fill in the retailer, purchase date, and price — the photo is read
              locally and never uploaded. You can always add a photo by URL too.
              On a synced item, <strong>Receipts &amp; documents</strong>{" "}
              lets you attach receipts, manuals, and warranty cards (snap or
              upload — each is compressed and kept with the item, opened in a
              tap). Everything exports as CSV or a full JSON backup, and imports
              merge by id, so restoring never duplicates. Need a record for
              insurance? <strong>Insurance report (PDF)</strong> prints a clean
              schedule of your belongings — item, location, purchase date,
              serial, paid, and estimated value with totals — right from your
              browser (choose <em>Save as PDF</em>); nothing leaves your device.
              Archive items you no longer actively track.
            </p>
          </Sub>
        </Section>

        <Section id="sync" title="Sync & privacy">
          <Sub title="Local-first, always">
            <p>
              Everything saves to your device the moment you act — no account
              required to use the app. Data is cached per signed-in account,
              so two people sharing a browser don&apos;t mix.
            </p>
          </Sub>
          <Sub title="What syncs, and how">
            <p>
              <strong>Bookmarks &amp; shortcuts</strong> sync only when you
              press <em>Sync to cloud</em> / <em>Sync from cloud</em> on the
              home page — explicit by design, with the last 7 snapshots kept as
              restorable backups. <strong>Focus, Habits, and My Stuff</strong>{" "}
              save to your account automatically once you&apos;ve connected
              (&ldquo;Sign in to sync&rdquo;), and each still has manual
              sync/export buttons. Cloud data lives in Firebase under your
              Google account and is scoped to you alone.
            </p>
          </Sub>
          <Sub title="Privacy">
            <p>
              No analytics or ad SDKs. Google Tasks/Calendar are touched only
              if you enable Google sync, and the access token lives in your
              encrypted session cookie — not on a server database. To leave:
              export your data, delete locally, sync the empty state, and
              revoke the app at myaccount.google.com/permissions. Details in{" "}
              <Link href="/privacy" className="text-blue-300 hover:text-blue-200">
                Privacy
              </Link>{" "}
              and{" "}
              <Link href="/faq" className="text-blue-300 hover:text-blue-200">
                FAQ
              </Link>
              .
            </p>
          </Sub>
        </Section>

        <Section id="personalize" title="Make it yours">
          <Sub title="Appearance">
            <p>
              From the account menu → <em>🅰 Appearance…</em>: pick a font
              (system stacks from Serif to Typewriter — or upload your own
              font file, which never leaves your device), and tune text, emoji,
              and icon sizes with live preview. Settings are per-device.
            </p>
          </Sub>
          <Sub title="Cursor companion">
            <p>
              <em>🐟 Cursor settings…</em> adds a decorative creature that
              follows your pointer — fish, turtle, dragon, jellyfish, lobster,
              or the default jelly art — with size, colour, motion, and even a
              trail of babies. Purely cosmetic, respects reduced-motion, and{" "}
              <em>Off</em> is always an option.
            </p>
          </Sub>
          <Sub title="Install as an app">
            <p>
              Bookmark Deck is installable: accept the install prompt on
              Chrome/Edge, or on iOS Safari use Share →{" "}
              <em>Add to Home Screen</em>. On the Focus page, allow
              notifications once so timer-end alerts reach you even in another
              tab.
            </p>
          </Sub>
        </Section>

        <Section id="shortcuts" title="Tips & shortcuts">
          <ul className="list-disc space-y-1.5 pl-5 text-slate-300">
            <li>
              <K>⌘K</K> / <K>Ctrl K</K> — command palette: jump anywhere, add a
              bookmark, search everything.
            </li>
            <li>
              On mobile, the bottom bar holds all four pillars plus a Search
              tab; it tucks away while you&apos;re typing.
            </li>
            <li>
              Deletes almost everywhere offer a brief <strong>Undo</strong> —
              bookmarks, shortcuts, to-dos, journal notes, activity entries.
            </li>
            <li>
              Long page? A scroll-to-top button with a progress ring appears
              bottom-right.
            </li>
            <li>
              The dashboards (Focus, Habits, home) have a sticky section nav —
              tap to jump straight to Timer, Insights, Folders, and more.
            </li>
            <li>
              Start work from wherever the context is: a bookmark&apos;s ⏱
              button, a habit&apos;s ⋯ → <em>Start focus</em>, or a
              &ldquo;Let them&rdquo; reset&apos;s next move — they all land in
              the same timer.
            </li>
          </ul>
        </Section>
      </section>

      <p className="mt-10 border-t border-slate-800/60 pt-4 text-xs text-slate-500">
        Still curious? The{" "}
        <Link href="/faq" className="text-blue-300 hover:text-blue-200">
          FAQ
        </Link>{" "}
        covers data questions, and{" "}
        <Link href="/habits/guide" className="text-blue-300 hover:text-blue-200">
          How habits work
        </Link>{" "}
        goes deeper on streak rules.
      </p>
    </div>
  );
}
