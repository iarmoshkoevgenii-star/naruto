/* The private room in the personal cabinet. Drawn at its base size (ROOM.w x ROOM.h "room pixels")
   and scaled to fit; objects stand at fixed spots (game-model.js SLOTS). */
import { api, esc, toast } from "./api.js";
import { furnished } from "./game-model.js";
import { notesHtml, fmtWhen, streakCardHtml, daysCardHtml, levelCardHtml, wordsCardHtml, heatHtml, bookingDialog, wordStats } from "./cabinet.js";
import { dayOf, addDays } from "./stats.js";

export const spriteUrl = s => s.sheet === "placeholders" ? "/game/placeholders.png" : "/api/game?asset=" + s.asset;

export function surfaceCss(s) {
  const a = s.accent, c = s.color;
  switch (s.pattern) {
    case "stripes": return `background:repeating-linear-gradient(90deg,${c} 0 6px,${a} 6px 8px)`;
    case "dots": return `background:radial-gradient(${a} 1px,transparent 1.5px) 0 0/8px 8px,${c}`;
    case "diamonds": return `background:conic-gradient(from 45deg,${a} 25%,${c} 0 50%,${a} 0 75%,${c} 0) 0 0/10px 10px`;
    case "planks": return `background:repeating-linear-gradient(90deg,transparent 0 23px,${a} 23px 24px),repeating-linear-gradient(0deg,${c} 0 7px,${a} 7px 8px)`;
    case "checker": return `background:conic-gradient(${a} 25%,${c} 0 50%,${a} 0 75%,${c} 0) 0 0/16px 16px`;
    default: return `background:${c}`;
  }
}

export function itemThumb(item, scale = 2) {
  if (item.surface) return '<span class="thumb-surface" style="' + surfaceCss(item.surface) + '"></span>';
  if (item.type === "show" || item.type === "book") return '<span class="thumb-cover" style="--cover:' + esc(item.cover || "#1E5C62") + '"><b>' + esc(item.name) + "</b></span>";
  if (!item.sprite) return "";
  const [x, y, w, h] = item.sprite.rect;
  return '<span class="thumb-sprite" style="width:' + w * scale + "px;height:" + h * scale + 'px"><i style="width:' + w + "px;height:" + h + "px;background:url(" + spriteUrl(item.sprite) + ") -" + x + "px -" + y + "px no-repeat;transform:scale(" + scale + ')"></i></span>';
}

function sceneHtml(config, game) {
  const room = config.room, items = furnished(game, config), out = [];
  const wall = items.wallpaper, floor = items.floor;
  out.push('<div class="rm-wall" style="height:' + room.wall + "px;" + (wall ? surfaceCss(wall.surface) : "") + '"></div>');
  out.push('<div class="rm-floor" style="top:' + room.wall + "px;height:" + (room.h - room.wall) + "px;" + (floor ? surfaceCss(floor.surface) : "") + '"></div>');
  const placed = config.slots.filter(s => s.kind !== "surface" && items[s.id] && items[s.id].sprite)
    .map(s => ({ s, it: items[s.id] })).sort((a, b) => (a.s.z ?? a.s.y) - (b.s.z ?? b.s.y));
  for (const { s, it } of placed) {
    const [x, y, w, h] = it.sprite.rect;
    const style = "left:" + Math.round(s.x - w / 2) + "px;top:" + (s.y - h) + "px;width:" + w + "px;height:" + h + "px;z-index:" + (s.z ?? s.y) + ";background:url(" + spriteUrl(it.sprite) + ") -" + x + "px -" + y + "px no-repeat";
    out.push(s.action
      ? '<button type="button" class="ri act" data-action="' + s.action + '" data-hint="' + esc(s.hint) + '" aria-label="' + esc(s.hint) + '" style="' + style + '"></button>'
      : '<div class="ri" title="' + esc(it.name) + '" style="' + style + '"></div>');
  }
  return out.join("");
}

