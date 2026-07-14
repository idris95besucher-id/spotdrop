/**
 * Ensure CapApp-SPM and capacitor.config.json include SpotDropPano after `cap sync`.
 * Cap CLI rewrites CapApp-SPM/Package.swift — this script re-applies our local plugin.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const packageSwiftPath = path.join(root, "ios/App/CapApp-SPM/Package.swift");
const configPath = path.join(root, "ios/App/App/capacitor.config.json");
const panoPackagePath = "../../../packages/spotdrop-pano";

function ensurePackageSwift() {
  let source = fs.readFileSync(packageSwiftPath, "utf8");

  if (!source.includes("SpotDropPano")) {
    source = source.replace(
      `.package(name: "CapacitorPushNotifications", path: "../../../node_modules/@capacitor/push-notifications")`,
      `.package(name: "CapacitorPushNotifications", path: "../../../node_modules/@capacitor/push-notifications"),\n        .package(name: "SpotDropPano", path: "${panoPackagePath}")`
    );

    source = source.replace(
      `.product(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications")`,
      `.product(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications"),\n                .product(name: "SpotDropPano", package: "SpotDropPano")`
    );

    fs.writeFileSync(packageSwiftPath, source);
    console.log("[spotdrop-pano] CapApp-SPM/Package.swift updated");
  } else {
    console.log("[spotdrop-pano] CapApp-SPM already includes SpotDropPano");
  }
}

function ensureConfig() {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

  config.packageClassList = config.packageClassList ?? [];

  if (!config.packageClassList.includes("SpotDropPanoPlugin")) {
    config.packageClassList.push("SpotDropPanoPlugin");
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, "\t")}\n`);
    console.log("[spotdrop-pano] packageClassList updated");
  } else {
    console.log("[spotdrop-pano] packageClassList already includes SpotDropPanoPlugin");
  }
}

ensurePackageSwift();
ensureConfig();
