// For whoever does the paperwork: Reports (any dates, any job — to print,
// copy or open in Excel), the ink-friendly Paper print style, and pasting a
// whole list as separate entries.
"use strict";

const fs = require("node:fs");
const { test } = require("@playwright/test");
const { check, iso, seed, state } = require("./helpers");

const T = iso(0);
test.use({ viewport: { width: 1360, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });

const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const now = new Date();
const LM_FIRST = isoOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const LM_MID = isoOf(new Date(now.getFullYear(), now.getMonth() - 1, 12));
const LM_LAST = isoOf(new Date(now.getFullYear(), now.getMonth(), 0));
const LONG_AGO = isoOf(new Date(now.getFullYear() - 2, 5, 15));

function seedData() {
  return {
    "track.jobs.v1": [{ id: "j1", text: "Smith House", color: 0 }, { id: "j2", text: "Office fit-out", color: 1 }, { id: "j3", text: "Old barn", color: 2, archived: true }],
    "track.tasks.v1": {
      [T]: [{ id: "t1", text: "Today's job", job: "j1" }],
      [LM_FIRST]: [{ id: "a", text: "Measured up", job: "j1" }, { id: "b", text: "Admin, banking" }],
      [LM_MID]: [{ id: "c", text: "Fitted \"blackout\" blinds", job: "j1" }, { id: "d", text: "=SUM(A1) site visit", job: "j2" }],
      [LM_LAST]: [{ id: "e", text: "Snag list", job: "j2" }],
      [LONG_AGO]: [{ id: "f", text: "Cleared the barn", job: "j3" }]
    }
  };
}
const clip = (page) => page.evaluate(() => navigator.clipboard.readText());
const stubPrint = (page) => page.evaluate(() => { window.printed = 0; window.print = () => { window.printed++; }; });

test("Reports: pick a period and a job, then copy it or open it in Excel", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page, seedData());
  await page.goto("/");
  await page.keyboard.press("Escape");
  await page.keyboard.press("r");
  check(await page.isVisible("#reportOverlay .modal"), "R opens Reports");
  check(await page.evaluate(() => document.activeElement.id) === "repPeriod", "…with the cursor on Period");
  check(await page.inputValue("#repPeriod") === "thismonth", "it starts on This month");
  await page.keyboard.press("Escape");
  check(!(await page.isVisible("#reportOverlay .modal")), "Esc closes it");

  await page.click("#reportBtn");
  await page.selectOption("#repPeriod", "lastmonth");
  check(await page.inputValue("#repFrom") === LM_FIRST && await page.inputValue("#repTo") === LM_LAST, "Last month fills in its first and last day");
  check((await page.textContent("#repSum")).startsWith("5 entries across 3 days · 2 jobs"), "the dialog counts what you'll get: " + await page.textContent("#repSum"));
  check((await page.locator("#repJob option").allTextContents()).join("|") === "All jobs|Office fit-out|Smith House|Old barn (archived)|Entries with no job", "every job is offered, archived last");

  // one job
  await page.selectOption("#repJob", "j1");
  check((await page.textContent("#repSum")).startsWith("2 entries across 2 days"), "choosing a job narrows it");
  await page.click("#repCopy");
  let text = await clip(page);
  check(text.startsWith("Smith House — "), "the copy is headed with the job and the dates: " + text.split("\n")[0]);
  check(text.includes("- Measured up") && text.includes("- Fitted \"blackout\" blinds") && !text.includes("Admin") && !text.includes("Today's job"), "only that job, only that period");
  check(!text.includes("(Smith House)"), "a one-job report doesn't repeat the job on every line");
  check(!(await page.isVisible("#reportOverlay .modal")) && await page.evaluate(() => document.activeElement.id) === "reportBtn", "it closes, focus back on Reports");

  // entries with no job, and the choices are remembered
  await page.click("#reportBtn");
  check(await page.inputValue("#repPeriod") === "lastmonth" && await page.inputValue("#repJob") === "j1", "it reopens on the last choices");
  await page.selectOption("#repJob", "none");
  check((await page.textContent("#repSum")).startsWith("1 entry across 1 day"), "Entries with no job");

  // Excel: one row per entry
  await page.selectOption("#repJob", "");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#repCsv")]);
  check(dl.suggestedFilename() === `docket-report-${LM_FIRST}-to-${LM_LAST}.csv`, "the file is named for its dates: " + dl.suggestedFilename());
  const csv = fs.readFileSync(await dl.path(), "utf8");
  const rows = csv.replace(String.fromCharCode(0xFEFF), "").split("\r\n");
  check(rows[0] === "Date,Day,Task,Job" && rows.length === 6, "a heading row and one row per entry");
  const dayName = new Date(LM_FIRST + "T12:00").toLocaleDateString("en", { weekday: "long" });
  check(rows[1] === `${LM_FIRST},${dayName},Measured up,Smith House`, "date, day, task, job: " + rows[1]);
  check(rows[2] === `${LM_FIRST},${dayName},"Admin, banking",`, "commas are quoted, no job is blank: " + rows[2]);
  check(csv.includes('"Fitted ""blackout"" blinds"') && csv.includes("'=SUM(A1) site visit"), "quotes are escaped and formulas neutralised");
  check((await state(page)).tasks[LM_FIRST].length === 2 && (await state(page)).tasks[T].length === 1, "the log is untouched");
  check(await page.evaluate(() => localStorage.getItem("track.lastbackup.v1")) === null, "a report isn't counted as a backup");

  // custom dates, typed the wrong way round, and an empty period
  await page.click("#reportBtn");
  await page.fill("#repFrom", LM_LAST);
  await page.fill("#repTo", LM_MID);
  check(await page.inputValue("#repPeriod") === "custom", "changing a date switches to Custom dates");
  check((await page.textContent("#repSum")).startsWith("3 entries across 2 days"), "From after To still works: " + await page.textContent("#repSum"));
  await page.fill("#repFrom", "2001-01-01");
  await page.fill("#repTo", "2001-01-31");
  check((await page.textContent("#repSum")).startsWith("Nothing logged"), "an empty period says so");
  check(await page.isDisabled("#repPrint") && await page.isDisabled("#repCopy") && await page.isDisabled("#repCsv"), "…and there's nothing to print, copy or save");
  await page.selectOption("#repPeriod", "all");
  check(await page.inputValue("#repFrom") === LONG_AGO && await page.inputValue("#repTo") === T, "Everything runs from the first entry to the last");
  await page.click("#reportClose");
  check(errors.length === 0, "no page errors " + JSON.stringify(errors));
});

