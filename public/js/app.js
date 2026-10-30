import * as M from "./model.js";
import { mountShell } from "./shell.js";
import { dayOf } from "./stats.js";

const { esc, furi, plain, toSec, stripParen, kanaize, options, LV_ORDER } = M;
const checkSvg = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5 5 9.2 10.2 3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* ===================== state ===================== */
const S = {
  role: null,
  storage: { writable: false, kind: null },
  nums: [],                 // episode numbers, ascending
  stored: new Set(),        // episodes saved in the store (edited or imported)
  eps: new Map(),           // num -> episode
  etags: new Map(),         // num -> ETag of the loaded version
  loading: new Map(),       // num -> in-flight promise
};
let TOPICS = {}, SPEAKERS = {}, KNOWN_LIST = [], KNOWN = new Set();
const isKnown = w => KNOWN.has(w) || KNOWN.has(stripParen(w));

const NOTE_INDEX = {}, VOCAB = {}, LINES = {};
const selected = new Set();      // id грамматических разборов
const CARDS = new Map();         // слово → {vkey, choice, custom}
let current = null;
let activeTab = "G";
const epByNum = n => S.eps.get(n) || null;
const $ = id => document.getElementById(id);

/* ===================== server ===================== */
export class ApiError extends Error {
  constructor(status, message, data) { super(message); this.status = status; this.data = data || null; }
}

async function api(method, url, body) {
  const init = { method, credentials: "same-origin", headers: { "X-Requested-With": "naruto-study" } };
  if (body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, init); }
  catch { throw new ApiError(0, "Нет связи с сервером. Проверьте интернет и повторите."); }
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;
  if (res.status === 401) { location.href = "/?next=" + encodeURIComponent(location.pathname + location.hash); }
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || "Ошибка " + res.status, data);
  return { data, res };
}

function applyCatalog(d) {
  TOPICS = d.topics || {};
  SPEAKERS = d.speakers || {};
  KNOWN_LIST = d.known || [];
  KNOWN = new Set(); KNOWN_LIST.forEach(w => { KNOWN.add(w); KNOWN.add(stripParen(w)); });
  S.nums = (d.episodes || []).slice().sort((a, b) => a - b);
  S.stored = new Set(d.stored || []);
  if (d.storage) S.storage = d.storage;
}

async function refreshCatalog() {
  const { data } = await api("GET", "/api/data");
  applyCatalog(data);
  return data;
}

/* индексы по загруженным эпизодам */
function indexEpisode(ep) {
  for (const k of Object.keys(NOTE_INDEX)) if (NOTE_INDEX[k].ep === ep.num) delete NOTE_INDEX[k];
  for (const k of Object.keys(VOCAB)) if (VOCAB[k].ep === ep.num) delete VOCAB[k];
  for (const k of Object.keys(LINES)) if (LINES[k].num === ep.num) delete LINES[k];
  ep.scenes.forEach((sc, si) => (sc.lines || []).forEach((ln, li) => {
    const lid = "e" + ep.num + "-" + sc.id + "-" + li; ln._lid = lid;
    LINES[lid] = { num: ep.num, si, li };
    (ln.g || []).forEach((g, gi) => { NOTE_INDEX[lid + "-" + gi] = { ep: ep.num, topic: g[0], pat: g[1], txt: g[2], t: ln.t, line: plain(ln.j), lid }; });
    (ln.v || []).forEach((v, vi) => { const [w, r, m] = v.split("|"); VOCAB[lid + "~" + vi] = { w, r: r || "", m: m || "", opts: options(m || ""), ep: ep.num, t: ln.t, lid, j: ln.j, ru: ln.r }; });
  }));
}

function installEpisode(ep) { S.eps.set(ep.num, ep); indexEpisode(ep); applySavedMarks(); }

