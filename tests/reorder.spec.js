// Reordering the entries in a day: drag, keyboard, and touch buttons.
"use strict";

const { test, devices } = require("@playwright/test");
const { check, iso, seed, state } = require("./helpers");

const T = iso(0);
const P = new Date().getDate() > 1 ? iso(-1) : iso(1); // another day in this month

function seedData() {
  return {
    "track.tasks.v1": {
      [T]: [{ id: "a", text: "Alpha" }, { id: "b", text: "Bravo" }, { id: "c", text: "Charlie" }, { id: "d", text: "Delta" }],
      [P]: [{ id: "x", text: "Other day" }]
    },
    "track.wishlist.v1": [{ id: "w1", text: "From the wishlist" }]
  };
}
const order = async (page) => (await state(page)).tasks[T].map((e) => e.text).join(",");
const row = (page, text) => page.locator("#itemList li.entry", { hasText: text });

test.use({ viewport: { width: 1360, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });

test("drag and keyboard reorder a day, and the new order sticks", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page, seedData());
  await page.goto("/");

  // drag Charlie onto the top half of Alpha → it goes above
  await row(page, "Charlie").dragTo(row(page, "Alpha"), { targetPosition: { x: 200, y: 6 } });
  check(await order(page) === "Charlie,Alpha,Bravo,Delta", "dropped on the top half lands above: " + await order(page));
  check(await row(page, "Charlie").locator(".num").textContent() === "1", "numbers follow the new order");

  // drag Charlie onto the bottom half of Delta → it goes last
  const box = await row(page, "Delta").boundingBox();
  await row(page, "Charlie").dragTo(row(page, "Delta"), { targetPosition: { x: 200, y: box.height - 6 } });
  check(await order(page) === "Alpha,Bravo,Delta,Charlie", "dropped on the bottom half lands below: " + await order(page));

  // keyboard: focus Bravo's number, ↓ moves it, focus follows it
  await row(page, "Bravo").locator(".num").focus();
  await page.keyboard.press("ArrowDown");
  check(await order(page) === "Alpha,Delta,Bravo,Charlie", "↓ moves it down one: " + await order(page));
  check(await page.evaluate(() => document.activeElement.closest("li").dataset.id) === "b", "focus stays on the moved entry");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  check(await order(page) === "Bravo,Alpha,Delta,Charlie", "↑ moves it up: " + await order(page));
  await page.keyboard.press("ArrowUp");
  check(await order(page) === "Bravo,Alpha,Delta,Charlie", "↑ at the top does nothing");
  check(await page.textContent("#dayTitle") === "Daily Log", "arrow keys on a handle don't change the day");

  // the copy and a reload both use the new order
  await page.click("#copyPlain");
  check(await page.evaluate(() => navigator.clipboard.readText()) === "Bravo\nAlpha\nDelta\nCharlie", "copy follows the order");
  await page.reload();
  check((await page.locator("#itemList li.entry .txt").allTextContents()).join(",") === "Bravo,Alpha,Delta,Charlie", "order survives a reload");

  // other drags still do what they did
  await page.locator("#wishList li", { hasText: "From the wishlist" }).dragTo(row(page, "Alpha"));
  check((await state(page)).tasks[T].some((e) => e.text === "From the wishlist"), "a wishlist item dropped on an entry still logs to the day");
  await row(page, "Delta").dragTo(page.locator(`#dayList button.dayrow[data-day="${P}"]`));
  check((await state(page)).tasks[P].some((e) => e.text === "Delta"), "an entry dropped on another day still moves there");

  check(errors.length === 0, "no page errors " + JSON.stringify(errors));
});

// a touch phone; the preset's browser choice is dropped (it can't change per group)
const { defaultBrowserType, ...phone } = devices["Pixel 7"]; // eslint-disable-line no-unused-vars

test.describe("on a phone", () => {
  test.use(phone);

  test("▲ ▼ buttons reorder without drag and drop", async ({ page }) => {
    await seed(page, seedData());
    await page.goto("/");
    check(await row(page, "Alpha").locator(".mover").isVisible(), "up/down buttons show on touch");
    check(!(await row(page, "Alpha").locator(".num").isVisible()), "…in the number's place");
    check(await row(page, "Alpha").locator(".mover .up").isDisabled(), "the first entry can't go up");
    check(await row(page, "Delta").locator(".mover .down").isDisabled(), "the last entry can't go down");
    await row(page, "Alpha").locator(".mover .down").tap();
    check(await order(page) === "Bravo,Alpha,Charlie,Delta", "▼ moves it down: " + await order(page));
    await row(page, "Delta").locator(".mover .up").tap();
    check(await order(page) === "Bravo,Alpha,Delta,Charlie", "▲ moves it up: " + await order(page));
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "no sideways scroll");
  });
});
