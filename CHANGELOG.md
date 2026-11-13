# Changelog

All notable changes to Docket. Versions follow [Semantic Versioning](https://semver.org/).

## [3.2.0] — 2026-11-13

Printed reports match the app.

### Changed
- **Print / PDF reports are aurora glass**, like the screen: the dark backdrop
  and its pools of colour run to the edge of every page, with frosted day
  cards, the gradient accent on the first total, and the job colours. This
  replaces the white-paper report for the day, week, month and job.
- Every page of a long report keeps its own top and bottom margin.
- The guide's printing section says to leave *Background graphics* ticked.

### Note
- The dark report is made for *Save as PDF*. Sent to a real printer it uses a
  lot of ink.

## [3.1.0] — 2026-11-13

Glass. Every function works as before.

### Changed
- **Docket is glass.** Panels and cards are frosted and translucent, floating
  over a deep aurora of cool blue, violet and teal. Each pane catches the light
  along its top edge.
- **The accent glows.** Orange is now an orange-to-pink gradient with a soft
  glow on the Add button, the This day tile, today's marker and the floating +.
  The entry box lights up while you type in it.
- **Dialogs** are dense frosted glass over a blurred, dimmed page.
- Job colours glow slightly on entries and in the Jobs list; job labels are a
  touch brighter so they stay readable on glass.
- A scrolling side list now fades out at the bottom instead of ending in a band.

### Added
- **Reduce transparency is respected.** A device set to reduce transparency
  gets the same layout on solid surfaces, with no blur and no aurora.
- A test that measures text contrast from real pixels, since panels are now
  see-through: every piece of text, in every view, on a computer and a phone,
  against WCAG AA.

### Fixed
- Two tests looked for the cursor a moment too early and could fail by luck
  of timing; they now wait for it.

## [3.0.0] — 2026-11-12

One decisive look. Every function works as before.

### Changed
- **Docket is graphite grey, everywhere.** Light mode, dark mode and the theme
  button are gone. There is one soft neutral grey with the orange accent and
  the job colours, the same on every device, by day and by night, whatever
  the system is set to. The grey is a step softer than the old dark mode, so
  panels and cards separate more clearly and it is easier on the eyes.
- **The floating +** on a computer is smaller and sits in the gutter beside the
  Wishlist, so it no longer covers job labels in the Week and Month views.
- The installed app's title bar and splash screen match the new grey.

### Removed
- The theme button and the "Light or dark" section of the guide. A saved
  light/dark choice (`track.theme.v1`) is cleared when Docket opens; no log
  data is touched.

### Unchanged
- Printed reports and PDFs are still on white paper in Docket's colours.

## [2.8.0] — 2026-11-12

A visual refinement for everyday use. Everything works as before.

### Changed
- **Dark mode is grey throughout.** The last warm-brown tints are gone: the Due
  today box, backup reminders, the set Job box, activity bars and the calendar's
  shading are neutral grey in dark mode, with orange kept for marks and borders.
- **The Month calendar is shaded by job.** Each day takes its busiest job's colour,
  deeper the busier the day, so the month shows at a glance where the time went.
  Days with no job are shaded neutrally. Every job colour passes AA contrast at
  every depth, in both themes.
- **The Week view is calmer.** Empty days fold to a slim row (the + still adds to
  them), so the days with work stand out.
- **This week** and **This month** tiles open those views with a click.
- **The Jobs list** shows a thin bar under each job: its share of the work.
- **An empty today greets you** by time of day instead of "Nothing logged".
- Icons on the Day / Week / Month tabs and the side-panel headings, a little light
  on the This day tile, and a soft glow at the top of the page.

## [2.7.4] — 2026-11-12

A repository audit, tidy-up and documentation update. The app itself is unchanged.

### Fixed
- `.env.example` said to copy it to `.env`, but nothing read that file. The server
  now loads `.env` on start if it's there; variables already set (such as Railway's)
  still win, and nothing is printed when there's no file.