/* ---------- ticks and cards saved to the account ---------- */
const MARKS = { ready: false, pending: null, timer: 0, added: 0 };
async function loadMarks() {
  try {
    const m = (await api("GET", "/api/me?part=marks&content=ja%2Fnaruto")).data.marks;
    if (m) MARKS.pending = { selected: new Set(m.selected || []), cards: Array.isArray(m.cards) ? m.cards : [] };
  } catch (_) { /* works without saved marks */ }
  MARKS.ready = true;
}
function applySavedMarks() {
  const p = MARKS.pending;
  if (!p) return;
  let changed = false;
  for (const id of [...p.selected]) if (NOTE_INDEX[id]) { selected.add(id); p.selected.delete(id); changed = true; }
  p.cards = p.cards.filter(([w, c]) => {
    if (!c || !VOCAB[c.vkey] || VOCAB[c.vkey].w !== w) return true;
    if (!CARDS.has(w)) CARDS.set(w, { vkey: c.vkey, choice: c.choice ?? 0, custom: c.custom || "" });
    changed = true; return false;
  });
  if (changed) { renderPlan(); renderCards(); updateCounts(); }
}
function saveMarksSoon(added = 0) {
  if (!MARKS.ready) return;
  MARKS.added += Math.max(0, added);
  clearTimeout(MARKS.timer);
  MARKS.timer = setTimeout(saveMarks, 1200);
}
async function saveMarks(keepalive = false) {
  MARKS.timer = 0;
  const p = MARKS.pending || { selected: new Set(), cards: [] };
  const body = { content: "ja/naruto", marks: { selected: [...selected, ...p.selected], cards: [...CARDS.entries()].map(([w, c]) => [w, { vkey: c.vkey, choice: c.choice, custom: c.custom }]).concat(p.cards) } };
  if (MARKS.added && S.role === "student") body.activity = { day: dayOf(), kind: "study", n: MARKS.added };
  MARKS.added = 0;
  try { await api("POST", "/api/me?action=marks", body); } catch (e) { toast("Отметки не сохранились: " + e.message); }
}
window.addEventListener("pagehide", () => { if (MARKS.timer) { clearTimeout(MARKS.timer); saveMarks(true); } });

function fetchEpisode(num) {
  if (S.eps.has(num)) return Promise.resolve(S.eps.get(num));
  if (S.loading.has(num)) return S.loading.get(num);
  const src = S.stored.has(num) ? "blob" : "seed";
  const p = (async () => {
    const { data, res } = await api("GET", "/api/episode?num=" + num + "&src=" + src);
    if (!data || data.num !== num) throw new ApiError(500, "Сервер вернул не тот эпизод.");
    S.etags.set(num, res.headers.get("ETag") || "");
    installEpisode(data);
    return data;
  })().finally(() => S.loading.delete(num));
  S.loading.set(num, p);
  return p;
}

async function prefetchRest() {
  for (const n of S.nums) {
    if (S.eps.has(n)) continue;
    try { await fetchEpisode(n); } catch { /* loaded on demand later */ }
  }
}

/* ---------- переключатель эпизодов ---------- */
function renderEps() {
  $("eps").innerHTML = S.nums.map(n =>
    '<button type="button" data-ep="' + n + '"' + (n === current ? ' aria-current="page"' : '') + '>Эпизод ' + n + '</button>').join("");
}

/* ---------- карта серии ---------- */
function renderMap(ep) {
  const map = $("map"), ticks = $("ticks");
  const total = toSec(ep.length || "23:20");
  const mins = Math.round(total / 60), n10 = mins % 10, n100 = mins % 100;
  const word = n10 === 1 && n100 !== 11 ? "минута" : n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14) ? "минуты" : "минут";
  $("mapCap").textContent = mins + " " + word + ", нажмите на отрезок";
  map.innerHTML = ""; ticks.innerHTML = "";
  ep.scenes.forEach(sc => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "seg k-" + sc.kind; b.dataset.target = sc.id;
    b.style.flexGrow = Math.max(1, toSec(sc.to) - toSec(sc.from));
    b.title = sc.from + "–" + sc.to + ": " + sc.title;
    b.setAttribute("aria-label", sc.title + ", " + sc.from + "–" + sc.to);
    b.innerHTML = '<span class="st">' + sc.from + '</span><span class="sn">' + esc(sc.title) + '</span>';
    b.addEventListener("click", () => $("sc-" + sc.id).scrollIntoView({ block: "start" }));
    map.appendChild(b);
  });
  for (let m = 0; m * 60 < total; m += 5) { const s = document.createElement("span"); s.textContent = m + ":00"; s.style.left = (m * 60 / total * 100) + "%"; ticks.appendChild(s); }
}

