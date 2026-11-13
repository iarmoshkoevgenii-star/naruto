/* Step 5: the teacher's shop management, through the real api/game.js handler. */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { useMemoryDb, closeDb } from "../lib/db.js";
import { migrate } from "../lib/migrate.js";
import { seedCatalog } from "../lib/seed-catalog.js";
import { getItem, listItems, listSections } from "../lib/catalog.js";
import { storeAsset, buy, gameOf, loadConfig } from "../lib/game.js";
import { authConfig, issueToken } from "../lib/auth.js";
import { furnished } from "../public/js/game-model.js";
import { POST } from "../api/game.js";

/* Throwaway credentials, only for signing test sessions. */
Object.assign(process.env, {
  SESSION_SECRET: randomBytes(32).toString("hex"),
  TEACHER_LOGIN: "t-" + randomBytes(4).toString("hex"), TEACHER_PASSWORD: randomBytes(12).toString("hex"),
  USER_LOGIN: "d-" + randomBytes(4).toString("hex"), USER_PASSWORD: randomBytes(12).toString("hex"),
});
const auth = authConfig().config;
const cookie = { teacher: "ns_session=" + issueToken("teacher", "teacher", auth), student: "ns_session=" + issueToken("student", "demo", auth) };

let dir;
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "admin-test-"));
  process.env.LOCAL_STORE_DIR = dir;
  await useMemoryDb();
  await migrate();
  await seedCatalog({ overrides: {} });
});
after(async () => { await closeDb(); if (dir) rmSync(dir, { recursive: true, force: true }); });

async function call(action, body, who = "teacher") {
  const res = await POST(new Request("http://localhost/api/game?action=" + action, {
    method: "POST", body: JSON.stringify(body),
    headers: { cookie: cookie[who], "x-requested-with": "naruto-study", "content-type": "application/json" },
  }));
  return { status: res.status, body: await res.json() };
}
const ok = async (action, body) => {
  const r = await call(action, body);
  assert.equal(r.status, 200, action + ": " + JSON.stringify(r.body));
  return r.body;
};
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("rug")]);
const upload = () => storeAsset("Carpet", "data:image/png;base64," + PNG.toString("base64"), 30, 12);
const sectionIds = async id => (await listItems({ includeHidden: true, includeDeleted: true })).filter(i => i.sectionId === id).map(i => i.id);

test("students get 403 for every shop action; unknown actions 404", async () => {
  for (const op of ["item.create", "item.update", "item.hide", "item.unhide", "item.delete", "item.restore", "item.reorder",
    "section.create", "section.rename", "section.reorder", "section.delete"]) {
    const r = await call(op, { id: "rug-teal", label: "x" }, "student");
    assert.equal(r.status, 403, op);
  }
  assert.equal((await getItem("rug-teal")).status, "active");
  assert.equal((await call("item.explode", {})).status, 404);
});

test("item.create: the carpet example, appended to its section and on sale for students", async () => {
  const pic = await upload();
  const before = await sectionIds("furniture");
  const { result, config } = await ok("item.create", { name: "Red carpet", type: "rug", sectionId: "furniture", price: 40, minLevel: 2, sprite: { asset: pic.id, rect: [0, 0, 30, 12] } });
  assert.match(result.id, /^u-[0-9a-f]{12}$/);
  assert.deepEqual([result.status, result.price, result.minLevel, result.sectionId], ["active", 40, 2, "furniture"]);
  assert.deepEqual(await sectionIds("furniture"), [...before, result.id]);
  assert.ok(config.items.some(i => i.id === result.id) && Array.isArray(config.assets), "answers with the teacher's config");
  assert.ok((await loadConfig()).config.items.some(i => i.id === result.id && i.active));
});

test("item.create validation: missing fields, bad values, unknown section/picture, seed-only fields", async () => {
  const pic = await upload();
  const base = { name: "Rug", type: "rug", sectionId: "furniture", price: 5, minLevel: 1, sprite: { asset: pic.id, rect: [0, 0, 4, 4] } };
  for (const [bad, msg] of [
    [{ ...base, name: "" }, /name/],
    [{ ...base, price: -1 }, /price/],
    [{ ...base, price: 1.5 }, /price/],
    [{ ...base, minLevel: 0 }, /level/],
    [{ ...base, type: "spaceship" }, /type/],
    [{ ...base, sectionId: "nope" }, /section/],
    [{ ...base, sprite: { asset: "f".repeat(32), rect: [0, 0, 4, 4] } }, /picture/],
    [{ ...base, sprite: undefined }, /picture/],
    [{ ...base, cover: "red" }, /colour/],
    [{ ...base, status: "hidden" }, /status/],
    [{ ...base, shelfLayout: {} }, /shelfLayout/],
    [{ name: "Rug", type: "rug", sectionId: "furniture", minLevel: 1, sprite: base.sprite }, /price/],
  ]) {
    const r = await call("item.create", bad);
    assert.equal(r.status, 422, JSON.stringify(bad));
    assert.match(r.body.error, msg);
  }
  const r = await call("item.create", { ...base, id: "rug-teal" });
  assert.equal(r.status, 200, "an id in the body is ignored, never used");
  assert.notEqual(r.body.result.id, "rug-teal");
  assert.equal((await getItem("rug-teal")).name !== "Rug", true);
});

