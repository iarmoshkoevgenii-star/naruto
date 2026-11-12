/* The shop catalog in Postgres (docs/room-shop/PLAN.md, step 3): sections and items.
   Items come out in the shape the client already uses
     {id, name, sub, type, price, minLevel, default, active, sprite: {asset, rect} | surface, cover}
   plus {status, sectionId, position, spine: {asset} | undefined, shelfLayout, builtin}.
   `active` is derived (status === 'active') and `builtin` (id doesn't start with "u-") is kept for the
   old editor until step 6. Every write validates here, so the admin API (step 5) only wires actions.
   Errors are HttpError 404 / 422 with a message a teacher can read. */
import { randomBytes } from "node:crypto";
import { query, tx } from "./db.js";
import { HttpError } from "./http.js";
import { ITEM_TYPES, PATTERNS } from "../public/js/game-model.js";

export const STATUSES = ["active", "hidden", "deleted"];
/* Shows, books (and movies from step 7) live on the bookshelf, not in a room spot: no picture needed. */
export const CONTENT_TYPES = ["show", "book", "movie"];
const HEX = /^#[0-9a-fA-F]{6}$/;
const ASSET = /^[a-f0-9]{32}$/;
const no = msg => new HttpError(422, msg);
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/* ---------- reading ---------- */

const ITEM_SQL = `SELECT i.* FROM items i JOIN shop_sections s ON s.id = i.section_id`;
const ORDER = ` ORDER BY s.position, i.position, i.id`;

export function itemOut(r) {
  const it = {
    id: r.id, name: r.name, type: r.type, price: r.price, minLevel: r.min_level, default: r.is_default,
    active: r.status === "active", status: r.status, sectionId: r.section_id, position: r.position,
    builtin: !r.id.startsWith("u-"),
  };
  if (r.sub) it.sub = r.sub;
  if (r.surface) it.surface = r.surface;
  else if (r.sprite_asset_id) it.sprite = { asset: r.sprite_asset_id, rect: r.sprite_rect ? r.sprite_rect.map(Number) : null };
  if (r.cover_color) it.cover = r.cover_color;
  if (r.spine_asset_id) it.spine = { asset: r.spine_asset_id };
  if (r.shelf_layout) it.shelfLayout = r.shelf_layout;
  return it;
}

/* Shop order: by section, then position. Hidden and deleted items only when asked for. */
export async function listItems({ includeHidden = false, includeDeleted = false } = {}) {
  const statuses = ["active", ...(includeHidden ? ["hidden"] : []), ...(includeDeleted ? ["deleted"] : [])];
  return (await query(ITEM_SQL + " WHERE i.status = ANY($1)" + ORDER, [statuses])).map(itemOut);
}

/* Any status: a student keeps hidden and deleted items they own. */
export async function getItem(id) {
  const [r] = await query("SELECT * FROM items WHERE id = $1", [String(id)]);
  return r ? itemOut(r) : null;
}

export async function listSections() {
  return (await query("SELECT id, label, position FROM shop_sections ORDER BY position, id")).map(s => ({ id: s.id, label: s.label, position: s.position }));
}

/* ---------- item validation ---------- */

function checkSprite(s) {
  const r = s && s.rect;
  if (!s || !ASSET.test(s.asset || "") || !Array.isArray(r) || r.length !== 4 || r.some(v => !isInt(v, 0, 4096)) || r[2] < 1 || r[3] < 1)
    throw no("The picture is not valid.");
  return { asset: s.asset, rect: r };
}
function checkSurface(s) {
  if (!s || !HEX.test(s.color || "") || !HEX.test(s.accent || "") || !PATTERNS.includes(s.pattern)) throw no("The wall or floor style is not valid.");
  return { color: s.color, pattern: s.pattern, accent: s.accent };
}

