# How Docket is built

A guide for anyone changing the code: how the pieces fit, the rules every
change follows, and where to look for what. For the saved-data formats see
[DATA-FORMAT.md](DATA-FORMAT.md).

## The shape of it

Docket is a single-page app with **no framework and no runtime
dependencies**. It ships as one self-contained HTML file, which is what lets
the same code run three ways:

| How it runs | What serves it | Storage origin |
|---|---|---|
| Installed app (PWA) | `server.js` → `dist/index.html`, plus the service worker | the site's origin |
| In a browser tab | the same server | the site's origin |
| Double-clicked file | nothing — `file://dist/Docket.html` | `file://` |

The page is a three-column grid on PC: `.side-left` (Recent days, Jobs,
Recurring, Backup), `.main` (the views, filling the space) and `.side-right`
(the Wishlist). Under 1200px wide the Wishlist moves under `.main`, and under
860px everything stacks in one column: log, Wishlist, then the other lists.
The breakpoints live at the end of `styles.css`.

The source is split for editing and joined at build time:

```
src/index.html   markup: top bar, side panel, views, dialogs
src/styles.css   every style; design tokens at the top, light and dark
src/app.js       every behaviour, in one strict-mode IIFE
src/sw.js        service worker (offline support for the installed app)
scripts/build.js inlines styles.css and app.js into index.html → dist/
```

`scripts/build.js` also stamps the version into the app and a content hash
into the service worker, so every release gets a fresh offline cache.

## app.js, top to bottom

The file is ordered so that each section only depends on the ones above it
(function declarations are hoisted, but data is not):

| Section | What it owns |
|---|---|
| storage | `readStore` / `setPref`: the only `localStorage` access, all guarded |
| loading, with repair | validates every saved record; keeps a backup if anything is repaired |
| jobs | job lookup, creation (`ensureJob`), colours, `jobStats`, import merging |
| date helpers | ISO dates, week/month arithmetic, the forgiving CSV date parser |
| rendering | `render()` and one renderer per view: Day, Week, Month, Job |
| reordering a day | `placeEntry` / `stepEntry` and the drag, keyboard and touch handles |
| jobs sidebar | the Jobs list: open, rename, recolour, delete, drop-to-link |
| entries anywhere | `findEntry`, `moveEntry`, `linkToJob`, drop targets |
| wishlist & recurring | the two sidebar lists, their editor and sending items to a day |
| actions | adding and removing entries, copy to clipboard, toasts and undo |
| backups, snapshots | the last-backup line, whole-state snapshots for undoing a clear or import |
| CSV / JSON backup | import and export, the CSV formula guard |
| wiring | event listeners for the static page controls |
| clear data, search, help | the three dialogs |
| keyboard shortcuts, hover hints | global key handling and the tooltip |
| theme, installable app | light/dark, manifest and service-worker registration |
| unexpected errors | the global error net: one calm message, at most every 10s |
| a new day | follows the date past midnight while Docket is left open |
| other tabs | keeps two open tabs in step via the `storage` event |

## State and the render cycle

All state lives in a few variables at the top of the IIFE: `data` (the log,
keyed by `YYYY-MM-DD`), `jobs`, `wishlist`, `recurring`, plus view state
(`view`, `currentDate`, `currentJob`, `editingId`, …).

There is no virtual DOM. **`render()` redraws everything** from that state:
the header, the active view, and the side panel. The data is small (a log is
thousands of short strings at most), so a full redraw is instant, and it
removes a whole class of "the sidebar didn't update" bugs.

A few things a redraw would otherwise recompute are cached, which keeps a
10,000-entry log under 100 ms per change (`safety.spec.js` holds a budget):
formatted date labels (`formatOnce`), icon SVGs (`icon()` clones a parsed
template), and the search index (`searchCorpus`, rebuilt only when
`dataVersion` moves on). If you add a cache, key it on `dataVersion` or on
values that can't change, never on time.

Every change follows the same four steps:

```js
item.text = newText;      // 1. change the state
save();                   // 2. write it (save / saveJobs / saveWishlist / saveRecurring)
render();                 // 3. redraw
toast("Done", undoFn);    // 4. confirm, with Undo where the change is destructive
```

UI that must survive a redraw, such as an open editor or a focused handle,
is described by state (`editingId`, `queueEdit`, `weekAdding`) and rebuilt
by the renderer. Focus is restored explicitly afterwards (`refocusEntry`).

## Rules every change follows

- **Never put saved text into HTML.** User text goes in through
  `textContent` or text nodes only. The only `innerHTML` assignments in
  the app are the fixed icon constants. Search highlighting is built from
  text nodes for the same reason.
- **Never touch `localStorage` directly.** Use `readStore`, `writeStore`
  (via the `save*` functions) or `setPref`. Storage can throw on any call
  (when blocked or full), and the guards are what keep the app running.
- **Every saved record is validated on load** (`cleanItem`, `cleanJob`).
  If you add a field, add it there too, or it will be stripped as damage.
