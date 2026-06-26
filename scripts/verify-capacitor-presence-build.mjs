#!/usr/bin/env node
/**
 * Fail Capacitor builds that omit OnlinePresenceBootstrap diagnostics from out/.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "out");
const chunksDir = path.join(outDir, "_next", "static", "chunks");

const requiredMarkers = [
  "[Online] bootstrap effect START",
  "[Online] heartbeat started",
  "[Online] HTML layout loaded",
  "[DM SCREEN] app/dm/[userId]/DmThreadView.tsx",
];

function walkJsFiles(dir, files = []) {
  if (!fs.existsSync(dir)) {
    return files;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkJsFiles(fullPath, files);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }

  return files;
}

function readHtmlFiles(dir, files = []) {
  if (!fs.existsSync(dir)) {
    return files;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      readHtmlFiles(fullPath, files);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(fullPath);
    }
  }

  return files;
}

if (!fs.existsSync(outDir)) {
  console.error("[capacitor-presence] Missing out/ directory. Run npm run build:capacitor first.");
  process.exit(1);
}

const jsFiles = walkJsFiles(chunksDir);
const htmlFiles = readHtmlFiles(outDir);
const corpus = [
  ...jsFiles.map((file) => fs.readFileSync(file, "utf8")),
  ...htmlFiles.map((file) => fs.readFileSync(file, "utf8")),
];

const missing = requiredMarkers.filter((marker) => !corpus.some((text) => text.includes(marker)));

if (missing.length > 0) {
  console.error("[capacitor-presence] Capacitor export is missing required presence markers:");
  for (const marker of missing) {
    console.error(`  - ${marker}`);
  }
  process.exit(1);
}

console.log("[capacitor-presence] Verified presence bootstrap markers in out/.");