/* Turns client fields into column values. Only the fields present are checked and returned. */
function columns(f) {
  const c = {};
  if ("name" in f) {
    const name = typeof f.name === "string" ? f.name.trim() : "";
    if (!name || name.length > 60) throw no("A name is required (up to 60 characters).");
    c.name = name;
  }
  if ("sub" in f) {
    if (f.sub != null && (typeof f.sub !== "string" || f.sub.length > 120)) throw no("The subtitle is too long (up to 120 characters).");
    c.sub = f.sub ? f.sub.trim() || null : null;
  }
  if ("type" in f) { if (!ITEM_TYPES.includes(f.type)) throw no("Unknown item type."); c.type = f.type; }
  if ("price" in f) { if (!isInt(f.price, 0, 1e6)) throw no("The price must be a whole number, 0 or more."); c.price = f.price; }
  if ("minLevel" in f) { if (!isInt(f.minLevel, 1, 500)) throw no("The level must be a whole number from 1 to 500."); c.min_level = f.minLevel; }
  if ("default" in f) { if (typeof f.default !== "boolean") throw no("Default must be yes or no."); c.is_default = f.default; }
  if ("sprite" in f && f.sprite != null) { const s = checkSprite(f.sprite); c.sprite_asset_id = s.asset; c.sprite_rect = s.rect; c.surface = null; }
  if ("surface" in f && f.surface != null) { c.surface = checkSurface(f.surface); c.sprite_asset_id = null; c.sprite_rect = null; }
  if ("cover" in f) { if (f.cover != null && !HEX.test(f.cover)) throw no("The cover colour is not valid."); c.cover_color = f.cover || null; }
  if ("spine" in f) {
    const a = f.spine && (typeof f.spine === "string" ? f.spine : f.spine.asset);
    if (f.spine != null && !ASSET.test(a || "")) throw no("The DVD spine picture is not valid.");
    c.spine_asset_id = f.spine ? a : null;
  }
  if ("shelfLayout" in f) {
    if (f.shelfLayout != null && (typeof f.shelfLayout !== "object" || Array.isArray(f.shelfLayout))) throw no("The shelf layout is not valid.");
    c.shelf_layout = f.shelfLayout || null;
  }
  return c;
}

/* Postgres errors -> readable 422s (an unknown picture or section id). */
function pgError(e) {
  if (e instanceof HttpError) return e;
  if (e && e.code === "23503") return no(/section/.test(e.constraint || e.message || "") ? "Unknown shop section." : "That picture is not uploaded.");
  if (e && e.code === "23505") return new HttpError(409, "Someone else changed the shop at the same time. Reload and try again.");
  return e;
}
const guarded = fn => fn().catch(e => { throw pgError(e); });

const nextPosition = async (t, sectionId) =>
  (await t.query("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM items WHERE section_id = $1", [sectionId]))[0].p;

/* One default per type: making an item the default clears the flag on the others of its type. */
async function soleDefault(t, id) {
  await t.query("UPDATE items SET is_default = false, updated_at = now() WHERE is_default AND id <> $1 AND type = (SELECT type FROM items WHERE id = $1)", [id]);
}

async function sectionExists(t, id) {
  if (typeof id !== "string" || !(await t.query("SELECT 1 FROM shop_sections WHERE id = $1", [id])).length) throw no("Unknown shop section.");
}

/* ---------- item writes ---------- */

/* fields: {name, type, sectionId, price, minLevel, sprite | surface, sub?, cover?, spine?, default?, status?, id?}.
   `id` is for the seed only (keeps old ids); new items get "u-<random>". Appended at the end of the section. */
