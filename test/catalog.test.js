import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { query, useMemoryDb, closeDb } from "../lib/db.js";
import { migrate } from "../lib/migrate.js";
import { putAsset } from "../lib/assets.js";
import {
  listItems, getItem, listSections, createItem, updateItem, moveItem, setStatus, reorder,
  createSection, renameSection, reorderSections, deleteSection,
} from "../lib/catalog.js";

let dir, pic;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("catalog-test")]);
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "catalog-test-"));
  process.env.LOCAL_STORE_DIR = dir;
  await useMemoryDb();
  await migrate();
  pic = (await putAsset({ bytes: PNG, name: "pic" })).id;
  await createSection({ id: "furniture", label: "Furniture" });
  await createSection({ id: "decor", label: "Decor" });
});
after(async () => { await closeDb(); if (dir) rmSync(dir, { recursive: true, force: true }); });

const rug = (extra = {}) => ({ name: "Rug", type: "rug", sectionId: "decor", price: 3, minLevel: 1, sprite: { asset: pic, rect: [0, 0, 4, 4] }, ...extra });
const ids = async opts => (await listItems(opts)).map(i => i.id);
const err = status => e => e.status === status;

test("createItem returns the client shape and appends to the section", async () => {
  const a = await createItem(rug({ id: "rug-a" }));
  const b = await createItem(rug({ name: "Second" }));
  assert.deepEqual(a, {
    id: "rug-a", name: "Rug", type: "rug", price: 3, minLevel: 1, default: false, active: true, status: "active",
    sectionId: "decor", position: 0, sprite: { asset: pic, rect: [0, 0, 4, 4] },
  });
  assert.match(b.id, /^u-[a-f0-9]{12}$/);
  assert.equal(b.position, 1);
  assert.deepEqual(await getItem("rug-a"), a);
});

test("surface items and shows need no picture; others do", async () => {
  const wall = await createItem({ name: "Wall", type: "wallpaper", sectionId: "decor", price: 1, minLevel: 1, surface: { color: "#EFE6D2", pattern: "plain", accent: "#E2D6BC" } });
  assert.deepEqual(wall.surface, { color: "#EFE6D2", pattern: "plain", accent: "#E2D6BC" });
  assert.equal(wall.sprite, undefined);
  const show = await createItem({ name: "DH", sub: "S1", type: "show", sectionId: "decor", price: 1, minLevel: 1, cover: "#1E5C62" });
  assert.deepEqual([show.sub, show.cover], ["S1", "#1E5C62"]);
  await assert.rejects(createItem({ name: "Lamp", type: "lamp", sectionId: "decor", price: 1, minLevel: 1 }), err(422));
});

test("validation errors are 422s with readable messages", async () => {
  await assert.rejects(createItem(rug({ price: -1 })), err(422));
  await assert.rejects(createItem(rug({ minLevel: 0 })), err(422));
  await assert.rejects(createItem(rug({ name: "  " })), err(422));
  await assert.rejects(createItem(rug({ type: "spaceship" })), err(422));
  await assert.rejects(createItem(rug({ sectionId: "nope" })), err(422));
  await assert.rejects(createItem(rug({ sprite: { asset: "f".repeat(32), rect: [0, 0, 1, 1] } })), e => e.status === 422 && /picture/.test(e.message));
  await assert.rejects(createItem(rug({ cover: "red" })), err(422));
  await assert.rejects(updateItem("missing", { price: 1 }), err(404));
  assert.deepEqual(await ids({ includeHidden: true, includeDeleted: true }), []);
});

test("statuses: listItems hides hidden and deleted unless asked; getItem always finds them", async () => {
  await createItem(rug({ id: "a" })); await createItem(rug({ id: "b" })); await createItem(rug({ id: "c" }));
  await setStatus("b", "hidden");
  await setStatus("c", "deleted");
  assert.deepEqual(await ids(), ["a"]);
  assert.deepEqual(await ids({ includeHidden: true }), ["a", "b"]);
  assert.deepEqual(await ids({ includeHidden: true, includeDeleted: true }), ["a", "b", "c"]);
  const c = await getItem("c");
  assert.deepEqual([c.status, c.active], ["deleted", false]);
  assert.equal((await setStatus("c", "active")).active, true);
  await assert.rejects(setStatus("a", "gone"), err(422));
});