### Changed
- Requires **Node.js 22.9 or newer**: Node 20 reached end of life in April 2026.
- CI and Release use `actions/checkout`, `setup-node` and `upload-artifact` v7,
  which run on Node 24 (v4 ran on the retired Node 20 runtime, with a warning on
  every run).
- Tests no longer print debug output (CSV dumps, copied text) into the CI log.

### Documentation
- README: a table of every `npm` command, the complete project layout, automatic
  folder backup in the feature list, how `.env` and Railway variables combine,
  what CI checks, and screenshots and the lockfile in the release steps.
- ARCHITECTURE: what CI runs and why Playwright and the runner are pinned, and
  where the server's settings come from.

## [2.7.3] — 2026-11-12

A testing, UAT, UI and UX audit: fixes only, no new features.

### Fixed
- **Copy Items Only** in the Week and Month views left a blank line between days,
  though it promises "one per line" (and the Day and Job views keep to that). It
  now gives one line per entry everywhere; the headed copy still separates days.

### Tests
- A test-coverage audit matched every control against the suites. A new `journeys`
  suite walks through what none of them did: the stat tiles and week/month
  summaries, Copy Week and Copy Month, Clear this day and its Undo, moving by ← → T
  and the date picker, opening a day from the Month view, folding a month in Recent
  days and its calendar icon, every + button, the floating +, the job ✕ on a list,
  and the ✕ on the guide and Clear data dialogs. Auto-backup's **Change folder** is
  now tested too.
- Also checked, with nothing to fix: very long words and links, 1,000-character
  entries and pasted line breaks wrap without breaking the layout on PC or phone,
  and the message bar never sits under the floating +.

## [2.7.2] — 2026-11-12

A user-acceptance, UI and UX audit: fixes only, no new features.

### Fixed
- **Keyboard:** the side panel came before the log in the Tab order, so the entry
  box was about 40 Tab presses away. The first Tab now offers **Skip to the log**,
  and the 14 activity bars are no longer Tab stops (Recent days, the arrows and the
  date picker already reach every day).
- **Phones:** the page opened scrolled down to the entry box, past the date and
  totals; it now opens at the top, without grabbing focus. The **Add** button
  shows just its **+**, so the entry box keeps room to type (on a 320 px screen it
  read "What did yo…").
- **Tap targets:** the ▲ ▼ reorder buttons, the Week view's job tags and the
  month calendar icon in Recent days are now at least 24 × 24 px (WCAG 2.2).
- **Wording:** messages and hints named days as `Thu 2026-11-12`; they now say
  **Thu 12 Nov** (with the year when it's another year), like the rest of the app.
- An empty month in Recent days showed a stray **·** in place of its count.

### Tests
- New `usability` suite: the skip link and Tab stops, day names in messages, the
  phone first view, and a 24 px minimum for every control on a phone.

## [2.7.1] — 2026-11-12

A visual, security and functional audit: fixes only, no new features.

### Fixed
- **Impossible dates in saved data or a backup** (such as `2026-02-30`) were shown
  as a different day than they were stored under. They're now dropped on load (the
  original kept under `.before-repair`, as for any repair) and skipped on import.
- **A huge file chosen for import froze the page** while it was read. Files over
  25 MB are refused straight away with a message; real backups are a few MB.
- Skipping a task under **Due today** in one tab left it showing in another open
  tab until that tab redrew. Both tabs now stay in step.
- **Turn off** auto-backup now updates the screen at once, instead of after the
  browser finished forgetting the folder.
- On phones, a **Due today** task with a job squeezed its name into a narrow column.
  The task now has its own line, with its job and buttons beneath.

### Tests and CI
- **CI was failing before any test ran:** GitHub moved `ubuntu-latest` to Ubuntu
  26.04, where Playwright 1.56 can't install its browser. CI and Release now run on
  `ubuntu-24.04`, and the test tooling is updated to Playwright 1.63.
