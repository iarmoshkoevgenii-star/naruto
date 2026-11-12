/* Applies db/migrations/NNN_name.sql in order, each in its own transaction, and records it in
   schema_migrations. Safe to run any number of times. Run by `npm run migrate`, `npm run dev` and the
   Vercel build (scripts/build-seed.mjs, only when DATABASE_URL is set). Never from an API function. */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, tx } from "./db.js";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const LOCK = 7_420_001; // arbitrary advisory-lock key: one migrator at a time

export function migrationFiles(dir = DIR) {
  return readdirSync(dir).filter(f => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();
}

export async function migrate({ dir = DIR } = {}) {
  await query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const applied = [];
  for (const name of migrationFiles(dir)) {
    const sql = readFileSync(path.join(dir, name), "utf8");
    const done = await tx(async t => {
      await t.query("SELECT pg_advisory_xact_lock($1)", [LOCK]);
      if ((await t.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name])).length) return false;
      await t.exec(sql);
      await t.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      return true;
    });
    if (done) applied.push(name);
  }
  return applied;
}
