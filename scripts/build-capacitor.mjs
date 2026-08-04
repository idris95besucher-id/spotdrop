#!/usr/bin/env node
/**
 * Static export for Capacitor: API routes are incompatible with output: "export",
 * so they are stashed for the build and restored afterward.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const apiDir = path.join(root, "app", "api");
const stashRoot = path.join(root, ".capacitor-stash");
const stashApiDir = path.join(stashRoot, "api");

function stashApiRoutes() {
  if (!fs.existsSync(apiDir)) {
    return;
  }

  fs.mkdirSync(stashRoot, { recursive: true });

  if (fs.existsSync(stashApiDir)) {
    fs.rmSync(stashApiDir, { recursive: true, force: true });
  }

  fs.renameSync(apiDir, stashApiDir);
}

function restoreApiRoutes() {
  if (!fs.existsSync(stashApiDir)) {
    return;
  }

  if (fs.existsSync(apiDir)) {
    fs.rmSync(apiDir, { recursive: true, force: true });
  }

  fs.renameSync(stashApiDir, apiDir);

  if (fs.existsSync(stashRoot) && fs.readdirSync(stashRoot).length === 0) {
    fs.rmdirSync(stashRoot);
  }
}

try {
  stashApiRoutes();
  execSync("next build", {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      CAPACITOR_BUILD: "1",
    },
  });
  execSync("node scripts/verify-capacitor-presence-build.mjs", {
    cwd: root,
    stdio: "inherit",
  });
  execSync("node scripts/verify-spotdrop-camera.mjs", {
    cwd: root,
    stdio: "inherit",
  });
} finally {
  restoreApiRoutes();
}
