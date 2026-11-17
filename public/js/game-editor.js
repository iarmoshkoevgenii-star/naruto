/* Teacher mode: Room & shop editor.
   - Shop list: the catalog (lib/catalog.js) by section. Every change saves straight away through
     POST /api/game?action=item.*|section.* and the page re-renders from the config in the answer.
   - Uploads: pictures; a piece (or the whole picture) becomes a new shop item, or a DVD spine.
   - Rules: levels, coins and XP, saved together with Save changes (config.json). */
import { api, esc, toast } from "./api.js";
import { itemThumb, spriteUrl } from "./room.js";
import { effectiveRules, moveId, SLOTS, ITEM_TYPES, CONTENT_TYPES } from "./game-model.js";

/* Types a picture can become (walls and floors are colour patterns, not pictures). */
const TYPES = ITEM_TYPES.filter(t => !["wallpaper", "floor"].includes(t));
const TYPE_LABEL = t => ({ plant: "Plant (2 spots)", wallpaper: "Wallpaper", floor: "Floor", book: "Book", show: "Show", movie: "Movie" }[t] || (SLOTS.find(s => s.id === t) || { label: t }).label);
const isContent = it => CONTENT_TYPES.includes(it.type);
const hasSpine = t => t === "show" || t === "movie";
const clone = o => JSON.parse(JSON.stringify(o));

/* Finds separate pieces in a sprite sheet: groups of non-transparent pixels, merged when they are
   at most `gap` pixels apart (so a chair's legs stay with the chair). */
export function findPieces(img, gap = 2) {
  const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
  const { data, width: W, height: H } = ctx.getImageData(0, 0, c.width, c.height);
  const seen = new Uint8Array(W * H), boxes = [];
  for (let i = 0; i < W * H; i++) {
    if (seen[i] || data[i * 4 + 3] < 16) continue;
    let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
    const stack = [i]; seen[i] = 1;
    while (stack.length) {
      const p = stack.pop(), x = p % W, y = (p - x) / W; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const q of [p - 1, p + 1, p - W, p + W]) {
        if (q < 0 || q >= W * H || seen[q] || (q === p - 1 && x === 0) || (q === p + 1 && x === W - 1)) continue;
        if (data[q * 4 + 3] >= 16) { seen[q] = 1; stack.push(q); }
      }
    }
    if (n >= 4) boxes.push([x0, y0, x1, y1]);
  }
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
      const A = boxes[a], B = boxes[b];
      if (A[0] - gap <= B[2] && B[0] - gap <= A[2] && A[1] - gap <= B[3] && B[1] - gap <= A[3]) {
        boxes[a] = [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[2], B[2]), Math.max(A[3], B[3])];
        boxes.splice(b, 1); merged = true; break outer;
      }
    }
  }
  return boxes.map(([x0, y0, x1, y1]) => [x0, y0, x1 - x0 + 1, y1 - y0 + 1]).sort((p, q) => p[1] - q[1] || p[0] - q[0]);
}

const readFile = file => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error("The file could not be read.")); r.readAsDataURL(file); });
const loadImage = src => new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error("This is not an image the browser can read.")); im.src = src; });

