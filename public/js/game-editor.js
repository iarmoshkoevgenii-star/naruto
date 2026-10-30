/* Teacher mode: Room & shop editor. Edits are kept as "overrides" on top of the built-in defaults
   (game-model.js) and saved together with Save changes. */
import { api, esc, toast } from "./api.js";
import { itemThumb, spriteUrl } from "./room.js";
import { effectiveConfig, SLOTS } from "./game-model.js";

const TYPES = [...new Set(SLOTS.map(s => s.id.replace(/\d+$/, "")))].concat(["book"]);
const TYPE_LABEL = t => ({ plant: "Plant (2 spots)", wallpaper: "Wallpaper", floor: "Floor", book: "Book" }[t] || (SLOTS.find(s => s.id === t) || { label: t }).label);
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
  let saved = clone(data.overrides || { rules: {}, items: {}, removed: [], assets: [] });
  let ov = clone(saved);
  ov.rules = ov.rules || {}; ov.items = ov.items || {}; ov.assets = ov.assets || [];
  let tab = new URLSearchParams(location.search).get("t") || "shop";
  let picked = null; // {asset, rect}
  const dirty = () => JSON.stringify(ov) !== JSON.stringify(saved);
  const cfg = () => effectiveConfig(ov);
  const setItem = (id, patch) => { ov.items[id] = { ...(ov.items[id] || {}), ...patch }; };

  function shopTab() {
    const items = cfg().items;
    const rows = items.map(it => {
      const editable = !!it.sprite || !!it.surface || it.type === "show" || it.type === "book";
      return '<tr data-id="' + esc(it.id) + '"><td class="ge-pic">' + (editable ? itemThumb(it, 2) : "") + "</td>" +
        '<td><input class="ge-in" data-f="name" value="' + esc(it.name) + '" aria-label="Name"><small>' + esc(TYPE_LABEL(it.type)) + (it.builtin ? "" : ", your item") + "</small></td>" +
        '<td><input class="ge-in num" type="number" min="0" data-f="price" value="' + (it.price ?? 0) + '" aria-label="Price"></td>' +
        '<td><input class="ge-in num" type="number" min="1" data-f="minLevel" value="' + (it.minLevel ?? 1) + '" aria-label="Level"></td>' +
        '<td><input type="checkbox" data-f="active"' + (it.active !== false ? " checked" : "") + ' aria-label="On sale"></td>' +
        "<td>" + (it.type === "show" || it.type === "book" ? "" : '<input type="checkbox" data-f="default"' + (it.default ? " checked" : "") + ' aria-label="Starting item">') + "</td>" +
        "<td>" + (it.builtin ? "" : '<button type="button" class="link-b danger" data-del>Delete</button>') + "</td></tr>";
    }).join("");
    return '<p class="note">Students start with the <b>starting items</b> (one per kind) and can buy the rest. Unticking <b>On sale</b> hides an item from the shop; students who bought it keep it.</p>' +
      '<div class="tbl"><table class="ge-t"><thead><tr><th></th><th>Name</th><th>Price</th><th>Level</th><th>On sale</th><th>Starting item</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>";
  }

  function uploadsTab() {
    const assets = ov.assets || [];
    return '<p class="note">Upload a sprite sheet or a single picture. The pieces are found automatically; click one to make it a shop item or a starting item.</p>' +
      '<div class="g-actions"><label class="p-btn primary"><input type="file" accept="image/png,image/webp,image/gif,image/jpeg" data-upload hidden>Upload a picture</label><span class="note" data-up-state></span></div>' +
      (assets.length ? '<div class="ge-assets">' + assets.map(a => '<button type="button" class="ge-asset" data-asset="' + a.id + '"><img src="/api/game?asset=' + a.id + '" alt=""><span>' + esc(a.name) + "</span><small>" + a.w + "×" + a.h + "</small></button>").join("") + "</div>" : '<p class="empty-s">No pictures uploaded yet.</p>') +
      '<div data-slicer></div>';
  }

  function rulesTab() {
    const r = cfg().rules, n = (f, v, label, hint = "", min = 0) => '<label class="p-field"><span>' + label + '</span><input type="number" min="' + min + '" data-rule="' + f + '" value="' + v + '">' + (hint ? "<small>" + hint + "</small>" : "") + "</label>";
    return '<p class="warn">Levels and coins are calculated from each student’s total XP, so changing XP per level or coins per level recalculates everyone’s level and coins straight away.</p>' +
      '<div class="ge-rules">' + n("maxLevel", r.maxLevel, "Number of levels", "", 1) + n("xpPerLevel", r.xpPerLevel, "XP per level", "", 1) + n("coinsPerLevel", r.coinsPerLevel, "Coins for each level up") + n("startCoins", r.startCoins, "Starting coins") + "</div>" +
      '<h3 class="rm-sub">XP for activities</h3><div class="tbl"><table class="ge-t"><thead><tr><th>Activity</th><th>XP</th><th>Daily limit</th><th>Minimum words</th><th>Only once</th></tr></thead><tbody>' +
      Object.entries(r.activities).map(([k, a]) => '<tr data-act="' + k + '"><td>' + esc(a.label) + "</td><td><input class=\"ge-in num\" type=\"number\" min=\"0\" data-a=\"xp\" value=\"" + a.xp + '"></td><td><input class="ge-in num" type="number" min="0" data-a="dailyCap" value="' + (a.dailyCap || 0) + '" title="0 means no limit"></td><td>' + (k === "training" ? '<input class="ge-in num" type="number" min="0" data-a="minAnswers" value="' + (a.minAnswers || 0) + '">' : "") + '</td><td><input type="checkbox" data-a="once"' + (a.once ? " checked" : "") + "></td></tr>").join("") +
      '</tbody></table></div><p class="note">Daily limit 0 means no limit. “Only once” gives XP once per episode or per homework.</p>';
  }

  function render() {
    main.innerHTML = '<div class="ge"><a class="back" href="/" data-nav>← Students</a><div class="page-h"><div><h1>Room &amp; shop</h1><p class="lede">Prices, levels, pictures and the XP rules of the room game.</p></div>' +
      '<div class="t-top"><a class="p-btn" href="/shop" data-nav>Preview the shop</a><button type="button" class="p-btn primary" data-save' + (dirty() ? "" : " disabled") + ">" + (dirty() ? "Save changes" : "Saved") + "</button></div></div>" +
      '<div class="seg-ctl" role="group" aria-label="Sections">' + [["shop", "Shop list"], ["uploads", "Uploads"], ["rules", "Rules"]].map(([k, l]) => '<button type="button" data-tab="' + k + '" aria-pressed="' + (k === tab) + '">' + l + "</button>").join("") + "</div>" +
      '<div class="ge-body">' + ({ shop: shopTab, uploads: uploadsTab, rules: rulesTab }[tab])() + "</div></div>";
  }
  const markDirty = () => { const b = main.querySelector("[data-save]"); if (b) { b.disabled = !dirty(); b.textContent = dirty() ? "Save changes" : "Saved"; } };

  main.addEventListener("input", e => {
    const t = e.target;
    const row = t.closest("tr[data-id]");
    if (row && t.dataset.f && t.type !== "checkbox") {
      const v = t.type === "number" ? Math.max(0, Math.round(Number(t.value) || 0)) : t.value;
      setItem(row.dataset.id, { [t.dataset.f]: t.dataset.f === "minLevel" ? Math.max(1, v) : v });
      markDirty(); return;
    }
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
    if (row && t.type === "checkbox") {
      const id = row.dataset.id;
      if (t.dataset.f === "default" && t.checked) {
        const type = cfg().items.find(i => i.id === id).type;
        cfg().items.filter(i => i.type === type && i.id !== id && i.default).forEach(i => setItem(i.id, { default: false }));
        setItem(id, { default: true }); render(); markDirty(); return;
      }
      if (t.dataset.f === "default" && !t.checked) { t.checked = true; toast("Choose another starting item of this kind instead"); return; }
      setItem(id, { [t.dataset.f]: t.checked }); markDirty(); return;
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
        const { data } = await api("POST", "/api/game?action=upload", { name: file.name, dataUrl, w: img.naturalWidth, h: img.naturalHeight });
        ov.assets = [...(ov.assets || []).filter(a => a.id !== data.asset.id), data.asset];
        saved.assets = clone(ov.assets);
        render(); openSlicer(data.asset);
        toast("Picture uploaded");
      } catch (err) { state.textContent = ""; toast(err.message); }
    }
  });
  main.addEventListener("click", async e => {
    const t = e.target;
    const tb = t.closest("[data-tab]"); if (tb) { tab = tb.dataset.tab; history.replaceState(null, "", "/room-editor?t=" + tab); render(); return; }
    const del = t.closest("[data-del]");
    if (del) { const id = del.closest("tr").dataset.id; delete ov.items[id]; render(); markDirty(); return; }
    const as = t.closest("[data-asset]"); if (as) { openSlicer((ov.assets || []).find(a => a.id === as.dataset.asset)); return; }
    if (t.closest("[data-save]")) {
      const b = t.closest("[data-save]"); b.disabled = true; b.textContent = "Saving…";
      try { await api("POST", "/api/game?action=config", { overrides: ov }); saved = clone(ov); toast("Saved: students see the changes now"); render(); }
      catch (err) { toast(err.message + (err.data && err.data.errors ? " " + err.data.errors.join(" ") : "")); b.disabled = false; b.textContent = "Save changes"; }
    }
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
    box.innerHTML = '<section class="card ge-slicer"><div class="card-h"><h2>' + esc(asset.name) + '</h2><span class="note">' + pieces.length + ' pieces found. Click one, or use the whole picture.</span></div>' +
      '<div class="ge-sheet" style="width:' + img.naturalWidth * zoom + "px;height:" + img.naturalHeight * zoom + 'px"><img src="' + spriteUrl({ asset: asset.id }) + '" alt="" style="width:' + img.naturalWidth * zoom + 'px">' +
      pieces.map((p, i) => '<button type="button" class="ge-piece" data-piece="' + i + '" style="left:' + p[0] * zoom + "px;top:" + p[1] * zoom + "px;width:" + p[2] * zoom + "px;height:" + p[3] * zoom + 'px" aria-label="Piece ' + (i + 1) + ", " + p[2] + "×" + p[3] + '"></button>').join("") + "</div>" +
      '<div class="g-actions"><button type="button" class="p-btn small" data-whole>Use the whole picture</button></div><div data-newitem></div></section>';
    const form = rect => {
      picked = { asset: asset.id, rect };
      box.querySelector("[data-newitem]").innerHTML = '<form class="ge-new"><div class="ge-prev">' + itemThumb({ sprite: picked }, 3) + "<small>" + rect[2] + "×" + rect[3] + " px</small></div>" +
        '<label class="p-field"><span>Name</span><input name="name" required maxlength="60" placeholder="Velvet armchair"></label>' +
        '<label class="p-field"><span>Where it goes</span><select name="type">' + TYPES.filter(t => !["wallpaper", "floor", "book"].includes(t)).map(t => '<option value="' + t + '">' + esc(TYPE_LABEL(t)) + "</option>").join("") + "</select></label>" +
        '<label class="p-field"><span>Price</span><input name="price" type="number" min="0" value="1"></label><label class="p-field"><span>Level</span><input name="minLevel" type="number" min="1" value="1"></label>' +
        '<label class="p-check"><input type="checkbox" name="default"> Starting item (replaces the current one for everyone)</label>' +
        '<div class="g-actions"><button type="submit" class="p-btn primary">Add to the shop</button></div></form>';
      box.querySelector(".ge-new").addEventListener("submit", ev => {
        ev.preventDefault();
        const f = ev.target, name = f.name.value.trim();
        if (!name) { f.name.focus(); return; }
        const type = f.type.value, id = "u-" + asset.id.slice(0, 8) + "-" + rect.join("-");
        if (f.default.checked) cfg().items.filter(i => i.type === type && i.default).forEach(i => setItem(i.id, { default: false }));
        ov.items[id] = { name, type, sprite: picked, price: Math.max(0, +f.price.value || 0), minLevel: Math.max(1, +f.minLevel.value || 1), default: f.default.checked, active: true };
        toast(name + " added. Save changes to publish it.");
        markDirty();
        box.querySelector("[data-newitem]").innerHTML = '<p class="note">' + esc(name) + " added to the shop list. Pick another piece, or save your changes.</p>";
      });
      box.querySelector("[name=name]").focus();
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