- Newer Chromium crashes when a stored private-file-system folder is read back from
  IndexedDB in a throwaway, incognito-like profile. That's a browser bug that
  real use doesn't hit (a normal profile works). The auto-backup tests now run in a
  normal persistent profile, like real use.
- The accessibility scan could fail by timing: a message fading out on its own
  timer was sometimes scanned half-transparent (this failed the 2.7 pull request
  check once). Messages are now held still during scans, and the message bar has
  its own fully-shown accessibility check.

### Documentation
- The guide and README list every action Undo covers, and Ctrl+P among the
  shortcuts. Stale references in the test config and docs are corrected.

## [2.7.0] — 2026-10-27

### Added
- **Print the day, week or month**, not just a job. **Print / PDF** now sits with the
  copy buttons in every view, and Ctrl+P prints the open view as a report too. An
  empty day, week or month says so rather than printing a blank page.

### Changed
- **Reports look like Docket.** The Docket mark and a report label, stat tiles (the
  first in the accent colour, or the job's colour on a job report), a **By job**
  split with colour bars showing where the time went, and each day as a card with
  a date chip and its entries in their job colours. They always print on white,
  even in dark mode, with the colours kept.

## [2.6.0] — 2026-10-27

### Added
- **Archive finished jobs.** A finished job leaves the Jobs list and the job boxes,
  with all its work kept. **Show archived** under the list finds it, its Job view
  says it's archived with a **Restore** button, and search still finds it. Logging
  new work on an archived job brings it back. Undo works as usual.
- **Printable job report.** **Print / PDF** in the Job view (or Ctrl+P there) prints
  a clean report: the job, its dates and totals, every entry by day in log order,
  and what's still on the wishlist for it. Save as PDF to email it with an invoice.
- **Recurring tasks on a schedule.** Tick the days a recurring task is due in its
  editor. On those days it appears under **Due today** at the top of today's log.
  **Log** adds it with its job; **✕** skips it until next time. The Recurring list
  shows each schedule and marks what's due.
- **Automatic backup to a folder** (Chrome and Edge on a computer). Pick a folder
  once, and Docket writes `docket-backup-YYYY-MM-DD.json` there a moment after
  every change, keeping the newest 30. A OneDrive or Dropbox folder makes it an
  off-computer copy. If the browser asks for permission again in a later session,
  it pauses and offers **Resume**.

### Changed
- CSV exports gain a fourth column, **Repeats**, for recurring schedules, and an
  `Archived` row for each archived job. JSON backups carry `archived` on jobs and
  `days` on recurring tasks. Older files still import.
- Job pill text is a little darker (lighter in dark mode), so every job colour
  passes WCAG AA on the side panels too.

## [2.5.0] — 2026-10-26

A full audit: security, correctness, speed and keeping your data safe. Nothing
that worked before has changed how it works.

### Security
- **CSV exports could carry spreadsheet formulas.** An entry or job starting with
  `=`, `+`, `-` or `@` would run as a formula when the CSV was opened in Excel.
  These are now written with a leading apostrophe, which import strips again, so
  round trips are exact.
- Updated `body-parser` (a dependency of the server) past a published advisory. CI
  now fails if a high-severity advisory affects anything that ships.

### Fixed
- **Left open past midnight, "today" stayed yesterday**, and new entries landed on
  the wrong day. Docket now follows the date if you were looking at today.
- **Imports had no Undo.** Every CSV and JSON import can now be undone from its
  message (or Ctrl+Z), like Clear data.

### Improved
- **Much faster with a big log.** With 10,000 entries, adding an entry dropped from
  about 250 ms to 85 ms, opening a job from 500 ms to 140 ms, opening search from
  390 ms to 50 ms, and loading from 400 ms to 210 ms.
- **Smaller download.** The server sends the page precompressed (brotli or gzip):
  about 44 KB instead of 212 KB.
- **Backup reminder.** The Backup section says when you last exported, and gently
  reminds you when it's been two weeks and the log has changed, or when there's a
  sizeable log and no backup yet.
- **Persistent storage.** Docket asks the browser not to clear its data to free up
  space.
- **A safety net for bugs.** An unexpected error now shows a calm message instead of
  failing silently.
- Text boxes take up to 1,000 characters, so a stray paste of a whole document
  can't swamp the log.

## [2.4.0] — 2026-10-23

### Changed
- **Three-column layout on PC.** The Wishlist has its own panel on the right, full
  height. Recent days, Jobs, Recurring and Backup stay on the left, and the log in the
  middle now fills the space between them instead of stopping at a fixed width.
  On small laptops (under 1200px wide) the Wishlist folds in under the log. On phones
  it comes straight after the log, before the other lists.

## [2.3.1] — 2026-10-21

A stability, accessibility and documentation release: no new features.

### Fixed
- **Docket wouldn't start at all when the browser blocks storage** (some private
  windows, site data turned off). It now starts, works for the session, shows
  **Not saved**, and explains why.
