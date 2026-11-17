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
