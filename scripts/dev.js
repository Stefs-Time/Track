#!/usr/bin/env node
/**
 * Local development: rebuilds dist/ whenever src/ changes and runs the server,
 * restarting it when server.js changes. Works the same on Windows, macOS and
 * Linux (no shell `&` tricks). Stop with Ctrl+C.
 */
"use strict";

const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
// build once up front so the server never starts without dist/
const first = spawnSync(process.execPath, [path.join(__dirname, "build.js")], { cwd: root, stdio: "inherit" });
if (first.status !== 0) process.exit(first.status || 1);

const children = [
  spawn(process.execPath, [path.join(__dirname, "build.js"), "--watch"], { cwd: root, stdio: "inherit" }),
  spawn(process.execPath, ["--watch-path=server.js", "server.js"], { cwd: root, stdio: "inherit" })
];

function stop() {
  for (const child of children) child.kill();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
