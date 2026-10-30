/* The room game on the server: config (defaults + teacher overrides), XP awards with limits,
   purchases, furnishing, teacher grants, uploaded pictures. */
import { createHash, randomBytes } from "node:crypto";
import { readDoc, updateDoc } from "./store.js";
import { readUser, updateUser } from "./users.js";
import { HttpError } from "./http.js";
import { effectiveConfig, configErrors, progress, owned, canBuy, itemById, slotById, spotsFor, SELF_REPORTED } from "../public/js/game-model.js";

const CONFIG_KEY = "school/game/config.json";
const assetKey = id => `school/game/assets/${id}.json`;
const EMPTY_OVERRIDES = { v: 1, rules: {}, items: {}, removed: [], assets: [] };

export async function loadConfig({ fresh = false } = {}) {
  const d = await readDoc(CONFIG_KEY, { fresh }).catch(() => null);
  const overrides = d ? d.data : JSON.parse(JSON.stringify(EMPTY_OVERRIDES));
  return { overrides, etag: d ? d.etag : null, config: effectiveConfig(overrides) };
}

/* Replace the teacher's overrides as a whole (the editor sends the full document). */
export async function saveOverrides(next) {
  const errors = configErrors(next);
  if (errors.length) throw new HttpError(422, "The changes were not saved.", { errors });
  const clean = { v: 1, rules: next.rules || {}, items: next.items || {}, removed: next.removed || [], assets: next.assets || [] };
  await updateDoc(CONFIG_KEY, EMPTY_OVERRIDES, cur => { clean.assets = mergeAssets(cur.assets, clean.assets); return clean; });
  return effectiveConfig(clean);
}
const mergeAssets = (a, b) => { const m = new Map(); [...(a || []), ...(b || [])].forEach(x => m.set(x.id, x)); return [...m.values()]; };

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

/* Can this student open the content (e.g. "en/desperate-housewives")? Content not in the shop is open. */
export async function contentAccess(uid, contentId) {
  const { config } = await loadConfig();
  const item = itemById(config, contentId);
  if (!item) return { ok: true };
  const game = await gameOf(uid, { fresh: true }); // fresh: a purchase must work immediately
  return owned(game, config).has(item.id) ? { ok: true } : { ok: false, item: { id: item.id, name: item.name, price: item.price, minLevel: item.minLevel } };
}

/* ---------- uploaded pictures (PNG, WebP, GIF or JPEG as data URLs, up to ~1.5 MB) ---------- */
export async function storeAsset(name, dataUrl, w, h) {
  if (typeof dataUrl !== "string" || !/^data:image\/(png|webp|gif|jpeg);base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > 2_000_000)
    throw new HttpError(422, "Upload a PNG, WebP, GIF or JPEG image under 1.5 MB.");
  const id = createHash("sha256").update(dataUrl).digest("hex").slice(0, 32);
  await updateDoc(assetKey(id), { dataUrl: null }, d => (d.dataUrl ? null : { dataUrl, name: String(name || "").slice(0, 80) }));
  const entry = { id, name: String(name || "picture").slice(0, 80), w: Math.round(w) || 0, h: Math.round(h) || 0, at: new Date().toISOString() };
  await updateDoc(CONFIG_KEY, EMPTY_OVERRIDES, cur => { cur.assets = mergeAssets(cur.assets, [entry]); return cur; });
  return entry;
}

export async function readAsset(id) {
  if (!/^[a-f0-9]{32}$/.test(id || "")) return null;
  const d = await readDoc(assetKey(id));
  return d && d.data.dataUrl ? d.data.dataUrl : null;
}