/* ---------- разбор ---------- */
function chipHtml(v, vkey) {
  const on = CARDS.has(v.w);
  return '<button type="button" class="vc" data-vkey="' + vkey + '" data-w="' + esc(v.w) + '" aria-pressed="' + on + '" title="' + (on ? 'Убрать из карточек' : 'Добавить в карточки Anki') + '">'
    + '<span class="mk" aria-hidden="true">' + (on ? '✓' : '+') + '</span><span class="w" lang="ja">' + esc(v.w) + '</span>'
    + (v.r ? '<span class="r" lang="ja">' + esc(v.r) + '</span>' : '') + '<span class="m">' + esc(v.m) + '</span>'
    + (isKnown(v.w) ? '<span class="kn" title="Это слово уже есть в одной из ваших колод">в колоде</span>' : '') + '</button>';
}
const vocabChip = vkey => chipHtml(VOCAB[vkey], vkey);

function noteHtml(id, g) {
  const tp = TOPICS[g[0]] || { t: g[0], lv: "" }, on = selected.has(id);
  return '<label class="g' + (on ? ' on' : '') + '" data-id="' + id + '"><input type="checkbox" data-id="' + id + '"' + (on ? ' checked' : '') + ' aria-label="Добавить в план: ' + esc(g[1]) + '"><span class="box">' + checkSvg + '</span><span class="gb"><span class="gp" lang="ja">' + esc(g[1]) + '</span>' + esc(g[2]) + '<span class="gt">' + esc(tp.t.split(":")[0]) + (tp.lv ? '<span class="lv">' + tp.lv + '</span>' : '') + '</span></span></label>';
}

/* Developer-only controls inside the speaker row; empty for readers. */
const lineTools = lid => S.role !== "teacher" ? "" :
  '<span class="ed-tools"><button type="button" data-ed="line" data-lid="' + lid + '">Изменить</button><button type="button" data-ed="v" data-lid="' + lid + '">＋ Слово</button><button type="button" data-ed="g" data-lid="' + lid + '">＋ Грамматика</button></span>';

function lineHtml(ln) {
  const lid = ln._lid, key = ln.s.replace("?", ""), unsure = ln.s.endsWith("?");
  const sp = SPEAKERS[key] || { name: key, color: "" };
  const cls = "ln" + (ln.k === "light" ? " light" : "") + (ln.k === "echo" ? " echo light" : "");
  let html = '<article class="' + cls + '" id="l-' + lid + '"><div class="tc">' + ln.t + '</div><div>';
  html += '<div class="who" style="--c:' + (sp.color || "var(--sp-other)") + '">' + esc(sp.name) + (unsure ? ' <span class="unsure" title="Говорящий не подписан, определён по смыслу">(по смыслу)</span>' : '') + lineTools(lid) + '</div>';
  html += '<p class="jpl" lang="ja">' + furi(ln.j) + (ln.k === "echo" ? '<span class="tag-echo">повтор</span>' : '') + '</p>';
  html += '<p class="ru" tabindex="0">' + esc(ln.r) + '</p>';
  if ((ln.v && ln.v.length) || (ln.g && ln.g.length) || ln.typo) {
    html += '<div class="notes">';
    if (ln.v && ln.v.length) html += '<div class="vocab">' + ln.v.map((x, vi) => vocabChip(lid + "~" + vi)).join("") + '</div>';
    (ln.g || []).forEach((g, gi) => { html += noteHtml(lid + "-" + gi, g); });
    if (ln.typo) html += '<div class="typo">' + esc(ln.typo) + '</div>';
    html += '</div>';
  }
  return html + '</div></article>';
}

function renderGuide(ep) {
  let html = "";
  ep.scenes.forEach(sc => {
    const passive = !sc.lines;
    html += '<section class="scene' + (passive ? ' passive' : '') + '" id="sc-' + sc.id + '" data-scene="' + sc.id + '">';
    html += '<div class="scene-head"><span class="range">' + sc.from + '–' + sc.to + '</span><h3>' + esc(sc.title) + '</h3><p>' + esc(sc.note) + '</p></div>';
    (sc.lines || []).forEach(ln => { html += lineHtml(ln); });
    html += '</section>';
  });
  $("guide").innerHTML = html;
}

