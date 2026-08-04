/**
 * Capacitor iOS sync that always re-applies local SpotDrop plugins.
 *
 * Plain `npx cap sync ios` rewrites CapApp-SPM/Package.swift and drops
 * SpotDropCamera / SpotDropPano from packageClassList. Without the ensure
 * scripts, openSpotDropCamera fails and the app falls back to the old
 * "Create a Spot / Take Photo" screen on real iPhones.
 *
 * Prefer: `npm run cap:sync:ios` or `node scripts/cap-sync-ios.mjs`
 * Never ship an iOS build after a bare `npx cap sync ios` alone.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("npx", ["cap", "sync", "ios"]);
run(process.execPath, [path.join(root, "scripts/ensure-spotdrop-camera-spm.mjs")]);
run(process.execPath, [path.join(root, "scripts/ensure-spotdrop-pano-spm.mjs")]);

console.log("[cap-sync-ios] Sync finished with SpotDropCamera + SpotDropPano ensured.");