- **Ids are unique within a store.** Entries are found by id across all
  days (`findEntry`), which is what lets the Day, Week and Job views share
  edit, delete and move.
- **Undo is a closure plus a version check.** `toast(msg, undoFn)` records
  the current `dataVersion`. Undo runs only if nothing has been saved since,
  so it can never overwrite later work.
- **Reordering is relative.** Moves are "put this entry before or after that
  one" (`placeEntry`), never an index. That's what makes the Job view, which
  shows only part of each day, reorder correctly.
- **Colours come from tokens.** Use the CSS custom properties (`--ink`,
  `--surface`, `--accent`, `--job`, …), never literal colours, so both themes
  and the job palette keep working. Muted text (`--ink-3`) is tuned to
  pass WCAG AA on every surface; the accessibility test checks it.

## Drag and drop

Drags carry a short text payload: `e:<id>` for an entry, `w:<id>` for a
wishlist item, `r:<id>` for a recurring item. Drop targets read it:

- a **day** (Recent days row, Week card, Month cell, the Day log) logs or
  moves the item there: `makeDropTarget`
- an **entry of the same day** reorders: `makeReorderTarget`
- a **job** (sidebar row, open Job view) links the item to it:
  `makeJobDropTarget`

Sources allow `linkMove`, because Chrome refuses a drop whose effect the
source didn't allow. Touch screens can't drag-and-drop, so every reorder
also has ▲ ▼ buttons, and every move has a non-drag route (the editor's date
field, ↳ buttons).

## Keeping data safe

- **Persistent storage:** after the first successful save, `askToKeepData`
  asks the browser (`navigator.storage.persist`) not to evict Docket's
  storage under pressure. It asks once and records the answer.
- **Backup reminder:** each export records the date and entry count
  (`noteBackup`). The Backup section shows "Last backup …", and turns into a
  reminder after 14 days if the log has changed, or straight away with 20+
  entries and no backup at all.
- **Undoable imports and clears:** `snapshotState` copies all four stores
  before the change; Undo hands it to `restoreState`.
- **CSV formula guard:** `csvSafe` / `csvUnsafe` add and remove the leading
  apostrophe described in DATA-FORMAT.md.
- **Error net:** uncaught errors and rejections show one message (at most
  every 10 seconds). Saved data is never touched by it.
- **Midnight:** `followToday` runs on focus, on becoming visible and every
  minute. If you were looking at today, you move to the new today.
- **Length limits:** entry and list boxes take up to 1,000 characters,
  job names 60.

## Two tabs, blocked storage, damaged data

- **Two tabs:** when one tab saves, the browser fires `storage` in the
  others, which reload from storage and redraw. Pending undos are dropped,
  because they refer to the old copies.
- **Blocked storage:** the app starts, works for the session, shows "Not
  saved", and says so in a message. The first-run guide doesn't open,
  because it couldn't remember being seen.
- **Damaged data:** unreadable records are repaired or dropped on load.
  The original is kept under `<key>.before-repair` before the cleaned
  version is saved, and a message says so.

## The server

`server.js` is a small Express app that serves `dist/` with:

- a Content-Security-Policy that allows the page's inline scripts **by
  hash**, recomputed when the file changes, so no `unsafe-inline` script;
- `no-cache` on the page, manifest and service worker, so updates land on
  the next launch; long caching for icons;
- precompressed delivery: the build writes `.br` and `.gz` copies of the
  page, service worker, manifest and SVG icon, and `servePrecompressed`
  sends one when the browser accepts it (brotli first), with the same headers
  via `applyHeaders` and `Vary: Accept-Encoding`. The page goes out at about
  a fifth of its size, and nothing is compressed per request;
- `/healthz` for the platform and `/download` for the standalone file;
- JSON 404s and a graceful shutdown on `SIGTERM`.

## Tests and checks

`npm test` builds, then runs the Playwright suites in `tests/` against the
real server in Chromium:

| Suite | Covers |
|---|---|
| `jobs`, `lists-and-jobs` | jobs end to end, list items with jobs |
| `entries`, `reorder`, `ease` | moving, editing anywhere, reordering, search, undo, quick-add |
| `clear-data` | Clear data, Undo, and clear → re-import round trips |
| `design` | job colours, the theme switch |
| `layout` | three columns on PC, the small-laptop and phone fallbacks |
| `robustness` | blocked storage, damaged data, two tabs, stale undo |
| `safety` | CSV formula guard, undoing imports, the backup reminder, the error net, midnight, a speed budget at 10,000 entries |
| `a11y` | axe-core, WCAG 2.1 A/AA, every view and dialog, both themes |
| `app` | server headers, CSP and compression, installability, offline use, the standalone file |

The suites read as user-acceptance scripts: one realistic flow per test,
with a named `check` at each step. They're soft assertions, so a failure
reports every broken step, not just the first.

`npm run check` runs ESLint (`eslint.config.js`, the recommended rule set)
and syntax-checks the browser scripts. CI runs both on every push.
