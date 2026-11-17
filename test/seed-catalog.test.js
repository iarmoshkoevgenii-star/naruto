import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { query, useMemoryDb, closeDb } from "../lib/db.js";
import { migrate } from "../lib/migrate.js";
import { updateDoc } from "../lib/store.js";
import { getAsset } from "../lib/assets.js";
import { listItems, getItem, listSections, updateItem } from "../lib/catalog.js";
import { seedCatalog, seedData } from "../lib/seed-catalog.js";
import ATLAS from "../public/game/placeholders.js";

let dir;
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "seed-test-"));
  process.env.LOCAL_STORE_DIR = dir;
  await useMemoryDb();
  await migrate();
});
after(async () => { await closeDb(); if (dir) rmSync(dir, { recursive: true, force: true }); });

const dump = async () => ({
  assets: await query("SELECT * FROM assets ORDER BY id"),
  sections: await query("SELECT * FROM shop_sections ORDER BY id"),
  items: await query("SELECT * FROM items ORDER BY id"),
});

/* An old base64 upload doc, the way storeAsset wrote them before step 2. */
async function legacyUpload(bytes, mime) {
  const dataUrl = `data:${mime};base64,` + bytes.toString("base64");
  const id = createHash("sha256").update(dataUrl).digest("hex").slice(0, 32);
  await updateDoc(`school/game/assets/${id}.json`, { dataUrl: null }, () => ({ dataUrl, name: "old" }));
  return id;
}
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("old-upload")]);
const GIF = Buffer.from("GIF89a-old");

test("a fresh database gets every built-in item with its id, section and sheet sprite", async () => {
  const r = await seedCatalog({ overrides: {} });
  assert.deepEqual(r.warnings, []);
  const data = seedData();
  assert.deepEqual((await listSections()).map(s => [s.id, s.label]), data.sections.map(s => [s.id, s.label]));
  const items = await listItems();
  assert.deepEqual(new Set(items.map(i => i.id)), new Set(data.items.map(i => i.id)));
  assert.equal(items.length, 40);
  const desk = await getItem("desk-wood");
  assert.deepEqual([desk.sectionId, desk.default, desk.price, desk.sprite], ["furniture", true, 1, { asset: r.sheet, rect: ATLAS["desk-wood"] }]);
  const sheet = await query("SELECT kind, w, h FROM assets WHERE id = $1", [r.sheet]);
  assert.equal(sheet[0].kind, "sheet");
  assert.ok(sheet[0].w > 0 && sheet[0].h > 0);
  const dh = await getItem("en/desperate-housewives");
  assert.deepEqual([dh.sectionId, dh.cover, dh.sub, dh.sprite], ["shows", "#1E5C62", "Season 1, episode 1", undefined]);
  assert.deepEqual((await getItem("wall-cream")).surface, { color: "#EFE6D2", pattern: "plain", accent: "#E2D6BC" });
  // today's order within a section
  const furniture = items.filter(i => i.sectionId === "furniture").map(i => i.id);
  assert.deepEqual(furniture, data.items.filter(i => data.sections[1].types.includes(i.type)).map(i => i.id));
});

test("bookshelves get a shelf layout with the DVD art", async () => {
  await seedCatalog({ overrides: {} });
  for (const id of ["bookshelf-wood", "bookshelf-white"]) {
    const l = (await getItem(id)).shelfLayout;
    assert.equal(l.capacity, 15);
    assert.equal(l.rows.length, 3);
    assert.deepEqual([l.dvd.w, l.dvd.h], [3, 8]);
    assert.ok(await getAsset(l.dvd.asset));
    assert.deepEqual(l.empty.rect, [0, 0, 28, 40]);
    assert.equal((await query("SELECT kind FROM assets WHERE id = $1", [l.empty.asset]))[0].kind, "shelf-empty");
  }
  assert.equal((await query("SELECT count(*)::int AS n FROM assets WHERE kind = 'dvd-blank'"))[0].n, 1);
});

test("running the seed twice changes nothing, and it never overwrites the teacher's edits", async () => {
  await seedCatalog({ overrides: {} });
  await updateItem("rug-teal", { price: 77 });
  const before = await dump();
  const r = await seedCatalog({ overrides: { items: { "rug-teal": { price: 5 } } } });
  assert.deepEqual([r.sectionsAdded, r.itemsAdded, r.assetsMigrated, r.shelvesSet, r.updated], [[], [], [], [], []]);
  assert.deepEqual(await dump(), before);
});

