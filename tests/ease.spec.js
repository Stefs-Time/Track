// Ease-of-use features: search, Ctrl+Z, Esc, Week quick-add, the floating +,
// and reordering inside the Week and Job views.
"use strict";

const { test, devices } = require("@playwright/test");
const { check, iso, seed, state, settle } = require("./helpers");

const T = iso(0);
const dow = (new Date().getDay() + 6) % 7; // 0 = Monday
const W = T === iso(-dow) ? iso(-dow + 1) : iso(-dow); // another day in this week

function seedData() {
  return {
    "track.jobs.v1": [{ id: "j1", text: "Smith House", color: 0 }, { id: "j2", text: "Office fit-out", color: 1 }],
    "track.tasks.v1": {
      [T]: [
        { id: "a", text: "Installed blinds, lounge", job: "j1" },
        { id: "b", text: "Admin and emails" },
        { id: "c", text: "Measured kitchen windows", job: "j1" },
        { id: "d", text: "Quoted fit-out", job: "j2" }
      ],
      [W]: [{ id: "e", text: "Site visit", job: "j1" }],
      "2025-03-14": [{ id: "old", text: "Fitted shutters, bedroom", job: "j1" }]
    },
    "track.wishlist.v1": [{ id: "w1", text: "Order paint", job: "j1" }],
    "track.recurring.v1": [{ id: "r1", text: "Timesheet" }]
  };
}
const dayOrder = async (page, day) => (await state(page)).tasks[day].map((e) => e.id).join("");

test.use({ viewport: { width: 1360, height: 900 } });

test("search finds anything and jumps to it", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page, seedData());
  await page.goto("/");

  await page.keyboard.press("Escape"); // leave the entry box
  await page.keyboard.press("/");
  check(await page.isVisible("#searchOverlay .searchbox"), "/ opens search");
  check(await page.evaluate(() => document.activeElement.id) === "searchInput", "…with the cursor in the box");
  check(await page.locator("#searchResults .sr").count() > 0, "before typing it shows recent entries");

  // every word must match: text, job or date
  await page.fill("#searchInput", "shutters smith");
  check(await page.locator("#searchResults .sr").count() === 1, "words combine across text and job");
  check(await page.locator("#searchResults .sr mark").count() >= 1, "matches are highlighted");
  await page.keyboard.press("Enter");
  check(!(await page.isVisible("#searchOverlay .searchbox")), "Enter opens the result and closes search");
  check(await page.inputValue("#datePick") === "2025-03-14", "it jumps to that entry's day, even long ago");
  check(await page.locator('#itemList li[data-id="old"]').evaluate((el) => el.classList.contains("flash")), "the entry lights up");

  // Ctrl+K from anywhere, jobs list first, arrows choose
  await page.keyboard.press("Control+k");
  await page.fill("#searchInput", "smith");
  check((await page.locator("#searchResults .sr").first().locator(".where").textContent()) === "Job", "jobs come first");
  check((await page.textContent("#searchSum")).includes("match"), "the count of matches is shown");
  await page.keyboard.press("Enter");
  check(await page.textContent("#navDate") === "Smith House", "choosing a job opens the Job view");

  // lists, mouse, and no matches
  await page.keyboard.press("/");
  await page.fill("#searchInput", "timesheet");
  await page.locator("#searchResults .sr", { hasText: "Timesheet" }).click();
  check(await page.locator('#recList li[data-id="r1"]').evaluate((el) => el.classList.contains("flash")), "a recurring item is found and lit up in its list");
  await page.keyboard.press("/");
  await page.fill("#searchInput", "zzzz nothing");
  check((await page.textContent("#searchSum")).startsWith("No matches"), "no matches says so");
  await page.keyboard.press("Escape");
  check(!(await page.isVisible("#searchOverlay .searchbox")), "Esc closes search");

  // typed text is never treated as HTML
  await page.click('#viewTabs button[data-view="day"]');
  await page.fill("#newItem", "<img src=x onerror=alert(1)> risky");
  await page.press("#newItem", "Enter");
  await page.keyboard.press("Escape");
  await page.keyboard.press("/");
  await page.fill("#searchInput", "risky");
  check(await page.locator("#searchResults img").count() === 0, "search results render text, not markup");
  check(errors.length === 0, "no page errors " + JSON.stringify(errors));
});

