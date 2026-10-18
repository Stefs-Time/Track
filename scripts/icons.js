#!/usr/bin/env node
/**
 * Render src/icons/icon.svg to the PNG sizes the PWA manifest and iOS need.
 * Run after changing the icon:  npm run icons
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const DIR = path.join(__dirname, "..", "src", "icons");
const svg = fs.readFileSync(path.join(DIR, "icon.svg"), "utf8");
// the icon's own rounded tile, so maskable versions can go full-bleed
const TILE = /<rect width="512" height="512" rx="\d+" fill="(#[0-9a-f]+)"\/>/i;
const tileColour = (svg.match(TILE) || [])[1] || "#ff6a3d";

// [file, size, maskable] — maskable icons keep the glyph inside the 80% safe
// zone on a full-bleed background, because the OS crops them to its own shape
const SIZES = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, true]
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, size, maskable] of SIZES) {
    await page.setViewportSize({ width: size, height: size });
    const art = maskable
      ? `<div style="width:${size}px;height:${size}px;background:${tileColour};display:grid;place-items:center">
           <div style="width:${size * 0.8}px;height:${size * 0.8}px">${svg.replace(TILE, "")}</div></div>`
      : `<div style="width:${size}px;height:${size}px">${svg}</div>`;
    await page.setContent(`<body style="margin:0">${art}<style>svg{width:100%;height:100%;display:block}</style></body>`);
    await page.screenshot({ path: path.join(DIR, name), omitBackground: !maskable });
    console.log("icons: " + name);
  }
  await browser.close();
})();
