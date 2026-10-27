// Finished jobs and reports: archiving a job, bringing it back, and the
// printable job report.
"use strict";

const { test } = require("@playwright/test");
const { check, iso, seed, state } = require("./helpers");

const T = iso(0), Y = iso(-1), OLD = iso(-40);
test.use({ viewport: { width: 1360, height: 900 } });

function seedData() {
  return {
    "track.jobs.v1": [
      { id: "j1", text: "Smith House", color: 0 },
      { id: "j2", text: "Office fit-out", color: 1 },
      { id: "j3", text: "Garden shed", color: 2 }
    ],
    "track.tasks.v1": {
      [T]: [{ id: "a", text: "Installed blinds, lounge", job: "j1" }, { id: "b", text: "Admin and emails" }, { id: "c", text: "Fitted handles", job: "j1" }],
      [Y]: [{ id: "d", text: "Measured kitchen windows", job: "j1" }, { id: "e", text: "Quoted fit-out", job: "j2" }],
      [OLD]: [{ id: "f", text: "Built shed base", job: "j3" }]
    },
    "track.wishlist.v1": [{ id: "w1", text: "Order paint", job: "j1" }, { id: "w2", text: "Buy shelving", job: "j3" }]
  };
}
const jobRow = (page, id) => page.locator(`#jobList li[data-job="${id}"]`);
const jobOptions = (page) => page.$$eval("#jobOptions option", (os) => os.map((o) => o.value));

test("archive a finished job, find it again, and bring it back", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page, seedData());
  await page.goto("/");

  // archive from the Jobs list
  await page.fill("#newJob", "Garden shed");
  await page.locator("#newJob").blur();
  await jobRow(page, "j3").hover();
  await jobRow(page, "j3").locator(".wbtn.arch").click();
  let s = await state(page);
  check(s.jobs.find((j) => j.id === "j3").archived === true, "the job is saved as archived");
  check(await jobRow(page, "j3").count() === 0, "it leaves the Jobs list");
  check(await page.textContent("#jobCount") === "· 2", "the count is of active jobs");
  check(!(await jobOptions(page)).includes("Garden shed"), "the job boxes stop suggesting it");
  check(await page.inputValue("#newJob") === "", "a Job box set to it is cleared");
  check(s.tasks[OLD][0].job === "j3" && s.wish.find((w) => w.id === "w2").job === "j3", "everything on it keeps its job");
  check((await page.textContent("#toast")).includes("archived"), "a message says where it went");

  // Undo puts it straight back
  await page.click("#toast .undo");
  check(await jobRow(page, "j3").count() === 1 && !(await state(page)).jobs.find((j) => j.id === "j3").archived, "Undo un-archives it");
  await jobRow(page, "j3").hover();
  await jobRow(page, "j3").locator(".wbtn.arch").click();

  // still reachable: Show archived, the Job view, search
  check((await page.textContent("#archToggle")).includes("Show 1 archived"), "a link offers the archived jobs");
  await page.click("#archToggle");
  check(await jobRow(page, "j3").evaluate((el) => el.classList.contains("archived")), "…shown dimmed below the others");
  await jobRow(page, "j3").locator(".jobrow").click();
  check(await page.textContent("#navDate") === "Garden shed", "an archived job's Job view still opens");
  check(await page.isVisible("#jobView .archnote"), "…saying it's archived");
  check(await page.locator("#jobView li.mini", { hasText: "Built shed base" }).count() === 1, "…with all its work");
  await page.keyboard.press("Escape");
  await page.keyboard.press("/");
  await page.fill("#searchInput", "garden");
  check(await page.locator("#searchResults .sr .where").first().textContent() === "Archived job", "search finds it, marked archived");
  await page.keyboard.press("Escape");

  // Restore from the Job view
  await page.click("#jobView .archnote button");
  check(!(await state(page)).jobs.find((j) => j.id === "j3").archived, "Restore brings it back");
  check(await page.locator("#archToggle").count() === 0, "with nothing archived, the link goes");
  check((await jobOptions(page)).includes("Garden shed"), "…and the job boxes offer it again");

  // logging new work against an archived job un-archives it
  await jobRow(page, "j3").hover();
  await jobRow(page, "j3").locator(".wbtn.arch").click();
  await page.click('#viewTabs button[data-view="day"]');
  await page.fill("#newJob", "garden shed");
  await page.fill("#newItem", "Painted shed");
  await page.press("#newItem", "Enter");
  s = await state(page);
  check(s.tasks[T].some((e) => e.text === "Painted shed" && e.job === "j3"), "the entry goes on the archived job");
  check(!s.jobs.find((j) => j.id === "j3").archived, "…which comes back to the Jobs list");
  check((await page.textContent("#toast")).includes("back in your Jobs"), "…and says so");

  // the side "New job" box restores rather than refusing
  await jobRow(page, "j2").hover();
  await jobRow(page, "j2").locator(".wbtn.arch").click();
  await page.fill("#newJobSide", "Office fit-out");
  await page.press("#newJobSide", "Enter");
  check(!(await state(page)).jobs.find((j) => j.id === "j2").archived, "adding an archived job's name restores it");

  // survives a reload; JSON export carries it
  await jobRow(page, "j1").hover();
  await jobRow(page, "j1").locator(".wbtn.arch").click();
  await page.reload();
  check(await jobRow(page, "j1").count() === 0 && (await page.textContent("#archToggle")).includes("1 archived"), "still archived after a reload");
  check(errors.length === 0, "no page errors " + JSON.stringify(errors));
});

