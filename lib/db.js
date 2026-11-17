/* The catalog database (docs/room-shop/PLAN.md).
   - A database address set (Vercel + Neon; see databaseUrl()): Neon's serverless driver. Plain queries go over HTTP; transactions
     open a short-lived WebSocket Pool that is closed when the transaction ends.
   - Otherwise (npm run dev, tests): PGlite, a real Postgres running in-process. Data persists in
     PGLITE_DIR (default .pglite/), or stays in memory when NODE_ENV=test or after useMemoryDb().
   On Vercel without an address there is no database: every call fails with a clear 503.

   API: query(text, params) -> rows;  tx(async t => ...) where t.query(text, params) -> rows and
   t.exec(sql) runs several statements (migrations). Use $1, $2 placeholders, never string concatenation. */
import { HttpError } from "./http.js";

let backend = null;

async function neonBackend(url) {
  const { neon, Pool } = await import("@neondatabase/serverless");
  const sql = neon(url);
  return {
    kind: "neon",
    query: (text, params = []) => sql.query(text, params),
    async tx(fn) {
      const pool = new Pool({ connectionString: url });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const t = { query: async (text, params = []) => (await client.query(text, params)).rows, exec: async text => { await client.query(text); } };
        const out = await fn(t);
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
        await pool.end();
      }
    },
    close: async () => {},
  };
}

async function pgliteBackend(dir) {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = dir ? new PGlite(dir) : new PGlite();
  await db.waitReady;
  return {
    kind: dir ? "pglite" : "pglite-memory",
    query: async (text, params = []) => (await db.query(text, params)).rows,
    tx: fn => db.transaction(t => fn({ query: async (text, params = []) => (await t.query(text, params)).rows, exec: async text => { await t.exec(text); } })),
    close: () => db.close(),
  };
}

/* Where the Neon address can be. Vercel's Neon integration was connected with the prefix NARUTO_STORAGE,
   so production has NARUTO_STORAGE_DATABASE_URL; DATABASE_URL wins when both are set. A value that isn't
   a postgres:// address (e.g. the "[SENSITIVE]" placeholder `vercel env pull` writes) is an error, not
   silently skipped, so a script never ends up on the wrong database. */
export const DB_URL_VARS = ["DATABASE_URL", "NARUTO_STORAGE_DATABASE_URL"];
export function databaseUrl(env = process.env) {
  for (const name of DB_URL_VARS) {
    const v = String(env[name] || "").trim();
    if (!v) continue;
    if (!/^postgres(ql)?:\/\//.test(v))
      throw new HttpError(503, `${name} is set but is not a postgres:// address${v === "[SENSITIVE]" ? " (it is the placeholder vercel env pull writes for secret values)" : ""}.`);
    return v;
  }
  return null;
}

function pick() {
  let url;
  try { url = databaseUrl(); } catch (e) { return Promise.reject(e); }
  if (url) return neonBackend(url);
  if (process.env.VERCEL) return Promise.reject(new HttpError(503, "The shop database is not connected yet (no " + DB_URL_VARS.join(" or ") + ")."));
  if (process.env.NODE_ENV === "test") return pgliteBackend(null);
  return pgliteBackend(process.env.PGLITE_DIR || ".pglite");
}

function db() {
  if (!backend) backend = pick().catch(e => { backend = null; throw e; });
  return backend;
}

/* False only on Vercel without a database address (Neon not connected): callers that have a pre-database
   fallback (lib/assets.js) use it instead of failing with the 503. */
export function dbConfigured() { return !!databaseUrl() || !process.env.VERCEL; }

export async function query(text, params = []) { return (await db()).query(text, params); }
export async function tx(fn) { return (await db()).tx(fn); }
export async function dbKind() { return (await db()).kind; }

/* Tests: start over with an empty in-memory database. */
export async function useMemoryDb() {
  await closeDb();
  backend = pgliteBackend(null);
  await backend;
}

export async function closeDb() {
  if (!backend) return;
  const b = await backend.catch(() => null);
  backend = null;
  if (b) await b.close();
}
