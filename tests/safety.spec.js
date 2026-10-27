// Keeping data safe: spreadsheet-formula neutralising in CSV, Undo after an
// import, the backup reminder, the error net, length limits, following the
// date past midnight, and staying quick with years of entries.
"use strict";

const fs = require("node:fs");
const { test } = require("@playwright/test");
const { check, iso, seed, state, importFile } = require("./helpers");

const T = iso(0);
test.use({ viewport: { width: 1360, height: 900 } });

/** Wipe storage and reload as a first-time visitor who has seen the guide. */
async function emptyApp(page) {
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("test.seeded", "1");
    localStorage.setItem("track.helpseen.v1", "1");
  });
  await page.reload();
}

test("CSV export can't smuggle spreadsheet formulas, and still round-trips", async ({ page }) => {
  await seed(page, {
    "track.jobs.v1": [{ id: "j1", text: "=HYPERLINK(\"x\")", color: 0 }],
    "track.tasks.v1": { [T]: [
      { id: "a", text: "=SUM(A1:A9)", job: "j1" },
      { id: "b", text: "+27 82 555 0100 called" },
      { id: "c", text: "-5 metres of trim" },
      { id: "d", text: "@home admin" },
      { id: "e", text: "'quoted' on purpose" }
    ] }
  });
  await page.goto("/");
  const before = (await state(page)).tasks[T].map((e) => e.text);

  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#csvExportBtn")]);
  const csv = fs.readFileSync(await dl.path(), "utf8");
  check(!/(^|,)"?[=+\-@]/m.test(csv.split("\r\n").slice(1).join("\n")), "no cell starts with = + - or @");
  check(csv.includes("'=SUM(A1:A9)") && csv.includes("'-5 metres"), "formula-like text is prefixed with an apostrophe");
  check(csv.includes("'=HYPERLINK"), "…job names too");
  check(csv.includes(",'quoted' on purpose") || csv.includes(",\"'quoted' on purpose\""), "ordinary text starting with ' is left alone");

  await emptyApp(page);
  const file = test.info().outputPath("formulas.csv");
  fs.writeFileSync(file, csv);
  await importFile(page, "#csvFile", file);
  const s = await state(page);
  check(JSON.stringify(s.tasks[T].map((e) => e.text)) === JSON.stringify(before), "re-import gives back the exact text: " + JSON.stringify(s.tasks[T]));
  check(s.jobs[0] && s.jobs[0].text === "=HYPERLINK(\"x\")", "…and the job name");
});

test("an import can be undone, CSV or JSON", async ({ page }) => {
  await seed(page, { "track.tasks.v1": { [T]: [{ id: "a", text: "Mine already" }] } });
  await page.goto("/");

  const csv = test.info().outputPath("in.csv");
  fs.writeFileSync(csv, "Date,Task,Job\r\n" + T + ",From the sheet,Smith House\r\n");
  await importFile(page, "#csvFile", csv);
  let s = await state(page);
  check(s.tasks[T].length === 2 && s.jobs.length === 1, "CSV import added an entry and a job");
  check(await page.isVisible("#toast .undo"), "the import toast offers Undo");
  await page.click("#toast .undo");
  s = await state(page);
  check(s.tasks[T].length === 1 && s.jobs.length === 0, "Undo takes the import back out, job and all");

  const json = test.info().outputPath("in.json");
  fs.writeFileSync(json, JSON.stringify({ [iso(-1)]: [{ id: "x", text: "From a backup" }], _wishlist: [{ id: "w", text: "Wish" }] }));
  await importFile(page, "#importFile", json);
  s = await state(page);
  check(s.tasks[iso(-1)] && s.wish.length === 1, "JSON import added an entry and a wishlist item");
  await page.click("#toast .undo");
  s = await state(page);
  check(!s.tasks[iso(-1)] && s.wish.length === 0 && s.tasks[T].length === 1, "Undo restores exactly what was there");
});

test("the backup line says when you last exported, and nudges when it's time", async ({ page }) => {
  const tasks = {};
  for (let i = 1; i <= 25; i++) tasks[iso(-i)] = [{ id: "x" + i, text: "Thing " + i }];
  await seed(page, { "track.tasks.v1": tasks });
  await page.goto("/");

  const stat = page.locator("#backupStat");
  check((await stat.textContent()).startsWith("No backup yet"), "a log with no backup says so");
  check(await stat.evaluate((el) => el.classList.contains("due")), "…and with 20+ entries it's a reminder");

  await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
  check((await stat.textContent()) === "Last backup today", "after Export JSON: last backup today");
  check(!(await stat.evaluate((el) => el.classList.contains("due"))), "…no reminder");

  // three weeks later, with more logged since
  await page.evaluate((at) => localStorage.setItem("track.lastbackup.v1", JSON.stringify({ at, entries: 3 })), iso(-21));
  await page.reload();
  check((await stat.textContent()) === "Last backup 21 days ago — time for a fresh one", "an old backup with changes since: " + await stat.textContent());
  // old, but nothing has changed since: no nagging
  await page.evaluate((at) => localStorage.setItem("track.lastbackup.v1", JSON.stringify({ at, entries: 25 })), iso(-21));
  await page.reload();
  check(!(await stat.evaluate((el) => el.classList.contains("due"))), "no reminder when nothing changed since");

  await Promise.all([page.waitForEvent("download"), page.click("#csvExportBtn")]);
  check((await stat.textContent()) === "Last backup today", "Export CSV counts as a backup too");
});

test("unexpected errors are reported, text boxes have sane limits", async ({ page }) => {
  await seed(page, {});
  await page.goto("/");
  for (const sel of ["#newItem", "#newWish", "#newRec"]) {
    check(await page.getAttribute(sel, "maxlength") === "1000", sel + " is limited to 1000 characters");
  }
  await page.fill("#newItem", "An entry");
  await page.press("#newItem", "Enter");
  const row = page.locator("#itemList li.entry").first();
  await row.hover();
  await row.locator(".icon.edit").click();
  check(await page.locator("li.editing input:not(.edate)").first().evaluate((el) => el.maxLength) === 1000, "…and so is the editor");
  await page.keyboard.press("Escape");

  page.on("pageerror", () => {}); // expected below
  await page.evaluate(() => setTimeout(() => { throw new Error("test: simulated bug"); }));
  await page.waitForFunction(() => document.getElementById("toast").textContent.includes("Something went wrong"));
  check(true, "an uncaught error shows a calm message");
  await page.evaluate(() => { Promise.reject(new Error("test: second")); });
  await page.waitForTimeout(200);
  check((await page.textContent("#toast")).includes("Something went wrong"), "a burst of errors shows one message, not many");
});

test("left open overnight, Today follows the date", async ({ page }) => {
  const evening = new Date();
  evening.setHours(23, 58, 0, 0);
  await page.clock.install({ time: evening });
  await seed(page, {});
  await page.goto("/");
  const day = () => page.inputValue("#datePick");
  const today = await day();

  await page.clock.runFor(3 * 60 * 1000); // past midnight
  const tomorrow = await day();
  check(tomorrow !== today && tomorrow > today, "Today moved on to the new date: " + today + " → " + tomorrow);
  await page.fill("#newItem", "Early start");
  await page.press("#newItem", "Enter");
  check(((await state(page)).tasks[tomorrow] || []).some((e) => e.text === "Early start"), "new entries land on the new day");

  // someone looking at another date is left where they are
  await page.click("#prevDay");
  await page.click("#prevDay");
  const looking = await day();
  await page.clock.runFor(24 * 60 * 60 * 1000);
  check(await day() === looking, "a past date stays open across midnight");
});

test("stays quick with years of entries", async ({ page }) => {
  const tasks = {};
  for (let d = 0; d < 1000; d++) {
    tasks[iso(-d)] = Array.from({ length: 10 }, (_, i) => ({ id: d + "-" + i, text: "Entry " + d + "." + i + " fitted blinds", job: i % 3 ? "j" + (i % 5) : undefined }));
  }
  await seed(page, {
    "track.jobs.v1": [0, 1, 2, 3, 4].map((n) => ({ id: "j" + n, text: "Job " + n, color: n })),
    "track.tasks.v1": tasks
  });
  await page.goto("/");
  const ms = await page.evaluate(() => {
    const box = document.getElementById("newItem");
    box.value = "Timed entry";
    const t0 = performance.now();
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    return performance.now() - t0;
  });
  check(await page.locator("#itemList li.entry", { hasText: "Timed entry" }).count() === 1, "the entry was added");
  check(ms < 500, `adding an entry to a 10,000-entry log takes ${Math.round(ms)} ms (budget 500 ms)`);
});