function rerenderLine(lid) {
  const ref = LINES[lid], el = $("l-" + lid);
  if (!ref || !el || ref.num !== current) return;
  const ln = S.eps.get(ref.num).scenes[ref.si].lines[ref.li];
  el.outerHTML = lineHtml(ln);
  const fresh = $("l-" + lid);
  if (fresh) fresh.classList.add("just-saved");
}

let io, showToken = 0;
async function showEpisode(num) {
  const token = ++showToken;
  current = num;
  renderEps();
  let ep = epByNum(num);
  if (!ep) {
    $("guide").innerHTML = '<div class="ep-state">Загружаю эпизод ' + num + '…</div>';
    try { ep = await fetchEpisode(num); }
    catch (e) {
      if (token === showToken) $("guide").innerHTML = '<div class="ep-state">Не удалось загрузить эпизод ' + num + '. ' + esc(e.message) + '<br><button class="btn" type="button" data-retry="' + num + '">Повторить</button></div>';
      return;
    }
    if (token !== showToken) return;
  }
  $("epTitle").innerHTML = esc(ep.title) + (ep.jp ? '<span class="jp" lang="ja">' + esc(ep.jp) + '</span>' : '');
  $("epLede").textContent = ep.lede || "";
  document.title = ep.title + " — разбор диалогов";
  renderMap(ep); renderGuide(ep);
  try { history.replaceState(null, "", "#ep" + num); } catch (_) { }
  if (io) io.disconnect();
  const segs = [...document.querySelectorAll(".seg")];
  io = new IntersectionObserver(en => en.forEach(x => { if (x.isIntersecting) { const id = x.target.dataset.scene; segs.forEach(s => s.classList.toggle("is-current", s.dataset.target === id)); } }), { rootMargin: "-30% 0px -60% 0px" });
  document.querySelectorAll(".scene").forEach(s => io.observe(s));
}

async function goToLine(epNum, lid) {
  setPlan(false);
  const go = () => { const el = $("l-" + lid); if (el) el.scrollIntoView({ block: "center" }); };
  if (epNum !== current) { await showEpisode(epNum); setTimeout(go, 30); } else go();
}

/* ---------- вкладки подборки ---------- */
function setTab(t) {
  activeTab = t;
  ["G", "C"].forEach(x => {
    $("tab" + x).setAttribute("aria-selected", x === t);
    $("pane" + x).hidden = x !== t;
    $("acts" + x).hidden = x !== t;
  });
}
function updateCounts() {
  $("statNotes").textContent = selected.size;
  $("statCards").textContent = CARDS.size;
  $("countMini").textContent = selected.size + CARDS.size;
  ["copyPlan", "dlPlan", "printPlan", "clearPlan"].forEach(id => $(id).disabled = !selected.size);
  ["dlCards", "copyCards", "clearCards"].forEach(id => $(id).disabled = !CARDS.size);
}

