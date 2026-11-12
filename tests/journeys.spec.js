// User-acceptance journeys for the parts no other suite walked through: the
// totals, copying a week or month, clearing a day, Recent days' month
// controls, the + buttons, the floating +, dialogs' ✕ buttons, and moving
// around by date.
"use strict";

const { test } = require("@playwright/test");
const { check, iso, seed, state } = require("./helpers");

const T = iso(0);
const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const day = (s) => new Date(s + "T12:00");
const dow = (day(T).getDay() + 6) % 7;           // 0 = Monday
const MON = isoOf(new Date(day(T).getTime() - dow * 864e5));
const OTHER = T === MON ? iso(1) : MON;          // another day in this week
const LAST_MONTH = isoOf(new Date(day(T).getFullYear(), day(T).getMonth() - 1, 15));

test.use({ viewport: { width: 1360, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });

function seedData() {
  return {
    "track.jobs.v1": [{ id: "j1", text: "Smith House", color: 0 }],
    "track.tasks.v1": {
      [T]: [{ id: "a", text: "Installed blinds", job: "j1" }, { id: "b", text: "Admin" }],
      [OTHER]: [{ id: "c", text: "Site visit", job: "j1" }],
      [LAST_MONTH]: [{ id: "d", text: "Old job" }, { id: "e", text: "Older job" }]
    }
  };
}
const clip = (page) => page.evaluate(() => navigator.clipboard.readText());
const sameMonth = OTHER.slice(0, 7) === T.slice(0, 7);

test("the totals add up, and copy gives a week or month ready to paste", async ({ page }) => {
  await seed(page, seedData());
  await page.goto("/");
  check(await page.textContent("#statToday") === "2", "This day: 2");
  check(await page.textContent("#statWeek") === "3", "This week: 3 (today and another day this week)");
  check(await page.textContent("#statMonth") === String(sameMonth ? 3 : 2), "This month counts only this month");

  await page.click('#viewTabs button[data-view="week"]');
  check((await page.textContent("#weekView .view-sum")).startsWith("3 entries across 2 days"), "the week sums itself up");
  await page.click("#copyDay");
  const week = await clip(page);
  const first = T < OTHER ? T : OTHER;
  check(week.startsWith(new Date(first + "T12:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })),
    "Copy Week starts with the first day's date: " + week.split("\n")[0]);
  check(week.includes("- Installed blinds (Smith House)") && week.includes("- Admin"), "entries are bulleted, with their job in brackets");
  check(week.split("\n").filter((l) => /\d{4}$/.test(l)).length === 2, "a dated heading for each day with work: " + JSON.stringify(week));
  await page.click("#copyPlain");
  const plain = await clip(page);
  check(plain.split("\n").length === 3 && !plain.includes("- ") && !plain.includes("\n\n"), "Copy Items Only: one line per entry, no gaps: " + JSON.stringify(plain));

  await page.click('#viewTabs button[data-view="month"]');
  check((await page.textContent("#monthSum")).startsWith((sameMonth ? 3 : 2) + " entries across"), "the month sums itself up");
  await page.click("#prevDay");
  await page.click("#copyDay");
  check((await clip(page)).includes("Old job") && !(await clip(page)).includes("Installed blinds"), "← steps back a month, and Copy Month copies that month");
});

test("clear a day, change your mind, and move around by date", async ({ page }) => {
  await seed(page, seedData());
  await page.goto("/");
  await page.click("#clearDay");
  check(!(await state(page)).tasks[T], "Clear this day empties it");
  check(await page.isVisible("#emptyMsg") && !(await page.isVisible("#clearDay")), "the empty message shows, and Clear this day hides");
  await page.click("#toast .undo");
  check((await state(page)).tasks[T].length === 2, "Undo puts both entries back, in order");

  await page.keyboard.press("Escape");
  await page.keyboard.press("ArrowLeft");
  check(await page.inputValue("#datePick") === iso(-1), "← goes back a day");
  await page.keyboard.press("t");
  check(await page.inputValue("#datePick") === T, "T comes back to today");
  await page.evaluate((d) => { const p = document.getElementById("datePick"); p.value = d; p.dispatchEvent(new Event("change")); }, LAST_MONTH);
  check((await page.textContent("#itemList")).includes("Old job"), "picking a date in the calendar opens that day");
  await page.click("#todayBtn");
  await page.click('#viewTabs button[data-view="month"]');
  await page.locator(`.mcell[data-day="${T}"]`).click();
  check(await page.textContent("#dayTitle") === "Daily Log" && await page.inputValue("#datePick") === T, "a Month cell opens its day");
});

test("Recent days: fold a month, or open it as a calendar", async ({ page }) => {
  await seed(page, seedData());
  await page.goto("/");
  const lastMonthRow = page.locator(`#dayList .dayrow[data-day="${LAST_MONTH}"]`);
  check(await lastMonthRow.count() === 0, "months other than the open one start folded");
  const toggles = page.locator("#dayList .mtoggle");
  await toggles.nth(1).click();
  check(await lastMonthRow.count() === 1, "clicking a month unfolds it");
  await toggles.nth(1).click();
  check(await lastMonthRow.count() === 0, "…and again folds it");
  await page.locator("#dayList .mgoto").nth(1).click({ force: true }); // shows on hover
  check(await page.textContent("#dayTitle") === "Monthly Calendar", "the calendar icon opens the Month view");
  check((await page.textContent("#navDate")).includes(day(LAST_MONTH).toLocaleDateString(undefined, { month: "long" })), "…on that month");
});

test("the + buttons, the floating +, and the dialogs' ✕", async ({ page }) => {
  await seed(page, {});
  await page.goto("/");
  await page.fill("#newJobSide", "Garden shed");
  await page.click("#addJobBtn");
  await page.fill("#newWish", "Order paint");
  await page.click("#addWishBtn");
  await page.fill("#newRec", "Timesheet");
  await page.click("#addRecBtn");
  await page.fill("#newItem", "Measured up");
  await page.click("#addBtn");
  const s = await state(page);
  check(s.jobs[0].text === "Garden shed" && s.wish[0].text === "Order paint" && s.rec[0].text === "Timesheet" && s.tasks[T][0].text === "Measured up",
    "each + adds what's typed, just like Enter");
  check(await page.textContent("#wishCount") === "· 1" && await page.textContent("#recCount") === "· 1", "the list counts update");

  // a job set for the next recurring task, then cleared with its ✕
  await page.click("#newRec");
  await page.fill("#recJob", "Garden shed");
  await page.click("#recJobClear");
  check(await page.inputValue("#recJob") === "", "a list's job ✕ clears it");

  // the floating + brings you back to typing from another view
  await page.click('#viewTabs button[data-view="week"]');
  await page.click("#fab");
  check(await page.textContent("#dayTitle") === "Daily Log" && await page.evaluate(() => document.activeElement.id) === "newItem",
    "the floating + opens the Day view, ready to type");

  // ✕ closes the guide and Clear data, handing focus back
  await page.click("#helpBtn");
  await page.click("#helpClose");
  check(!(await page.isVisible("#helpOverlay .modal")) && await page.evaluate(() => document.activeElement.id) === "helpBtn", "the guide's ✕ closes it, focus back on ?");
  await page.click("#clearAllBtn");
  check((await page.textContent("#clrWishN")) === "1 item" && (await page.textContent("#clrRecN")) === "1 task", "Clear data counts each list");
  await page.click("#clearClose");
  check(!(await page.isVisible("#clearOverlay .modal")) && (await state(page)).wish.length === 1, "its ✕ closes it without clearing anything");
});
