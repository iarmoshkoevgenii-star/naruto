/* One-time catalog seed (docs/room-shop/PLAN.md, step 3), safe to run any number of times.
   It only ADDS what is missing (sections, items, assets) and fills empty shelf layouts; it never changes
   a row that exists, so running it after the teacher has edited the shop changes nothing.
     1. public/game/placeholders.png -> asset kind 'sheet'; built-in sprites point at it with their rect.
     2. Sections from db/seed/catalog.json (today's shop tabs), in order.
     3. Built-in items (same ids) merged with the teacher's overrides from school/game/config.json, then the
        teacher's own items ("u-..."). removed -> 'deleted', active:false -> 'hidden'.
     4. Old base64 uploads (school/game/assets/<id>.json) -> real files + `assets` rows. Same id as before
        unless the stored data URL declared the wrong type; then item sprites are pointed at the new id.
     5. DVD art from step 0 (public/game/dvd) -> assets; bookshelf items get shelf_layout.
     6. Step 7 brings databases seeded earlier up to date, touching only rows that still hold the seeded
        value: a bookshelf still showing its old sheet picture gets the empty DVD shelf
        (sprite = shelf_layout.empty), and the "Shows & books" section is renamed "Shows & movies".
   Returns a report; problems with single items are collected in report.warnings, not thrown. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "./db.js";
import { readDoc } from "./store.js";
import { putAsset, decodeDataUrl, sniffMime, assetIdOf } from "./assets.js";
import { createItem, createSection, updateItem } from "./catalog.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_KEY = "school/game/config.json";
const legacyKey = id => `school/game/assets/${id}.json`;
const FIELDS = ["name", "sub", "type", "price", "minLevel", "default", "sprite", "surface", "cover"];

export function seedData() {
  return JSON.parse(readFileSync(path.join(ROOT, "db/seed/catalog.json"), "utf8"));
}

/* Width and height from a PNG header (IHDR). */
export function pngSize(buf) {
  return buf.length >= 24 && buf.toString("latin1", 12, 16) === "IHDR" ? { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) } : { w: 0, h: 0 };
}

async function putFile(rel, kind, name) {
  const bytes = readFileSync(path.join(ROOT, rel));
  return putAsset({ bytes, kind, name, ...pngSize(bytes) });
}

const hasAsset = async id => (await query("SELECT 1 FROM assets WHERE id = $1", [id])).length > 0;

