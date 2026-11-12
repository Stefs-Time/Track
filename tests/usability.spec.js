// Usability: keyboard paths, tap targets, phone first impressions, and how
// days are named in messages. Each check guards a finding from the
// UAT / UI / UX audit.
"use strict";

const { test, devices } = require("@playwright/test");
const { check, iso, seed } = require("./helpers");

const T = iso(0);
function seedData() {
  return {
    "track.jobs.v1": [{ id: "j1", text: "Office fit-out — second floor reception", color: 1 }],
    "track.tasks.v1": { [T]: [{ id: "a", text: "Quoted the office fit-out, partitions and ceiling grid", job: "j1" }, { id: "b", text: "Admin" }] },
    "track.wishlist.v1": [{ id: "w", text: "Order paint" }],
    "track.recurring.v1": [{ id: "r", text: "Site safety check", job: "j1", days: [new Date().getDay()] }]
  };
}

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1360, height: 900 } });

  test("keyboard users can skip straight to the log, past fewer stops", async ({ page }) => {
    await seed(page, seedData());
    await page.goto("/");
    const first = await page.evaluate(() => document.querySelector("body a[href], body button, body input").className);
    check(first === "skiplink", "“Skip to the log” is the first thing Tab reaches");
    await page.focus(".skiplink");
    check(await page.locator(".skiplink").isVisible(), "…and it shows when focused");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    check(await page.evaluate(() => document.activeElement.id) === "prevDay", "after skipping, Tab lands on the log's own controls");
    check(await page.locator("#actStrip button[tabindex='-1']").count() === 14, "the 14 activity bars aren't Tab stops (Recent days and the arrows cover them)");
    check(await page.locator("#actStrip").getAttribute("aria-hidden") === "true", "…nor read out twice");
  });

  test("messages name days the way people say them", async ({ page }) => {
    await seed(page, seedData());
    await page.goto("/");
    const row = page.locator("#itemList li.entry", { hasText: "Admin" });
    await row.hover();
    await row.locator(".icon.edit").click();
    await page.fill("li.editing input.edate", iso(-1));
    await page.click("li.editing .save");
    const msg = await page.textContent("#toast");
    const d = new Date(iso(-1) + "T12:00");
    check(msg.includes("Moved to " + ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()] + " " + d.getDate() + " "), "“Moved to Wed 11 Nov”, not a raw date: " + msg);
    check(!/\d{4}-\d{2}-\d{2}/.test(msg), "no YYYY-MM-DD in the message");
    check(!/\d{4}-\d{2}-\d{2}/.test(await page.locator("#recList .wbtn.send").first().getAttribute("data-tip")), "…or in the ↳ hints");
  });

  test("an empty month in Recent days shows no stray dot", async ({ page }) => {
    await seed(page, {});
    await page.goto("/");
    check((await page.locator(".mtoggle .mbadge").first().textContent()) === "", "no “·” where a count would be");
  });
});

// a touch phone; the preset's browser choice is dropped (it can't change per group)
const { defaultBrowserType, ...phone } = devices["Pixel 7"]; // eslint-disable-line no-unused-vars

test.describe("on a phone", () => {
  test.use(phone);

  test("opens at the top, keeps the entry box roomy, and every tap target is big enough", async ({ page }) => {
    await seed(page, seedData());
    await page.goto("/");
    await page.waitForTimeout(300);
    check(await page.evaluate(() => scrollY) === 0, "the page opens at the top, not scrolled to the entry box");
    check(await page.evaluate(() => document.activeElement === document.body), "no box grabs focus (no keyboard popping up)");
    check(!(await page.locator("#addBtn .al").isVisible()), "Add is just a +, so the box keeps its width");
    check((await page.locator("#newItem").boundingBox()).width >= 180, "the entry box has room to type");

    for (const view of ["day", "week"]) {
      if (view === "week") await page.click('#viewTabs button[data-view="week"]');
      const small = await page.evaluate(() => [...document.querySelectorAll('button:not([tabindex="-1"]), input')]
        .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24); })
        .map((e) => String(e.className) + " " + Math.round(e.getBoundingClientRect().width) + "x" + Math.round(e.getBoundingClientRect().height)));
      check(small.length === 0, `${view}: every control is at least 24×24 px (WCAG 2.2): ` + small.join(", "));
    }
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "no sideways scroll");
  });
});
