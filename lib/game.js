/* The room game on the server: config (rules from config.json, items and sections from the shop
   catalog), XP awards with limits, purchases, furnishing, teacher grants, uploaded pictures. */
import { createHash, randomBytes } from "node:crypto";
import { readDoc, updateDoc } from "./store.js";
import { dbConfigured } from "./db.js";
import { putAsset, decodeDataUrl, ASSET_KINDS } from "./assets.js";
import { listItems, listSections, createItem, updateItem, setStatus, reorder, createSection, renameSection, reorderSections, deleteSection } from "./catalog.js";
import { readUser, updateUser } from "./users.js";
import { HttpError } from "./http.js";
import { effectiveRules, rulesErrors, progress, owned, canBuy, itemById, slotById, spotsFor, SELF_REPORTED, SLOTS, ROOM } from "../public/js/game-model.js";

/* config.json keeps the teacher's rules. Its old `items`, `removed` and `assets` are only read by the
   one-time seed (lib/seed-catalog.js), so they are kept as they are. */
const CONFIG_KEY = "school/game/config.json";
const assetKey = id => `school/game/assets/${id}.json`;

/* config = {rules, items, sections}. items: the whole catalog in shop order, hidden and deleted ones
   included, so a student's bought items always resolve. Filter with clientConfig before sending. */
export async function loadConfig({ fresh = false } = {}) {
  const [d, items, sections] = await Promise.all([
    readDoc(CONFIG_KEY, { fresh }).catch(() => null),
    listItems({ includeHidden: true, includeDeleted: true }),
    listSections(),
  ]);
  const rules = (d && d.data && d.data.rules) || {};
  return { overrides: { rules }, etag: d ? d.etag : null, config: { rules: effectiveRules(rules), items, sections } };
}

/* What the browser gets. Students: items on sale plus the ones they own (hidden or deleted ones stay in
   their room). Teachers: every item, and the uploaded pictures for the editor. */
export function clientConfig(config, { role, game, assets } = {}) {
  let items = config.items;
  if (role !== "teacher") { const own = owned(game, config); items = items.filter(i => i.active || own.has(i.id)); }
  const out = { rules: config.rules, items, sections: config.sections, slots: SLOTS, room: ROOM };
  if (role === "teacher") out.assets = assets || [];
  return out;
}

/* Saves the teacher's rules (the editor sends {rules}). Items are changed through the catalog. */
export async function saveOverrides(next) {
  const rules = (next && next.rules) || {};
  const errors = rulesErrors(rules);
  if (errors.length) throw new HttpError(422, "The changes were not saved.", { errors });
  await updateDoc(CONFIG_KEY, { v: 1 }, cur => ({ ...cur, v: 1, rules }));
  return (await loadConfig({ fresh: true })).config;
}

export async function gameOf(uid, { fresh = true } = {}) { return readUser(uid, "game", { fresh }); }

export function summary(game, config) {
  return { progress: progress(game, config.rules), owned: [...owned(game, config)], equipped: game.equipped || {}, completed: [...new Set(game.events.filter(e => e.kind === "homework").map(e => e.ref))] };
}

/* Award XP for an activity, applying the rule's limits. Returns what happened. */
export async function award(uid, kind, ref, meta = {}, { byTeacher = false, day } = {}) {
  const { config } = await loadConfig();
  const rule = config.rules.activities[kind];
  if (!rule) throw new HttpError(400, "Unknown activity.");
  if (!byTeacher && !SELF_REPORTED.includes(kind)) throw new HttpError(403, "Only the teacher can record this.");
  const today = day || new Date().toISOString().slice(0, 10);
  let result = { awarded: 0, reason: null };
  const game = await updateUser(uid, "game", g => {
    const before = progress(g, config.rules);
    result = { awarded: 0, reason: null, before };
    if (!(rule.xp > 0)) { result.reason = "no-xp"; return null; }
    if (rule.once && g.events.some(e => e.kind === kind && e.ref === ref)) { result.reason = "already"; return null; }
    if (rule.dailyCap && g.events.filter(e => e.kind === kind && e.day === today).length >= rule.dailyCap) { result.reason = "daily-limit"; return null; }
    if (rule.minAnswers && (Number(meta.answers) || 0) < rule.minAnswers) { result.reason = "too-short"; return null; }
    g.events.push({ id: randomBytes(5).toString("hex"), kind, ref: String(ref || "").slice(0, 120), xp: rule.xp, day: today, at: new Date().toISOString() });
    g.events = g.events.slice(-5000);
    result.awarded = rule.xp;
    return g;
  });
  return { ...result, after: progress(game, config.rules), summary: summary(game, config) };
}

export async function buy(uid, itemId) {
  const { config } = await loadConfig();
  const item = itemById(config, itemId);
  if (!item) throw new HttpError(404, "This item is not in the shop.");
  let check;
  const game = await updateUser(uid, "game", g => {
    check = canBuy(item, g, config);
    if (!check.ok) return null;
    g.purchases.push({ item: item.id, price: item.price || 0, at: new Date().toISOString() });
    const spots = spotsFor(item.type);
    if (spots.length && slotById(spots[0])) {
      const free = spots.find(s => !g.equipped[s]) || spots[0];  // a new item goes into an empty spot, or replaces
      g.equipped[free] = item.id;
    }
    return g;
  });
  if (!check.ok) {
    const msg = { owned: "You already have this.", level: "You need level " + item.minLevel + " for this.", coins: "Not enough coins.", inactive: "This item is not on sale." }[check.why];
    throw new HttpError(422, msg || "This item cannot be bought.");
  }
  return summary(game, config);
}