/* Mounts the room into root. ctx: {config, game, me, readOnly, onShop, onChange} */
export function mountRoom(root, ctx) {
  const { config } = ctx;
  root.innerHTML = '<div class="room-wrap"><div class="room" style="width:' + config.room.w + "px;height:" + config.room.h + 'px">' + sceneHtml(config, ctx.game) + '</div><div class="rm-tip" hidden></div></div>' +
    '<p class="note rm-help">' + (ctx.readOnly ? "The student’s room. Click an object to see what they see." : (matchMedia("(pointer: coarse)").matches ? "Tap" : "Click") + " an object: the computer for messages, the calendar for deadlines, the diary for your progress, the bookshelf for your shows. The door leads to the shop.") + "</p>";
  const wrap = root.querySelector(".room-wrap"), room = root.querySelector(".room"), tip = root.querySelector(".rm-tip");
  const fit = () => {
    const avail = root.clientWidth || config.room.w;
    const byWidth = avail / config.room.w, byHeight = (window.innerHeight * 0.72) / config.room.h;
    let s = Math.min(byWidth, byHeight);
    s = s >= 2 ? Math.min(5, Math.floor(s)) : Math.min(byWidth, 2);   // whole numbers keep the pixels crisp
    room.style.transform = "scale(" + s + ")";
    wrap.style.width = Math.round(config.room.w * s) + "px";
    wrap.style.height = Math.round(config.room.h * s) + "px";
  };
  fit();
  if (window.ResizeObserver) new ResizeObserver(fit).observe(root);
  window.addEventListener("resize", fit);
  const showTip = el => {
    const r = el.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    tip.textContent = el.dataset.hint; tip.hidden = false;
    tip.style.left = (r.left - w.left + r.width / 2) + "px"; tip.style.top = (r.top - w.top) + "px";
  };
  room.querySelectorAll(".act").forEach(el => {
    el.addEventListener("pointerenter", () => showTip(el));
    el.addEventListener("focus", () => showTip(el));
    el.addEventListener("pointerleave", () => { tip.hidden = true; });
    el.addEventListener("blur", () => { tip.hidden = true; });
    el.addEventListener("click", () => openPanel(el.dataset.action, ctx));
  });
  return { open: action => openPanel(action, ctx) };
}

/* ---------- panels ---------- */
function panel(title, body, cls = "") {
  const dlg = document.createElement("dialog");
  dlg.className = "p-dlg wide rm-panel " + cls;
  dlg.innerHTML = '<div class="p-form"><div class="p-dh rm-ph"><h2>' + esc(title) + '</h2><button type="button" class="link-b" data-close>Close</button></div><div class="p-db">' + body + "</div></div>";
  document.body.appendChild(dlg);
  dlg.addEventListener("close", () => dlg.remove());
  dlg.addEventListener("click", e => { if (e.target === dlg || e.target.closest("[data-close]")) dlg.close(); });
  dlg.showModal();
  return dlg;
}

function openPanel(action, ctx) {
  if (action === "shop") { if (ctx.onShop) ctx.onShop(); return; }
  if (action === "notifications") return messagesPanel(ctx);
  if (action === "deadlines") return calendarPanel(ctx);
  if (action === "stats") return diaryPanel(ctx);
  if (action === "library") return libraryPanel(ctx);
}

function messagesPanel(ctx) {
  const me = ctx.me;
  const render = filter => '<div class="filters" role="group" aria-label="Show">' + [["all", "All"], ["class", "Classes"], ["homework", "Homework"], ["test", "Tests"], ["message", "Messages"]].map(([k, l]) => '<button type="button" data-filter="' + k + '" aria-pressed="' + (k === filter) + '">' + l + "</button>").join("") + "</div>" +
    "<div data-notes>" + notesHtml(me.notifications || [], filter, { teacher: ctx.readOnly }) + "</div>" +
    (!ctx.readOnly && (me.notifications || []).some(n => !n.read) ? '<button type="button" class="link-b" data-read-all>Mark all as read</button>' : "");
  const dlg = panel("Messages", '<div class="screen">' + render("all") + "</div>", "rm-computer");
  const box = dlg.querySelector(".screen");
  let filter = "all";
  box.addEventListener("click", async e => {
    const f = e.target.closest("[data-filter]");
    if (f) { filter = f.dataset.filter; box.innerHTML = render(filter); return; }
    if (ctx.readOnly) return;
    const r = e.target.closest("[data-read]"), all = e.target.closest("[data-read-all]");
    if (!r && !all) return;
    try {
      const { data } = await api("POST", "/api/me?action=read", all ? { all: true } : { ids: [r.dataset.read] });
      me.notifications = data.notifications; box.innerHTML = render(filter);
      if (ctx.onChange) ctx.onChange("notifications");
    } catch (err) { toast(err.message); }
  });
}