/* ---------- план грамматики ---------- */
function compile() {
  const by = {};
  [...selected].forEach(id => { const n = NOTE_INDEX[id]; if (!n) return; (by[n.topic] = by[n.topic] || { key: n.topic, items: [] }).items.push(n); });
  return Object.values(by).map(o => ({ ...o, ...(TOPICS[o.key] || { t: o.key, lv: "", why: "", study: "", task: "" }) })).sort((a, b) =>
    b.items.length - a.items.length || (LV_ORDER[a.lv] || 9) - (LV_ORDER[b.lv] || 9) || a.t.localeCompare(b.t, "ru"));
}
function advice(list) {
  if (!list.length) return "";
  const n4 = list.filter(x => (LV_ORDER[x.lv] || 9) <= 2.5).length, n3 = list.length - n4;
  const rec = list.filter(x => x.rec).map(x => x.t.split(":")[0]);
  let s = n4 && n3 ? "Начните с тем уровня N4: это прямой материал экзамена. Темы N3 разбирайте после них, как задел на следующий уровень."
    : n4 ? "Все отмеченные темы относятся к N4 и ниже: это прямой материал экзамена, их стоит закрепить в первую очередь."
      : "Отмеченные темы относятся к N3. Для экзамена N4 их достаточно узнавать в тексте; активно учить их можно позже.";
  if (rec.length === 1) s += " Тему «" + rec[0] + "» достаточно узнавать на слух: активно использовать её не нужно.";
  else if (rec.length > 1) s += " Темы «" + rec.join("», «") + "» достаточно узнавать на слух: активно использовать их не нужно.";
  return s;
}
const byTime = items => items.slice().sort((a, b) => a.ep - b.ep || toSec(a.t) - toSec(b.t));
function renderPlan() {
  const list = compile(), el = $("paneG");
  if (!list.length) { el.innerHTML = '<div class="empty"><b>План пока пуст.</b> Отметьте грамматические разборы, в которых не чувствуете уверенности. Темы появятся здесь по приоритету: сначала те, что вы отметили чаще.</div>'; return; }
  let h = '<div class="advice">' + esc(advice(list)) + '</div>';
  list.forEach((tp, i) => {
    h += '<div class="topic"><div class="topic-h"><span class="rank">' + (i + 1) + '</span><h3>' + esc(tp.t) + '</h3>';
    h += '<div class="topic-meta">Уровень ' + esc(tp.lv) + (tp.ref ? ', справочник ' + esc(tp.ref) : '') + ', отмечено: ' + tp.items.length + '</div>';
    h += '<dl><dt>Зачем</dt><dd>' + esc(tp.why) + '</dd><dt>Что повторить</dt><dd>' + esc(tp.study) + '</dd><dt>Упражнение</dt><dd>' + esc(tp.task) + '</dd></dl>';
    h += '<ul class="examples">' + byTime(tp.items).map(it => '<li><a href="#l-' + it.lid + '" data-ep="' + it.ep + '" data-jump="' + it.lid + '">Эп. ' + it.ep + ', ' + it.t + '</a><span><span class="jpx" lang="ja">' + esc(it.pat) + '</span> в «' + esc(it.line) + '»</span></li>').join("") + '</ul>';
    h += '</div></div>';
  });
  el.innerHTML = h;
}
function planText() {
  const list = compile(), L = ["План повторения грамматики: Наруто", "Отмечено разборов: " + selected.size + ", тем: " + list.length, "", advice(list), ""];
  list.forEach((tp, i) => {
    L.push((i + 1) + ". " + tp.t + " (" + tp.lv + (tp.ref ? ", справочник " + tp.ref : "") + "), отмечено: " + tp.items.length);
    L.push("   Зачем: " + tp.why); L.push("   Что повторить: " + tp.study); L.push("   Упражнение: " + tp.task); L.push("   Примеры:");
    byTime(tp.items).forEach(it => L.push("     Эп. " + it.ep + ", " + it.t + "  " + it.pat + " в «" + it.line + "»")); L.push("");
  });
  return L.join("\n");
}