/* Put an owned item in a spot, or empty the spot (item null). */
export async function equip(uid, slotId, itemId) {
  const { config } = await loadConfig();
  const slot = slotById(slotId);
  if (!slot) throw new HttpError(400, "Unknown spot.");
  const item = itemId ? itemById(config, itemId) : null;
  if (itemId && (!item || !spotsFor(item.type).includes(slotId))) throw new HttpError(400, "This item does not go there.");
  const game = await updateUser(uid, "game", g => {
    if (item && !owned(g, config).has(item.id)) throw new HttpError(403, "Buy this item first.");
    if (!item && !slot.removable) throw new HttpError(400, "This object cannot be removed, only replaced.");
    g.equipped[slotId] = item ? item.id : null;
    return g;
  });
  return summary(game, config);
}

export async function grant(uid, { xp = 0, coins = 0, note = "" }) {
  const x = Math.round(Number(xp) || 0), c = Math.round(Number(coins) || 0);
  if (!x && !c) throw new HttpError(422, "Enter XP or coins to give.");
  if (Math.abs(x) > 1e7 || Math.abs(c) > 1e6) throw new HttpError(422, "The amount is too large.");
  const { config } = await loadConfig();
  const game = await updateUser(uid, "game", g => { g.grants.push({ xp: x, coins: c, note: String(note).slice(0, 120), at: new Date().toISOString() }); return g; });
  return summary(game, config);
}

export async function resetGame(uid) {
  const { config } = await loadConfig();
  const game = await updateUser(uid, "game", () => ({ v: 1, events: [], grants: [], purchases: [], equipped: {} }));
  return summary(game, config);
}

/* Can this student open the content (e.g. "en/desperate-housewives")? Content that isn't in the catalog
   is open; a show in it (on sale, hidden or deleted) needs to be owned. */
export async function contentAccess(uid, contentId) {
  const { config } = await loadConfig();
  const item = itemById(config, contentId);
  if (!item) return { ok: true };
  const game = await gameOf(uid, { fresh: true }); // fresh: a purchase must work immediately
  return owned(game, config).has(item.id) ? { ok: true } : { ok: false, item: { id: item.id, name: item.name, price: item.price, minLevel: item.minLevel } };
}

/* ---------- uploaded pictures (PNG, WebP, GIF or JPEG as data URLs, up to 1.5 MB) ----------
   Stored by lib/assets.js (file + `assets` row); the editor lists them with listUploads (lib/catalog.js).
   On Vercel without a database the old base64 doc is written instead (removed in step 9). */
export async function storeAsset(name, dataUrl, w, h, kind) {
  const label = String(name || "picture").slice(0, 80);
  if (dbConfigured()) {
    const { bytes, mime } = decodeDataUrl(dataUrl);
    const a = await putAsset({ bytes, mime, name: label, kind: ASSET_KINDS.includes(kind) ? kind : "sprite", w, h });
    return { id: a.id, name: a.name, w: a.w, h: a.h, at: a.at };
  }
  if (typeof dataUrl !== "string" || !/^data:image\/(png|webp|gif|jpeg);base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > 2_100_000)
    throw new HttpError(422, "Upload a PNG, WebP, GIF or JPEG image under 1.5 MB.");
  const id = createHash("sha256").update(dataUrl).digest("hex").slice(0, 32);
  await updateDoc(assetKey(id), { dataUrl: null }, d => (d.dataUrl ? null : { dataUrl, name: label }));
  return { id, name: label, w: Math.round(w) || 0, h: Math.round(h) || 0, at: new Date().toISOString() };
}

/* ---------- the teacher's shop management (admin API, step 5) ----------
   op = item.create | item.update | item.hide | item.unhide | item.delete | item.restore | item.reorder |
        section.create | section.rename | section.reorder | section.delete.
   Only the fields listed here are accepted (an unknown one is a 422), so a teacher can't set an id,
   a status or a shelf layout through create/update. lib/catalog.js validates the values. */
const CREATE_FIELDS = ["name", "sub", "type", "sectionId", "price", "minLevel", "sprite", "surface", "cover", "spine", "default", "isDefault"];
const UPDATE_FIELDS = ["name", "sub", "price", "minLevel", "sectionId", "sprite", "surface", "cover", "spine", "default", "isDefault"];
const STATUS_OF = { "item.hide": "hidden", "item.unhide": "active", "item.delete": "deleted", "item.restore": "active" };
export const CATALOG_OPS = ["item.create", "item.update", ...Object.keys(STATUS_OF), "item.reorder", "section.create", "section.rename", "section.reorder", "section.delete"];

function itemFields(body, allowed) {
  const f = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === "id") continue;
    if (!allowed.includes(k)) throw new HttpError(422, "This field can't be set here: " + k + ".");
    f[k === "isDefault" ? "default" : k] = v;
  }
  return f;
}
const idOf = (v, what) => {
  if (typeof v !== "string" || !v) throw new HttpError(422, "Which " + what + "? An id is required.");
  return v;
};

export async function catalogAction(op, body) {
  const b = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  switch (op) {
    case "item.create": return createItem(itemFields(b, CREATE_FIELDS));
    case "item.update": return updateItem(idOf(b.id, "item"), itemFields(b, UPDATE_FIELDS));
    case "item.hide": case "item.unhide": case "item.delete": case "item.restore":
      return setStatus(idOf(b.id, "item"), STATUS_OF[op]);
    case "item.reorder": return { sectionId: idOf(b.sectionId, "section"), ids: await reorder(b.sectionId, b.ids) };
    case "section.create": return createSection({ label: b.label });
    case "section.rename": return renameSection(idOf(b.id, "section"), b.label);
    case "section.reorder": return { ids: await reorderSections(b.ids) };
    case "section.delete": return deleteSection(idOf(b.id, "section"));
    default: throw new HttpError(404, "Unknown action.");
  }
}
