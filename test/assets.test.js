import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { query, useMemoryDb, closeDb } from "../lib/db.js";
import { migrate } from "../lib/migrate.js";
import { updateDoc } from "../lib/store.js";
import { putAsset, getAsset, assetIdOf, sniffMime, MAX_ASSET_BYTES } from "../lib/assets.js";

let dir;
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "assets-test-"));
  process.env.LOCAL_STORE_DIR = dir;
  await useMemoryDb();
  await migrate();
});
after(async () => { await closeDb(); if (dir) rmSync(dir, { recursive: true, force: true }); });

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("rest-of-a-png")]);
const GIF = Buffer.from("GIF89a....");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([4, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);

test("sniffMime recognises the four allowed formats and nothing else", () => {
  assert.equal(sniffMime(PNG), "image/png");
  assert.equal(sniffMime(GIF), "image/gif");
  assert.equal(sniffMime(JPEG), "image/jpeg");
  assert.equal(sniffMime(WEBP), "image/webp");
  assert.equal(sniffMime(Buffer.from("<svg xmlns=...>")), null);
  assert.equal(sniffMime(Buffer.alloc(0)), null);
});

test("ids use the same scheme as the old uploads (sha256 of the data URL, 32 hex)", () => {
  const dataUrl = "data:image/png;base64," + PNG.toString("base64");
  assert.equal(assetIdOf(PNG, "image/png"), createHash("sha256").update(dataUrl).digest("hex").slice(0, 32));
});

test("putAsset stores the file and a row; getAsset returns the same bytes", async () => {
  const a = await putAsset({ bytes: PNG, mime: "image/png", name: "Rug", kind: "sprite", w: 16, h: 8 });
  assert.match(a.id, /^[a-f0-9]{32}$/);
  assert.deepEqual({ name: a.name, w: a.w, h: a.h, kind: a.kind, mime: a.mime }, { name: "Rug", w: 16, h: 8, kind: "sprite", mime: "image/png" });
  assert.ok(existsSync(path.join(dir, `school/game/files/${a.id}.png`)));
  assert.deepEqual(readFileSync(path.join(dir, `school/game/files/${a.id}.png`)), PNG);
  const [row] = await query("SELECT * FROM assets WHERE id = $1", [a.id]);
  assert.equal(row.blob_key, `school/game/files/${a.id}.png`);
  const got = await getAsset(a.id);
  assert.equal(got.mime, "image/png");
  assert.deepEqual(Buffer.from(got.bytes), PNG);
});

test("mime defaults to the sniffed type", async () => {
  const a = await putAsset({ bytes: GIF, name: "g" });
  assert.equal(a.mime, "image/gif");
  assert.equal(a.kind, "sprite");
});

test("uploading the same picture twice keeps one row and the first name", async () => {
  const a = await putAsset({ bytes: JPEG, mime: "image/jpeg", name: "First" });
  const b = await putAsset({ bytes: JPEG, mime: "image/jpeg", name: "Second" });
  assert.equal(a.id, b.id);
  assert.equal(b.name, "First");
  assert.equal((await query("SELECT count(*)::int AS n FROM assets")).at(0).n, 1);
});

test("rejects other formats, mismatched types, bad kinds and big files", async () => {
  await assert.rejects(putAsset({ bytes: Buffer.from("<svg/>"), mime: "image/png" }), e => e.status === 422);
  await assert.rejects(putAsset({ bytes: PNG, mime: "image/gif" }), e => e.status === 422);
  await assert.rejects(putAsset({ bytes: PNG, mime: "image/svg+xml" }), e => e.status === 422);
  await assert.rejects(putAsset({ bytes: PNG, kind: "virus" }), e => e.status === 422);
  const big = Buffer.concat([PNG, Buffer.alloc(MAX_ASSET_BYTES)]);
  await assert.rejects(putAsset({ bytes: big, mime: "image/png" }), e => e.status === 422);
  assert.equal((await query("SELECT count(*)::int AS n FROM assets")).at(0).n, 0);
});

test("getAsset falls back to an old base64 upload doc", async () => {
  const dataUrl = "data:image/webp;base64," + WEBP.toString("base64");
  const id = createHash("sha256").update(dataUrl).digest("hex").slice(0, 32);
  await updateDoc(`school/game/assets/${id}.json`, { dataUrl: null }, () => ({ dataUrl, name: "old" }));
  const got = await getAsset(id);
  assert.equal(got.mime, "image/webp");
  assert.deepEqual(Buffer.from(got.bytes), WEBP);
});

test("getAsset returns null for unknown or malformed ids", async () => {
  assert.equal(await getAsset("0".repeat(32)), null);
  assert.equal(await getAsset("../etc/passwd"), null);
  assert.equal(await getAsset(null), null);
});

test("the upload API path (storeAsset) stores via putAsset and still lists the picture for the editor", async () => {
  const { storeAsset } = await import("../lib/game.js");
  const { readDoc } = await import("../lib/store.js");
  const entry = await storeAsset("Carpet", "data:image/png;base64," + PNG.toString("base64"), 12.4, 6);
  assert.deepEqual({ name: entry.name, w: entry.w, h: entry.h }, { name: "Carpet", w: 12, h: 6 });
  assert.equal(entry.id, assetIdOf(PNG, "image/png"));
  assert.deepEqual(Buffer.from((await getAsset(entry.id)).bytes), PNG);
  const cfg = await readDoc("school/game/config.json");
  assert.deepEqual(cfg.data.assets.map(a => a.id), [entry.id]);
  await assert.rejects(storeAsset("x", "data:image/png;base64," + Buffer.from("not a png").toString("base64")), e => e.status === 422);
});
