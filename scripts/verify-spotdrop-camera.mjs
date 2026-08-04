/**
 * Fail the process if the protected SpotDrop camera / pano wiring is missing.
 *
 * Baseline: commit a38c02d357dc3cb822a7aecf9ca2388947f52c1f
 * Wired after: npm run build:capacitor, npx cap sync ios (capacitor:sync:after).
 *
 * Source + package.json hooks always checked.
 * CapApp-SPM / packageClassList checked when the local iOS Cap tree is present
 * (skipped on Vercel / missing ios Cap tree — same policy as ensure-*-spm).
 */
import fs from "node:fs";
import path from "node:path";
import {
  getRepoRoot,
  hasLocalIosCapacitorProject,
  isVercelEnvironment,
} from "./iosCapacitorEnv.mjs";

const TAG = "[verify-spotdrop-camera]";
const root = getRepoRoot();
const errors = [];

function read(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    errors.push(`missing file: ${rel}`);
    return null;
  }
  return fs.readFileSync(abs, "utf8");
}

function requireIncludes(rel, needles, label) {
  const source = read(rel);
  if (source == null) {
    return;
  }
  for (const needle of needles) {
    if (!source.includes(needle)) {
      errors.push(`${label}: ${rel} missing ${JSON.stringify(needle)}`);
    }
  }
}

function requireExists(rel) {
  if (!fs.existsSync(path.join(root, rel))) {
    errors.push(`missing path: ${rel}`);
  }
}

// --- Native packages + modes (always) --------------------------------------
requireExists("packages/spotdrop-camera/Package.swift");
requireExists("packages/spotdrop-camera/ios/Sources/SpotDropCameraPlugin/SpotDropCameraPlugin.swift");
requireExists("packages/spotdrop-camera/ios/Sources/SpotDropCameraPlugin/VideoCaptureViewController.swift");
requireExists("packages/spotdrop-pano/Package.swift");

requireIncludes(
  "packages/spotdrop-camera/ios/Sources/SpotDropCameraPlugin/SpotDropCameraPlugin.swift",
  ['jsName = "SpotDropCamera"', "openCamera"],
  "SpotDropCamera plugin"
);

requireIncludes(
  "packages/spotdrop-camera/ios/Sources/SpotDropCameraPlugin/VideoCaptureViewController.swift",
  ['("photo", "PHOTO")', '("video", "VIDEO")', '("text", "TEXT")'],
  "Photo/Video/Text modes"
);

requireIncludes(
  "lib/spotDropCamera.ts",
  ['registerPlugin<SpotDropCameraPlugin>("SpotDropCamera"', "openSpotDropCamera"],
  "JS bridge"
);

requireIncludes(
  "components/SpotInstagramCamera.tsx",
  [
    'export type SpotCreateCameraMode = "photo" | "video" | "text"',
    "openSpotDropCamera",
  ],
  "SpotInstagramCamera"
);

const packageJsonRaw = read("package.json");
if (packageJsonRaw) {
  let pkg;
  try {
    pkg = JSON.parse(packageJsonRaw);
  } catch {
    errors.push("package.json: invalid JSON");
    pkg = null;
  }
  const after = pkg?.scripts?.["capacitor:sync:after"] ?? "";
  if (!after.includes("ensure-spotdrop-camera-spm.mjs")) {
    errors.push("package.json: capacitor:sync:after must run ensure-spotdrop-camera-spm.mjs");
  }
  if (!after.includes("ensure-spotdrop-pano-spm.mjs")) {
    errors.push("package.json: capacitor:sync:after must run ensure-spotdrop-pano-spm.mjs");
  }
  if (!after.includes("verify-spotdrop-camera.mjs")) {
    errors.push("package.json: capacitor:sync:after must run verify-spotdrop-camera.mjs");
  }
}

// --- iOS SPM (local Cap tree only) -----------------------------------------
if (isVercelEnvironment()) {
  console.log(`${TAG} Skipping CapApp-SPM checks on Vercel (local iOS tree only).`);
} else if (!hasLocalIosCapacitorProject()) {
  console.log(
    `${TAG} Skipping CapApp-SPM checks — ios CapApp-SPM / capacitor.config.json not found.`
  );
} else {
  const packageSwift = "ios/App/CapApp-SPM/Package.swift";
  requireIncludes(
    packageSwift,
    [
      '.package(name: "SpotDropCamera", path: "../../../packages/spotdrop-camera")',
      '.package(name: "SpotDropPano", path: "../../../packages/spotdrop-pano")',
      '.product(name: "SpotDropCamera", package: "SpotDropCamera")',
      '.product(name: "SpotDropPano", package: "SpotDropPano")',
    ],
    "CapApp-SPM"
  );

  const configPath = path.join(root, "ios/App/App/capacitor.config.json");
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const list = config.packageClassList ?? [];
    if (!list.includes("SpotDropCameraPlugin")) {
      errors.push("capacitor.config.json: packageClassList missing SpotDropCameraPlugin");
    }
    if (!list.includes("SpotDropPanoPlugin")) {
      errors.push("capacitor.config.json: packageClassList missing SpotDropPanoPlugin");
    }
  } catch {
    errors.push("capacitor.config.json: invalid JSON");
  }
}

if (errors.length > 0) {
  console.error(`${TAG} FAILED — protected camera wiring is incomplete:`);
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  console.error(
    `${TAG} Do not open Xcode until SpotDropCamera + SpotDropPano are restored (see commit a38c02d).`
  );
  process.exit(1);
}

const spmChecked = !isVercelEnvironment() && hasLocalIosCapacitorProject();
console.log(
  spmChecked
    ? `${TAG} OK — SpotDropCamera, SpotDropPano, Photo/Video/Text, CapApp-SPM entries present.`
    : `${TAG} OK — SpotDropCamera, SpotDropPano, Photo/Video/Text present (CapApp-SPM checks skipped).`
);