test("Reports print in Glass or Paper, and Paper sticks for every print", async ({ page }) => {
  await seed(page, seedData());
  await page.goto("/");
  await stubPrint(page);
  const r = page.locator("#printReport");
  const rootBg = () => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);

  await page.click("#reportBtn");
  check(await page.isChecked("#repGlass"), "Glass is the print style to begin with");
  await page.selectOption("#repPeriod", "lastmonth");
  await page.click("#repPrint");
  check(await page.evaluate(() => window.printed) === 1, "Print / PDF opens the print dialog");
  check(await r.locator(".rp-kind").textContent() === "Report", "it's headed Report");
  const d1 = new Date(LM_FIRST + "T12:00"), d2 = new Date(LM_LAST + "T12:00");
  const mon = d1.toLocaleDateString("en", { month: "short" });
  check(await r.locator(".rp-title").textContent() === `1 – ${d2.getDate()} ${mon} ${d2.getFullYear()}`, "titled with its dates: " + await r.locator(".rp-title").textContent());
  check(JSON.stringify(await r.locator(".rp-sn").allTextContents()) === JSON.stringify(["5", "3", "2"]), "5 entries, 3 days, 2 jobs");
  check(await r.locator(".rp-day").count() === 3 && await r.locator(".rp-split .rp-srow").count() === 3, "a card per day and the By job split");
  // the browser rebuilds the report as printing starts: it must still be this one
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  check(await r.locator(".rp-kind").textContent() === "Report", "the chosen report is what prints");
  await page.emulateMedia({ media: "print" });
  check(await rootBg() === "rgb(16, 18, 26)", "Glass prints on the dark backdrop");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });

  // a job over a period
  await page.click("#reportBtn");
  await page.selectOption("#repJob", "j2");
  await page.check("#repPaper");
  await page.click("#repPrint");
  check(await r.locator(".rp-title").textContent() === "Office fit-out" && (await r.locator(".rp-sub").textContent()).startsWith("1 – "), "a job's report: its name, then the dates");
  check(await r.locator(".rp-list li").count() === 2 && await r.locator(".rp-pill").count() === 0, "only that job's entries");
  await page.emulateMedia({ media: "print" });
  check(await rootBg() === "rgb(255, 255, 255)", "Paper prints on white");
  check(await page.evaluate(() => getComputedStyle(document.body, "::before").display) === "none", "…with no backdrop");
  check(await r.locator(".rp-dbody").first().evaluate((el) => getComputedStyle(el).backgroundColor) === "rgb(255, 255, 255)", "…and white cards");
  check(await r.locator(".rp-t").first().evaluate((el) => getComputedStyle(el).color) === "rgb(29, 27, 24)", "…in dark ink");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });

  // the choice is remembered, and the ordinary Print / PDF button uses it
  await page.reload();
  await stubPrint(page);
  await page.click("#printBtn");
  check(await r.evaluate((el) => el.classList.contains("paper")), "after a reload, Print / PDF is still Paper");
  check(await r.locator(".rp-kind").textContent() === "Daily log", "…and prints the open day, not the last report");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.click("#reportBtn");
  check(await page.isChecked("#repPaper"), "the dialog shows Paper chosen");
  await page.check("#repGlass");
  await page.click("#reportClose");
  await page.click("#printBtn");
  check(!(await r.evaluate((el) => el.classList.contains("paper"))), "switching back to Glass takes effect straight away");
});

