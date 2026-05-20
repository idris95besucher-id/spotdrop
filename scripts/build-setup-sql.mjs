import { readFileSync, writeFileSync } from "node:fs";

const files = [
  "database/add-ai-guide-fields.sql",
  "database/add-guide-places.sql",
  "database/add-discovery-map.sql",
  "database/add-stories.sql",
];

const parts = files.map((path) => {
  const sql = readFileSync(path, "utf8").trim();
  return `-- >>> ${path}\n${sql}`;
});

writeFileSync(
  "database/setup-all-migrations.sql",
  `-- SpotDrop: paste this entire file into Supabase SQL Editor → Run\n\n${parts.join("\n\n")}\n\nnotify pgrst, 'reload schema';\n`
);

console.log("Wrote database/setup-all-migrations.sql");