test("print a job as a clean report", async ({ page }) => {
  await seed(page, seedData());
  await page.goto("/");
  check(!(await page.isVisible("#printJobBtn")), "Print / PDF only shows in the Job view");
  await jobRow(page, "j1").locator(".jobrow").click();
  await page.evaluate(() => { window.printed = 0; window.print = () => { window.printed++; }; });
  await page.click("#printJobBtn");
  check(await page.evaluate(() => window.printed) === 1, "it opens the print dialog");

  const r = page.locator("#printReport");
  check(await r.locator("h1").textContent() === "Smith House", "the report is titled with the job");
  check((await r.locator(".rp-meta").textContent()).startsWith("3 entries over 2 days"), "with its totals: " + await r.locator(".rp-meta").textContent());
  const days = await r.locator(".rp-day:not(.rp-todo) h2").allTextContents();
  check(days.length === 2 && days[0].includes(String(new Date(Y + "T12:00").getDate())), "days run oldest first: " + days);
  const lines = await r.locator(".rp-day:not(.rp-todo) li").allTextContents();
  check(JSON.stringify(lines) === JSON.stringify(["Measured kitchen windows", "Installed blinds, lounge", "Fitted handles"]),
    "only this job's entries, in log order: " + lines);
  check(JSON.stringify(await r.locator(".rp-todo li").allTextContents()) === JSON.stringify(["Order paint"]), "what's still to do is listed");

  // on paper, only the report shows
  await page.emulateMedia({ media: "print" });
  check(await r.isVisible(), "the report prints");
  check(!(await page.isVisible(".app")) && !(await page.isVisible(".mast")), "the app itself doesn't");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });
  check(!(await page.evaluate(() => document.body.classList.contains("print-report"))), "afterwards the page is back to normal");

  // Ctrl+P (beforeprint) in the Job view gives the report too; in the Day view, the page
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  check(await page.evaluate(() => document.body.classList.contains("print-report")), "Ctrl+P in the Job view prints the report");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.click('#viewTabs button[data-view="day"]');
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  check(!(await page.evaluate(() => document.body.classList.contains("print-report"))), "…but not from other views");

  // entry text is text, never markup
  await page.fill("#newJob", "Smith House");
  await page.fill("#newItem", "<img src=x onerror=alert(1)>");
  await page.press("#newItem", "Enter");
  await jobRow(page, "j1").locator(".jobrow").click();
  await page.click("#printJobBtn");
  check(await r.locator("img").count() === 0 && (await r.textContent()).includes("<img"), "the report shows entries as plain text");
});
