// Recurring tasks on a schedule: choosing the days, the "Due today" strip,
// and schedules (plus archived jobs) surviving CSV and JSON round trips.
"use strict";

const fs = require("node:fs");
const { test } = require("@playwright/test");
const { check, iso, seed, state, importFile } = require("./helpers");

const T = iso(0);
const DOW = new Date().getDay();                // today, 0 = Sunday
const TOMORROW = (DOW + 1) % 7;
const NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
test.use({ viewport: { width: 1360, height: 900 } });

function seedData() {
  return {
    "track.jobs.v1": [{ id: "j1", text: "Smith House", color: 0 }, { id: "j2", text: "Garden shed", color: 2, archived: true }],
    "track.tasks.v1": { [iso(-5)]: [{ id: "x", text: "Built shed base", job: "j2" }] },
    "track.recurring.v1": [
      { id: "r1", text: "Timesheet" },
      { id: "r2", text: "Site safety check", job: "j1", days: [TOMORROW] },
      { id: "r3", text: "Invoices" }
    ]
  };
}
const rec = (page, id) => page.locator(`#recList li[data-id="${id}"]`);

test("choose the days a recurring task is due, then log or skip it", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page, seedData());
  await page.goto("/");
  check(!(await page.isVisible("#dueBar")), "nothing due yet, so no Due today strip");
  check((await rec(page, "r2").locator(".sched").textContent()) === "Every " + NAMES[TOMORROW], "a schedule shows under the task");

  // edit: tick today and Monday
  await rec(page, "r1").locator(".wbtn.edit").evaluate((el) => el.click());
  const picker = page.locator("#recList li.qediting .dayspick");
  check(await picker.locator("button").count() === 7, "the editor offers the seven days");
  check(await picker.locator("button").first().getAttribute("aria-label") === "Monday", "…Monday first");
  await picker.locator(`button[aria-label="${NAMES[DOW]}"]`).click();
  if (DOW !== 1) await picker.locator('button[aria-label="Monday"]').click();
  check(await picker.locator(`button[aria-label="${NAMES[DOW]}"]`).getAttribute("aria-pressed") === "true", "a chosen day shows as pressed");
  await page.click("#recList li.qediting .save");
  let s = await state(page);
  const want = DOW === 1 ? [1] : [1, DOW].sort();
  check(JSON.stringify(s.rec.find((r) => r.id === "r1").days) === JSON.stringify(want), "days are saved: " + JSON.stringify(s.rec[0].days));

  // today's log offers it
  check(await page.isVisible("#dueBar"), "the Due today strip appears");
  check(await page.locator("#dueBar li").count() === 1 && (await page.textContent("#dueBar li .dt")) === "Timesheet", "…with just what's due today");
  check(await rec(page, "r1").evaluate((el) => el.classList.contains("due")), "the Recurring list marks it due");
  check((await rec(page, "r1").locator(".sched").textContent()).startsWith("Due today"), "…in words too");
  await page.click("#prevDay");
  check(!(await page.isVisible("#dueBar")), "other days don't show the strip");
  await page.click("#nextDay");

  // Log it: logged once, strip empties, it stays in Recurring
  await page.click("#dueBar .dlog");
  s = await state(page);
  check((s.tasks[T] || []).filter((e) => e.text === "Timesheet").length === 1, "Log puts it on today");
  check(!(await page.isVisible("#dueBar")), "…and it leaves the strip");
  check(s.rec.length === 3, "…but stays in Recurring");
  check(await page.evaluate(() => document.activeElement.id) === "newItem", "focus lands on the entry box");
  await page.click("#toast .undo");
  check(await page.isVisible("#dueBar"), "Undo offers it again");

  // Skip: gone for today only, Undo-able
  await page.click("#dueBar .dskip");
  check(!(await page.isVisible("#dueBar")), "Skip hides it for today");
  check(!((await state(page)).tasks[T] || []).some((e) => e.text === "Timesheet"), "…without logging it");
  await page.reload();
  check(!(await page.isVisible("#dueBar")), "…even after a reload");
  await page.evaluate(() => localStorage.setItem("track.skipped.v1", JSON.stringify({ day: "2000-01-01", ids: ["r1"] })));
  await page.reload();
  check(await page.isVisible("#dueBar"), "a skip from another day doesn't count");

  // logged by hand counts too
  await page.fill("#newItem", "Timesheet");
  await page.press("#newItem", "Enter");
  check(!(await page.isVisible("#dueBar")), "logging the same words by hand also clears it");

  // clearing the days removes the schedule
  await rec(page, "r1").locator(".wbtn.edit").evaluate((el) => el.click());
  const on = page.locator("#recList li.qediting .dayspick button.on");
  while (await on.count()) await on.first().click();
  await page.click("#recList li.qediting .save");
  check(!("days" in (await state(page)).rec.find((r) => r.id === "r1")), "no days ticked = no schedule");
  check(await rec(page, "r1").locator(".sched").count() === 0, "…and no label");
  check(errors.length === 0, "no page errors " + JSON.stringify(errors));
});