/* ---------- карточки Anki ---------- */
function toggleWord(vkey) {
  const v = VOCAB[vkey]; if (!v) return;
  const adding = !CARDS.has(v.w);
  if (!adding) CARDS.delete(v.w); else CARDS.set(v.w, { vkey, choice: 0, custom: "" });
  saveMarksSoon(adding ? 1 : 0);
  document.querySelectorAll('button.vc[data-w="' + CSS.escape(v.w) + '"]').forEach(b => {
    const on = CARDS.has(v.w); b.setAttribute("aria-pressed", on); b.querySelector(".mk").textContent = on ? "✓" : "+";
    b.title = on ? "Убрать из карточек" : "Добавить в карточки Anki";
  });
  renderCards(); updateCounts();
}
function cardFields(c) {
  const v = VOCAB[c.vkey];
  const tr = c.choice === "custom" ? (c.custom.trim() || v.opts[0]) : v.opts[c.choice];
  return [v.w, v.r || stripParen(v.w), tr, plain(v.j).trim(), kanaize(v.j, v.w).trim(), v.ru];
}
function renderCards() {
  const el = $("paneC");
  if (!CARDS.size) { el.innerHTML = '<div class="empty"><b>Карточек пока нет.</b> Нажмите на слово в разборе, и оно появится здесь. Слова с пометкой «в колоде» уже есть в ваших прежних файлах.</div>'; return; }
  let h = '<p class="hint">Шесть полей: слово, чтение, перевод, пример, пример с каной вокруг слова, перевод примера. Пример берётся из реплики, где вы отметили слово.</p>';
  [...CARDS.entries()].forEach(([w, c]) => {
    const v = VOCAB[c.vkey], f = cardFields(c), sid = "sel-" + c.vkey.replace(/[^\w-]/g, "_");
    h += '<div class="card" data-w="' + esc(w) + '"><div class="card-h"><span class="w" lang="ja">' + esc(f[0]) + '</span><span class="r" lang="ja">' + esc(f[1]) + '</span>' + (isKnown(w) ? '<span class="lv" style="color:var(--water)">в колоде</span>' : '') + '<button type="button" class="x" data-rm="' + esc(w) + '">Убрать</button></div>';
    h += '<label for="' + sid + '">Перевод для карточки</label><select id="' + sid + '" data-w="' + esc(w) + '">' + v.opts.map((o, i) => '<option value="' + i + '"' + (c.choice === i ? ' selected' : '') + '>' + esc(o) + '</option>').join("") + '<option value="custom"' + (c.choice === "custom" ? ' selected' : '') + '>Свой вариант…</option></select>';
    if (c.choice === "custom") h += '<input type="text" data-custom="' + esc(w) + '" value="' + esc(c.custom) + '" placeholder="Введите свой перевод" aria-label="Свой перевод">';
    h += '<div class="ex"><div class="f4" lang="ja">' + esc(f[3]) + '</div><div class="f5" lang="ja">' + esc(f[4]) + '</div><div class="f6">' + esc(f[5]) + '</div><div class="src"><a href="#l-' + v.lid + '" data-ep="' + v.ep + '" data-jump="' + v.lid + '">Эп. ' + v.ep + ', ' + v.t + '</a></div></div></div>';
  });
  el.innerHTML = h;
}
const tsv = () => [...CARDS.values()].map(c => cardFields(c).map(f => String(f).replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n") + "\n";

/* ---------- кнопки ---------- */
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200); }
async function copyText(txt, ok) {
  try { await navigator.clipboard.writeText(txt); toast(ok); }
  catch (e) { const ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); let r = false; try { r = document.execCommand("copy"); } catch (_) { } ta.remove(); toast(r ? ok : "Не удалось скопировать: попробуйте скачать файл"); }
}
function download(txt, name, type, ok) {
  try { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); toast(ok); }
  catch (e) { toast("Скачивание недоступно здесь: используйте копирование"); }
}
const stamp = () => new Date().toISOString().slice(0, 10);

/* ---------- шторка на мобильных ---------- */
function setPlan(open) { $("plan").classList.toggle("open", open); $("scrim").classList.toggle("show", open); }

/* ===================== saving (developer mode) ===================== */
function lineRef(lid) {
  const ref = LINES[lid]; if (!ref) return null;
  const ep = S.eps.get(ref.num);
  return { ...ref, ep, sc: ep.scenes[ref.si], ln: ep.scenes[ref.si].lines[ref.li] };
}

function snapshotSelections(num) {
  const notes = [...selected].filter(id => NOTE_INDEX[id] && NOTE_INDEX[id].ep === num).map(id => ({ id, ...NOTE_INDEX[id] }));
  const cards = [...CARDS.entries()].filter(([, c]) => VOCAB[c.vkey] && VOCAB[c.vkey].ep === num).map(([w, c]) => ({ w, c, lid: VOCAB[c.vkey].lid }));
  return { notes, cards };
}
function remapSelections(before) {
  for (const n of before.notes) {
    selected.delete(n.id);
    const hit = Object.keys(NOTE_INDEX).find(id => NOTE_INDEX[id].lid === n.lid && NOTE_INDEX[id].topic === n.topic && NOTE_INDEX[id].pat === n.pat);
    if (hit) selected.add(hit);
  }
  for (const { w, c, lid } of before.cards) {
    const keys = Object.keys(VOCAB);
    const hit = keys.find(k => VOCAB[k].lid === lid && VOCAB[k].w === w) || keys.find(k => VOCAB[k].w === w);
    if (!hit) { CARDS.delete(w); continue; }
    c.vkey = hit;
    if (typeof c.choice === "number" && c.choice >= VOCAB[hit].opts.length) c.choice = 0;
  }
  renderPlan(); renderCards(); updateCounts(); saveMarksSoon();
}

