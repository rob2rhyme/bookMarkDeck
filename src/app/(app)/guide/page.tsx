// src/app/(app)/guide/page.tsx — the site guide: what every pillar does and how.
import Link from "next/link";

const SECTIONS = [
  { id: "start", label: "Getting started" },
  { id: "bookmarks", label: "Bookmarks" },
  { id: "folders", label: "Folders" },
  { id: "focus", label: "Focus" },
  { id: "habits", label: "Habits" },
  { id: "stuff", label: "My Stuff" },
  { id: "filing", label: "Filing" },
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
        life around it. Five pillars share one roof: <strong>Bookmarks</strong>{" "}
        (the sites and apps you use), <strong>Focus</strong> (the work you do),{" "}
        <strong>Habits</strong> (the consistency you build),{" "}
        <strong>My Stuff</strong> (the things you own), and{" "}
        <strong>Filing</strong> (where your paper lives, and what it&apos;s due
        for). Everything is local-first and syncs to your own account when you
        ask it to. This page is the long version of how it all works.
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
            account you need, and one sign-in connects cloud sync for every
            pillar at once. You land on <strong>Bookmarks</strong> (the home
            page); the other pillars are one tap away in the header pills, or
            in the bottom bar on your phone. Everything you add is saved on
            your device instantly; what reaches your account is always
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
              purchase details (price plus a <strong>tax rate</strong> — the
              cost on your cards and totals is always the{" "}
              <strong>true, tax-included figure</strong>), a{" "}
              <strong>warranty plan</strong> (its cost joins that total, taxed
              like the price, and typing the plan&apos;s{" "}
              <em>length in years</em> fills the expiry date in from the
              purchase date automatically), serial, condition (including{" "}
              <em>Open box</em>), whether it&apos;s still{" "}
              <strong>in its original box</strong>, a <strong>store URL</strong>{" "}
              for re-buying, estimated value, <strong>photos</strong> (snap
              them with your camera, upload files, or paste URLs — each is
              compressed on your device before it saves; the first one is the
              card cover), and notes all fold away under <em>Add details</em>{" "}
              for later. Organize items into{" "}
              <strong>nestable locations</strong> — rooms, shelves, boxes —
              and browse in <strong>grid</strong> view,{" "}
              <strong>list</strong> view (wide cards that lay out the full
              record — photo, price with tax, condition, status, links — like a
              ledger), or <strong>shelf</strong> view, which
              groups everything by where it lives with a per-spot count and
              value. Deleted something by accident? Every delete offers a brief{" "}
              <strong>Undo</strong> that brings the item back whole — photos
              and receipts included. Starting fresh? A one-tap offer can{" "}
              <strong>seed a handful of common rooms</strong> so the page is
              never blank — rename or nest them however you like. While naming a
              new item, a gentle &ldquo;you may already own this&rdquo; hint
              helps before you buy a duplicate.
            </p>
            <p>
              Tap any item&apos;s photo or name to open its{" "}
              <strong>detail view</strong> — photo carousel (tap again for
              full-screen, with paging), the facts at a glance (with{" "}
              <em>price + warranty + tax = total</em> spelled out), warranty
              countdown with the plan&apos;s length and cost, links, notes, and
              attached receipts — with one Edit
              button when something needs changing. A <strong>Share</strong>{" "}
              button sends the item to a friend through Messages, WhatsApp, or
              any app in your share sheet (with a copy-to-clipboard fallback),
              and <em>View in store</em> jumps to its store page.
            </p>
          </Sub>
          <Sub title="Price comparison">
            <p>
              Save <strong>compare links</strong> on an item — store, URL, and
              the price you saw — and the detail view lines them up
              cheapest-first, starring the best offer and showing how much
              you&apos;d save versus what you paid. A <strong>Price ↑/↓</strong>{" "}
              toggle flips the list between lowest-first and highest-first
              (link-only rows stay at the bottom). If the item has a barcode
              and a <strong>live price lookup</strong> finds current offers,
              those take over automatically (badged <em>Live prices</em>) and
              your saved links wait as the fallback. Wishlist entries get the
              exact same comparison — see below.
            </p>
          </Sub>
          <Sub title="Find it, and ask about it">
            <p>
              Search spans name, category, maker, model, serial, barcode,
              project, notes, tags, and links; a location filter narrows to one
              room or the unassigned pile. When you just need to know{" "}
              <em>where</em> something is, <strong>Find &amp; ask</strong> is a
              forgiving quick-find — type &ldquo;where&apos;s my passport&rdquo;
              and it answers with the full location path (Bedroom › Desk
              drawer), or <em>With Alex</em> if it&apos;s lent out.
            </p>
            <p>
              Leave the box empty and it turns into{" "}
              <strong>quick questions about your stuff</strong> — what&apos;s
              lent out, whose warranty is ending, what needs upkeep, what
              isn&apos;t photographed yet, your most valuable things. Each is
              answered instantly from your own data on your device — no AI, no
              guessing, nothing sent anywhere.
            </p>
          </Sub>
          <Sub title="Links & projects — connective tissue">
            <p>
              Every item can <strong>link to its online life</strong>: attach
              bookmarks from your library — the manual, the product page, the
              warranty portal — and open them from the item&apos;s card. An item
              can also be tied to a <strong>Focus project</strong>, so the thing
              and the work you do with it stay connected. My Stuff moments —
              added, lent, returned, let go — also land in the Focus page&apos;s
              unified <strong>activity timeline</strong>, alongside your focus
              blocks and habits.
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
          <Sub title="Item history — every item tells its story">
            <p>
              Each item keeps a quiet <strong>life log</strong>. Its detail view
              shows a status you can set in one tap —{" "}
              <em>Have it · Misplaced · Lost · Returned</em> — plus{" "}
              <strong>✨ Used today</strong> to note you actually used it.{" "}
              <strong>🔙 Returned</strong> is for the faulty one you sent back
              under warranty for a refund: the item keeps its record and
              history, but its cost <strong>drops out of every total</strong>{" "}
              (value, paid, resale) and its reminders go quiet — the card wears
              a &ldquo;Returned — not in totals&rdquo; badge so you always know
              why. Tap <em>Have it</em> if it ever comes back. Lending
              is tracked end to end: who you lent it to, when, how many days it
              was out, and its <strong>condition going out versus coming
              back</strong>. Below that, an at-a-glance line (&ldquo;in your care
              120d · used 8× · lent 2×&rdquo;) and a timeline of everything —
              acquired, moved between locations, lent, returned, found — build up
              automatically as you use the app; nothing to fill in.
            </p>
          </Sub>
          <Sub title="Trending — what you actually reach for">
            <p>
              Once there&apos;s some history, a <strong>🔥 Trending</strong>{" "}
              section ranks your <em>most used</em>, <em>most lent</em>, and{" "}
              <em>most moved</em> items over the last 90 days. It&apos;s a
              mirror, not a scoreboard — handy for spotting what deserves a
              better home, and what you could let go.
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
          <Sub title="QR labels for boxes">
            <p>
              In <strong>Locations</strong>, tap <strong>Print QR labels</strong>{" "}
              for a sheet of cut-out labels — one per room, shelf, or box. Stick
              one on a sealed box and later just <strong>scan it with your
              phone camera</strong> to open My Stuff filtered to that spot — see
              what&apos;s inside without unpacking.
            </p>
          </Sub>
          <Sub title="Rediscover">
            <p>
              Once a day, a calm <strong>Rediscover</strong> card surfaces one
              thing you may have forgotten — a nudge to use it or let it go, not
              a notification. Tap it to have a look, or dismiss it and it&apos;ll
              bring something else tomorrow.
            </p>
          </Sub>
          <Sub title="Wishlist">
            <p>
              The <strong>♡ Wishlist</strong> button keeps a light list of things
              you want to buy — separate from what you own. <strong>Scan a
              barcode</strong> (or type one) to prefill the name, price,
              category — <em>and the product photo</em> — in one go; the photo
              becomes the wish&apos;s thumbnail, just like items get (an ✕ next
              to the preview removes a wrong match). Wishes get the same{" "}
              <strong>price comparison</strong> as items: add store links (or
              let a scanned barcode pull <em>live prices</em>), then tap{" "}
              <strong>⚖ Compare</strong> on any wish to see offers
              cheapest-first with the savings versus your estimate — checked{" "}
              <em>before</em> you buy, when it matters most (each offer links
              straight to its store, so where-to-buy is always one tap away).
              As you type a name it
              gently flags anything you <em>may already have</em>, so you don&apos;t
              re-buy by accident. Change your mind on details? <strong>Tap a
              wish (or its ✎)</strong> and it reopens in the form — tweak the
              name, price, category, photo, or store links and save. Bought it?
              Tap <strong>Got it</strong> and it becomes a real item in My
              Stuff — carrying its photo, barcode, and compare links along.
              Slip of the finger? Deleting a wish and <em>Got it</em> both show
              an <strong>Undo</strong> for a few seconds. And when something
              you own wears out, the <strong>♡ on any item card</strong> wishes
              it again — a re-buy entry prefilled with the item&apos;s photo,
              price, and store links.
            </p>
          </Sub>
          <Sub title="Item types — forms that fit the thing">
            <p>
              A pantry can has no warranty; a book has an author. Pick an{" "}
              <strong>item type</strong> under the name — General · 📚 Book ·
              🥫 Food &amp; pantry · 🧴 Self-care · 👕 Clothing · 🛠 Tool —
              and the form slims down to just what applies.{" "}
              <strong>Scans pick the type for you</strong>: a book&apos;s
              barcode fills title, author, and cover (via Open Library) and
              flips to the Book form; a food or cosmetics barcode opens the
              pantry or self-care form. <strong>Books</strong> get a read
              status (📕 not read · 📖 reading · ✅ read) you can flip with
              one tap in the detail view — and your{" "}
              <strong>want-to-read list is just the Wishlist</strong> (scan a
              book there, price-compare it, then <em>Got it</em>).{" "}
              <strong>Food &amp; self-care</strong> get a{" "}
              <strong>use-by date</strong> (self-care also{" "}
              <em>opened-on + months-after-opening</em>, whichever ends
              first), and anything past or within 14 days shows up in the{" "}
              <strong>Attention</strong> panel. <strong>Clothing</strong> gets
              a size. <strong>💾 Digital</strong> covers subscriptions and
              one-time purchases: pick a billing cycle (one-time · monthly ·
              yearly), and subs get a <strong>renewal date that rolls forward
              by itself</strong> — with a heads-up in Attention during the
              7-day cancel window — while one-time buys get a{" "}
              <strong>license key</strong> field and a platform/account. The{" "}
              <strong>💳 Subs</strong> button totals it all up —{" "}
              <em>&ldquo;you&apos;re paying ≈ $X/mo ($Y/yr)&rdquo;</em>, tax
              included, soonest renewal first, with a manage/cancel link per
              row. Subscriptions are running costs, not possessions — they
              stay out of your Total value. Every type keeps every power:
              photos, locations, price with tax, editable cards, undo.
            </p>
          </Sub>
          <Sub title="🤲 Borrowed & rented">
            <p>
              Not everything in your care is yours. Set{" "}
              <strong>Ownership</strong> in the item form to{" "}
              <em>Borrowed</em> or <em>Rented</em> (with who it&apos;s from and
              a return-by date) and the item gets every power — barcode
              lookup, photos, a location, the fee you paid with tax and any
              damage-cover cost — but stays <strong>out of your value
              totals</strong>; the fee still counts as spend. Cards wear a{" "}
              <em>🤲 Borrowed / 🏷 Rented</em> badge, and a{" "}
              <strong>🤲 Borrowed</strong> button gathers everything in your
              care with due dates (overdue in red) and a one-tap{" "}
              <strong>Gave back</strong>. Given-back things move to a{" "}
              <strong>returned history</strong> that keeps what each one cost
              you — and like every card, an accidental delete offers{" "}
              <strong>Undo</strong>.
            </p>
          </Sub>
          <Sub title="📈 Insights">
            <p>
              The <strong>📈 Insights</strong> button turns your catalog into
              calm charts: a <strong>pie of what you collect</strong> (category
              share), bars for <strong>where things live</strong> and{" "}
              <strong>how you tag</strong>, a{" "}
              <strong>keeping-vs-returned</strong> split, a color-coded{" "}
              <strong>warranty outlook</strong> (expired → soon → later), and
              an <strong>interest-over-time</strong> chart of additions per
              quarter by category — watch what&apos;s rising and what&apos;s
              fading. Below the charts, <em>Noticed in your numbers</em> lists
              grounded facts computed on your device, and an optional{" "}
              <strong>✨ AI read</strong> asks the AI what your things say
              about you — it sends only aggregate counts and category/tag
              labels, never item names or serials (and needs the site
              owner&apos;s AI key, like AI capture).
            </p>
          </Sub>
          <Sub title="✨ AI capture (coming soon)">
            <p>
              Built and waiting in the wings: an <strong>✨ AI add</strong>{" "}
              button where you <strong>snap or choose a photo</strong> and the
              AI names the product, guesses a category and a rough price, then
              asks one question — <em>want it or have it?</em>{" "}
              <strong>Add to Wishlist</strong> saves it as a wish;{" "}
              <strong>Already bought</strong> opens the add-item form prefilled
              (photo included) so you review and save. Everything stays
              editable — it&apos;s a head start, not a decision. Great for
              things barcodes can&apos;t cover: furniture, tools, gifts,
              hand-me-downs. The button is tucked away until the site owner
              turns on the AI key (see <code>.env.example</code>) — it&apos;ll
              appear here when it goes live.
            </p>
          </Sub>
          <Sub title="Upkeep calendar">
            <p>
              When any item has a warranty or maintenance date, a{" "}
              <strong>📅 Upkeep</strong> button appears — a calm timeline of
              what&apos;s coming, grouped <em>Overdue → This month → Next month</em>{" "}
              and on. It&apos;s the wider view; the <strong>Attention</strong>{" "}
              panel still flags anything due within 30 days. Tap any date to open
              the item.
            </p>
          </Sub>
          <Sub title="Barcode, photos & your data">
            <p>
              At the top of the add form, <strong>Scan a product</strong> is
              the fast way in. <strong>📷 Scan</strong> reads the barcode from
              the camera — any phone (including iPhone), a desktop webcam, or a
              USB/Bluetooth barcode scanner (those type the code, and Enter looks
              it up). Or type/paste the code and press <strong>Look up</strong>.
              A match auto-fills the empty fields (name, make, model, category,
              price, photo); your own entries are never overwritten, and the code
              is saved either way. The lookup checks several <strong>free product
              databases</strong>, so many everyday items (including non-US
              barcodes) now resolve; when none has it, just read the label or
              type. No barcode? <strong>🔤 Read label to name it</strong> snaps
              the item or its box and reads the printed text on your device to
              suggest a name (and brand) — handy for things that have words but
              no code. It&apos;s a suggestion into empty fields; nothing is
              uploaded. Detection runs on your device — the
              camera image never leaves the browser. You can also{" "}
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
          <Sub title="App lock">
            <p>
              Want a little more privacy? <strong>🔒 Lock</strong> puts My Stuff
              behind a <strong>4–8 digit PIN</strong> — and, on supported devices,
              your <strong>fingerprint or face</strong>. It re-locks when you load
              or return to the page, and <em>Lock now</em> screens it instantly.
              It&apos;s a <strong>quick privacy screen, not encryption</strong>:
              your sign-in is still what keeps your data yours, and the PIN stays
              on this device (never synced). Forgot it? A reset turns the lock
              off and reveals your inventory — nothing is ever deleted.
            </p>
          </Sub>
        </Section>

        <Section id="filing" title="Filing — where every paper lives">
          <Sub title="Places, folders, papers">
            <p>
              Filing answers &ldquo;where is it?&rdquo; for paper the way
              Bookmarks answers it for the web. Start with{" "}
              <strong>places</strong> — the actual furniture, nested however deep
              you need: <em>Garage › Grey cabinet › Drawer 2</em>. Then make a{" "}
              <strong>folder</strong> (the thing you physically pull out) and drop{" "}
              <strong>papers</strong> into it. A title is enough to file
              something; everything else is optional. A paper with nowhere to go
              yet lands in <strong>Unfiled</strong> and waits.
            </p>
            <p>
              Give a folder <strong>other names you might search for</strong> —
              &ldquo;car&rdquo;, &ldquo;auto&rdquo;, &ldquo;Taurus&rdquo; all find
              the same one. That&apos;s the difference between remembering the
              name you filed it under and finding it at 11pm.{" "}
              <strong>People</strong> label whose paper it is — a family member,
              a client — and one control switches the whole view to just theirs.
            </p>
          </Sub>

          <Sub title="Finding it again">
            <p>
              <strong>Where is it?</strong> searches everything and answers with
              the full path plus the folder to pull. It&apos;s in{" "}
              <kbd>⌘K</kbd> too, alongside <em>File a paper</em>.{" "}
              <strong>Labels</strong> prints QR stickers sized for drawers and
              file folders — scan one with your phone camera and the app opens
              filtered to exactly that spot.
            </p>
          </Sub>

          <Sub title="What&apos;s due next">
            <p>
              A paper can carry what it obliges you to do — renew the licence,
              pay the premium, file the return, book the inspection. Pick a{" "}
              <strong>preset</strong> and it&apos;s one tap. Everything due
              gathers in <strong>Coming up</strong>, grouped Overdue · This week ·
              This month · Later, and the count rides the nav badge from anywhere
              in the app.
            </p>
            <p>
              Marking a repeating reminder done moves it forward{" "}
              <strong>exactly one period</strong> — so three missed months read as
              still overdue rather than quietly skipping ahead to next year.
              Turn on the optional <strong>daily summary</strong> to get one
              notification a day (never one per paper), or export an{" "}
              <strong>.ics file</strong> and import your deadlines into Google,
              Apple or Outlook Calendar.
            </p>
          </Sub>

          <Sub title="What expires, and when">
            <p>
              <strong>Valid until</strong> is a separate list from{" "}
              <em>Coming up</em>, because an expiring passport isn&apos;t the same
              kind of thing as an unpaid bill — you can&apos;t settle it late, and
              renewing takes months. It shows <em>everything</em> with an expiry
              date, including the licence that&apos;s fine for another three
              years, so you can see what you hold at a glance. Presets cover
              passports, driving licences, national ID cards, residence and work
              permits, visas, permanent-resident cards, Global Entry and
              memberships.
            </p>
            <p>
              For passports it also tracks the{" "}
              <strong>six-month rule</strong>: many countries refuse entry — and
              airlines refuse boarding — unless your passport is valid for six
              months beyond your trip, so a passport can be perfectly in date and
              still turn you away at the desk. Filing shows the date that
              actually matters. Requirements vary (the Schengen area asks three
              months; some places only want validity on the day you land), so
              check your destination.
            </p>
          </Sub>

          <Sub title="Filing history">
            <p>
              <strong>History</strong> is the picture of what you&apos;ve
              actually done: papers filed, renewals and payments handled, things
              cleared out, and a month-by-month bar chart of the last year — tap
              any month for its breakdown. Alongside it, what kind of handling
              dominates and where your paper actually lives. It&apos;s counted
              from each record&apos;s own history, which keeps its last 300
              events, so a very long-lived paper&apos;s earliest entries age out.
            </p>
          </Sub>

          <Sub title="Clearing out, and who has what">
            <p>
              Give a folder a <strong>retention rule</strong> and its papers
              surface in <strong>Ready to clear</strong> once they&apos;ve aged
              out. The clock starts at the <em>end of the year the contents
              cover</em>, not the day you filed them — so 2024 papers filed in
              March 2025 come up at the end of 2031, which is the date that
              actually matters. Nothing is ever deleted on a timer: it&apos;s a
              review queue, and clearing a paper keeps a dated receipt on its
              history. <strong>Hold</strong> pauses a folder&apos;s reminder
              without touching its clock.
            </p>
            <p>
              Lent something out? <strong>Who has it</strong> records where a
              folder went, who has it and when it&apos;s wanted back — and says
              so when it&apos;s late. There&apos;s no separate
              &ldquo;checked out&rdquo; switch to forget: a folder is out
              precisely because it isn&apos;t where it lives.
            </p>
            <p className="text-slate-400">
              Retention and renewal periods are general guidance, not legal or
              tax advice — they vary by state, profession and circumstance.
              Everything is editable.
            </p>
          </Sub>

          <Sub title="Linking a paper to its account">
            <p>
              A paper can point at the <strong>bookmark</strong> for the account
              it belongs to, so the policy in Drawer 2 and the insurer&apos;s
              login page are one record. Open a folder&apos;s papers and hit{" "}
              <strong>Link</strong>. <strong>Export</strong> gives you JSON (the
              complete copy, importable again) or CSV (a flat sheet of what you
              have and where). Importing <strong>merges and never deletes</strong>,
              so restoring an old backup can&apos;t remove anything you&apos;ve
              filed since.
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
          <Sub title="One sign-in covers everything">
            <p>
              Signing in with Google once connects cloud sync for{" "}
              <strong>every</strong> pillar — Bookmarks, Focus, Habits, My Stuff
              and Filing — automatically and silently on your next visit. No more
              per-app &ldquo;Sign in to sync&rdquo; taps. (If the silent
              connection ever can&apos;t complete, that button simply
              reappears — one tap reconnects all pillars at once.)
            </p>
          </Sub>
          <Sub title="What syncs, and how">
            <p>
              <strong>Bookmarks &amp; shortcuts</strong> sync only when you
              press <em>Sync to cloud</em> / <em>Sync from cloud</em> on the
              home page — explicit by design, with the last 7 snapshots kept as
              restorable backups.{" "}
              <strong>Focus, Habits, My Stuff and Filing</strong> save to your
              account automatically while you&apos;re signed in, and each still
              has manual sync/export buttons. Anything you create before
              connecting is pushed up when you do, rather than being overwritten
              by the first sync. Cloud data lives in Firebase under your Google
              account and is scoped to you alone.
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
              On mobile, the bottom bar holds all five pillars plus a Search
              tab; it tucks away while you&apos;re typing.
            </li>
            <li>
              Deletes almost everywhere offer a brief <strong>Undo</strong> —
              bookmarks, shortcuts, to-dos, journal notes, activity entries,
              and My Stuff items (photos and receipts come back too).
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
