#!/usr/bin/env node
/**
 * Ensures GoogleService-Info.plist is present for iOS Firebase/FCM.
 *
 * Usage:
 *   node scripts/sync-google-service-info-ios.mjs
 *   GOOGLE_SERVICE_INFO_PLIST=~/Downloads/GoogleService-Info.plist node scripts/sync-google-service-info-ios.mjs
 *   node scripts/sync-google-service-info-ios.mjs --verify
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "ios/App/App/GoogleService-Info.plist");
const example = path.join(root, "ios/App/App/GoogleService-Info.plist.example");
const pbxproj = path.join(root, "ios/App/App.xcodeproj/project.pbxproj");
const verifyOnly = process.argv.includes("--verify");

const XCODE_BUNDLE_ID = "com.idrisgazimagomaev.spotdropapp";

function readPlistKeys(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const keys = {};

  for (const key of [
    "GOOGLE_APP_ID",
    "GCM_SENDER_ID",
    "API_KEY",
    "PROJECT_ID",
    "BUNDLE_ID",
    "STORAGE_BUCKET",
  ]) {
    const match = raw.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`));
    if (match) {
      keys[key] = match[1].trim();
    }
  }

  return keys;
}

function resolveSourcePath() {
  const candidates = [
    process.env.GOOGLE_SERVICE_INFO_PLIST?.trim(),
    path.join(root, "GoogleService-Info.plist"),
    dest,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  return null;
}

function copyPlist(sourcePath) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(sourcePath, dest);
  console.log(`[firebase-ios] Copied GoogleService-Info.plist → ${path.relative(root, dest)}`);
}

function validatePlist(filePath) {
  const keys = readPlistKeys(filePath);

  if (!keys) {
    return { ok: false, error: "File not found or unreadable." };
  }

  if (!keys.GOOGLE_APP_ID) {
    return { ok: false, error: "GOOGLE_APP_ID is missing or empty." };
  }

  if (keys.BUNDLE_ID && keys.BUNDLE_ID !== XCODE_BUNDLE_ID) {
    return {
      ok: false,
      error: `BUNDLE_ID mismatch: plist=${keys.BUNDLE_ID}, Xcode=${XCODE_BUNDLE_ID}. Re-download plist from Firebase for the Xcode bundle ID.`,
    };
  }

  return { ok: true, keys };
}

function verifyXcodeProject() {
  if (!fs.existsSync(pbxproj)) {
    return { ok: false, error: "ios/App/App.xcodeproj/project.pbxproj not found." };
  }

  const project = fs.readFileSync(pbxproj, "utf8");
  const hasFileRef = project.includes("GoogleService-Info.plist");
  const inResources =
    project.includes("GoogleService-Info.plist in Resources") ||
    /GoogleService-Info\.plist \*\/ = \{isa = PBXBuildFile/.test(project);

  if (!hasFileRef) {
    return { ok: false, error: "GoogleService-Info.plist is not referenced in the Xcode project." };
  }

  if (!inResources) {
    return { ok: false, error: "GoogleService-Info.plist is not in Copy Bundle Resources." };
  }

  return { ok: true };
}

function printSetupInstructions() {
  console.error(`
[firebase-ios] GoogleService-Info.plist is required for iOS push (FCM/APNs).

Steps:
  1. Firebase Console → Project settings → Your apps → Add iOS app
  2. Bundle ID must match Xcode: ${XCODE_BUNDLE_ID}
  3. Download GoogleService-Info.plist
  4. Run ONE of:
       cp ~/Downloads/GoogleService-Info.plist ios/App/App/GoogleService-Info.plist
       GOOGLE_SERVICE_INFO_PLIST=~/Downloads/GoogleService-Info.plist npm run ios:firebase-plist
  5. npm run cap:sync:ios
  6. In Xcode: App target → Signing & Capabilities → Push Notifications

Template: ${path.relative(root, example)}
`);
}

function main() {
  const source = resolveSourcePath();

  if (!verifyOnly && source && path.resolve(source) !== path.resolve(dest)) {
    copyPlist(source);
  }

  const plistPath = fs.existsSync(dest) ? dest : source;
  const plistCheck = plistPath ? validatePlist(plistPath) : { ok: false, error: "GoogleService-Info.plist not found." };
  const xcodeCheck = verifyXcodeProject();

  console.log("[firebase-ios] verify", {
    plistExists: Boolean(plistPath && fs.existsSync(plistPath)),
    plistPath: plistPath ? path.relative(root, plistPath) : null,
    xcodeProject: xcodeCheck.ok,
    bundleId: XCODE_BUNDLE_ID,
    googleAppId: plistCheck.ok ? plistCheck.keys?.GOOGLE_APP_ID : null,
  });

  if (verifyOnly) {
    if (!plistCheck.ok || !xcodeCheck.ok) {
      if (!plistCheck.ok) {
        console.error(`[firebase-ios] plist: ${plistCheck.error}`);
      }
      if (!xcodeCheck.ok) {
        console.error(`[firebase-ios] xcode: ${xcodeCheck.error}`);
      }
      printSetupInstructions();
      process.exit(1);
    }

    console.log("[firebase-ios] OK — ready for FirebaseApp.configure() and FCM token registration.");
    process.exit(0);
  }

  if (!plistCheck.ok) {
    printSetupInstructions();
    console.warn(`[firebase-ios] ${plistCheck.error}`);
    process.exit(0);
  }

  if (!xcodeCheck.ok) {
    console.warn(`[firebase-ios] ${xcodeCheck.error}`);
  }
}

main();
