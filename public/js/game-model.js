/* The room game: defaults and the rules, shared by the browser and the API.
   Everything here can be overridden by the teacher in Room & shop (stored as overrides),
   so numbers are expected to change. */
import ATLAS from "../game/placeholders.js";

/* ---------- rules ---------- */
export const DEFAULT_RULES = {
  maxLevel: 60, xpPerLevel: 1000, coinsPerLevel: 100, startCoins: 100,
  activities: {
    class: { label: "Attending a class", xp: 1000 },
    homework: { label: "Completing homework", xp: 1000, once: true },
    episode: { label: "Reaching the end of an episode", xp: 1000, once: true },
    training: { label: "Completing a word training", xp: 1000, minAnswers: 5, dailyCap: 3 },
    grammar: { label: "Completing a grammar training", xp: 1000, dailyCap: 3 },
  },
};
/* Activities a student's own page may report; the others are awarded by the teacher. */
export const SELF_REPORTED = ["episode", "training", "grammar"];

/* ---------- the room: fixed spots (base size 192 x 136 px, wall 0..52) ---------- */
export const ROOM = { w: 192, h: 136, wall: 52 };
/* x, y: where the bottom centre of the item goes. z: drawing order (defaults to y). */
export const SLOTS = [
  { id: "wallpaper", label: "Wallpaper", kind: "surface" },
  { id: "floor", label: "Floor", kind: "surface" },
  { id: "window", label: "Window", x: 60, y: 44 },
  { id: "art", removable: true, label: "Wall art", x: 102, y: 40 },
  { id: "clock", removable: true, label: "Clock", x: 20, y: 30 },
  { id: "calendar", label: "Calendar", x: 128, y: 42, action: "deadlines", hint: "Calendar: deadlines" },
  { id: "door", label: "Door", x: 168, y: 52, action: "shop", hint: "Door: go to the shop" },
  { id: "bookshelf", label: "Bookshelf", x: 20, y: 94, action: "library", hint: "Bookshelf: your shows and books" },
  { id: "desk", label: "Desk", x: 64, y: 90 },
  { id: "computer", label: "Computer", x: 58, y: 74, z: 91, action: "notifications", hint: "Computer: messages" },
  { id: "diary", label: "Diary", x: 77, y: 76, z: 92, action: "stats", hint: "Diary: your progress" },
  { id: "chair", label: "Chair", x: 64, y: 106 },
  { id: "rug", removable: true, label: "Rug", x: 112, y: 122, z: 1 },
  { id: "armchair", removable: true, label: "Armchair", x: 116, y: 104 },
  { id: "bed", label: "Bed", x: 166, y: 132 },
  { id: "plant1", removable: true, label: "Plant by the wall", x: 138, y: 70 },
  { id: "plant2", removable: true, label: "Plant by the desk", x: 92, y: 70 },
  { id: "lamp", removable: true, label: "Floor lamp", x: 142, y: 96 },
];
export const slotById = id => SLOTS.find(s => s.id === id) || null;
/* Which spots an item of a given type can go to. */
export const SLOT_TYPES = { plant: ["plant1", "plant2"] };
export const spotsFor = type => SLOT_TYPES[type] || [type];

