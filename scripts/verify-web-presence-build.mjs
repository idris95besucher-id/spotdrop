#!/usr/bin/env node
/**
 * Fail Vercel / web builds that omit OnlinePresenceBootstrap from the client bundle.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const nextDir = path.join(root, ".next");
const staticChunksDir = path.join(nextDir, "static", "chunks");
const serverAppDir = path.join(nextDir, "server", "app");

const requiredMarkers = [
  "[Online] bootstrap effect START",
  "[Online] heartbeat started",
  "[Online] goOnline()",
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

if (!fs.existsSync(nextDir)) {
  console.error("[web-presence] Missing .next/ directory. Run next build first.");
  process.exit(1);
}

const jsFiles = [...walkJsFiles(staticChunksDir), ...walkJsFiles(serverAppDir)];
const corpus = jsFiles.map((file) => fs.readFileSync(file, "utf8"));

const missing = requiredMarkers.filter((marker) => !corpus.some((text) => text.includes(marker)));

if (missing.length > 0) {
  console.error("[web-presence] Web build is missing required presence markers:");
  for (const marker of missing) {
    console.error(`  - ${marker}`);
  }
  process.exit(1);
}

console.log("[web-presence] Verified OnlinePresenceBootstrap markers in .next/.");
