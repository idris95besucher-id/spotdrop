/**
 * Safe npm postinstall for web (Vercel) and local Mac.
 * iOS/Capacitor patches never fail install when the ios tree is absent.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isVercelEnvironment } from "./iosCapacitorEnv.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(scriptRelativePath) {
  const scriptPath = path.join(root, scriptRelativePath);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (isVercelEnvironment()) {
  console.log("[postinstall] Vercel detected — skipping iOS/Capacitor patch scripts.");
  process.exit(0);
}

run("scripts/patch-capacitor-firebase-ios.mjs");
run("scripts/ensure-spotdrop-camera-spm.mjs");
