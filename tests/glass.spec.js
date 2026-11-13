// The glass look, measured from real pixels. Panels are translucent over a
// coloured backdrop, and axe-core can only reason about flat colours — so this
// takes a screenshot and checks every piece of text against what is actually
// painted behind it (WCAG AA: 4.5:1, or 3:1 for large text).
"use strict";

const { test, devices } = require("@playwright/test");
const { check, iso, seed, settle } = require("./helpers");

function seedData() {
  const tasks = {};
  for (let d = 0; d < 12; d++) {
    tasks[iso(-d)] = [
      { id: "a" + d, text: "Installed blinds, lounge", job: "j" + (d % 8) },
      { id: "b" + d, text: "Admin and emails" },
      { id: "c" + d, text: "Quoted the office fit-out", job: "j" + ((d + 3) % 8) }
    ].slice(0, 1 + (d % 3));
  }
  return {
    // all eight job colours
    "track.jobs.v1": [0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: "j" + n, text: "Job " + n, color: n })),
    "track.tasks.v1": tasks,
    "track.wishlist.v1": [{ id: "w", text: "Order paint", job: "j1" }, { id: "w2", text: "Renew insurance" }],
    "track.recurring.v1": [{ id: "r", text: "Timesheet", days: [new Date().getDay()] }, { id: "r2", text: "Site check", job: "j2" }]
  };
}

/**
 * Every visible piece of text in the viewport whose contrast with the pixels
 * behind it is below WCAG AA. The background is read from a screenshot of
 * the text's own box; the text colour is the computed colour, faded by any
 * ancestor opacity.
 */
async function lowContrast(page) {
  const png = (await page.screenshot({ type: "png" })).toString("base64");
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const cv = document.createElement("canvas");
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    // any CSS colour (rgb, color(), oklab…) as plain sRGB, by painting it
    const dot = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const rgbOf = (css) => { dot.clearRect(0, 0, 1, 1); dot.fillStyle = css; dot.fillRect(0, 0, 1, 1); return [...dot.getImageData(0, 0, 1, 1).data].slice(0, 3); };
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!n.nodeValue.trim() || seen.has(el)) continue;
      seen.add(el);
      if (el.closest("[disabled], [aria-hidden='true'], #printReport, script, style")) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) continue;
      // skip text that is covered (a dialog over the page) or not shown
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!top || !(top === el || el.contains(top) || top.contains(el))) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden") continue;
      let alpha = 1;
      for (let a = el; a; a = a.parentElement) alpha *= Number(getComputedStyle(a).opacity);
      if (alpha < 0.05) continue;
      const fg = rgbOf(cs.color);
      const d = ctx.getImageData(Math.floor(r.left), Math.floor(r.top), Math.ceil(r.width), Math.ceil(r.height)).data;
      const px = [];
      for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
      px.sort((p, q) => lum(p) - lum(q));
      // the tight box around a line of text is part text, part background:
      // the background is the 30% of pixels furthest from the text's own tone
      const bg = lum(fg) > lum(px[px.length >> 1]) ? px[Math.floor(px.length * 0.3)] : px[Math.floor(px.length * 0.7)];
      const text = fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));
      const hi = Math.max(lum(text), lum(bg)), lo = Math.min(lum(text), lum(bg));
      const ratio = (hi + 0.05) / (lo + 0.05);
      const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
      const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      if (ratio < need) out.push(`“${n.nodeValue.trim().slice(0, 24)}” ${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} ${ratio.toFixed(2)}:1 (needs ${need})`);
    }
    return out;
  }, png);
}

const VIEWS = [
  ["Day", async () => {}],
  ["Day, scrolled down", async (p) => p.evaluate(() => scrollTo(0, document.body.scrollHeight))],
  ["Week", async (p) => { await p.evaluate(() => scrollTo(0, 0)); await p.click('#viewTabs button[data-view="week"]'); }],
  ["Week, scrolled down", async (p) => p.evaluate(() => scrollTo(0, document.body.scrollHeight))],
  ["Month", async (p) => { await p.evaluate(() => scrollTo(0, 0)); await p.click('#viewTabs button[data-view="month"]'); }],
  ["guide", async (p) => p.click("#helpBtn")],
  ["Clear data", async (p) => { await p.keyboard.press("Escape"); await p.click("#clearAllBtn"); }],
  ["Reports", async (p) => { await p.keyboard.press("Escape"); await p.click("#reportBtn"); }],
  ["search", async (p) => { await p.keyboard.press("Escape"); await p.click("#searchBtn"); await p.fill("#searchInput", "blinds"); }]
];

const { defaultBrowserType, ...phone } = devices["Pixel 7"]; // eslint-disable-line no-unused-vars
for (const [where, use] of [["a computer", { viewport: { width: 1600, height: 900 } }], ["a phone", { ...phone, deviceScaleFactor: 1 }]]) {
  test.describe("on " + where, () => {
    test.use(use);

    test("text on glass keeps WCAG AA contrast against what is really behind it", async ({ page }) => {
      await seed(page, seedData());
      await page.goto("/");
      for (const [name, go] of VIEWS) {
        await go(page);
        await page.evaluate(() => { const t = document.getElementById("toast"); t.style.transition = "none"; t.classList.remove("show"); });
        await page.mouse.move(1, 1);
        await settle(page);
        await page.waitForTimeout(400); // entrance animations
        const low = await lowContrast(page);
        check(low.length === 0, `${name}: ` + low.join(" · "));
      }
    });
  });
}

test("the glass: frosted panes over the aurora, and solid surfaces for those who ask", async ({ page }) => {
  await seed(page, seedData());
  await page.goto("/");
  const blur = (sel) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).backdropFilter);
  for (const sel of [".mast", ".side", ".addcard", ".sheet", ".stat"]) {
    check((await blur(sel)).includes("blur("), sel + " is frosted");
  }
  check(!(await blur("ol.items li.entry")).includes("blur("), "rows inside a pane are not blurred themselves (keeps long lists quick)");
  check((await page.evaluate(() => getComputedStyle(document.body, "::before").backgroundImage)).includes("radial-gradient"), "the aurora is behind everything");
  const alpha = await page.locator(".sheet").evaluate((el) => Number((getComputedStyle(el).backgroundColor.match(/[\d.]+/g) || [])[3]));
  check(alpha > 0 && alpha < 0.3, "cards are translucent (alpha " + alpha + ")");

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
  const solid = await page.locator(".sheet").evaluate((el) => getComputedStyle(el).backgroundColor);
  check(/^rgb\(/.test(solid), "with “reduce transparency” on, cards are solid: " + solid);
  check((await blur(".sheet")) === "none", "…and nothing is blurred");
  check(await page.evaluate(() => getComputedStyle(document.body, "::before").display) === "none", "…and the aurora is off");
});
