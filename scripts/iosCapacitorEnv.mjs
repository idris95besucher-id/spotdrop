/**
 * Shared guards for iOS/Capacitor maintenance scripts.
 * Vercel (and other CI without a local Xcode tree) must not fail npm install.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function getRepoRoot() {
  return root;
}

export function isVercelEnvironment() {
  return Boolean(process.env.VERCEL) || Boolean(process.env.VERCEL_ENV);
}

/** True when CapApp-SPM + generated capacitor.config.json are present (local Xcode tree). */
export function hasLocalIosCapacitorProject() {
  const packageSwiftPath = path.join(root, "ios/App/CapApp-SPM/Package.swift");
  const configPath = path.join(root, "ios/App/App/capacitor.config.json");
  const iosDir = path.join(root, "ios");

  return (
    fs.existsSync(iosDir) &&
    fs.existsSync(packageSwiftPath) &&
    fs.existsSync(configPath)
  );
}

/**
 * @param {string} scriptLabel e.g. "[spotdrop-camera]"
 * @returns {boolean} true when the caller should exit without doing work
 */
export function shouldSkipIosCapacitorScript(scriptLabel) {
  if (isVercelEnvironment()) {
    console.log(`${scriptLabel} Skipping on Vercel (iOS/Capacitor scripts are local-only).`);
    return true;
  }

  if (!hasLocalIosCapacitorProject()) {
    console.log(
      `${scriptLabel} Skipping — ios CapApp-SPM / capacitor.config.json not found (run cap sync locally first).`
    );
    return true;
  }

  return false;
}
