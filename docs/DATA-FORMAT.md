# Docket data formats

Docket keeps everything in the browser's `localStorage`, on the user's own
device. Nothing is sent anywhere. This page documents the two file formats
used to move that data around, and the storage layout behind them.

## JSON backup (Export JSON / Import JSON)

The complete, exact backup: log, jobs, wishlist and recurring tasks, with
every job link. Use it to move between browsers, computers, or between the
installed app and the standalone file.

```json
{
  "2026-10-05": [
    { "id": "1759650000000-ab12c", "text": "Installed blinds, lounge", "job": "1759640000000-xy98z" },
    { "id": "1759650000001-cd34e", "text": "Admin and emails" }
  ],
  "_jobs": [
    { "id": "1759640000000-xy98z", "text": "Smith House", "color": 0 },
    { "id": "1759640000001-zz11a", "text": "Garden shed", "color": 2, "archived": true }
  ],
  "_wishlist": [
    { "id": "1759650000002-ef56g", "text": "Order paint", "job": "1759640000000-xy98z" }
  ],
  "_recurring": [
    { "id": "1759650000003-gh78i", "text": "Timesheet", "days": [5] }
  ],
  "_docket": { "version": 2, "exported": "2026-10-05T14:03:11.000Z" }
}
```

- Each `YYYY-MM-DD` key holds that day's entries, in order.
- `job` is optional on entries, wishlist and recurring items. It points at a
  job's `id` in `_jobs`.
- `color` on a job is an index (0–7) into Docket's job palette. It's optional;
  jobs without one are given one when loaded.
- `archived: true` on a job hides it from the Jobs list and job boxes; its
  work is untouched. Absent means active.
- `days` on a recurring task lists the weekdays it's due, `0` = Sunday …
  `6` = Saturday, sorted. Absent means no schedule.
- `_docket.version` is the format version. Version 1 backups (from before
  jobs) have no `_jobs` and no `job` fields, and still import.

**Importing merges.** Nothing already there is removed or overwritten:

- Jobs merge **by name** (case-insensitive). The backup's job ids are mapped
  onto the local ones.
- An item is a duplicate when the same text is already in the same place
  (same day, or same list) **with the same job**. The same text on two
  different jobs is two items.
- If the backup has a job and the matching local item has none, the job is
  filled in rather than the item being duplicated.
- A backup without jobs (version 1) treats the same text in the same place as
  a duplicate, whatever its job.
- An archived job in the backup is archived here only if this import created
  it, so restoring an old backup never hides a job you're using.
- A recurring task's `days` are filled in only where the local task has no
  schedule of its own.

Automatic backups to a folder (Chrome and Edge) are this same format, written
to `docket-backup-YYYY-MM-DD.json` after each change. The newest 30 such files
are kept; other files in the folder are never touched.

## CSV (Export CSV / Import CSV)

For spreadsheets. One item per row: **Date, Task, Job, Repeats**.

```csv
Date,Task,Job,Repeats
2026-07-01,"Installed blinds, lounge",Smith House
02/07/2026,Quoted new office fit-out,
Wishlist,Order paint,Smith House
Recurring,Timesheet,,Every Friday
Recurring,Site check,Office fit-out,Weekdays
,,Shopfront
Archived,,Garden shed
```

| First column | Meaning |
|---|---|
| A date | A log entry on that day |
| `Wishlist` | An item on the wishlist |
| `Recurring` | A recurring task |
| *(empty, with only a Job)* | A job with nothing on it yet |
| `Archived`, with only a Job | An archived job (archived on import only if the import creates it) |

- **Repeats** (fourth column, read when the header names it `Repeats`): the
  days a recurring task is due. Export writes `Every day`, `Weekdays`,
  `Weekends`, `Every Friday` or a list like `Mon Wed Fri`. Import also accepts
  `daily`, `fridays`, `Mon, Tue & Thu` and similar. On other rows it's ignored.
  Rows have three columns unless they carry a schedule.

- **Dates**: `2026-07-01`, `2026/07/01`, `01/07/2026`, `1/7/2026`,
  `01-07-2026` or `01.07.2026`. Day-first is assumed unless the first number
  can only be a month.
- **Delimiters**: comma, semicolon or tab, detected from the first line, so
  regional Excel exports work.
- **Header row**: optional. To import jobs, include it with `Job` (or
  `Project`, `Client`, `Group`) as the third heading. Without that header,
  extra columns are joined onto the task text, the way pre-jobs files worked.
- **Quoting**: standard CSV — wrap fields containing commas, quotes or line
  breaks in double quotes, and double any quotes inside.
- Exports start with a UTF-8 byte-order mark so Excel reads accents correctly.
- **Formula guard**: a task or job that starts with `=`, `+`, `-`, `@`, tab or
  carriage return is exported with a leading apostrophe (`'=SUM(A1)`), so a
  spreadsheet shows it as text instead of running it as a formula. Import
  removes that apostrophe again (only when the next character is one of
  those), so export → import gives back the exact text.
- Every import, CSV or JSON, can be undone from its message.
- Duplicates follow the same rules as the JSON import above. Rows with an
  unreadable date or no task are skipped and counted in the import message.

## Storage keys

The keys keep the app's original `track.` prefix so data saved before the
rename to Docket keeps loading.

| Key | Holds |
|---|---|
| `track.tasks.v1` | The log: `{ "YYYY-MM-DD": [entry, …] }` |
| `track.jobs.v1` | Jobs: `[{ id, text, color, archived? }]` |
| `track.wishlist.v1` | Wishlist: `[{ id, text, job? }]` |
| `track.recurring.v1` | Recurring tasks: `[{ id, text, job?, days? }]` |
| `track.view.v1` | Last view (`day`, `week`, `month`) |
| `track.helpseen.v1` | Whether the first-run guide has been shown |
| `track.theme.v1` | A pinned theme (`light` / `dark`); absent means follow the system |
| `track.lastbackup.v1` | The last export: `{ "at": "YYYY-MM-DD", "entries": n }`, for the backup reminder |
| `track.persist.v1` | Whether persistent storage was requested: `asked`, `granted` or `declined` |
| `track.skipped.v1` | Recurring tasks skipped today: `{ "day": "YYYY-MM-DD", "ids": [...] }`; ignored once the day has passed |
| IndexedDB `docket` → `kv` → `backupDir` | The folder chosen for automatic backups (a browser folder handle; it can't live in `localStorage`) |
| `<key>.before-repair` | The original text of a store that had to be repaired on load (see below) |

## Validation and repair

Every record is checked when Docket loads:

- An entry or list item needs non-empty `text`. A bare string becomes the text, and a number is converted. A missing or duplicate `id` is replaced.
- A day key must be `YYYY-MM-DD` and hold a list.
- A job needs a name. A missing colour, or one outside 0–7, is given a free colour. `archived` is kept only when it's `true`.
- A recurring task's `days` keeps whole numbers 0–6, once each, sorted; an empty list means no schedule.

Anything else is dropped. If any record changed, the store's original text is first saved under `<key>.before-repair` (one slot per store, replaced by the next repair). Then the cleaned data is saved and a message says so. Text that isn't valid JSON at all is kept the same way, and the store starts empty.

`localStorage` belongs to one browser profile and one site (or, for the
standalone file, to `file://`). That's why the installed app and the
standalone file each have their own data, and why moving between them goes
through Export JSON → Import JSON.
