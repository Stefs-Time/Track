// Lint rules: ESLint's recommended set — it catches real bugs (undefined
// names, unused code, unreachable branches) without bikeshedding style.
"use strict";

const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  { ignores: ["dist/", "node_modules/", "test-results/", "playwright-report/"] },
  js.configs.recommended,
  {
    // the app: a classic browser script (no modules), one IIFE
    files: ["src/app.js"],
    languageOptions: { ecmaVersion: 2017, sourceType: "script", globals: globals.browser },
    rules: {
      "no-inner-declarations": "off",
      // storage and clipboard calls can throw where the failure is expected and
      // handled by carrying on; the error object itself isn't needed there
      "no-unused-vars": ["error", { caughtErrors: "none" }]
    }
  },
  {
    files: ["src/sw.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: globals.serviceworker }
  },
  {
    files: ["server.js", "scripts/**/*.js", "eslint.config.js", "playwright.config.js", "tests/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "commonjs", globals: globals.node }
  },
  {
    // page.evaluate() / addInitScript() callbacks run in the browser
    files: ["tests/**/*.js", "scripts/screenshots.js", "scripts/icons.js"],
    languageOptions: { globals: { ...globals.browser } }
  }
];
