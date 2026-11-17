/* npm run seed-catalog: apply pending migrations, then fill the catalog from the built-in items and the
   teacher's overrides (lib/seed-catalog.js). Safe to run again: it only adds what is missing.
   Uses DATABASE_URL or NARUTO_STORAGE_DATABASE_URL (Neon) and the Blob store when set (.env.local / .env), else .pglite/ and .local-store/. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
for (const file of [".env.local", ".env"]) {
  let text; try { text = readFileSync(file, "utf8"); } catch { continue; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}
// Same default as npm run dev: no Blob credentials -> ./.local-store.
if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID && process.env.LOCAL_STORE_DIR === undefined) process.env.LOCAL_STORE_DIR = ".local-store";
// Rows in Neon pointing at files on this laptop would break every picture on the site.
const { databaseUrl } = await import("../lib/db.js");
let dbUrl;
try { dbUrl = databaseUrl(); } catch (e) { console.error(e.message + " Put the real Neon address in .env.local as DATABASE_URL=postgresql://..."); process.exit(1); }
if (dbUrl && process.env.LOCAL_STORE_DIR) {
  console.error("The database address points at a real database but pictures would go to a local folder. Set BLOB_READ_WRITE_TOKEN (and unset LOCAL_STORE_DIR) to seed the real site.");
  process.exit(1);
}

const { migrate } = await import("../lib/migrate.js");
const { dbKind, closeDb } = await import("../lib/db.js");
const { storageInfo } = await import("../lib/store.js");
const { seedCatalog } = await import("../lib/seed-catalog.js");
try {
  await migrate();
  const r = await seedCatalog();
  console.log(`Catalog database (${await dbKind()}), files: ${JSON.stringify(storageInfo())}`);
  console.log(`sheet ${r.sheet}; sections added: ${r.sectionsAdded.length}; items added: ${r.itemsAdded.length}; ` +
    `old uploads migrated: ${r.assetsMigrated.length}; shelf layouts set: ${r.shelvesSet.length}`);
  for (const u of r.updated) console.log("updated:", u);
  for (const w of r.warnings) console.log("warning:", w);
} finally {
  await closeDb();
}
