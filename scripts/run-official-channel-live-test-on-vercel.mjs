#!/usr/bin/env node
/**
 * Runs the official-channel live locale smoke only on Vercel Production builds,
 * where Sensitive env vars (service role, OpenAI) are available.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const isVercelProd =
  process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";

if (!isVercelProd) {
  console.log(
    "[official-channel-live-test] skip (not Vercel production build)"
  );
  process.exit(0);
}

const script = path.join(
  process.cwd(),
  "scripts/live-official-channel-locale-test.mjs"
);

const result = spawnSync(process.execPath, [script], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
