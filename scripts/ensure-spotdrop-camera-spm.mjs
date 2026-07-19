/**
 * Ensure CapApp-SPM and capacitor.config.json include SpotDropCamera after `cap sync`.
 * Cap CLI rewrites CapApp-SPM/Package.swift — this script re-applies our local plugin.
 * Mirrors scripts/ensure-spotdrop-pano-spm.mjs exactly, one package per script so a
 * change to one plugin's wiring can never silently affect the other's.
 *
 * No-ops on Vercel / when the local iOS Cap tree is missing (safe for npm install).
 */
import fs from "node:fs";
import path from "node:path";
import { getRepoRoot, shouldSkipIosCapacitorScript } from "./iosCapacitorEnv.mjs";

if (shouldSkipIosCapacitorScript("[spotdrop-camera]")) {
  process.exit(0);
}

const root = getRepoRoot();
const packageSwiftPath = path.join(root, "ios/App/CapApp-SPM/Package.swift");
const configPath = path.join(root, "ios/App/App/capacitor.config.json");
const cameraPackagePath = "../../../packages/spotdrop-camera";

function ensurePackageSwift() {
  let source = fs.readFileSync(packageSwiftPath, "utf8");

  if (!source.includes("SpotDropCamera")) {
    // Insert after whichever local package is already present (SpotDropPano, if
    // this runs after its script) — otherwise after CapacitorPushNotifications.
    const anchors = [
      {
        find: `.package(name: "SpotDropPano", path: "../../../packages/spotdrop-pano")`,
        replaceWith: (match) => `${match},\n        .package(name: "SpotDropCamera", path: "${cameraPackagePath}")`,
      },
      {
        find: `.package(name: "CapacitorPushNotifications", path: "../../../node_modules/@capacitor/push-notifications")`,
        replaceWith: (match) => `${match},\n        .package(name: "SpotDropCamera", path: "${cameraPackagePath}")`,
      },
    ];

    for (const anchor of anchors) {
      if (source.includes(anchor.find)) {
        source = source.replace(anchor.find, anchor.replaceWith(anchor.find));
        break;
      }
    }

    source = source.replace(
      `.product(name: "SpotDropPano", package: "SpotDropPano")`,
      `.product(name: "SpotDropPano", package: "SpotDropPano"),\n                .product(name: "SpotDropCamera", package: "SpotDropCamera")`
    );

    if (!source.includes(`.product(name: "SpotDropCamera"`)) {
      source = source.replace(
        `.product(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications")`,
        `.product(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications"),\n                .product(name: "SpotDropCamera", package: "SpotDropCamera")`
      );
    }

    fs.writeFileSync(packageSwiftPath, source);
    console.log("[spotdrop-camera] CapApp-SPM/Package.swift updated");
  } else {
    console.log("[spotdrop-camera] CapApp-SPM already includes SpotDropCamera");
  }
}

function ensureConfig() {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

  config.packageClassList = config.packageClassList ?? [];

  if (!config.packageClassList.includes("SpotDropCameraPlugin")) {
    config.packageClassList.push("SpotDropCameraPlugin");
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, "\t")}\n`);
    console.log("[spotdrop-camera] packageClassList updated");
  } else {
    console.log("[spotdrop-camera] packageClassList already includes SpotDropCameraPlugin");
  }
}

ensurePackageSwift();
ensureConfig();
