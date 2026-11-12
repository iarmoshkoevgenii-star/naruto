import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { query, tx, useMemoryDb, closeDb, dbKind } from "../lib/db.js";
import { migrate, migrationFiles } from "../lib/migrate.js";

beforeEach(() => useMemoryDb());
after(() => closeDb());

const section = (id, position) => query("INSERT INTO shop_sections (id, label, position) VALUES ($1, $2, $3)", [id, id, position]);
const item = (id, position, extra = {}) => query(
  "INSERT INTO items (id, name, type, section_id, position, price, status) VALUES ($1, $2, 'rug', 'decor', $3, $4, $5)",
  [id, extra.name ?? id, position, extra.price ?? 1, extra.status ?? "active"]);

test("tests run on in-memory PGlite", async () => {
  assert.equal(await dbKind(), "pglite-memory");
});

test("migrate applies every migration on a fresh database", async () => {
  const applied = await migrate();
  assert.deepEqual(applied, migrationFiles());
  const tables = (await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1")).map(r => r.table_name);
  assert.deepEqual(tables, ["assets", "items", "schema_migrations", "shop_sections"]);
});

test("migrate is idempotent", async () => {
  await migrate();
  assert.deepEqual(await migrate(), []);
  const rows = await query("SELECT name FROM schema_migrations");
  assert.equal(rows.length, migrationFiles().length);
});

test("query round-trips parameters, arrays and json", async () => {
  await migrate();
  await section("decor", 1);
  await query("INSERT INTO items (id, name, type, section_id, position, sprite_rect, surface) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    ["rug-teal", "Teal rug", "rug", "decor", 1, [1, 2, 3, 4], JSON.stringify({ color: "#000000" })]);
  const [row] = await query("SELECT * FROM items WHERE id = $1", ["rug-teal"]);
  assert.equal(row.name, "Teal rug");
  assert.deepEqual(row.sprite_rect, [1, 2, 3, 4]);
  assert.deepEqual(row.surface, { color: "#000000" });
  assert.equal(row.status, "active");
  assert.equal(row.price, 0);
});

test("constraints reject bad prices, statuses and ids", async () => {
  await migrate();
  await section("decor", 1);
  await assert.rejects(item("a", 1, { price: -1 }));
  await assert.rejects(item("b", 2, { status: "gone" }));
  await assert.rejects(item("Bad Id", 3));
  await assert.rejects(query("INSERT INTO items (id, name, type, section_id, position) VALUES ('c', 'C', 'rug', 'nope', 1)"));
});

test("positions are unique per section, but can be swapped inside a transaction", async () => {
  await migrate();
  await section("decor", 1);
  await item("a", 1); await item("b", 2);
  await assert.rejects(item("c", 1));
  await tx(async t => {
    await t.query("UPDATE items SET position = 2 WHERE id = 'a'");
    await t.query("UPDATE items SET position = 1 WHERE id = 'b'");
  });
  const order = (await query("SELECT id FROM items ORDER BY position")).map(r => r.id);
  assert.deepEqual(order, ["b", "a"]);
});

test("a failing transaction leaves nothing behind", async () => {
  await migrate();
  await section("decor", 1);
  await assert.rejects(tx(async t => {
    await t.query("INSERT INTO items (id, name, type, section_id, position) VALUES ('x', 'X', 'rug', 'decor', 1)");
    throw new Error("boom");
  }), /boom/);
  assert.equal((await query("SELECT * FROM items")).length, 0);
});
