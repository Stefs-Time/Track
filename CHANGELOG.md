# Changelog

All notable changes to Docket. Versions follow [Semantic Versioning](https://semver.org/).

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

[2.0.0]: https://github.com/Stefs-Time/Track/releases/tag/v2.0.0
