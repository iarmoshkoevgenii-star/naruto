/* npm run migrate: apply pending catalog migrations to DATABASE_URL (Neon), or to .pglite/ locally.
   Reads .env.local / .env like npm run dev. */
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

const { migrate } = await import("../lib/migrate.js");
const { dbKind, closeDb } = await import("../lib/db.js");
const applied = await migrate();
console.log("Catalog database (" + await dbKind() + "):", applied.length ? "applied " + applied.join(", ") : "up to date");
await closeDb();
