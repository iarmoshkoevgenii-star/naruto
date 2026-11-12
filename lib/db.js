/* The catalog database (docs/room-shop/PLAN.md).
   - DATABASE_URL set (Vercel + Neon): Neon's serverless driver. Plain queries go over HTTP; transactions
     open a short-lived WebSocket Pool that is closed when the transaction ends.
   - Otherwise (npm run dev, tests): PGlite, a real Postgres running in-process. Data persists in
     PGLITE_DIR (default .pglite/), or stays in memory when NODE_ENV=test or after useMemoryDb().
   On Vercel without DATABASE_URL there is no database: every call fails with a clear 503.

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

function pick() {
  const url = process.env.DATABASE_URL;
  if (url) return neonBackend(url);
  if (process.env.VERCEL) return Promise.reject(new HttpError(503, "The shop database is not connected yet (DATABASE_URL is missing)."));
  if (process.env.NODE_ENV === "test") return pgliteBackend(null);
  return pgliteBackend(process.env.PGLITE_DIR || ".pglite");
}

function db() {
  if (!backend) backend = pick().catch(e => { backend = null; throw e; });
  return backend;
}

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