export function createItem(fields) {
  return guarded(() => tx(async t => {
    const f = fields || {};
    for (const k of ["name", "type", "price", "minLevel"]) if (!(k in f)) throw no("Missing " + k + ".");
    if (!f.sprite && !f.surface && !CONTENT_TYPES.includes(f.type)) throw no("Choose a picture or a wall/floor style.");
    const c = columns(f);
    const id = f.id ?? "u-" + randomBytes(6).toString("hex");
    if (!/^[a-z0-9/_-]{1,80}$/.test(id)) throw no("Invalid item id.");
    const status = f.status ?? "active";
    if (!STATUSES.includes(status)) throw no("Unknown status.");
    await sectionExists(t, f.sectionId);
    if ((await t.query("SELECT 1 FROM items WHERE id = $1", [id])).length) throw new HttpError(409, "An item with this id already exists.");
    const position = await nextPosition(t, f.sectionId);
    await t.query(
      `INSERT INTO items (id, name, sub, type, section_id, position, price, min_level, is_default, status,
         sprite_asset_id, sprite_rect, surface, cover_color, spine_asset_id, shelf_layout)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [id, c.name, c.sub ?? null, c.type, f.sectionId, position, c.price, c.min_level, c.is_default ?? false, status,
        c.sprite_asset_id ?? null, c.sprite_rect ?? null, c.surface ?? null, c.cover_color ?? null, c.spine_asset_id ?? null, c.shelf_layout ?? null]);
    if (c.is_default) await soleDefault(t, id);
    return itemOut((await t.query("SELECT * FROM items WHERE id = $1", [id]))[0]);
  }));
}

/* Changes the given fields (name, sub, type, price, minLevel, default, sprite|surface, cover, spine,
   shelfLayout, sectionId). A new sectionId moves the item to the end of that section. */
export function updateItem(id, fields) {
  return guarded(() => tx(async t => {
    const [cur] = await t.query("SELECT * FROM items WHERE id = $1 FOR UPDATE", [String(id)]);
    if (!cur) throw new HttpError(404, "This item is not in the catalog.");
    const f = { ...(fields || {}) };
    const c = columns(f);
    if ("sectionId" in f && f.sectionId !== cur.section_id) {
      await sectionExists(t, f.sectionId);
      c.section_id = f.sectionId;
      c.position = await nextPosition(t, f.sectionId);
    }
    const keys = Object.keys(c);
    if (keys.length) {
      await t.query(`UPDATE items SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id = $1`, [cur.id, ...keys.map(k => c[k])]);
      if (c.is_default || ("type" in c && cur.is_default)) await soleDefault(t, cur.id);
    }
    return itemOut((await t.query("SELECT * FROM items WHERE id = $1", [cur.id]))[0]);
  }));
}

export const moveItem = (id, sectionId) => updateItem(id, { sectionId });

/* hide / unhide / delete / restore all come down to this. */
export async function setStatus(id, status) {
  if (!STATUSES.includes(status)) throw no("Unknown status.");
  const [r] = await query("UPDATE items SET status = $2, updated_at = now() WHERE id = $1 RETURNING *", [String(id), status]);
  if (!r) throw new HttpError(404, "This item is not in the catalog.");
  return itemOut(r);
}

/* ids = the full new order of the section's items that aren't deleted. Deleted items keep their
   relative order after them. */
export function reorder(sectionId, ids) {
  return guarded(() => tx(async t => {
    await sectionExists(t, sectionId);
    const rows = await t.query("SELECT id, status FROM items WHERE section_id = $1 ORDER BY position, id FOR UPDATE", [sectionId]);
    const live = rows.filter(r => r.status !== "deleted").map(r => r.id);
    if (!Array.isArray(ids) || ids.length !== live.length || new Set(ids).size !== ids.length || ids.some(id => !live.includes(id)))
      throw no("The new order must list every item of the section once.");
    const order = [...ids, ...rows.filter(r => r.status === "deleted").map(r => r.id)];
    for (const [i, id] of order.entries()) await t.query("UPDATE items SET position = $2, updated_at = now() WHERE id = $1 AND position <> $2", [id, i]);
    return order;
  }));
}

/* ---------- sections ---------- */

const checkLabel = l => {
  const label = typeof l === "string" ? l.trim() : "";
  if (!label || label.length > 40) throw no("A section name is required (up to 40 characters).");
  return label;
};
const slug = s => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "section";

/* Appended after the last section. The id comes from the label unless given (the seed keeps old ids). */
export function createSection({ id, label } = {}) {
  return guarded(() => tx(async t => {
    const name = checkLabel(label);
    let sid = id ?? slug(name);
    if (!/^[a-z0-9-]{1,40}$/.test(sid)) throw no("Invalid section id.");
    if (id != null && (await t.query("SELECT 1 FROM shop_sections WHERE id = $1", [sid])).length) throw new HttpError(409, "This section already exists.");
    for (let n = 2; (await t.query("SELECT 1 FROM shop_sections WHERE id = $1", [sid])).length; n++) sid = slug(name).slice(0, 32) + "-" + n;
    const [{ p }] = await t.query("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM shop_sections");
    await t.query("INSERT INTO shop_sections (id, label, position) VALUES ($1, $2, $3)", [sid, name, p]);
    return { id: sid, label: name, position: p };
  }));
}

export async function renameSection(id, label) {
  const [r] = await query("UPDATE shop_sections SET label = $2 WHERE id = $1 RETURNING id, label, position", [String(id), checkLabel(label)]);
  if (!r) throw new HttpError(404, "Unknown shop section.");
  return r;
}

/* ids = every section id, in the new order. */
export function reorderSections(ids) {
  return guarded(() => tx(async t => {
    const all = (await t.query("SELECT id FROM shop_sections FOR UPDATE")).map(r => r.id);
    if (!Array.isArray(ids) || ids.length !== all.length || new Set(ids).size !== ids.length || ids.some(id => !all.includes(id)))
      throw no("The new order must list every section once.");
    for (const [i, id] of ids.entries()) await t.query("UPDATE shop_sections SET position = $2 WHERE id = $1 AND position <> $2", [id, i]);
    return ids;
  }));
}

/* Only an empty section can go. Deleted items don't count: they move to the end of the first other
   section (they need one, and they can be restored from there). */
export function deleteSection(id) {
  return guarded(() => tx(async t => {
    await sectionExists(t, id);
    const items = await t.query("SELECT id, status FROM items WHERE section_id = $1 ORDER BY position, id", [id]);
    const live = items.filter(r => r.status !== "deleted").length;
    if (live) throw no(`This section still has ${live} item${live === 1 ? "" : "s"}. Move or delete them first.`);
    if (items.length) {
      const [other] = await t.query("SELECT id FROM shop_sections WHERE id <> $1 ORDER BY position LIMIT 1", [id]);
      if (!other) throw no("The last section can't be deleted while it holds deleted items.");
      let p = await nextPosition(t, other.id);
      for (const r of items) await t.query("UPDATE items SET section_id = $2, position = $3, updated_at = now() WHERE id = $1", [r.id, other.id, p++]);
    }
    await t.query("DELETE FROM shop_sections WHERE id = $1", [id]);
    return { id };
  }));
}