test("schedules and archived jobs survive CSV and JSON round trips", async ({ page }) => {
  await seed(page, seedData());
  await page.goto("/");
  await page.evaluate(() => {
    const r = JSON.parse(localStorage.getItem("track.recurring.v1"));
    r[0].days = [1, 2, 3, 4, 5];
    r[2].days = [1, 3];
    localStorage.setItem("track.recurring.v1", JSON.stringify(r));
  });
  await page.reload();
  const before = await state(page);

  const [dc] = await Promise.all([page.waitForEvent("download"), page.click("#csvExportBtn")]);
  const csv = fs.readFileSync(await dc.path(), "utf8");
  check(csv.split("\r\n")[0].endsWith("Date,Task,Job,Repeats"), "the CSV has a Repeats column");
  check(csv.includes("\r\nRecurring,Timesheet,,Weekdays"), "schedules are written in words");
  check(csv.includes("\r\nRecurring,Invoices,,Mon Wed"), "…day names for a mix");
  check(csv.includes("\r\nArchived,,Garden shed"), "archived jobs are marked");
  const [dj] = await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
  const json = fs.readFileSync(await dj.path(), "utf8");

  const same = (s) => JSON.stringify({
    rec: s.rec.map((r) => [r.text, r.days || null, (s.jobs.find((j) => j.id === r.job) || {}).text || ""]),
    jobs: s.jobs.map((j) => [j.text, !!j.archived]).sort()
  });
  for (const [kind, file, selector] of [["CSV", csv, "#csvFile"], ["JSON", json, "#importFile"]]) {
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("test.seeded", "1");
      localStorage.setItem("track.helpseen.v1", "1");
    });
    await page.reload();
    const path = test.info().outputPath("back." + kind.toLowerCase());
    fs.writeFileSync(path, file);
    await importFile(page, selector, path);
    const after = await state(page);
    check(same(after) === same(before), `${kind}: clear → import gives back the schedules and archived jobs\n${same(after)}\n${same(before)}`);
  }

  // an import never archives a job you're using, or overwrites a schedule you set
  await page.evaluate(() => {
    const jobs = JSON.parse(localStorage.getItem("track.jobs.v1"));
    jobs.forEach((j) => { delete j.archived; });
    localStorage.setItem("track.jobs.v1", JSON.stringify(jobs));
    const r = JSON.parse(localStorage.getItem("track.recurring.v1"));
    r[0].days = [6];
    localStorage.setItem("track.recurring.v1", JSON.stringify(r));
  });
  await page.reload();
  const path = test.info().outputPath("again.csv");
  fs.writeFileSync(path, csv);
  await importFile(page, "#csvFile", path);
  const s = await state(page);
  check(!s.jobs.find((j) => j.text === "Garden shed").archived, "re-importing doesn't archive a job that's in use here");
  check(JSON.stringify(s.rec.find((r) => r.text === "Timesheet").days) === "[6]", "…or replace a schedule set here");

  // hand-written schedules in a spreadsheet are understood
  fs.writeFileSync(path, "Date,Task,Job,Repeats\r\nRecurring,Water plants,,every friday\r\nRecurring,Stand-up,,\"Mon, Tue & Thu\"\r\nRecurring,Gym,,weekends\r\n");
  await importFile(page, "#csvFile", path);
  const r2 = (await state(page)).rec;
  const days = (t) => JSON.stringify((r2.find((r) => r.text === t) || {}).days);
  check(days("Water plants") === "[5]" && days("Gym") === "[0,6]", "'every friday' and 'weekends' read correctly");
  check(days("Stand-up") === "[1,2,4]", "…and a list of days: " + days("Stand-up"));
});