function replaceEpisode(ep) {
  const before = snapshotSelections(ep.num);
  installEpisode(ep);
  remapSelections(before);
}

async function reloadEpisode(num) {
  await refreshCatalog();
  const before = snapshotSelections(num);
  S.eps.delete(num);
  await fetchEpisode(num);
  remapSelections(before);
  if (num === current) await showEpisode(num);
}

/* PUT an episode. On a conflict the fresh version is loaded and the error is rethrown. */
async function saveEpisode(draft, { force = false } = {}) {
  const num = draft.num;
  try {
    const { data } = await api("PUT", "/api/episode?num=" + num, { episode: M.clean(draft), baseEtag: S.etags.get(num) || "", force });
    S.etags.set(num, data.etag);
    S.stored.add(num);
    if (!S.nums.includes(num)) { S.nums.push(num); S.nums.sort((a, b) => a - b); }
  } catch (e) {
    if (e.status === 409) await reloadEpisode(num).catch(() => { });
    throw e;
  }
  replaceEpisode(draft);
}

/* Change one line: mutate a copy, validate, save, then update the page. */
async function commitLine(lid, mutate) {
  const ref = lineRef(lid);
  if (!ref) throw new ApiError(0, "Реплика не найдена: обновите страницу.");
  const draft = M.clean(ref.ep);
  const line = draft.scenes[ref.si].lines[ref.li];
  mutate(line);
  for (const k of ["v", "g"]) if (Array.isArray(line[k]) && !line[k].length) delete line[k];
  const errors = M.episodeErrors(draft, TOPICS, SPEAKERS);
  if (errors.length) throw new ApiError(422, "Правка не сохранена: исправьте ошибки.", { errors });
  await saveEpisode(draft);
  rerenderLine(lid);
}

/* ===================== views ===================== */
function showView(name) {
  $("bootView").hidden = name !== "boot";
  $("appView").hidden = name !== "app";
}

function showLogin() { location.href = "/?next=" + encodeURIComponent(location.pathname + location.hash); }