test("Ctrl+Z, Esc, quick-add in the Week view, and the floating +", async ({ page }) => {
  await seed(page, seedData());
  await page.goto("/");

  // the floating + hides while the entry box is on screen
  await page.waitForTimeout(300);
  check(await page.locator("#fab").evaluate((el) => el.classList.contains("away")), "floating + steps aside while the entry box shows");

  // Esc hands the keyboard back to the shortcuts
  check(await page.evaluate(() => document.activeElement.id) === "newItem", "the entry box has the cursor on load");
  await page.keyboard.press("Escape");
  await page.keyboard.press("w");
  check(await page.textContent("#dayTitle") === "Weekly Overview", "after Esc, W switches to the Week view");

  // Ctrl+Z undoes a delete long after the toast has gone
  await page.keyboard.press("d");
  const row = page.locator("#itemList li.entry", { hasText: "Admin and emails" });
  await row.hover();
  await row.locator(".icon.del").click();
  check(!(await state(page)).tasks[T].some((e) => e.id === "b"), "entry deleted");
  await page.evaluate(() => document.getElementById("toast").classList.remove("show")); // as if the toast timed out
  await page.locator("body").click({ position: { x: 700, y: 820 } });
  await page.keyboard.press("Control+z");
  check((await state(page)).tasks[T].some((e) => e.id === "b"), "Ctrl+Z brings it back after the toast has gone");
  await page.keyboard.press("Control+z");
  check((await state(page)).tasks[T].filter((e) => e.id === "b").length === 1, "a second Ctrl+Z doesn't repeat it");

  // + on a Week card adds to that day, with the Day view's job
  await page.fill("#newJob", "Office fit-out");
  await page.locator("#newJob").blur();
  await page.click('#viewTabs button[data-view="week"]');
  await page.locator(`.wday[data-day="${W}"] .wadd`).click();
  const box = page.locator(`.wday[data-day="${W}"] .waddrow input`);
  check(await box.evaluate((el) => el === document.activeElement), "the card's add box opens with the cursor in it");
  check((await box.getAttribute("placeholder")).includes("Office fit-out"), "it says which job it will use");
  await box.fill("Quick call with client");
  await box.press("Enter");
  let s = await state(page);
  const added = s.tasks[W].find((e) => e.text === "Quick call with client");
  check(added && added.job === "j2", "added to that day, on the job from the Job box");
  check(await page.locator(`.wday[data-day="${W}"] .waddrow input`).evaluate((el) => el === document.activeElement), "the box stays open for the next one");
  await page.keyboard.press("Escape");
  check(await page.locator(".waddrow").count() === 0, "Esc closes it");
});

test("reorder inside Week cards and the Job view", async ({ page }) => {
  await seed(page, seedData());
  await page.goto("/");
  await page.click('#viewTabs button[data-view="week"]');
  await settle(page);
  const card = page.locator(`.wday[data-day="${T}"]`);
  const mini = (text) => card.locator("li.mini", { hasText: text });

  // drag within a Week card
  await mini("Quoted fit-out").dragTo(mini("Installed blinds"), { targetPosition: { x: 100, y: 3 } });
  check(await dayOrder(page, T) === "dabc", "drag in a Week card reorders the day: " + await dayOrder(page, T));
  // keyboard on the dot handle
  await mini("Admin and emails").locator(".mgrip").focus();
  await page.keyboard.press("ArrowUp");
  check(await dayOrder(page, T) === "dbac", "↑ on the handle moves it up: " + await dayOrder(page, T));
  check(await page.evaluate(() => document.activeElement.closest("li").dataset.id) === "b", "focus follows the entry");
  // dropping on another day's card still moves it there
  await mini("Admin and emails").dragTo(page.locator(`.wday[data-day="${W}"] .wday-main`));
  check((await state(page)).tasks[W].some((e) => e.id === "b"), "dropped on another day's card, it moves there");

  // Job view: only this job's entries show, and moves are among them
  await page.locator('#jobList li[data-job="j1"] .jobrow').click();
  const jcard = page.locator(`#jobView .wday:has(li[data-id="a"])`);
  check(await jcard.locator("li.mini").count() === 2, "the Job view shows Smith House's two entries that day");
  await jcard.locator('li[data-id="c"] .mgrip').focus();
  await page.keyboard.press("ArrowUp");
  const order = await dayOrder(page, T);
  check(order.indexOf("c") < order.indexOf("a"), "↑ in the Job view puts it above the previous Smith House entry: " + order);
  check(order.indexOf("d") === 0, "…without disturbing entries on other jobs: " + order);
});

// a touch phone; the preset's browser choice is dropped (it can't change per group)
const { defaultBrowserType, ...phone } = devices["Pixel 7"]; // eslint-disable-line no-unused-vars

test.describe("on a phone", () => {
  test.use(phone);

  test("Week view reorders with ▲ ▼, and search fits", async ({ page }) => {
    await seed(page, seedData());
    await page.goto("/");
    await page.click('#viewTabs button[data-view="week"]');
    const card = page.locator(`.wday[data-day="${T}"]`);
    check(await card.locator('li[data-id="a"] .mover').isVisible(), "▲ ▼ show in Week cards on touch");
    await card.locator('li[data-id="a"] .mover .down').tap();
    check(await dayOrder(page, T) === "bacd", "▼ moves it down: " + await dayOrder(page, T));
    await page.click("#searchBtn");
    check(await page.isVisible("#searchInput"), "search opens from the icon");
    await page.fill("#searchInput", "blinds");
    check(await page.locator("#searchResults .sr").count() === 1, "and finds things");
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "no sideways scroll");
  });
});
