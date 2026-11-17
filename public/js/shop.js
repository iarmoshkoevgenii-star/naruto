/* The shop: shows, movies and books, and things for the room. Decorated with the DeadWood Cafe art. */
import { api, esc, toast } from "./api.js";
import { itemThumb } from "./room.js";
import { spotsFor, slotById, CONTENT_TYPES, contentHref } from "./game-model.js";

const SCENE = '<div class="sc-bar"></div>' + ["window", "walldeco", "light", "rug", "shelf", "table", "coffmach", "stool", "sign"]
  .map(n => '<img class="sc-' + n + '" src="/game/shop/' + n + '.webp" alt="" decoding="async">').join("");

const coinWord = n => n === 1 ? "coin" : "coins";

export async function shopPage(main, me, { renderShell } = {}) {
  document.title = "Shop — Natalia’s Language School";
  main.innerHTML = '<p class="loading">Opening the shop…</p>';
  let data = (await api("GET", "/api/game")).data;
  const teacher = me.role === "teacher";
  const config = data.config;
  const sections = config.sections || [];  // in shop order; items come sorted by section, then position
  let section = new URLSearchParams(location.search).get("s") || (sections[0] && sections[0].id);
  let mine = data.me || { progress: { level: 99, coins: 0, into: 0, need: 1, maxed: true }, owned: [], equipped: {} };

  function card(it) {
    const own = mine.owned.includes(it.id);
    const placed = Object.values(mine.equipped).includes(it.id) || (it.default && !Object.keys(mine.equipped).some(k => spotsFor(it.type).includes(k) && mine.equipped[k] !== it.id));
    const level = mine.progress.level, coins = Math.max(0, mine.progress.coins);
    let action;
    if (teacher) action = '<span class="sh-state">Level ' + it.minLevel + ", " + it.price + " " + coinWord(it.price) + "</span>";
    else if (own) {
      if (CONTENT_TYPES.includes(it.type)) action = contentHref(it) ? '<a class="p-btn small" href="' + esc(contentHref(it)) + '">Open</a>' : '<span class="sh-state ok">On your bookshelf</span>';
      else if (placed) action = '<span class="sh-state ok">In your room</span>' + (spotsFor(it.type).some(sp => (slotById(sp) || {}).removable) ? '<button type="button" class="link-b" data-remove="' + esc(it.id) + '">Take out</button>' : "");
      else action = '<button type="button" class="p-btn small" data-place="' + esc(it.id) + '">Put in the room</button>';
    } else if (level < it.minLevel) action = '<button type="button" class="p-btn small" disabled>Reach Lv ' + it.minLevel + "</button>";
    else if (coins < it.price) action = '<button type="button" class="p-btn small" disabled>Not enough coins</button>';
    else action = '<button type="button" class="p-btn small primary" data-buy="' + esc(it.id) + '">Buy for ' + it.price + " " + coinWord(it.price) + "</button>";
    return '<article class="sh-item' + (own ? " owned" : "") + (level < it.minLevel && !own ? " locked" : "") + '"><div class="sh-pic">' + itemThumb(it, 3) + "</div><b>" + esc(it.name) + "</b>" +
      '<span class="sh-meta">' + (it.sub ? esc(it.sub) + ". " : "") + "Level " + it.minLevel + ", " + it.price + " " + coinWord(it.price) + "</span>" + '<div class="sh-act">' + action + "</div></article>";
  }

  function render() {
    const sec = sections.find(s => s.id === section) || sections[0] || { id: "" };
    const list = config.items.filter(i => i.sectionId === sec.id && i.active && !(i.default && i.price === 0));
    const p = mine.progress;
    main.innerHTML = '<div class="shop"><a class="back" href="/" data-nav>← Back to my room</a>' +
      '<section class="shop-scene"><div class="sc-text"><h1>The Shop</h1><p>New shows, movies and books, and things for your room. Everything you buy stays yours.</p></div><div class="sc-art" aria-hidden="true">' + SCENE + "</div></section>" +
      (teacher ? '<p class="warn">Teacher preview: students see buy buttons here. Prices and levels are set in <a href="/room-editor" data-nav>Room &amp; shop</a>.</p>'
        : '<div class="wallet"><span class="lv-badge">Lv ' + p.level + '</span><div class="xp"><div class="xp-bar"><i style="width:' + Math.round(p.into / p.need * 100) + '%"></i></div><span>' + (p.maxed ? "Top level" : p.into + " / " + p.need + " XP") + '</span></div><span class="coins"><span class="coin" aria-hidden="true"></span>' + Math.max(0, p.coins) + " " + coinWord(Math.max(0, p.coins)) + "</span></div>") +
      '<div class="seg-ctl shop-tabs" role="group" aria-label="Sections">' + sections.map(s => '<button type="button" data-sec="' + esc(s.id) + '" aria-pressed="' + (s.id === sec.id) + '">' + esc(s.label) + "</button>").join("") + "</div>" +
      '<div class="shop-grid">' + (list.length ? list.map(card).join("") : '<p class="empty-s">Nothing here yet.</p>') + "</div></div>";
  }

  async function act(action, body, done) {
    try { mine = (await api("POST", "/api/game?action=" + action, body)).data; render(); renderShell && renderShell(); toast(done); }
    catch (e) { toast(e.message); }
  }
  main.addEventListener("click", e => {
    const t = e.target;
    const s = t.closest("[data-sec]"); if (s) { section = s.dataset.sec; history.replaceState(null, "", "/shop?s=" + section); render(); return; }
    const b = t.closest("[data-buy]");
    if (b) { const it = config.items.find(i => i.id === b.dataset.buy); b.disabled = true; act("buy", { item: it.id }, CONTENT_TYPES.includes(it.type) ? it.name + " is on your bookshelf now" : it.name + " is in your room now"); return; }
    const pl = t.closest("[data-place]");
    if (pl) { const it = config.items.find(i => i.id === pl.dataset.place); const spots = spotsFor(it.type); const spot = spots.find(sp => !mine.equipped[sp]) || spots[0]; act("equip", { slot: spot, item: it.id }, it.name + " is in your room now"); return; }
    const rm = t.closest("[data-remove]");
    if (rm) { const spot = Object.keys(mine.equipped).find(k => mine.equipped[k] === rm.dataset.remove); if (spot) act("equip", { slot: spot, item: null }, "Taken out of the room"); }
  });
  render();
}
