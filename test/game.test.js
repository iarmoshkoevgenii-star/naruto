/* Step 4: the game reads items from the catalog (lib/catalog.js), rules from config.json. */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { useMemoryDb, closeDb } from "../lib/db.js";
import { migrate } from "../lib/migrate.js";
import { readDoc, updateDoc } from "../lib/store.js";
import { setStatus, listUploads } from "../lib/catalog.js";
import { seedCatalog } from "../lib/seed-catalog.js";
import { loadConfig, saveOverrides, buy, equip, contentAccess, gameOf, clientConfig, storeAsset } from "../lib/game.js";
import { furnished, owned } from "../public/js/game-model.js";

let dir;
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "game-test-"));
  process.env.LOCAL_STORE_DIR = dir;
  await useMemoryDb();
  await migrate();
  await seedCatalog({ overrides: {} });
});
after(async () => { await closeDb(); if (dir) rmSync(dir, { recursive: true, force: true }); });

const err = status => e => e.status === status;
const DH = "en/desperate-housewives";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("game-test")]);

test("loadConfig: items and sections come from the catalog, rules from config.json", async () => {
  await updateDoc("school/game/config.json", {}, () => ({ v: 1, rules: { startCoins: 7 }, items: { "rug-teal": { price: 99 } } }));
  const { config } = await loadConfig();
  assert.equal(config.rules.startCoins, 7);
  assert.equal(config.rules.xpPerLevel, 1000);
  assert.deepEqual(config.sections.map(s => s.id), ["shows", "furniture", "walls", "decor"]);
  assert.equal(config.items.find(i => i.id === "rug-teal").price, 1, "config.json items are no longer read");
  assert.equal(config.items.find(i => i.id === "desk-wood").sprite.asset.length, 32);
  await setStatus("rug-teal", "deleted");
  assert.ok((await loadConfig()).config.items.some(i => i.id === "rug-teal"), "the server config keeps deleted items");
});

test("an owner keeps a hidden or deleted item in the room", async () => {
  await buy("ann", "rug-teal");
  for (const status of ["hidden", "deleted"]) {
    await setStatus("rug-teal", status);
    const { config } = await loadConfig();
    const game = await gameOf("ann");
    assert.ok(owned(game, config).has("rug-teal"), status);
    assert.equal(furnished(game, config).rug.id, "rug-teal", status);
  }
  await equip("ann", "rug", null);
  await equip("ann", "rug", "rug-teal"); // re-placing a deleted item they own still works
});

test("hidden and deleted items can't be bought and leave a student's shop", async () => {
  await setStatus("rug-teal", "hidden");
  await setStatus("rug-orange", "deleted");
  await assert.rejects(buy("bob", "rug-teal"), err(422));
  await assert.rejects(buy("bob", "rug-orange"), err(422));
  const { config } = await loadConfig();
  const ids = clientConfig(config, { role: "student", game: await gameOf("bob") }).items.map(i => i.id);
  assert.ok(!ids.includes("rug-teal") && !ids.includes("rug-orange"));
  assert.ok(ids.includes("rug-beige") && ids.includes("desk-wood"));
});

test("the student's config: active items plus the ones they own, in shop order, with sections", async () => {
  await buy("ann", "rug-teal");
  await setStatus("rug-teal", "deleted");
  const { config } = await loadConfig();
  const c = clientConfig(config, { role: "student", game: await gameOf("ann") });
  assert.ok(c.items.some(i => i.id === "rug-teal"));
  assert.deepEqual(c.sections.map(s => s.label), ["Shows & movies", "Furniture", "Walls & floors", "Decor"]);
  assert.equal(c.items[0].id, DH);
  assert.equal(c.assets, undefined, "students don't get the upload list");
  assert.ok(Array.isArray(c.slots) && c.room.w === 192);
});

test("the teacher's config has every item and the uploaded pictures", async () => {
  await setStatus("rug-teal", "deleted");
  const up = await storeAsset("Carpet", "data:image/png;base64," + PNG.toString("base64"), 4, 2);
  const { config } = await loadConfig();
  const c = clientConfig(config, { role: "teacher", assets: await listUploads() });
  assert.ok(c.items.some(i => i.id === "rug-teal"));
  assert.deepEqual(c.assets.map(a => [a.id, a.name, a.w, a.h]), [[up.id, "Carpet", 4, 2]]);
  assert.equal((await readDoc("school/game/config.json").catch(() => null))?.data?.assets, undefined, "uploads are not listed in config.json any more");
});

test("listUploads lists sprite uploads only, newest first", async () => {
  const a = await storeAsset("A", "data:image/png;base64," + PNG.toString("base64"), 1, 1);
  const list = await listUploads();
  assert.deepEqual(list.map(x => x.id), [a.id], "the seeded sheet and DVD art are not uploads");
  assert.deepEqual(Object.keys(list[0]).sort(), ["at", "h", "id", "name", "w"]);
});

test("owning the show unlocks the episode, also after it is hidden; others stay locked", async () => {
  assert.equal((await contentAccess("ann", DH)).ok, false);
  await buy("ann", DH);
  assert.equal((await contentAccess("ann", DH)).ok, true);
  await setStatus(DH, "hidden");
  assert.equal((await contentAccess("ann", DH)).ok, true);
  assert.equal((await contentAccess("bob", DH)).ok, false, "a hidden show is not free");
  assert.equal((await contentAccess("bob", "en/not-in-the-shop")).ok, true);
});

test("saveOverrides saves rules only and leaves the rest of config.json for the seed", async () => {
  await updateDoc("school/game/config.json", {}, () => ({ v: 1, rules: {}, items: { "rug-teal": { price: 5 } }, removed: ["clock"] }));
  const config = await saveOverrides({ rules: { startCoins: 3 }, items: { "rug-teal": { price: 9 } } });
  assert.equal(config.rules.startCoins, 3);
  const doc = (await readDoc("school/game/config.json")).data;
  assert.deepEqual([doc.rules, doc.items, doc.removed], [{ startCoins: 3 }, { "rug-teal": { price: 5 } }, ["clock"]]);
  await assert.rejects(saveOverrides({ rules: { maxLevel: 0 } }), err(422));
});

test("the summary lists the student's DVDs in purchase order (shows and movies, not books)", async () => {
  const { createItem } = await import("../lib/catalog.js");
  const m = await createItem({ name: "Heat", type: "movie", sectionId: "shows", price: 1, minLevel: 1, cover: "#AA3300" });
  const b = await createItem({ name: "A book", type: "book", sectionId: "shows", price: 1, minLevel: 1 });
  await buy("ann", m.id);
  await buy("ann", b.id);
  const s = await buy("ann", DH);
  assert.deepEqual(s.dvds, [m.id, DH]);
  await setStatus(m.id, "deleted");
  const { config } = await loadConfig();
  const { summary } = await import("../lib/game.js");
  assert.deepEqual(summary(await gameOf("ann"), config).dvds, [m.id, DH], "a deleted movie they bought stays on the shelf");
});