export async function gameEditorPage(main) {
  document.title = "Room & shop — Natalia’s Language School";
  main.innerHTML = '<p class="loading">Loading…</p>';
  const data = (await api("GET", "/api/game")).data;
  let conf = data.config;                  // the teacher's config: rules, sections, items of every status, assets
  let saved = { rules: clone((data.overrides || {}).rules || {}) };
  let ov = clone(saved);
  let tab = new URLSearchParams(location.search).get("t") || "shop";
  let filter = "all";                      // all (on sale + hidden) | hidden | deleted
  let picked = null;                       // {asset, rect} chosen in the slicer
  let dragId = null;
  const dirty = () => JSON.stringify(ov) !== JSON.stringify(saved);
  const itemOf = id => conf.items.find(i => i.id === id);
  const sectionOf = id => conf.sections.find(s => s.id === id) || { label: "" };
  /* A section's order the way the API wants it: every item that isn't deleted, in shop order. */
  const orderOf = sectionId => conf.items.filter(i => i.sectionId === sectionId && i.status !== "deleted").map(i => i.id);
  const sectionOptions = cur => conf.sections.map(s => '<option value="' + esc(s.id) + '"' + (s.id === cur ? " selected" : "") + ">" + esc(s.label) + "</option>").join("");
  const rowSel = id => 'tr[data-id="' + id + '"]';

  /* Sends one catalog change. The answer carries the whole teacher config, so the page re-renders from
     it. On an error the page re-renders too, which puts the old value back. focus: selectors to try
     afterwards (keyboard reordering keeps its place). */
  async function change(action, body, done, { focus, rerender = true, renderOnError = rerender } = {}) {
    try {
      const { data: d } = await api("POST", "/api/game?action=" + action, body);
      conf = d.config;
      if (rerender) { render(); refocus(focus); }
      toast(done);
      return d.result;
    } catch (err) {
      toast(err.message);
      if (renderOnError) render();
      return null;
    }
  }
  const refocus = sel => { for (const s of [].concat(sel || [])) { const el = main.querySelector(s); if (el && !el.disabled) { el.focus(); return; } } };

  /* ---------- Shop list ---------- */
  function itemRow(it, ordering, first, last) {
    const deleted = it.status === "deleted", dis = deleted ? " disabled" : "", name = esc(it.name);
    const order = ordering
      ? '<span class="ge-drag" title="Drag to reorder" aria-hidden="true">⠿</span><button type="button" class="ge-mv" data-up aria-label="Move ' + name + ' up"' + (first ? " disabled" : "") + '>↑</button><button type="button" class="ge-mv" data-down aria-label="Move ' + name + ' down"' + (last ? " disabled" : "") + ">↓</button>"
      : "";
    const starting = isContent(it)
      ? '<input type="color" class="ge-color" data-f="cover" value="' + esc(it.cover || "#1E5C62") + '" aria-label="Cover colour of ' + name + '" title="Cover colour"' + dis + ">"
      : '<input type="checkbox" data-f="default"' + (it.default ? " checked" : "") + ' aria-label="' + name + ' is a starting item"' + dis + ">";
    const acts = deleted ? '<button type="button" class="link-b" data-restore>Restore</button>'
      : (it.status === "hidden" ? '<button type="button" class="link-b" data-unhide>Put on sale</button>' : '<button type="button" class="link-b" data-hide>Hide</button>') +
        '<button type="button" class="link-b danger" data-delete>Delete</button>';
    const notes = [esc(TYPE_LABEL(it.type))];
    if (it.status === "hidden") notes.push('<b class="ge-chip">Hidden</b>');
    if (hasSpine(it.type) && it.spine) notes.push("has a DVD spine");
    return '<tr data-id="' + esc(it.id) + '"' + (it.status !== "active" ? ' class="ge-off"' : "") + ">" +
      '<td class="ge-order">' + order + "</td>" +
      '<td class="ge-pic">' + itemThumb(it, 2) + "</td>" +
      '<td><input class="ge-in" data-f="name" maxlength="60" value="' + name + '" aria-label="Name"' + dis + "><small>" + notes.join(" · ") + "</small></td>" +
      '<td><input class="ge-in num" type="number" min="0" step="1" data-f="price" value="' + it.price + '" aria-label="Price of ' + name + '"' + dis + "></td>" +
      '<td><input class="ge-in num" type="number" min="1" step="1" data-f="minLevel" value="' + it.minLevel + '" aria-label="Level for ' + name + '"' + dis + "></td>" +
      '<td><select class="ge-in" data-f="sectionId" aria-label="Section of ' + name + '"' + dis + ">" + sectionOptions(it.sectionId) + "</select></td>" +
      "<td>" + starting + "</td>" +
      '<td class="ge-acts">' + acts + "</td></tr>";
  }

  function shopTab() {
    const count = s => conf.items.filter(i => i.status === s).length;
    const shown = it => (filter === "all" ? it.status !== "deleted" : it.status === filter);
    const ordering = filter === "all";
    const head = '<thead><tr><th></th><th></th><th>Name</th><th>Price</th><th>Level</th><th>Section</th><th>Starting item or cover</th><th></th></tr></thead>';
    const secs = conf.sections.map((s, i) => {
      const order = orderOf(s.id), rows = conf.items.filter(it => it.sectionId === s.id && shown(it)), label = esc(s.label);
      return '<section class="ge-sec" data-sec="' + esc(s.id) + '"><div class="ge-sec-h">' +
        '<input class="ge-in ge-sec-name" data-sec-label maxlength="40" value="' + label + '" aria-label="Name of the section ' + label + '">' +
        '<button type="button" class="ge-mv" data-sec-up aria-label="Move the section ' + label + ' up"' + (i === 0 ? " disabled" : "") + ">↑</button>" +
        '<button type="button" class="ge-mv" data-sec-down aria-label="Move the section ' + label + ' down"' + (i === conf.sections.length - 1 ? " disabled" : "") + ">↓</button>" +
        '<span class="note">' + order.length + (order.length === 1 ? " item" : " items") + "</span>" +
        (order.length ? "" : '<button type="button" class="link-b danger" data-sec-del>Delete section</button>') + "</div>" +
        (rows.length ? '<div class="tbl"><table class="ge-t">' + head + "<tbody>" + rows.map(it => itemRow(it, ordering, order[0] === it.id, order[order.length - 1] === it.id)).join("") + "</tbody></table></div>"
          : '<p class="empty-s">' + ({ all: "No items in this section yet.", hidden: "Nothing hidden here.", deleted: "Nothing deleted here." }[filter]) + "</p>") +
        "</section>";
    }).join("");
    return '<p class="note">Students start with the <b>starting items</b> (one per kind) and can buy the rest. <b>Hidden</b> and <b>deleted</b> items leave the shop; students who bought them keep them. Every change is saved straight away. Drag ⠿ or use ↑ ↓ to change the order.</p>' +
      '<div class="filters" role="group" aria-label="Show">' + [["all", "Shop"], ["hidden", "Hidden (" + count("hidden") + ")"], ["deleted", "Deleted (" + count("deleted") + ")"]].map(([k, l]) => '<button type="button" data-filter="' + k + '" aria-pressed="' + (k === filter) + '">' + l + "</button>").join("") + "</div>" +
      secs +
      '<form class="ge-add-sec" data-add-sec><label class="p-field"><span>New section</span><input name="label" maxlength="40" required placeholder="Posters"></label><button type="submit" class="p-btn">Add section</button></form>';
  }

  /* ---------- Uploads ---------- */
  function uploadsTab() {
    const assets = conf.assets || [];
    return '<p class="note">Upload a sprite sheet or a single picture. The pieces are found automatically; click one (or use the whole picture) to add it to the shop, or to use it as the DVD spine of a show.</p>' +
      '<div class="g-actions"><label class="p-btn primary"><input type="file" accept="image/png,image/webp,image/gif,image/jpeg" data-upload hidden>Upload a picture</label><span class="note" data-up-state></span></div>' +
      (assets.length ? '<div class="ge-assets">' + assets.map(a => '<button type="button" class="ge-asset" data-asset="' + a.id + '"><img src="/api/game?asset=' + a.id + '" alt=""><span>' + esc(a.name) + "</span><small>" + a.w + "×" + a.h + "</small></button>").join("") + "</div>" : '<p class="empty-s">No pictures uploaded yet.</p>') +
      '<div data-slicer></div>';
  }

  /* ---------- Rules ---------- */
  function rulesTab() {
    const r = effectiveRules(ov.rules), n = (f, v, label, hint = "", min = 0) => '<label class="p-field"><span>' + label + '</span><input type="number" min="' + min + '" data-rule="' + f + '" value="' + v + '">' + (hint ? "<small>" + hint + "</small>" : "") + "</label>";
    return '<p class="warn">Levels and coins are calculated from each student’s total XP, so changing XP per level or coins per level recalculates everyone’s level and coins straight away.</p>' +
      '<div class="ge-rules">' + n("maxLevel", r.maxLevel, "Number of levels", "", 1) + n("xpPerLevel", r.xpPerLevel, "XP per level", "", 1) + n("coinsPerLevel", r.coinsPerLevel, "Coins for each level up") + n("startCoins", r.startCoins, "Starting coins") + "</div>" +
      '<h3 class="rm-sub">XP for activities</h3><div class="tbl"><table class="ge-t"><thead><tr><th>Activity</th><th>XP</th><th>Daily limit</th><th>Minimum words</th><th>Only once</th></tr></thead><tbody>' +
      Object.entries(r.activities).map(([k, a]) => '<tr data-act="' + k + '"><td>' + esc(a.label) + "</td><td><input class=\"ge-in num\" type=\"number\" min=\"0\" data-a=\"xp\" value=\"" + a.xp + '"></td><td><input class="ge-in num" type="number" min="0" data-a="dailyCap" value="' + (a.dailyCap || 0) + '" title="0 means no limit"></td><td>' + (k === "training" ? '<input class="ge-in num" type="number" min="0" data-a="minAnswers" value="' + (a.minAnswers || 0) + '">' : "") + '</td><td><input type="checkbox" data-a="once"' + (a.once ? " checked" : "") + "></td></tr>").join("") +
      '</tbody></table></div><p class="note">Daily limit 0 means no limit. “Only once” gives XP once per episode or per homework.</p>';
  }

  function render() {
    main.innerHTML = '<div class="ge"><a class="back" href="/" data-nav>← Students</a><div class="page-h"><div><h1>Room &amp; shop</h1><p class="lede">The shop’s items and sections, pictures, and the XP rules of the room game.</p></div>' +
      '<div class="t-top"><a class="p-btn" href="/shop" data-nav>Preview the shop</a>' + (tab === "rules" || dirty() ? '<button type="button" class="p-btn primary" data-save' + (dirty() ? "" : " disabled") + ">" + (dirty() ? "Save rules" : "Saved") + "</button>" : "") + "</div></div>" +
      '<div class="seg-ctl" role="group" aria-label="Sections">' + [["shop", "Shop list"], ["uploads", "Uploads"], ["rules", "Rules"]].map(([k, l]) => '<button type="button" data-tab="' + k + '" aria-pressed="' + (k === tab) + '">' + l + "</button>").join("") + "</div>" +
      '<div class="ge-body">' + ({ shop: shopTab, uploads: uploadsTab, rules: rulesTab }[tab] || shopTab)() + "</div></div>";
  }
  const markDirty = () => { const b = main.querySelector("[data-save]"); if (b) { b.disabled = !dirty(); b.textContent = dirty() ? "Save rules" : "Saved"; } };

  main.addEventListener("input", e => {
    const t = e.target;
    if (t.dataset.rule) { ov.rules[t.dataset.rule] = Math.max(t.dataset.rule === "coinsPerLevel" || t.dataset.rule === "startCoins" ? 0 : 1, Math.round(Number(t.value) || 0)); markDirty(); return; }
    const ar = t.closest("tr[data-act]");
    if (ar && t.dataset.a && t.type !== "checkbox") {
      ov.rules.activities = ov.rules.activities || {};
      ov.rules.activities[ar.dataset.act] = { ...(ov.rules.activities[ar.dataset.act] || {}), [t.dataset.a]: Math.max(0, Math.round(Number(t.value) || 0)) };
      markDirty();
    }
  });

  main.addEventListener("change", async e => {
    const t = e.target;
    const row = t.closest("tr[data-id]");
    if (row && t.dataset.f) {
      const id = row.dataset.id, it = itemOf(id), f = t.dataset.f;
      if (!it) return;
      if (f === "default") {
        if (!t.checked) { t.checked = true; toast("Choose another starting item of this kind instead"); return; }
        change("item.update", { id, isDefault: true }, it.name + " is the starting " + TYPE_LABEL(it.type).toLowerCase() + " now");
        return;
      }
      if (f === "sectionId") { change("item.update", { id, sectionId: t.value }, it.name + " moved to “" + sectionOf(t.value).label + "”"); return; }
      const value = f === "price" || f === "minLevel" ? (t.value.trim() === "" ? null : Number(t.value)) : t.value;
      // name, price, level, cover: keep the page (and the keyboard focus) as it is
      change("item.update", { id, [f]: value }, "Saved", { rerender: false, renderOnError: true });
      return;
    }
    if (t.matches("[data-sec-label]")) {
      change("section.rename", { id: t.closest("[data-sec]").dataset.sec, label: t.value }, "Section renamed", { rerender: false, renderOnError: true });
      return;
    }
    const ar = t.closest("tr[data-act]");
    if (ar && t.type === "checkbox") {
      ov.rules.activities = ov.rules.activities || {};
      ov.rules.activities[ar.dataset.act] = { ...(ov.rules.activities[ar.dataset.act] || {}), once: t.checked };
      markDirty(); return;
    }
    if (t.matches("[data-upload]")) {
      const file = t.files && t.files[0]; t.value = "";
      if (!file) return;
      const state = main.querySelector("[data-up-state]");
      try {
        state.textContent = "Uploading…";
        const dataUrl = await readFile(file), img = await loadImage(dataUrl);
        const { data: d } = await api("POST", "/api/game?action=upload", { name: file.name, dataUrl, w: img.naturalWidth, h: img.naturalHeight });
        conf.assets = [d.asset, ...(conf.assets || []).filter(a => a.id !== d.asset.id)];
        render(); openSlicer(d.asset);
        toast("Picture uploaded");
      } catch (err) { state.textContent = ""; toast(err.message); }
    }
  });

  main.addEventListener("click", async e => {
    const t = e.target;
    const tb = t.closest("[data-tab]"); if (tb) { tab = tb.dataset.tab; history.replaceState(null, "", "/room-editor?t=" + tab); render(); return; }
    const fl = t.closest("[data-filter]"); if (fl) { filter = fl.dataset.filter; render(); return; }
    const as = t.closest("[data-asset]"); if (as) { openSlicer((conf.assets || []).find(a => a.id === as.dataset.asset)); return; }
    const row = t.closest("tr[data-id]");
    if (row) {
      const id = row.dataset.id, it = itemOf(id);
      if (!it) return;
      const mv = t.closest("[data-up],[data-down]");
      if (mv) {
        const up = mv.hasAttribute("data-up"), order = orderOf(it.sectionId);
        const sel = rowSel(id);
        change("item.reorder", { sectionId: it.sectionId, ids: moveId(order, id, order.indexOf(id) + (up ? -1 : 1)) }, it.name + " moved " + (up ? "up" : "down"),
          { focus: [sel + (up ? " [data-up]" : " [data-down]"), sel + (up ? " [data-down]" : " [data-up]")] });
        return;
      }
      const st = ["hide", "unhide", "delete", "restore"].find(k => t.closest("[data-" + k + "]"));
      if (st) {
        const msg = {
          hide: it.name + " is hidden: it left the shop, students who bought it keep it",
          unhide: it.name + " is on sale again",
          delete: it.name + " is deleted. It’s under “Deleted” if you want it back",
          restore: it.name + " is back in the shop",
        }[st];
        change("item." + st, { id }, msg);
      }
      return;
    }
    const sec = t.closest("[data-sec]");
    if (sec) {
      const sid = sec.dataset.sec, ids = conf.sections.map(s => s.id), label = sectionOf(sid).label;
      const smv = t.closest("[data-sec-up],[data-sec-down]");
      if (smv) {
        const up = smv.hasAttribute("data-sec-up"), sel = '[data-sec="' + sid + '"] ';
        change("section.reorder", { ids: moveId(ids, sid, ids.indexOf(sid) + (up ? -1 : 1)) }, "“" + label + "” moved " + (up ? "up" : "down"),
          { focus: [sel + (up ? "[data-sec-up]" : "[data-sec-down]"), sel + (up ? "[data-sec-down]" : "[data-sec-up]")] });
        return;
      }
      if (t.closest("[data-sec-del]")) { change("section.delete", { id: sid }, "Section “" + label + "” deleted"); return; }
    }
    if (t.closest("[data-save]")) {
      const b = t.closest("[data-save]"); b.disabled = true; b.textContent = "Saving…";
      try { await api("POST", "/api/game?action=config", { overrides: { rules: ov.rules } }); saved = clone(ov); toast("Saved: students see the changes now"); render(); }
      catch (err) { toast(err.message + (err.data && err.data.errors ? " " + err.data.errors.join(" ") : "")); b.disabled = false; b.textContent = "Save rules"; }
    }
  });

  main.addEventListener("submit", e => {
    if (!e.target.matches("[data-add-sec]")) return;
    e.preventDefault();
    const input = e.target.elements.namedItem("label"), label = input.value.trim();
    if (!label) { input.focus(); return; }
    change("section.create", { label }, "Section “" + label + "” added", { focus: "[data-add-sec] input" });
  });

  /* Drag and drop inside a section. A row becomes draggable only while the ⠿ handle is held, so text
     in the row's fields can still be selected with the mouse. */
  const clearDrop = () => main.querySelectorAll(".ge-drop-before,.ge-drop-after,.ge-dragging").forEach(r => r.classList.remove("ge-drop-before", "ge-drop-after", "ge-dragging"));
  const dropTarget = e => {
    const row = e.target.closest && e.target.closest("tr[data-id]");
    if (!row || !dragId || row.dataset.id === dragId) return null;
    const a = itemOf(dragId), b = itemOf(row.dataset.id);
    if (!a || !b || a.sectionId !== b.sectionId) return null;
    const r = row.getBoundingClientRect();
    return { row, after: e.clientY > r.top + r.height / 2 };
  };
  main.addEventListener("pointerdown", e => { const h = e.target.closest(".ge-drag"); if (h) h.closest("tr").draggable = true; });
  main.addEventListener("pointerup", () => main.querySelectorAll("tr[draggable=true]").forEach(r => { r.draggable = false; }));
  main.addEventListener("dragstart", e => {
    const row = e.target.closest && e.target.closest("tr[data-id]");
    if (!row || !row.draggable) return;
    dragId = row.dataset.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragId);
    row.classList.add("ge-dragging");
  });
  main.addEventListener("dragover", e => {
    const d = dropTarget(e);
    if (!d) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    main.querySelectorAll(".ge-drop-before,.ge-drop-after").forEach(r => r !== d.row && r.classList.remove("ge-drop-before", "ge-drop-after"));
    d.row.classList.toggle("ge-drop-after", d.after);
    d.row.classList.toggle("ge-drop-before", !d.after);
  });
  main.addEventListener("drop", e => {
    const d = dropTarget(e);
    if (!d) return;
    e.preventDefault();
    const it = itemOf(dragId), order = orderOf(it.sectionId), rest = order.filter(x => x !== dragId);
    const ids = [...rest];
    ids.splice(rest.indexOf(d.row.dataset.id) + (d.after ? 1 : 0), 0, dragId);
    const name = it.name;
    dragId = null; clearDrop();
    if (ids.join("\n") !== order.join("\n")) change("item.reorder", { sectionId: it.sectionId, ids }, name + " moved");
  });
  main.addEventListener("dragend", e => {
    dragId = null; clearDrop();
    const row = e.target.closest && e.target.closest("tr[data-id]");
    if (row) row.draggable = false;
  });

  window.addEventListener("beforeunload", e => { if (dirty() && main.isConnected) { e.preventDefault(); e.returnValue = ""; } });

  async function openSlicer(asset) {
    const box = main.querySelector("[data-slicer]");
    if (!box || !asset) return;
    box.innerHTML = '<p class="loading">Finding pieces…</p>';
    const img = await loadImage("/api/game?asset=" + asset.id);
    const pieces = findPieces(img);
    const zoom = Math.max(1, Math.min(4, Math.floor(860 / img.naturalWidth)));
    picked = null;
    box.innerHTML = '<section class="card ge-slicer"><div class="card-h"><h2>' + esc(asset.name) + '</h2><span class="note">' + pieces.length + (pieces.length === 1 ? " piece" : " pieces") + ' found. Click one, or use the whole picture.</span></div>' +
      '<div class="ge-sheet" style="width:' + img.naturalWidth * zoom + "px;height:" + img.naturalHeight * zoom + 'px"><img src="' + spriteUrl({ asset: asset.id }) + '" alt="" style="width:' + img.naturalWidth * zoom + 'px">' +
      pieces.map((p, i) => '<button type="button" class="ge-piece" data-piece="' + i + '" style="left:' + p[0] * zoom + "px;top:" + p[1] * zoom + "px;width:" + p[2] * zoom + "px;height:" + p[3] * zoom + 'px" aria-label="Piece ' + (i + 1) + ", " + p[2] + "×" + p[3] + '"></button>').join("") + "</div>" +
      '<div class="g-actions"><button type="button" class="p-btn small" data-whole>Use the whole picture</button></div><div data-newitem></div></section>';

    /* Which section new items of a type usually go to: where most items of that type already are. */
    const guessSection = type => {
      const n = {};
      for (const i of conf.items) if (i.type === type && i.status !== "deleted") n[i.sectionId] = (n[i.sectionId] || 0) + 1;
      const best = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
      return best ? best[0] : (conf.sections[0] || {}).id;
    };
    const form = rect => {
      picked = { asset: asset.id, rect };
      const types = [...TYPES.filter(t => !CONTENT_TYPES.includes(t)), ...TYPES.filter(t => CONTENT_TYPES.includes(t))];
      const titles = conf.items.filter(i => hasSpine(i.type) && i.status !== "deleted");
      const out = box.querySelector("[data-newitem]");
      out.innerHTML = '<form class="ge-new" data-new-item>' +
        '<div class="ge-prev">' + itemThumb({ sprite: picked }, 3) + "<small>" + rect[2] + "×" + rect[3] + " px</small></div>" +
        '<label class="p-field"><span>Name</span><input name="name" required maxlength="60" placeholder="Velvet armchair"></label>' +
        '<label class="p-field"><span>What it is</span><select name="type">' + types.map(t => '<option value="' + t + '">' + esc(TYPE_LABEL(t)) + "</option>").join("") + "</select></label>" +
        '<label class="p-field"><span>Section</span><select name="sectionId">' + sectionOptions(guessSection(types[0])) + "</select></label>" +
        '<label class="p-field"><span>Price</span><input name="price" type="number" min="0" step="1" value="1"></label>' +
        '<label class="p-field"><span>Level</span><input name="minLevel" type="number" min="1" step="1" value="1"></label>' +
        '<label class="p-field" data-for="content"><span>Subtitle</span><input name="sub" maxlength="120" placeholder="Season 1"></label>' +
        '<label class="p-field" data-for="content"><span>Cover colour</span><input type="color" name="cover" value="#1E5C62"></label>' +
        '<label class="p-check" data-for="spine"><input type="checkbox" name="spine" checked> Use the whole picture as its DVD spine</label>' +
        '<label class="p-check" data-for="thing"><input type="checkbox" name="default"> Starting item (replaces the current one for everyone)</label>' +
        '<div class="g-actions"><button type="submit" class="p-btn primary">Add to the shop</button></div></form>' +
        (titles.length ? '<form class="ge-new" data-set-spine><label class="p-field"><span>Or make the whole picture the DVD spine of</span><select name="id">' +
          titles.map(i => '<option value="' + esc(i.id) + '">' + esc(i.name) + (i.spine ? " (has one)" : "") + "</option>").join("") + '</select></label><div class="g-actions"><button type="submit" class="p-btn">Set as DVD spine</button></div></form>' : "");
      const f = out.querySelector("[data-new-item]"), el = n => f.elements.namedItem(n);
      const sync = () => {
        const t = el("type").value, content = CONTENT_TYPES.includes(t);
        f.querySelectorAll("[data-for]").forEach(x => { x.hidden = !{ content, spine: hasSpine(t), thing: !content }[x.dataset.for]; });
      };
      el("type").addEventListener("change", () => { el("sectionId").value = guessSection(el("type").value); sync(); });
      sync();
      f.addEventListener("submit", async ev => {
        ev.preventDefault();
        const name = el("name").value.trim(), type = el("type").value, content = CONTENT_TYPES.includes(type);
        if (!name) { el("name").focus(); return; }
        const num = v => (String(v).trim() === "" ? null : Number(v));
        const body = { name, type, sectionId: el("sectionId").value, price: num(el("price").value), minLevel: num(el("minLevel").value) };
        if (content) {
          body.cover = el("cover").value;
          if (el("sub").value.trim()) body.sub = el("sub").value.trim();
          if (hasSpine(type) && el("spine").checked) body.spine = asset.id;
        } else {
          body.sprite = picked;
          if (el("default").checked) body.isDefault = true;
        }
        const btn = f.querySelector("[type=submit]"); btn.disabled = true;
        const it = await change("item.create", body, name + " is in the shop now", { rerender: false });
        btn.disabled = false;
        if (it) out.innerHTML = '<p class="note">' + esc(it.name) + " was added to “" + esc(sectionOf(it.sectionId).label) + "”. Pick another piece, or open the " +
          '<button type="button" class="link-b" data-tab="shop">Shop list</button> to change its place.</p>';
      });
      const sp = out.querySelector("[data-set-spine]");
      if (sp) sp.addEventListener("submit", async ev => {
        ev.preventDefault();
        const id = sp.elements.namedItem("id").value, it = itemOf(id);
        const done = await change("item.update", { id, spine: asset.id }, "This picture is the DVD spine of " + (it ? it.name : "the title") + " now", { rerender: false });
        if (done) sp.querySelector("option[value='" + id.replace(/'/g, "") + "']").textContent = done.name + " (has one)";
      });
      el("name").focus();
    };
    box.querySelector(".ge-sheet").addEventListener("click", ev => {
      const b = ev.target.closest("[data-piece]"); if (!b) return;
      box.querySelectorAll(".ge-piece").forEach(x => x.classList.toggle("on", x === b));
      form(pieces[+b.dataset.piece]);
    });
    box.querySelector("[data-whole]").addEventListener("click", () => form([0, 0, img.naturalWidth, img.naturalHeight]));
    box.scrollIntoView({ block: "start" });
  }

  render();
}
