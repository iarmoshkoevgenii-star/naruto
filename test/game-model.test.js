/* Pure helpers in public/js/game-model.js (shared by the browser and the server). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { moveId } from "../public/js/game-model.js";

test("moveId moves one id to a new index and leaves the input alone", () => {
  const ids = ["a", "b", "c", "d"];
  assert.deepEqual(moveId(ids, "c", 0), ["c", "a", "b", "d"]);
  assert.deepEqual(moveId(ids, "a", 3), ["b", "c", "d", "a"]);
  assert.deepEqual(moveId(ids, "b", 2), ["a", "c", "b", "d"]);
  assert.deepEqual(ids, ["a", "b", "c", "d"]);
});

test("moveId clamps the index and ignores unknown ids", () => {
  assert.deepEqual(moveId(["a", "b"], "a", -1), ["a", "b"]);
  assert.deepEqual(moveId(["a", "b"], "a", 9), ["b", "a"]);
  assert.deepEqual(moveId(["a", "b"], "x", 0), ["a", "b"]);
});

/* ---------- step 7: DVD shelf ---------- */
import { dvdLayout, shelfTitles, ITEM_TYPES } from "../public/js/game-model.js";

const SHELF = {
  capacity: 15, dvd: { w: 3, h: 8, gap: 1, asset: "b".repeat(32) },
  rows: [{ x: 3, y: 4, w: 22, h: 8 }, { x: 3, y: 15, w: 22, h: 8 }, { x: 3, y: 26, w: 22, h: 8 }],
  empty: { asset: "e".repeat(32), rect: [0, 0, 28, 40] },
};
const title = (n, extra = {}) => ({ id: "t" + n, type: "show", cover: "#00000" + (n % 10), ...extra });
const titles = n => Array.from({ length: n }, (_, i) => title(i));

test("movie is an item type", () => assert.ok(ITEM_TYPES.includes("movie")));

test("dvdLayout: no titles, an empty shelf", () => {
  assert.deepEqual(dvdLayout([], SHELF), { placed: [], hidden: 0 });
});

test("dvdLayout: 4 titles fill the first row from the left, standing on the shelf", () => {
  const { placed, hidden } = dvdLayout(titles(4), SHELF);
  assert.equal(hidden, 0);
  assert.deepEqual(placed.map(p => [p.id, p.x, p.y]), [["t0", 3, 4], ["t1", 7, 4], ["t2", 11, 4], ["t3", 15, 4]]);
  assert.deepEqual([placed[1].tint, placed[1].spine], ["#000001", null]);
});

test("dvdLayout: 15 titles fill all three rows; 20 leave 5 hidden", () => {
  const full = dvdLayout(titles(15), SHELF);
  assert.equal(full.placed.length, 15);
  assert.equal(full.hidden, 0);
  assert.deepEqual([full.placed[5].x, full.placed[5].y], [3, 15]);
  assert.deepEqual([full.placed[14].x, full.placed[14].y], [19, 26]);
  const over = dvdLayout(titles(20), SHELF);
  assert.deepEqual([over.placed.length, over.hidden, over.placed[14].id], [15, 5, "t14"]);
});

test("dvdLayout: an uploaded spine is passed on; no cover means the default colour", () => {
  const [p] = dvdLayout([{ id: "m", type: "movie", spine: { asset: "s".repeat(32) } }], SHELF).placed;
  assert.deepEqual([p.spine, p.tint], ["s".repeat(32), "#1E5C62"]);
});

test("dvdLayout: no shelf layout (a teacher's own bookshelf) places nothing", () => {
  assert.deepEqual(dvdLayout(titles(3), null), { placed: [], hidden: 3 });
});

test("shelfTitles: owned shows and movies in purchase order; books ignored; hidden and deleted still count", () => {
  const config = { items: [
    title(1), title(2, { type: "movie", status: "hidden" }), title(3, { type: "book" }), title(4, { status: "deleted" }), title(5),
    { id: "free", type: "show", price: 0 },
  ] };
  const game = { purchases: [
    { item: "t4", at: "2026-01-01T00:00:00Z" }, { item: "t3", at: "2026-01-02T00:00:00Z" },
    { item: "t2", at: "2026-01-03T00:00:00Z" }, { item: "t1", at: "2026-01-04T00:00:00Z" },
  ] };
  assert.deepEqual(shelfTitles(game, config).map(t => t.id), ["free", "t4", "t2", "t1"]);
  assert.deepEqual(shelfTitles(null, config).map(t => t.id), ["free"]);
});

test("contentHref: built-in titles open their page; the teacher's own titles have none", async () => {
  const { contentHref } = await import("../public/js/game-model.js");
  assert.equal(contentHref({ id: "en/desperate-housewives", type: "show" }), "/en/desperate-housewives");
  assert.equal(contentHref({ id: "u-1234abcd", type: "movie" }), null);
  assert.equal(contentHref({ id: "rug-teal", type: "rug" }), null);
});