/* ---------- built-in catalog ---------- */
const sprite = id => ({ sheet: "placeholders", rect: ATLAS[id] });
const furniture = (id, name, type, opts = {}) => ({ id, name, type, sprite: sprite(id), price: 1, minLevel: 1, ...opts });
export const BUILTIN_ITEMS = [
  { id: "en/desperate-housewives", name: "Desperate Housewives", sub: "Season 1, episode 1", type: "show", lang: "en", cover: "#1E5C62", price: 1, minLevel: 1 },
  furniture("desk-wood", "Oak desk", "desk", { default: true }), furniture("desk-white", "White desk", "desk"), furniture("desk-walnut", "Walnut desk", "desk"),
  furniture("chair-teal", "Teal chair", "chair", { default: true }), furniture("chair-orange", "Orange chair", "chair"), furniture("chair-green", "Green chair", "chair"),
  furniture("bed-blue", "Blue bed", "bed", { default: true }), furniture("bed-orange", "Orange bed", "bed"), furniture("bed-green", "Green bed", "bed"),
  furniture("bookshelf-wood", "Wooden bookshelf", "bookshelf", { default: true }), furniture("bookshelf-white", "White bookshelf", "bookshelf"),
  furniture("computer", "Computer", "computer", { default: true }),
  furniture("diary", "Diary", "diary", { default: true }),
  furniture("calendar", "Calendar", "calendar", { default: true }),
  furniture("window-plain", "Window", "window", { default: true }), furniture("window-curtain-teal", "Window, teal curtains", "window"), furniture("window-curtain-red", "Window, red curtains", "window"),
  furniture("door-wood", "Wooden door", "door", { default: true }), furniture("door-teal", "Teal door", "door"),
  furniture("rug-beige", "Beige rug", "rug"), furniture("rug-teal", "Teal rug", "rug"), furniture("rug-orange", "Orange rug", "rug"), furniture("rug-green-round", "Round green rug", "rug"),
  furniture("plant-bush", "Bushy plant", "plant"), furniture("plant-tall", "Tall plant", "plant"),
  furniture("lamp-cream", "Cream lamp", "lamp"), furniture("lamp-teal", "Teal lamp", "lamp"),
  furniture("art-sunset", "Sunset picture", "art"), furniture("art-mountains", "Mountain picture", "art"),
  furniture("armchair-mustard", "Mustard armchair", "armchair"), furniture("armchair-gray", "Gray armchair", "armchair"),
  furniture("clock", "Wall clock", "clock"),
  { id: "wall-cream", name: "Cream wall", type: "wallpaper", surface: { color: "#EFE6D2", pattern: "plain", accent: "#E2D6BC" }, price: 1, minLevel: 1, default: true },
  { id: "wall-teal-stripes", name: "Teal stripes", type: "wallpaper", surface: { color: "#CFE3DF", pattern: "stripes", accent: "#B4D2CC" }, price: 1, minLevel: 1 },
  { id: "wall-peach-dots", name: "Peach dots", type: "wallpaper", surface: { color: "#F6DCC8", pattern: "dots", accent: "#E9BC9C" }, price: 1, minLevel: 1 },
  { id: "wall-sage-diamonds", name: "Sage diamonds", type: "wallpaper", surface: { color: "#DCE6D2", pattern: "diamonds", accent: "#C3D3B4" }, price: 1, minLevel: 1 },
  { id: "floor-oak", name: "Oak planks", type: "floor", surface: { color: "#C99A66", pattern: "planks", accent: "#B4834F" }, price: 1, minLevel: 1, default: true },
  { id: "floor-checker", name: "Checker tiles", type: "floor", surface: { color: "#E9E4DA", pattern: "checker", accent: "#BFC6C6" }, price: 1, minLevel: 1 },
  { id: "floor-carpet", name: "Gray carpet", type: "floor", surface: { color: "#9AA3A8", pattern: "plain", accent: "#8C959A" }, price: 1, minLevel: 1 },
];

export const ITEM_TYPES = ["show", "book", ...new Set(SLOTS.map(s => s.id.replace(/\d+$/, "")))];
export const PATTERNS = ["plain", "stripes", "dots", "diamonds", "planks", "checker"];

/* ---------- config: defaults + teacher overrides ---------- */
/* overrides = {rules: {...}, items: {id: {...changed fields or a whole custom item}}, removed: [ids], assets: [{id, name, w, h}]} */
export function effectiveConfig(overrides = {}) {
  const o = overrides || {};
  const r = o.rules || {};
  const rules = { ...DEFAULT_RULES, ...r, activities: {} };
  for (const k of Object.keys(DEFAULT_RULES.activities)) rules.activities[k] = { ...DEFAULT_RULES.activities[k], ...((r.activities || {})[k] || {}) };
  const removed = new Set(o.removed || []);
  const items = [];
  const byId = new Map(BUILTIN_ITEMS.map(i => [i.id, i]));
  for (const base of BUILTIN_ITEMS) if (!removed.has(base.id)) items.push({ active: true, ...base, ...((o.items || {})[base.id] || {}), builtin: true });
  for (const [id, it] of Object.entries(o.items || {})) if (!byId.has(id) && !removed.has(id)) items.push({ active: true, ...it, id, builtin: false });
  // one default per spot type: the last one marked wins, so a newly chosen default replaces the old one
  const defaults = {};
  for (const it of items) if (it.default) defaults[it.type] = it.id;
  for (const it of items) it.default = defaults[it.type] === it.id;
  return { rules, items, assets: o.assets || [] };
}

export const itemById = (config, id) => config.items.find(i => i.id === id) || null;

