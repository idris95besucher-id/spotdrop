import { spawn } from "node:child_process";

const files = [
  "database/add-guide-places.sql",
  "database/add-discovery-map.sql",
  "database/add-stories.sql",
];

function run(file) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["scripts/run-discovery-map-sql.mjs"], {
      env: { ...process.env, MIGRATION_FILE: file },
      stdio: "inherit",
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Migration failed: ${file} (exit ${code})`));
    });
  });
}

for (const file of files) {
  console.log(`\n=== ${file} ===`);
  await run(file);
}

console.log("\nAll migrations applied.");
