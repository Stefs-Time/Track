# Track — Daily Task List

A simple, dark-themed daily task list that runs locally on Windows. No installs, no server, no account — it's a single file.

## How to use

1. Download `Track.html` (or clone this repo).
2. Double-click `Track.html` — it opens in your browser (Edge, Chrome, etc.).
3. Pick a date (defaults to today), type what you did, press **Enter** to add it.

The full guide is built into the app itself — it pops up on first use, and the **?** button (top right) reopens it any time. The HTML file is all you need; this README just mirrors it.

Tip: right-click `Track.html` → *Send to* → *Desktop (create shortcut)* so it's always one click away.

## Features

- **Per-day lists** — use the date picker or ‹ › buttons to move between days; the sidebar shows every day that has entries.
- **Copy & paste** — "Copy day to clipboard" copies the date plus a bulleted list, ready to paste into an email, timesheet or invoice. "Copy items only" copies just the lines.
- **Edit in place** — click any item to edit it; press Enter to save, Escape to cancel. Emptying an item deletes it.
- **Auto-save** — everything is stored in the browser's local storage on your machine, instantly, as you type.
- **CSV import/export** — bulk-load the month to date from a spreadsheet, or export everything for Excel.
- **Backup** — Export saves all your data to a JSON file; Import merges a backup file back in (no duplicates).

## CSV format

One entry per row: date in the first column, task in the second.

```csv
Date,Task
2026-07-01,"Installed blinds, lounge"
2026-07-01,Collected payment
02/07/2026,Quoted new office fit-out
```

The import is forgiving:

- A header row is optional and skipped automatically.
- Dates can be `2026-07-01`, `01/07/2026`, `1/7/2026`, `01-07-2026` or `01.07.2026` (day-first assumed).
- Comma, semicolon, or tab delimited — detected automatically, so Excel's regional "Save as CSV" quirks are fine.
- Duplicate entries (same date + same text) and unreadable rows are skipped, and the import tells you how many.

**Export CSV** produces this exact format, so you can export, edit in Excel, and re-import.

## Notes

- Data lives in the browser you open the file with. If you switch browsers (e.g. Chrome → Edge), Export from the old one and Import in the new one.
- Clearing your browser's site data will erase the list — keep an occasional Export as a backup.