export function configErrors(overrides) {
  const e = [];
  const o = overrides || {};
  const num = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  const r = o.rules || {};
  if (r.maxLevel !== undefined && !num(r.maxLevel, 1, 500)) e.push("Number of levels: a whole number from 1 to 500.");
  if (r.xpPerLevel !== undefined && !num(r.xpPerLevel, 1, 1e7)) e.push("XP per level: a whole number above 0.");
  if (r.coinsPerLevel !== undefined && !num(r.coinsPerLevel, 0, 1e6)) e.push("Coins per level: a whole number, 0 or more.");
  if (r.startCoins !== undefined && !num(r.startCoins, 0, 1e6)) e.push("Starting coins: a whole number, 0 or more.");
  for (const [k, a] of Object.entries(r.activities || {})) {
    if (!DEFAULT_RULES.activities[k]) { e.push("Unknown activity " + k + "."); continue; }
    if (a.xp !== undefined && !num(a.xp, 0, 1e7)) e.push(DEFAULT_RULES.activities[k].label + ": XP must be a whole number, 0 or more.");
    if (a.dailyCap !== undefined && a.dailyCap !== null && !num(a.dailyCap, 0, 1000)) e.push(DEFAULT_RULES.activities[k].label + ": the daily limit must be a whole number (0 means no limit).");
    if (a.minAnswers !== undefined && !num(a.minAnswers, 0, 1000)) e.push(DEFAULT_RULES.activities[k].label + ": the minimum must be a whole number.");
  }
  for (const [id, it] of Object.entries(o.items || {})) {
    const w = "Item " + id + ": ";
    if (!/^[a-z0-9/_-]{1,80}$/.test(id)) e.push(w + "invalid id.");
    if (it.name !== undefined && !(typeof it.name === "string" && it.name.trim() && it.name.length <= 60)) e.push(w + "a name is required (up to 60 characters).");
    if (it.price !== undefined && !num(it.price, 0, 1e6)) e.push(w + "the price must be a whole number, 0 or more.");
    if (it.minLevel !== undefined && !num(it.minLevel, 1, 500)) e.push(w + "the level must be a whole number from 1.");
    if (it.type !== undefined && !ITEM_TYPES.includes(it.type)) e.push(w + "unknown type " + it.type + ".");
    if (it.sprite !== undefined) {
      const s = it.sprite, rect = s && s.rect;
      if (!s || !(s.sheet === "placeholders" || /^[a-f0-9]{16,64}$/.test(s.asset || "")) || !Array.isArray(rect) || rect.length !== 4 || rect.some(v => !num(v, 0, 4096)) || rect[2] < 1 || rect[3] < 1) e.push(w + "the picture is not valid.");
    }
    if (it.surface !== undefined) {
      const s = it.surface;
      if (!s || !/^#[0-9a-fA-F]{6}$/.test(s.color || "") || !/^#[0-9a-fA-F]{6}$/.test(s.accent || "") || !PATTERNS.includes(s.pattern)) e.push(w + "the wall or floor style is not valid.");
    }
  }
  if (o.removed && (!Array.isArray(o.removed) || o.removed.some(x => typeof x !== "string"))) e.push("The list of removed items is not valid.");
  return e.slice(0, 40);
}

/* ---------- a student's progress ---------- */
export const EMPTY_GAME = { v: 1, events: [], grants: [], purchases: [], equipped: {} };
const sum = (list, f) => (list || []).reduce((n, x) => n + (Number(x[f]) || 0), 0);

export function progress(game, rules) {
  const g = game || EMPTY_GAME;
  const xp = Math.max(0, sum(g.events, "xp") + sum(g.grants, "xp"));
  const level = Math.min(rules.maxLevel, 1 + Math.floor(xp / rules.xpPerLevel));
  const maxed = level >= rules.maxLevel;
  const into = maxed ? rules.xpPerLevel : xp - (level - 1) * rules.xpPerLevel;
  const coins = rules.startCoins + (level - 1) * rules.coinsPerLevel + sum(g.grants, "coins") - sum(g.purchases, "price");
  return { xp, level, into, need: rules.xpPerLevel, coins, maxed };
}

export function owned(game, config) {
  const set = new Set((game && game.purchases || []).map(p => p.item));
  for (const it of config.items) if (it.default || it.price === 0) set.add(it.id);
  return set;
}

/* What stands in each spot: the student's choice if they own it, otherwise the default. */
export function furnished(game, config) {
  const own = owned(game, config), eq = (game && game.equipped) || {}, out = {};
  for (const slot of SLOTS) {
    const types = Object.entries(SLOT_TYPES).find(([, spots]) => spots.includes(slot.id));
    const type = types ? types[0] : slot.id;
    const chosen = eq[slot.id] && itemById(config, eq[slot.id]);
    if (chosen && own.has(chosen.id) && chosen.type === type) { out[slot.id] = chosen; continue; }
    if (eq[slot.id] === null) continue; // emptied on purpose
    const def = config.items.find(i => i.type === type && i.default);
    if (def) out[slot.id] = def;
  }
  return out;
}

export function canBuy(item, game, config) {
  const p = progress(game, config.rules);
  if (owned(game, config).has(item.id)) return { ok: false, why: "owned" };
  if (!item.active) return { ok: false, why: "inactive" };
  if (p.level < (item.minLevel || 1)) return { ok: false, why: "level" };
  if (p.coins < (item.price || 0)) return { ok: false, why: "coins" };
  return { ok: true };
}