function calendarPanel(ctx) {
  const notes = (ctx.me.notifications || []).filter(n => n.when);
  const today = dayOf(), first = today.slice(0, 8) + "01";
  const start = addDays(first, -((new Date(first + "T12:00:00Z").getUTCDay() + 6) % 7));
  const month = new Date(first + "T12:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  let cells = "";
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i), items = notes.filter(n => n.when.slice(0, 10) === d);
    if (i >= 35 && d.slice(0, 7) !== today.slice(0, 7)) break;
    cells += '<div class="cal-d' + (d.slice(0, 7) !== today.slice(0, 7) ? " other" : "") + (d === today ? " today" : "") + '"><span>' + Number(d.slice(8)) + "</span>" + items.map(n => '<i class="cal-dot nt-' + n.type + '" title="' + esc(n.title) + '"></i>').join("") + "</div>";
  }
  const upcoming = notes.filter(n => n.when.slice(0, 10) >= today).sort((a, b) => a.when.localeCompare(b.when));
  const body = '<div class="cal"><div class="cal-h"><b>' + esc(month) + "</b></div><div class=\"cal-w\">" + ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => "<span>" + d + "</span>").join("") + '</div><div class="cal-g">' + cells + "</div></div>" +
    "<h3 class=\"rm-sub\">Coming up</h3>" + (upcoming.length ? '<ul class="nl">' + upcoming.map(n => '<li class="nt-' + n.type + '"><span class="cal-dot nt-' + n.type + '"></span><div class="nt-b"><span class="nt-k">' + esc(fmtWhen(n.when)) + "</span><b>" + esc(n.title) + "</b>" + (n.body ? "<p>" + esc(n.body) + "</p>" : "") + "</div><span></span></li>").join("") + "</ul>" : '<p class="empty-s">No upcoming classes, homework or tests.</p>') +
    (ctx.readOnly ? "" : '<div class="g-actions"><button type="button" class="p-btn primary" data-book>Book a class</button></div>');
  const dlg = panel("Calendar", body, "rm-calendar");
  const b = dlg.querySelector("[data-book]");
  if (b) b.addEventListener("click", () => bookingDialog());
}

function diaryPanel(ctx) {
  const p = ctx.gameSummary.progress, me = ctx.me;
  const body = '<div class="diary"><section class="dy-lv"><div class="lv-badge">Lv ' + p.level + '</div><div class="xp"><div class="xp-bar"><i style="width:' + Math.round(p.into / p.need * 100) + '%"></i></div><span>' + (p.maxed ? "Top level reached" : p.into + " / " + p.need + " XP to level " + (p.level + 1)) + '</span></div><div class="coins"><span class="coin" aria-hidden="true"></span>' + Math.max(0, p.coins) + " coins</div></section>" +
    '<div class="cab-grid">' + streakCardHtml(me) + daysCardHtml(me) + levelCardHtml(me) + wordsCardHtml(ctx.words || wordStats(ctx.marks), ctx.readOnly) + "</div>" + heatHtml(me.activity) + "</div>";
  const dlg = panel("Diary", body, "rm-diary");
  const heat = dlg.querySelector("[data-heat]"); if (heat) heat.scrollLeft = heat.scrollWidth;
  const m = dlg.querySelector("[data-month]");
  if (m) { const n = Object.keys(me.activity || {}).filter(d => d.startsWith(m.dataset.month)).length; m.textContent = "This month: " + n + (n === 1 ? " day" : " days"); }
}

function libraryPanel(ctx) {
  const own = new Set(ctx.gameSummary.owned);
  const shows = ctx.config.items.filter(i => (i.type === "show" || i.type === "book") && own.has(i.id));
  const href = i => "/" + i.id;
  const body = (shows.length ? '<div class="shelf">' + shows.map(i => (ctx.readOnly ? '<div class="shelf-i">' : '<a class="shelf-i" href="' + esc(href(i)) + '">') + itemThumb(i) + "<b>" + esc(i.name) + "</b><span>" + esc(i.sub || (i.type === "book" ? "Book" : "Show")) + "</span>" + (ctx.readOnly ? "</div>" : "</a>")).join("") + "</div>"
    : '<p class="empty-s">' + (ctx.readOnly ? "No shows or books yet." : "Your bookshelf is empty. Shows and books you get in the shop appear here.") + "</p>") +
    (ctx.readOnly ? "" : '<div class="g-actions"><a class="p-btn primary" href="/shop" data-nav data-close>Find more in the shop</a></div>');
  panel("Bookshelf", body, "rm-library");
}