- **One damaged saved record stopped the whole log from showing.** Records are now
  validated on load: readable ones are repaired (missing ids, duplicate ids, bare
  strings) and the rest dropped. The original is kept under `<key>.before-repair`
  first, including text that isn't valid JSON.
- **Two open tabs overwrote each other's work.** Tabs now stay in step: a change in
  one shows up in the other straight away, and the theme follows too.
- **Ctrl+Z could throw away newer work.** Undoing a clear after logging new
  entries restored the old snapshot over them. Undo now only runs while nothing has
  been saved since, and otherwise says so.
- After jumping to a search result, the next key press could be swallowed by the
  hidden search box. Focus now moves to what you jumped to.
- Messages at the bottom of the screen could cover buttons (such as the guide's
  "Got it"). Only a message's Undo button takes clicks now.
- The Week quick-add's hint didn't name a job that was typed but not yet created.

### Accessibility
- Every view and dialog now passes WCAG 2.1 AA in both themes (axe-core, checked on
  every test run). 58 issues were fixed: muted text and labels raised to at least
  4.5:1 contrast, the Job view's colour tile made readable for every job colour,
  accessible names matched to visible text, search results announce which one is
  selected, and the guide's text can be scrolled from the keyboard.

### Changed
- ESLint (recommended rules) runs in `npm run check` and CI.
- New `docs/ARCHITECTURE.md`; README and data-format docs cover reliability and
  repair.

## [2.3.0] — 2026-10-19

Easier to use, everywhere.

### Added
- **Search** — press `/` or Ctrl+K (or the Search button) to find any entry, job,
  wishlist or recurring item. Every word must match the text, job or date
  ("smith oct" works); jobs list first, then the log newest first. ↑ ↓ and Enter jump
  straight to the result, which lights up.
- **Ctrl+Z** undoes the last delete, move, link or clear for a minute after it
  happens, not just while the Undo button is showing.
- **Reorder in the Week and Job views** too: drag within a card, or focus the coloured
  dot and press ↑ ↓; ▲ ▼ buttons on touch screens. In the Job view, moves are among that
  job's entries and leave other jobs' entries where they are.
- **Quick add in the Week view** — the + on a day's card adds an entry to that day
  without leaving the week, using the job set in the Job box.

### Changed
- **Dark mode is a neutral grey** instead of a warm brown-black.
- **Esc** leaves the entry box (and the Job box), so the single-key shortcuts work
  straight after typing. `/` now opens search; `N` still starts a new entry.
- The floating + steps aside while the entry box is on screen, and on phones while
  you're typing, instead of covering the list.
- Week-view rows on phones lay out as a grid: reorder buttons, text with its job
  beneath, then edit and delete.

## [2.2.0] — 2026-10-19

### Added
- **Reorder a day's entries.** Drag an entry up or down the list (a line shows where
  it will land), or Tab to its number and press ↑ / ↓. Touch screens get ▲ ▼ buttons
  beside each entry instead. The order is what the copy buttons and exports use.

