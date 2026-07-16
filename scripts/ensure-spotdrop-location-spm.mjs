/**
 * Ensure CapApp-SPM and capacitor.config.json include SpotDropLocation after `cap sync`.
 * Cap CLI rewrites CapApp-SPM/Package.swift — this script re-applies our local plugin.
 * Mirrors scripts/ensure-spotdrop-camera-spm.mjs / ensure-spotdrop-pano-spm.mjs exactly, one
 * package per script so a change to one plugin's wiring can never silently affect another's.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const packageSwiftPath = path.join(root, "ios/App/CapApp-SPM/Package.swift");
const configPath = path.join(root, "ios/App/App/capacitor.config.json");
const locationPackagePath = "../../../packages/spotdrop-location";

function ensurePackageSwift() {
  let source = fs.readFileSync(packageSwiftPath, "utf8");

  if (!source.includes("SpotDropLocation")) {
    // Insert after whichever local package is already present, so ordering stays stable
    // regardless of which ensure-scripts have already run this pass.
    const anchors = [
      `.package(name: "SpotDropCamera", path: "../../../packages/spotdrop-camera")`,
      `.package(name: "SpotDropPano", path: "../../../packages/spotdrop-pano")`,
      `.package(name: "CapacitorPushNotifications", path: "../../../node_modules/@capacitor/push-notifications")`,
    ];

    for (const anchor of anchors) {
      if (source.includes(anchor)) {
        source = source.replace(
          anchor,
          `${anchor},\n        .package(name: "SpotDropLocation", path: "${locationPackagePath}")`
        );
        break;
      }
    }

    const productAnchors = [
      `.product(name: "SpotDropCamera", package: "SpotDropCamera")`,
      `.product(name: "SpotDropPano", package: "SpotDropPano")`,
      `.product(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications")`,
    ];

    for (const anchor of productAnchors) {
      if (source.includes(anchor) && !source.includes(`.product(name: "SpotDropLocation"`)) {
        source = source.replace(
          anchor,
          `${anchor},\n                .product(name: "SpotDropLocation", package: "SpotDropLocation")`
        );
        break;
      }
    }

    fs.writeFileSync(packageSwiftPath, source);
    console.log("[spotdrop-location] CapApp-SPM/Package.swift updated");
  } else {
    console.log("[spotdrop-location] CapApp-SPM already includes SpotDropLocation");
  }
}

function ensureConfig() {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

  config.packageClassList = config.packageClassList ?? [];

  if (!config.packageClassList.includes("SpotDropLocationPlugin")) {
    config.packageClassList.push("SpotDropLocationPlugin");
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, "\t")}\n`);
    console.log("[spotdrop-location] packageClassList updated");
  } else {
    console.log("[spotdrop-location] packageClassList already includes SpotDropLocationPlugin");
  }
}

ensurePackageSwift();
ensureConfig();