export async function seedCatalog({ overrides } = {}) {
  const report = { sheet: null, sectionsAdded: [], itemsAdded: [], assetsMigrated: [], remapped: {}, shelvesSet: [], updated: [], warnings: [] };
  const warn = m => report.warnings.push(m);
  const data = seedData();
  const o = overrides ?? (await readDoc(CONFIG_KEY, { fresh: true }).catch(() => null))?.data ?? {};

  // 1. the placeholder sheet
  const sheet = await putFile("public/game/placeholders.png", "sheet", "placeholders");
  report.sheet = sheet.id;

  // 2. sections
  const have = new Set((await query("SELECT id FROM shop_sections")).map(r => r.id));
  for (const s of data.sections) if (!have.has(s.id)) { await createSection({ id: s.id, label: s.label }); report.sectionsAdded.push(s.id); }
  const sectionOf = type => (data.sections.find(s => s.types.includes(type)) || data.sections[data.sections.length - 1]).id;

  // 4 (before 3, items need the assets). Old uploads: the editor's list plus anything an item points at.
  const legacy = new Map();
  for (const a of o.assets || []) if (a && a.id) legacy.set(a.id, a);
  for (const it of Object.values(o.items || {})) if (it && it.sprite && it.sprite.asset && !legacy.has(it.sprite.asset)) legacy.set(it.sprite.asset, { id: it.sprite.asset });
  const remap = {};
  for (const [oldId, meta] of legacy) {
    if (await hasAsset(oldId)) continue;
    const doc = await readDoc(legacyKey(oldId)).catch(() => null);
    if (!doc || !doc.data || !doc.data.dataUrl) { warn(`Upload ${oldId}: the old picture file is missing.`); continue; }
    try {
      const { bytes } = decodeDataUrl(doc.data.dataUrl);
      const real = sniffMime(bytes), sniffedId = real && assetIdOf(bytes, real);
      if (sniffedId && sniffedId !== oldId && await hasAsset(sniffedId)) { remap[oldId] = sniffedId; continue; } // remapped by an earlier run
      // no declared mime: putAsset sniffs it, so a wrongly labelled old upload still migrates (with a new id)
      const a = await putAsset({ bytes, kind: "sprite", name: meta.name || doc.data.name || "", w: meta.w, h: meta.h });
      report.assetsMigrated.push(a.id);
      if (a.id !== oldId) { remap[oldId] = a.id; report.remapped[oldId] = a.id; warn(`Upload ${oldId} had the wrong declared type; it is now ${a.id}.`); }
    } catch (e) { warn(`Upload ${oldId}: ${e.message}`); }
  }

  // 3. items
  const sprite = s => {
    if (!s) return undefined;
    if (s.sheet === "placeholders") return { asset: sheet.id, rect: s.rect };
    return { asset: remap[s.asset] || s.asset, rect: s.rect };
  };
  const removed = new Set(o.removed || []);
  const ov = o.items || {};
  const builtinIds = new Set(data.items.map(i => i.id));
  const wanted = [
    ...data.items.map(b => ({ ...b, ...pick(ov[b.id]) })),
    ...Object.entries(ov).filter(([id]) => !builtinIds.has(id)).map(([id, it]) => ({ ...pick(it), id, _active: it.active })),
  ];
  for (const b of data.items) if (ov[b.id]) wanted.find(w => w.id === b.id)._active = ov[b.id].active;
  const exists = new Set((await query("SELECT id FROM items")).map(r => r.id));
  for (const w of wanted) {
    if (exists.has(w.id)) continue;
    const status = removed.has(w.id) ? "deleted" : w._active === false ? "hidden" : "active";
    const fields = { ...w, sprite: sprite(w.sprite), default: status !== "deleted" && !!w.default, sectionId: sectionOf(w.type), status };
    delete fields._active;
    if (fields.sprite && !(await hasAsset(fields.sprite.asset))) { warn(`Item ${w.id}: its picture ${fields.sprite.asset} is missing, so the item was not added.`); continue; }
    try { await createItem(fields); report.itemsAdded.push(w.id); }
    catch (e) { warn(`Item ${w.id}: ${e.message}`); }
  }

  // 5. DVD shelf art and layouts
  const layout = JSON.parse(readFileSync(path.join(ROOT, "public/game/dvd/shelf-layout.json"), "utf8"));
  const blank = await putFile("public/game/dvd/dvd-blank.png", "dvd-blank", "dvd-blank");
  for (const [itemId, rows] of Object.entries(layout.shelves)) {
    const empty = await putFile(`public/game/dvd/${itemId}-empty.png`, "shelf-empty", `${itemId}-empty`);
    const value = { capacity: layout.capacity, dvd: { ...layout.dvd, asset: blank.id }, rows, empty: { asset: empty.id, rect: [0, 0, empty.w, empty.h] } };
    const [cur] = await query("SELECT shelf_layout FROM items WHERE id = $1", [itemId]);
    if (!cur) { warn(`Bookshelf ${itemId} is not in the catalog; no shelf layout set.`); continue; }
    if (cur.shelf_layout) continue;
    await updateItem(itemId, { shelfLayout: value });
    report.shelvesSet.push(itemId);
  }

  // 6. step 7: the empty DVD shelf, and the section's new name (only where nobody changed them)
  for (const b of data.items.filter(i => i.type === "bookshelf" && i.sprite && i.sprite.sheet === "placeholders")) {
    const [row] = await query("SELECT sprite_asset_id, sprite_rect, shelf_layout FROM items WHERE id = $1", [b.id]);
    const empty = row && row.shelf_layout && row.shelf_layout.empty;
    if (!empty || row.sprite_asset_id !== sheet.id || String((row.sprite_rect || []).map(Number)) !== String(b.sprite.rect)) continue;
    await updateItem(b.id, { sprite: empty });
    if (!report.itemsAdded.includes(b.id)) report.updated.push(`${b.id}: empty DVD shelf`); // new rows aren't news
  }
  const renamed = data.sections.find(s => s.id === "shows");
  if (renamed && (await query("UPDATE shop_sections SET label = $2 WHERE id = $1 AND label = 'Shows & books' RETURNING id", ["shows", renamed.label])).length)
    report.updated.push(`shows: renamed to ${renamed.label}`);
  return report;
}

function pick(it) {
  const out = {};
  for (const k of FIELDS) if (it && it[k] !== undefined) out[k] = it[k];
  return out;
}
