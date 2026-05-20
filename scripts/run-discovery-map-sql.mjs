import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const { Client } = pg;

function loadLocalEnv() {
  if (!existsSync(".env.local")) {
    return;
  }

  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function getProjectRef(supabaseUrl) {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0];
  } catch {
    return null;
  }
}

function resolveDatabaseUrl() {
  const direct = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

  if (direct) {
    return direct;
  }

  const password = process.env.SUPABASE_DB_PASSWORD;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const projectRef = process.env.SUPABASE_PROJECT_REF || getProjectRef(supabaseUrl ?? "");

  if (!password || !projectRef) {
    return null;
  }

  const host = process.env.SUPABASE_DB_HOST || `db.${projectRef}.supabase.co`;
  const port = process.env.SUPABASE_DB_PORT || "5432";
  const user = process.env.SUPABASE_DB_USER || "postgres";
  const database = process.env.SUPABASE_DB_NAME || "postgres";

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

async function verifyTables(supabase) {
  const checks = [
    "discovery_regions",
    "discovery_places",
    "discovery_place_saves",
    "discovery_place_comments",
  ];

  const results = [];

  for (const table of checks) {
    const { error } = await supabase.from(table).select("id").limit(1);

    results.push({
      table,
      ok: !error,
      error: error ? `${error.code ?? ""} ${error.message}`.trim() : null,
    });
  }

  const { error: postsError } = await supabase
    .from("posts")
    .select("discovery_place_id, content_kind, expires_at")
    .limit(1);

  results.push({
    table: "posts.discovery_place_id + content_kind + expires_at",
    ok: !postsError,
    error: postsError ? `${postsError.code ?? ""} ${postsError.message}`.trim() : null,
  });

  return results;
}

async function main() {
  loadLocalEnv();

  const sqlPath = process.env.MIGRATION_FILE || "database/add-discovery-map.sql";
  const sql = readFileSync(sqlPath, "utf8");
  const databaseUrl = resolveDatabaseUrl();

  if (!databaseUrl) {
    console.error(
      [
        "Missing database connection.",
        "Add one of these to .env.local:",
        "  DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres",
        "  SUPABASE_DB_PASSWORD=[your database password]",
        "",
        "Project ref from URL: guihuviajsatcexbtuex",
        "Get password: Supabase Dashboard → Project Settings → Database",
      ].join("\n")
    );
    process.exit(1);
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  console.log(`Executing ${sqlPath}...`);

  try {
    await client.connect();
    await client.query(sql);
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log("SQL executed successfully.");
  } catch (error) {
    console.error("SQL execution failed:");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await client.end();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const verifyKey = serviceRoleKey || anonKey;

  if (!supabaseUrl || !verifyKey) {
    console.log("Tables created (Postgres). Skipping API verification — no Supabase API key in env.");
    process.exit(0);
  }

  const supabase = createClient(supabaseUrl, verifyKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await new Promise((r) => setTimeout(r, 1500));

  const results = await verifyTables(supabase);
  let allOk = true;

  console.log("\nVerification:");
  for (const row of results) {
    if (row.ok) {
      console.log(`  ✓ ${row.table}`);
    } else {
      allOk = false;
      console.log(`  ✗ ${row.table}: ${row.error}`);
    }
  }

  if (!allOk) {
    console.error("\nSome checks failed. If errors mention schema cache, wait 30s and reload the app.");
    process.exit(1);
  }

  console.log("\nAll discovery map tables verified.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
