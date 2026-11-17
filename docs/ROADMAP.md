# Docket roadmap

What's planned after the current release. It's the same plan shown in the app
under **Docket at a glance** (the ✦ button) and in its downloadable PDF, so
if you change it here, change it there too: the markup is between the
`overview:start` and `overview:end` markers in `src/index.html`. Then run
`npm run overview` to re-make the PDF.

A roadmap is a plan, not a promise: what comes first may change as we learn
what helps most.

## Now — being designed

| Feature | What it does |
|---|---|
| **Hours & rates** | Add time and a rate to any entry, with totals per job, week and month. |
| **Invoice-ready reports** | Turn a job's hours into a totalled report you can send the client. |
| **Job details** | Client, site address and contact, kept with each job. |

## Next — coming after

| Feature | What it does |
|---|---|
| **Photos on entries** | Snap the work on site and keep it with the day. |
| **Reminders** | A nudge when a recurring task is due. |
| **Quick phrases** | Save the entries you type every week and add them in one tap. |
| **Tags & filters** | Slice the log by type of work, across every job. |

## Later — on the horizon

| Feature | What it does |
|---|---|
| **Sync across devices** | Optional and end-to-end encrypted: one log on phone and computer. |
| **Team mode** | Share jobs with a crew and see everyone's work in one place. |
| **Accounting exports** | Send hours straight to Xero, QuickBooks or Sage. |
| **Voice entry** | Say what you did; Docket writes it down. |

## Things to settle before building

- **Hours & rates** change what an entry is (today: text and an optional job).
  The JSON and CSV formats, import, every view and every report need the new
  fields, and old backups must still import. See `docs/DATA-FORMAT.md`.
- **Sync** and **Team mode** are the first features that need a server to
  hold data, and accounts. That ends "nothing leaves your device", so they
  must stay optional, with the data encrypted before it leaves.
- **Reminders** while Docket is closed need push notifications, which need
  a server and the installed app.
