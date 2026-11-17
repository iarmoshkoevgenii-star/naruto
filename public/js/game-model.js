/* The room game: default rules, the room's spots and the pure game logic, shared by the browser and
   the API. The items themselves live in the shop catalog (lib/catalog.js); the teacher can change the
   rules in Room & shop, so numbers are expected to change. */

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
  { id: "bookshelf", label: "Bookshelf", x: 20, y: 94, action: "library", hint: "Bookshelf: your shows, movies and books" },
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

export const ITEM_TYPES = ["show", "book", "movie", ...new Set(SLOTS.map(s => s.id.replace(/\d+$/, "")))];
/* Shows, books and movies live on the bookshelf, not in a room spot: they need no picture. */
export const CONTENT_TYPES = ["show", "book", "movie"];
/* Shows and movies stand on the bookshelf as DVDs; books are only listed in its panel. */
export const DVD_TYPES = ["show", "movie"];
export const DEFAULT_COVER = "#1E5C62";
/* The page a title opens: built-in titles have one (their id is the content path, e.g.
   "en/desperate-housewives"); titles a teacher adds in the editor ("u-…") have none yet. */
export const contentHref = it => (CONTENT_TYPES.includes(it.type) && !String(it.id).startsWith("u-") ? "/" + it.id : null);
export const TITLE_LABEL = { show: "Show", movie: "Movie", book: "Book" };

/* A copy of ids with `id` moved to index `to` (clamped). Used to build a section's new order. */
export function moveId(ids, id, to) {
  const from = ids.indexOf(id);
  if (from < 0) return [...ids];
  const out = ids.filter(x => x !== id);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, id);
  return out;
}
export const PATTERNS = ["plain", "stripes", "dots", "diamonds", "planks", "checker"];

/* ---------- rules: defaults + the teacher's changes (config.json `rules`) ---------- */
export function effectiveRules(r = {}) {
  r = r || {};
  const rules = { ...DEFAULT_RULES, ...r, activities: {} };
  for (const k of Object.keys(DEFAULT_RULES.activities)) rules.activities[k] = { ...DEFAULT_RULES.activities[k], ...((r.activities || {})[k] || {}) };
  return rules;
}

/* config = {rules, items, sections}; items come from the shop catalog (lib/catalog.js), in shop order. */
export const itemById = (config, id) => config.items.find(i => i.id === id) || null;

export function rulesErrors(r) {
  const e = [];
  r = r || {};
  const num = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
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

/* Bought items (whatever their status now) plus everyone's starting and free items, unless deleted. */
export function owned(game, config) {
  const set = new Set((game && game.purchases || []).map(p => p.item));
  for (const it of config.items) if (it.status !== "deleted" && (it.default || it.price === 0)) set.add(it.id);
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
    const def = config.items.find(i => i.type === type && i.default && i.status !== "deleted");
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

/* ---------- the DVD shelf ---------- */
/* The student's DVDs: owned shows and movies, oldest purchase first (free titles, owned from the start,
   come first). Hidden and deleted titles they bought still count. */
export function shelfTitles(game, config) {
  const own = owned(game, config), at = new Map();
  for (const p of (game && game.purchases) || []) if (!at.has(p.item)) at.set(p.item, String(p.at || ""));
  return config.items
    .filter(i => DVD_TYPES.includes(i.type) && own.has(i.id))
    .map((it, n) => ({ it, at: at.get(it.id) ?? "", n }))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.n - b.n))
    .map(x => x.it);
}

/* Where each DVD stands on a bookshelf, in sprite pixels from the shelf's top-left. Rows fill left to
   right, top to bottom; a DVD stands on the bottom of its row. shelfLayout (seeded on the bookshelf items):
   {capacity, dvd: {w, h, gap, asset}, rows: [{x, y, w, h}], empty: {asset, rect}}.
   -> {placed: [{id, x, y, tint, spine: assetId | null}], hidden: titles that didn't fit}. */
export function dvdLayout(titles, shelfLayout) {
  const L = shelfLayout, d = L && L.dvd;
  if (!d || !Array.isArray(L.rows) || !(d.w > 0)) return { placed: [], hidden: titles.length };
  const gap = d.gap || 0, step = d.w + gap, spots = [];
  for (const r of L.rows) {
    const n = Math.floor((r.w + gap) / step);
    for (let i = 0; i < n; i++) spots.push({ x: r.x + i * step, y: r.y + r.h - d.h });
  }
  const cap = Math.min(spots.length, Number.isInteger(L.capacity) ? L.capacity : spots.length);
  const placed = titles.slice(0, cap).map((t, i) => ({ id: t.id, x: spots[i].x, y: spots[i].y, tint: t.cover || DEFAULT_COVER, spine: t.spine ? t.spine.asset : null }));
  return { placed, hidden: Math.max(0, titles.length - cap) };
}