test("paste a list: one entry per line, on the job, undone in one go", async ({ page }) => {
  await seed(page, { "track.jobs.v1": [{ id: "j1", text: "Smith House", color: 0 }], "track.tasks.v1": { [T]: [{ id: "x", text: "Already here" }] } });
  await page.goto("/");
  const paste = (sel, text) => page.locator(sel).evaluate((el, t) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    el.focus();
    const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    if (el.dispatchEvent(ev)) el.value += t.replace(/\n/g, " "); // what the browser would do with it
  }, text);

  await page.fill("#newJob", "Smith House");
  await paste("#newItem", "- Measured the lounge\n• Ordered fabric\n\n3. Quoted the bedroom\n[ ] Call the client\r\nKitchen\tblinds\t2");
  let s = await state(page);
  check(JSON.stringify(s.tasks[T].map((e) => e.text)) === JSON.stringify(["Already here", "Measured the lounge", "Ordered fabric", "Quoted the bedroom", "Call the client", "Kitchen · blinds · 2"]),
    "each line is its own entry, without its bullet or number: " + JSON.stringify(s.tasks[T].map((e) => e.text)));
  check(s.tasks[T].slice(1).every((e) => e.job === "j1") && !s.tasks[T][0].job, "they go on the job in the Job box");
  check(await page.inputValue("#newItem") === "", "the box stays empty");
  check((await page.textContent("#toast")).startsWith("Added 5 entries from your paste"), "a message says what happened: " + await page.textContent("#toast"));
  await page.click("#toast .undo");
  s = await state(page);
  check(s.tasks[T].length === 1 && s.tasks[T][0].text === "Already here", "Undo takes the whole paste back");

  // ordinary pastes are left alone
  await paste("#newItem", "Just one line");
  check(await page.inputValue("#newItem") === "Just one line" && (await state(page)).tasks[T].length === 1, "a single line pastes into the box as usual");
  await paste("#newItem", "more\nlines");
  check((await state(page)).tasks[T].length === 1, "…and so does a paste into a box you've started typing in");
  await page.fill("#newItem", "");

  // the lists take a pasted list too
  await page.fill("#newJob", "");
  await paste("#newWish", "Order paint\nBook electrician\nRenew insurance");
  s = await state(page);
  check(JSON.stringify(s.wish.map((e) => e.text)) === JSON.stringify(["Order paint", "Book electrician", "Renew insurance"]), "the Wishlist takes a pasted list");
  await page.click("#toast .undo");
  check((await state(page)).wish.length === 0, "…with Undo");
  await paste("#newRec", "Timesheet\nSite safety check");
  check((await state(page)).rec.length === 2, "…and so does Recurring");
  check((await state(page)).jobs.length === 1, "no stray jobs were created along the way");

  // a huge paste is capped
  await paste("#newItem", Array.from({ length: 230 }, (_, i) => "Line " + (i + 1)).join("\n"));
  check((await state(page)).tasks[T].length === 201, "at most 200 lines are added at once");
  check((await page.textContent("#toast")).includes("30 more were left out"), "…and the message says how many were left out");
});