## [2.1.0] — 2026-10-18

A complete visual redesign. Every control is where it was; everything looks new.

### Changed
- **New look ("Studio")**: a light, warm canvas with one tangerine accent replaces the
  black-and-silver ledger. Bold, left-aligned headings; lists move to a left panel;
  entering work happens in one composer bar.
- **Week view** is a timeline; **Month view** is a grid of rounded, heat-shaded tiles.
- New app icon and favicon.

### Added
- **A colour per job**, used on its pills, down the edge of its entries, on calendar
  bars and to tint the Job view. Existing jobs get colours automatically; click a job's
  dot in the sidebar to change it. Colours are kept in JSON backups.
- **Month cells show how each day split between jobs**, as a coloured bar.
- **Dark mode** that follows the system, and a theme button to pin light or dark.

## [2.0.0] — 2026-10-17

The jobs release, and the first release as an installable application.

### Added
- **Jobs** — group work under a client, site or project. A sticky Job box beside
  the entry box tags new entries; each entry shows its job as a pill; the Job view
  lists everything on a job across every day, with totals and **Copy Job** for invoices.
- Jobs on the **Wishlist** and **Recurring** lists too: a job box on each list's add
  row, a ✎ editor for text and job, and logging an item carries its job onto the entry.
  The Job view lists the job's wishlist and recurring items, ready to log with ↳.
- **Move entries between days** — change the date in the editor, or drag an entry onto
  another day in Recent days, a Week card or a Month cell.
- **Edit and delete entries from the Week and Job views**, not just the Day view.
- **Drag onto a job** — drop an entry, wishlist or recurring item on a job in the
  sidebar, or on the open Job view, to link it.
- The **Month** calendar names each day's jobs, busiest first.
- **Clear data…** — wipe the log, jobs, wishlist and/or recurring tasks, with a backup
  button first and Undo after.
- Undo when sending a wishlist or recurring item to a day.
- **Installable app (PWA)** — manifest, icons, an Install button, and a service worker
  so the installed app opens offline.
- A Node/Express server for hosting (Railway-ready), with a hash-based
  Content-Security-Policy, hardening headers, `/healthz` and `/download`.
- End-to-end test suite (Playwright), CI, and a release workflow that attaches the
  standalone `Docket.html` to each GitHub Release.

### Changed
- CSV export and import now carry jobs (third column) and the Wishlist and Recurring
  lists (`Wishlist` / `Recurring` in the Date column), so CSV round-trips everything.
- Imports treat the same task on two different jobs as two items, and fill in a
  missing job on a matching item instead of duplicating it.
- The source is now split into `src/` (HTML, CSS, JS) and built back into one
  self-contained file, so the double-click download still works.

### Fixed
- Imports silently dropped an entry that had the same text as another entry on the
  same day but a different job.
- Dragging onto a job did nothing in Chrome and Edge (the drop was refused).

### Upgrading
Data carries over automatically — same storage, nothing to migrate. The installed app
and the standalone file each keep their own data: to switch, use **Export JSON** in
one and **Import JSON** in the other.

## [1.0.0]

The single-file daily log: Day, Week and Month views, Wishlist and Recurring lists,
copy to clipboard, CSV and JSON import/export, Undo, keyboard shortcuts and the
black-and-silver ledger design.

[2.4.0]: https://github.com/Stefs-Time/Track/releases/tag/v2.4.0
[2.3.1]: https://github.com/Stefs-Time/Track/releases/tag/v2.3.1
[2.3.0]: https://github.com/Stefs-Time/Track/releases/tag/v2.3.0
[2.2.0]: https://github.com/Stefs-Time/Track/releases/tag/v2.2.0
[2.1.0]: https://github.com/Stefs-Time/Track/releases/tag/v2.1.0
[2.0.0]: https://github.com/Stefs-Time/Track/releases/tag/v2.0.0