test("one default per type", async () => {
  await createItem(rug({ id: "a", default: true }));
  await createItem(rug({ id: "b", default: true }));
  assert.deepEqual([(await getItem("a")).default, (await getItem("b")).default], [false, true]);
  await updateItem("a", { default: true });
  assert.deepEqual([(await getItem("a")).default, (await getItem("b")).default], [true, false]);
});

test("updateItem changes fields; a new section appends at its end", async () => {
  await createItem(rug({ id: "f1", sectionId: "furniture" }));
  await createItem(rug({ id: "a" }));
  const u = await updateItem("a", { price: 9, minLevel: 4, name: "Big rug", cover: "#112233" });
  assert.deepEqual([u.price, u.minLevel, u.name, u.cover], [9, 4, "Big rug", "#112233"]);
  const m = await moveItem("a", "furniture");
  assert.deepEqual([m.sectionId, m.position], ["furniture", 1]);
  assert.deepEqual(await ids(), ["f1", "a"]);
  const s = await updateItem("a", { surface: { color: "#000000", pattern: "dots", accent: "#ffffff" } });
  assert.equal(s.sprite, undefined);
});

test("reorder takes the full order of live items; deleted ones go after", async () => {
  for (const id of ["a", "b", "c", "d"]) await createItem(rug({ id }));
  await setStatus("b", "deleted");
  await reorder("decor", ["d", "a", "c"]);
  assert.deepEqual(await ids({ includeDeleted: true }), ["d", "a", "c", "b"]);
  await assert.rejects(reorder("decor", ["d", "a"]), err(422));
  await assert.rejects(reorder("decor", ["d", "a", "a"]), err(422));
  await assert.rejects(reorder("decor", ["d", "a", "c", "b"]), err(422));
});

test("sections: create, rename, reorder", async () => {
  const s = await createSection({ label: "Shows & movies" });
  assert.deepEqual(s, { id: "shows-movies", label: "Shows & movies", position: 2 });
  assert.equal((await createSection({ label: "Shows & movies" })).id, "shows-movies-2");
  await assert.rejects(createSection({ id: "decor", label: "Again" }), err(409));
  await assert.rejects(createSection({ label: "" }), err(422));
  await renameSection("decor", "Decorations");
  await reorderSections(["shows-movies-2", "decor", "furniture", "shows-movies"]);
  assert.deepEqual((await listSections()).map(x => [x.id, x.label]), [["shows-movies-2", "Shows & movies"], ["decor", "Decorations"], ["furniture", "Furniture"], ["shows-movies", "Shows & movies"]]);
  await assert.rejects(reorderSections(["decor"]), err(422));
  await assert.rejects(renameSection("nope", "x"), err(404));
});

test("listItems follows section order", async () => {
  await createItem(rug({ id: "d1" }));
  await createItem(rug({ id: "f1", sectionId: "furniture" }));
  assert.deepEqual(await ids(), ["f1", "d1"]);
  await reorderSections(["decor", "furniture"]);
  assert.deepEqual(await ids(), ["d1", "f1"]);
});

test("deleteSection: only when no live items; deleted items move to another section", async () => {
  await createItem(rug({ id: "a" }));
  await assert.rejects(deleteSection("decor"), e => e.status === 422 && /1 item/.test(e.message));
  await setStatus("a", "deleted");
  await deleteSection("decor");
  assert.deepEqual((await listSections()).map(s => s.id), ["furniture"]);
  assert.equal((await getItem("a")).sectionId, "furniture");
  await assert.rejects(deleteSection("decor"), err(422));
  await createItem(rug({ id: "b", sectionId: "furniture" }));
  await setStatus("b", "deleted");
  await assert.rejects(deleteSection("furniture"), err(422)); // last section holding deleted items
});

test("positions stay unique per section", async () => {
  for (const id of ["a", "b", "c"]) await createItem(rug({ id }));
  const rows = await query("SELECT position FROM items WHERE section_id = 'decor' ORDER BY position");
  assert.deepEqual(rows.map(r => r.position), [0, 1, 2]);
});