test("item.update: price, level, name, cover; moving section appends at the end", async () => {
  const { result } = await ok("item.update", { id: "rug-teal", price: 77, minLevel: 3, name: "Teal rug XL" });
  assert.deepEqual([result.price, result.minLevel, result.name], [77, 3, "Teal rug XL"]);
  await ok("item.update", { id: "en/desperate-housewives", cover: "#aa3311" });
  assert.equal((await getItem("en/desperate-housewives")).cover, "#aa3311");
  const decor = await sectionIds("decor");
  const moved = (await ok("item.update", { id: "rug-teal", sectionId: "decor" })).result;
  assert.equal(moved.sectionId, "decor");
  assert.deepEqual(await sectionIds("decor"), [...decor, "rug-teal"]);
  assert.ok(!(await sectionIds("furniture")).includes("rug-teal"));
});

test("item.update: isDefault keeps one default per type", async () => {
  const rugs = (await listItems()).filter(i => i.type === "rug");
  const other = rugs.find(i => !i.default);
  await ok("item.update", { id: other.id, isDefault: true });
  assert.deepEqual((await listItems()).filter(i => i.type === "rug" && i.default).map(i => i.id), [other.id]);
});

test("item.update validation and errors", async () => {
  assert.equal((await call("item.update", { id: "no-such", price: 1 })).status, 404);
  assert.equal((await call("item.update", { price: 1 })).status, 422, "id required");
  assert.equal((await call("item.update", { id: "rug-teal", price: -5 })).status, 422);
  assert.equal((await call("item.update", { id: "rug-teal", sectionId: "nope" })).status, 422);
  assert.equal((await call("item.update", { id: "rug-teal", type: "desk" })).status, 422, "type can't change");
  assert.equal((await call("item.update", { id: "rug-teal", status: "deleted" })).status, 422, "status only via hide/delete");
  assert.equal((await getItem("rug-teal")).status, "active");
});

test("hide / unhide / delete / restore; the owner keeps the item, others can't buy it", async () => {
  await buy("ann", "rug-teal");
  for (const [op, status] of [["item.hide", "hidden"], ["item.unhide", "active"], ["item.delete", "deleted"]]) {
    assert.equal((await ok(op, { id: "rug-teal" })).result.status, status, op);
  }
  const { config } = await loadConfig();
  assert.equal(furnished(await gameOf("ann"), config).rug.id, "rug-teal");
  await assert.rejects(buy("bob", "rug-teal"), e => e.status === 422);
  assert.equal((await ok("item.restore", { id: "rug-teal" })).result.status, "active");
  assert.equal((await call("item.hide", { id: "no-such" })).status, 404);
  assert.equal((await call("item.delete", {})).status, 422);
});

test("item.reorder: full new order of a section; partial or foreign lists are refused", async () => {
  const ids = await sectionIds("decor");
  const rev = [...ids].reverse();
  assert.deepEqual((await ok("item.reorder", { sectionId: "decor", ids: rev })).result.ids, rev);
  assert.deepEqual(await sectionIds("decor"), rev);
  assert.equal((await call("item.reorder", { sectionId: "decor", ids: rev.slice(1) })).status, 422);
  assert.equal((await call("item.reorder", { sectionId: "decor", ids: [...rev.slice(1), "rug-teal"] })).status, 422);
  assert.equal((await call("item.reorder", { sectionId: "decor", ids: [rev[0], ...rev] })).status, 422);
  assert.equal((await call("item.reorder", { sectionId: "nope", ids: [] })).status, 422);
  assert.equal((await call("item.reorder", { sectionId: "decor", ids: "x" })).status, 422);
});

test("sections: create, rename, reorder, delete when empty", async () => {
  const { result: s } = await ok("section.create", { label: "Plants" });
  assert.equal(s.id, "plants");
  assert.equal((await ok("section.rename", { id: "plants", label: "Green things" })).result.label, "Green things");
  const order = ["plants", "shows", "furniture", "walls", "decor"];
  const r = await ok("section.reorder", { ids: order });
  assert.deepEqual(r.config.sections.map(x => x.id), order);
  assert.equal((await call("section.reorder", { ids: order.slice(1) })).status, 422);
  assert.equal((await call("section.create", { label: "" })).status, 422);
  assert.equal((await call("section.rename", { id: "nope", label: "X" })).status, 404);
  await ok("section.delete", { id: "plants" });
  assert.ok(!(await listSections()).some(x => x.id === "plants"));
});

test("section.delete: refused with a clear 422 while it has items; deleted items move away", async () => {
  const r = await call("section.delete", { id: "decor" });
  assert.equal(r.status, 422);
  assert.match(r.body.error, /still has \d+ items?/);
  await ok("section.create", { label: "Temp" });
  await ok("item.update", { id: "rug-teal", sectionId: "temp" });
  await ok("item.delete", { id: "rug-teal" });
  await ok("section.delete", { id: "temp" });
  const moved = await getItem("rug-teal");
  assert.equal(moved.sectionId, "shows", "to the first other section");
  assert.equal(moved.status, "deleted");
  assert.equal((await call("section.delete", { id: "temp" })).status, 422, "already gone");
});