test("config.json overrides are applied: fields, defaults, hidden, removed, custom items, old uploads", async () => {
  const oldPng = await legacyUpload(PNG, "image/png");
  const wrong = await legacyUpload(GIF, "image/png"); // declared png, really a gif
  await updateDoc("school/game/config.json", {}, () => ({
    v: 1,
    rules: { maxLevel: 10 },
    items: {
      "rug-teal": { price: 12, minLevel: 3, name: "Sea rug" },
      "desk-white": { default: true },
      "lamp-teal": { active: false },
      "art-sunset": { sprite: { asset: oldPng, rect: [0, 0, 2, 2] } },
      [`u-${oldPng.slice(0, 8)}-0-0-2-2`]: { name: "My rug", type: "rug", price: 4, minLevel: 2, sprite: { asset: oldPng, rect: [0, 0, 2, 2] }, active: true },
      "u-gifgif-0-0-1-1": { name: "My plant", type: "plant", price: 1, minLevel: 1, sprite: { asset: wrong, rect: [0, 0, 1, 1] }, active: false },
    },
    removed: ["clock"],
    assets: [{ id: oldPng, name: "Rug picture", w: 2, h: 2 }, { id: wrong, name: "Plant", w: 1, h: 1 }],
  }));
  const r = await seedCatalog(); // reads config.json from the store
  assert.equal(r.itemsAdded.length, 42);

  const teal = await getItem("rug-teal");
  assert.deepEqual([teal.price, teal.minLevel, teal.name], [12, 3, "Sea rug"]);
  assert.deepEqual([(await getItem("desk-white")).default, (await getItem("desk-wood")).default], [true, false]);
  assert.equal((await getItem("lamp-teal")).status, "hidden");
  const clock = await getItem("clock");
  assert.deepEqual([clock.status, clock.default], ["deleted", false]);
  assert.ok(!(await listItems()).some(i => i.id === "clock" || i.id === "lamp-teal"));

  // old upload keeps its id and becomes a real asset
  assert.deepEqual(r.assetsMigrated.includes(oldPng), true);
  assert.deepEqual((await getItem("art-sunset")).sprite, { asset: oldPng, rect: [0, 0, 2, 2] });
  const [row] = await query("SELECT name, w, h, kind FROM assets WHERE id = $1", [oldPng]);
  assert.deepEqual(row, { name: "Rug picture", w: 2, h: 2, kind: "sprite" });
  const mine = await getItem(`u-${oldPng.slice(0, 8)}-0-0-2-2`);
  assert.deepEqual([mine.name, mine.sectionId, mine.price, mine.minLevel, mine.sprite.asset], ["My rug", "walls", 4, 2, oldPng]);

  // wrongly labelled upload: new id, item sprite rewritten, warning logged
  const newId = r.remapped[wrong];
  assert.ok(newId && newId !== wrong);
  const plant = await getItem("u-gifgif-0-0-1-1");
  assert.deepEqual([plant.sprite.asset, plant.status, plant.sectionId], [newId, "hidden", "decor"]);
  assert.equal((await getAsset(newId)).mime, "image/gif");
  assert.equal(r.warnings.length, 1);

  // custom items come after the built-ins of their section
  const walls = (await listItems({ includeHidden: true })).filter(i => i.sectionId === "walls").map(i => i.id);
  assert.equal(walls.at(-1), mine.id);

  // and again: nothing changes
  const before = await dump();
  const again = await seedCatalog();
  assert.deepEqual([again.itemsAdded, again.assetsMigrated, again.warnings], [[], [], []]);
  assert.deepEqual(await dump(), before);
});

test("a missing old upload is reported, and its item is skipped (not half-created)", async () => {
  const ghost = "a".repeat(32);
  const r = await seedCatalog({ overrides: { items: { "u-ghost": { name: "Ghost", type: "rug", price: 1, minLevel: 1, sprite: { asset: ghost, rect: [0, 0, 1, 1] } } } } });
  assert.equal(r.warnings.length, 2);
  assert.match(r.warnings[0], /missing/);
  assert.match(r.warnings[1], /Item u-ghost: .*not added/);
  assert.equal(await getItem("u-ghost"), null);
});

test("bookshelves show the empty DVD shelf; the first section is Shows & movies", async () => {
  const r = await seedCatalog({ overrides: {} });
  for (const id of ["bookshelf-wood", "bookshelf-white"]) {
    const b = await getItem(id);
    assert.deepEqual(b.sprite, b.shelfLayout.empty, id);
  }
  assert.equal((await listSections())[0].label, "Shows & movies");
  assert.deepEqual(r.updated, []);
});

test("a database seeded before step 7 is brought up to date, but the teacher's changes are kept", async () => {
  const first = await seedCatalog({ overrides: {} });
  // the way step 3 left it: bookshelves on the sheet, the old section label
  await updateItem("bookshelf-wood", { sprite: { asset: first.sheet, rect: ATLAS["bookshelf-wood"] } });
  await updateItem("bookshelf-white", { sprite: { asset: first.sheet, rect: [0, 0, 5, 5] } }); // a teacher's own choice
  await query("UPDATE shop_sections SET label = 'Shows & books' WHERE id = 'shows'");
  const r = await seedCatalog({ overrides: {} });
  assert.deepEqual(r.updated, ["bookshelf-wood: empty DVD shelf", "shows: renamed to Shows & movies"]);
  const wood = await getItem("bookshelf-wood");
  assert.deepEqual(wood.sprite, wood.shelfLayout.empty);
  assert.deepEqual((await getItem("bookshelf-white")).sprite, { asset: first.sheet, rect: [0, 0, 5, 5] });
  assert.equal((await listSections())[0].label, "Shows & movies");
  await query("UPDATE shop_sections SET label = 'Series' WHERE id = 'shows'");
  assert.deepEqual((await seedCatalog({ overrides: {} })).updated, []);
  assert.equal((await listSections())[0].label, "Series");
});