function bindApp() {
  $("eps").addEventListener("click", e => {
    const b = e.target.closest("button[data-ep]"); if (!b) return;
    showEpisode(+b.dataset.ep); window.scrollTo({ top: 0 });
  });
  const body = document.body;
  $("tFuri").addEventListener("change", e => body.classList.toggle("no-furi", !e.target.checked));
  $("tRu").addEventListener("change", e => { body.classList.toggle("hide-ru", e.target.checked); document.querySelectorAll(".ru.shown").forEach(x => x.classList.remove("shown")); });
  $("tCompact").addEventListener("change", e => body.classList.toggle("compact", e.target.checked));
  const guide = $("guide");
  guide.addEventListener("click", e => {
    const retry = e.target.closest("button[data-retry]"); if (retry) { showEpisode(+retry.dataset.retry); return; }
    const ru = e.target.closest(".ru"); if (ru && body.classList.contains("hide-ru")) ru.classList.toggle("shown");
    const vc = e.target.closest("button.vc"); if (vc) toggleWord(vc.dataset.vkey);
  });
  guide.addEventListener("keydown", e => {
    const ru = e.target.closest(".ru"); if (ru && (e.key === "Enter" || e.key === " ") && body.classList.contains("hide-ru")) { e.preventDefault(); ru.classList.toggle("shown"); }
  });
  guide.addEventListener("change", e => {
    if (!e.target.matches(".g input")) return;
    const id = e.target.dataset.id;
    e.target.checked ? selected.add(id) : selected.delete(id);
    saveMarksSoon(e.target.checked ? 1 : 0);
    e.target.closest(".g").classList.toggle("on", e.target.checked);
    renderPlan(); updateCounts();
  });
  $("tabG").addEventListener("click", () => setTab("G"));
  $("tabC").addEventListener("click", () => setTab("C"));
  const paneC = $("paneC");
  paneC.addEventListener("change", e => {
    const s = e.target.closest("select[data-w]"); if (!s) return;
    const c = CARDS.get(s.dataset.w); c.choice = s.value === "custom" ? "custom" : +s.value;
    saveMarksSoon();
    renderCards();
    if (c.choice === "custom") { const inp = paneC.querySelector('input[data-custom="' + CSS.escape(s.dataset.w) + '"]'); if (inp) inp.focus(); }
  });
  paneC.addEventListener("input", e => { const i = e.target.closest("input[data-custom]"); if (i) { CARDS.get(i.dataset.custom).custom = i.value; saveMarksSoon(); } });
  paneC.addEventListener("click", e => {
    const rm = e.target.closest("button[data-rm]"); if (rm) { const c = CARDS.get(rm.dataset.rm); if (c) toggleWord(c.vkey); }
  });
  $("copyPlan").addEventListener("click", () => copyText(planText(), "План скопирован"));
  $("dlPlan").addEventListener("click", () => download(planText(), "naruto_plan_" + stamp() + ".txt", "text/plain;charset=utf-8", "Файл плана сохранён"));
  $("printPlan").addEventListener("click", () => { setTab("G"); window.print(); });
  $("clearPlan").addEventListener("click", () => { selected.clear(); document.querySelectorAll(".g input:checked").forEach(i => { i.checked = false; i.closest(".g").classList.remove("on"); }); renderPlan(); updateCounts(); saveMarksSoon(); toast("Отметки сняты"); });
  $("dlCards").addEventListener("click", () => download(tsv(), "naruto_cards_" + stamp() + ".tsv", "text/tab-separated-values;charset=utf-8", "Файл карточек сохранён"));
  $("copyCards").addEventListener("click", () => copyText(tsv(), "Карточки скопированы"));
  $("clearCards").addEventListener("click", () => { [...CARDS.values()].map(c => c.vkey).forEach(toggleWord); toast("Отметки сняты"); });
  $("openPlan").addEventListener("click", () => setPlan(true));
  $("closePlan").addEventListener("click", () => setPlan(false));
  $("scrim").addEventListener("click", () => setPlan(false));
  document.querySelector(".plan-body").addEventListener("click", e => {
    const a = e.target.closest("a[data-jump]"); if (!a) return; e.preventDefault(); goToLine(+a.dataset.ep, a.dataset.jump);
  });
}

/* What the developer editor (editor.js) may use. */
const engine = {
  S, api, ApiError, toast, download, stamp,
  get topics() { return TOPICS; },
  get speakers() { return SPEAKERS; },
  get knownList() { return KNOWN_LIST; },
  NOTE_INDEX, VOCAB, LINES,
  currentNum: () => current,
  epByNum, fetchEpisode, showEpisode, lineRef, chipHtml, noteHtml,
  commitLine, saveEpisode, refreshCatalog, reloadEpisode, applyCatalog,
};

/* ===================== start ===================== */
async function boot() {
  let data;
  try {
    const me = (await api("GET", "/api/me")).data;
    mountShell($("shell"), me, "vocabulary");
    data = (await api("GET", "/api/data")).data;
  } catch (e) {
    if (e.status === 401) return;
    $("bootView").innerHTML = '<div class="ep-locked"><a class="home-link" href="/vocabulary">← Vocabulary</a><h1>' + (e.data && e.data.locked ? "Japanese is not in your plan yet" : "Не удалось загрузить сайт") + "</h1><p>" + esc(e.data && e.data.locked ? "Ask Natalia if you would like to study Japanese." : e.message) + "</p></div>";
    return;
  }
  applyCatalog(data);
  S.role = data.role;
  await loadMarks();
  showView("app");
  bindApp();
  const m = (location.hash || "").match(/^#ep(\d+)/);
  current = m && S.nums.includes(+m[1]) ? +m[1] : (S.nums.length ? S.nums[S.nums.length - 1] : null);
  renderPlan(); renderCards(); updateCounts(); setTab("G");
  if (current !== null) await showEpisode(current);
  else { renderEps(); $("guide").innerHTML = '<div class="ep-state">Эпизодов пока нет.</div>'; }
  if (S.role === "teacher") {
    try { (await import("./editor.js")).initEditor(engine); }
    catch (e) { console.error(e); toast("Не удалось включить режим учителя: " + e.message); }
  }
  setTimeout(prefetchRest, 400);
}

boot();
