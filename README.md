# Docket — Daily Work Log

A daily log of work done with a black-and-silver ledger look, built for consulting: record what you did each day, then copy it straight into an email, timesheet or invoice. Runs locally on Windows — no installs, no server, no account. It's a single file.

## How to use

1. Download `Docket.html` (or clone this repo).
2. Double-click `Docket.html` — it opens in your browser (Edge, Chrome, etc.).
3. Pick a date (defaults to today), type what you did, press **Enter** to add it.

The full guide is built into the app itself — it pops up on first use, and the **?** button (top right) reopens it any time. The HTML file is all you need; this README just mirrors it.

Tip: right-click `Docket.html` → *Send to* → *Desktop (create shortcut)* so it's always one click away.

## Features

- **Jobs** — group work under one heading (a client, site or project). Type a name in the **Job** box beside the entry box and every entry you add goes against it; it stays set so you can log a run of entries in a row. Each entry shows its job as a pill — click it (or the job in the sidebar's **Jobs** list) to open the **Job view**: every entry on that job across every day, with totals and a **Copy Job** button that's ready for an invoice. Change an entry's job with the pencil; rename or delete jobs from the sidebar (deleting a job keeps its entries).
- **Per-day lists** — use the date picker or ‹ › buttons to move between days; the sidebar groups every logged day by month, with old months folded away.
- **Day, Week and Month views** — a weekly overview and a monthly calendar with entry counts; click any day to open it, and the copy buttons follow the view (Copy Month = the whole month-to-date, ready to paste).
- **Activity at a glance** — stat tiles count the open day, its week and its month; a clickable 14-day activity chart sits beside them, and the month calendar shades busier days like a heatmap.
- **Copy & paste** — "Copy Day to Clipboard" copies the date plus a bulleted list, ready to paste into an email, timesheet or invoice; entries on a job carry it in brackets. "Copy Items Only" copies just the lines.
- **Wishlist** — queue things that still need doing, then drag them onto a day (or click ↳) when they're done.
- **Recurring tasks** — keep often-repeated tasks in the sidebar and drag (or ↳) them onto any day; they stay in the list for next time, and duplicates on the same day are skipped.
- **Edit in place** — hover an entry and click the pencil to edit (Save/Cancel), or ✕ to delete.
- **Undo** — deleting an entry, a wishlist/recurring item, or clearing a whole day pops up an **Undo** button for a few seconds, so nothing is lost to a slipped click.
- **Keyboard shortcuts** — `←` `→` move between days (weeks/months in those views), `T` jumps to today, `D`/`W`/`M` switch views, `N` starts a new entry, `J` picks the job, `C` copies the open view, `?` opens the guide.
- **Hover hints** — every button and control explains itself when you hover over it, or when you Tab to it with the keyboard.
- **Auto-save** — everything is stored in the browser's local storage on your machine, instantly, as you type.
- **CSV import/export** — bulk-load the month to date from a spreadsheet, or export everything for Excel.
- **Backup** — Export JSON saves all your data (log, jobs, wishlist and recurring tasks) to a file; Import JSON merges a backup back in (no duplicates). Export CSV holds the log and jobs, including jobs with nothing logged yet. The wishlist and recurring tasks are only in the JSON backup.
- **Clear data** — the **Clear data…** button under Backup & data wipes the log, jobs, wishlist and/or recurring tasks; you tick which. It shows what each will remove, offers a one-click JSON backup first, and pops up an **Undo** afterwards. To reload cleanly, clear everything, then Import JSON (or Import CSV).

## CSV format

One entry per row: date in the first column, task in the second, and optionally the job in the third.

```csv
Date,Task,Job
2026-07-01,"Installed blinds, lounge",Smith House
2026-07-01,Collected payment,Smith House
02/07/2026,Quoted new office fit-out,
```

The import is forgiving:

- A header row is optional and skipped automatically — but to import jobs, include it with `Job` (or `Project` / `Client`) as the third heading. Without that header, any extra columns are added to the task text, as before. Jobs that don't exist yet are created.
- Dates can be `2026-07-01`, `01/07/2026`, `1/7/2026`, `01-07-2026` or `01.07.2026` (day-first assumed).
- Comma, semicolon, or tab delimited — detected automatically, so Excel's regional "Save as CSV" quirks are fine.
- Duplicate entries (same date + same text) and unreadable rows are skipped, and the import tells you how many.

- A row with only a Job (no date, no task) creates that job. Export uses this for jobs with nothing logged yet, so they survive a round trip.

**Export CSV** produces this exact format, so you can export, edit in Excel, and re-import.

## Notes

- Data lives in the browser you open the file with. If you switch browsers (e.g. Chrome → Edge), Export from the old one and Import in the new one.
- Clearing your browser's site data will erase the log — keep an occasional Export as a backup.
- The app was previously called Track; its saved data carries over unchanged after the rename.
