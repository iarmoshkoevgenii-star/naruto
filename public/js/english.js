/* English episode page. The engine of the Desperate Housewives homework page, with data loaded
   from the API, marks saved to the account, and an editor in teacher mode. */
import { api, toast, toLogin } from "./api.js";
import { mountShell } from "./shell.js";
import { speak } from "./trainer.js";
import { dayOf } from "./stats.js";
import { topicPath } from "./grammar-data.js";

const ID = (location.pathname.match(/^\/en\/([a-z0-9-]+)/) || [])[1] || "";
const CONTENT = "en/" + ID;

/* ====================== state ====================== */
let DATA, INFO = {}, VOCAB, TOPICS, LESSONS, LINES, SCENES, LINE_BY_ID, NOTES, VOCAB_IDS, NOTE_IDS, TOPICS_IN_EP;
let ME = null, ETAG = "";
const LV_ORDER = { "A1": 0, "A1–A2": 1, "A2": 2, "A2–B1": 3, "B1": 4, "B1–B2": 5, "B2": 6, "B2–C1": 7, "C1": 8, "C2": 9 };
const S = { words: new Set(), notes: new Set(), learned: {}, lessons: new Set() };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const first = ru => ru.split(";")[0].trim();
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const pctLabel = (a, b) => (a > 0 && pct(a, b) === 0 ? "<1" : pct(a, b)) + "%";
const words = n => n + " " + (n === 1 ? "word" : "words");
const fmt = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

function index(data) {
  DATA = data;
  INFO = data.info || {};
  VOCAB = data.vocab; TOPICS = data.topics; LESSONS = data.lessons || [];
  LINES = data.lines; SCENES = data.scenes;
  LINE_BY_ID = {}; LINES.forEach(l => LINE_BY_ID[l.id] = l);
  NOTES = {};
  LINES.forEach(l => (l.g || []).forEach((g, i) => { NOTES[l.id + "-g" + i] = { id: l.id + "-g" + i, topic: g[0], pat: g[1], txt: g[2], line: l.id, t: l.t }; }));
  VOCAB_IDS = Object.keys(VOCAB); NOTE_IDS = Object.keys(NOTES);
  TOPICS_IN_EP = [...new Set(NOTE_IDS.map(id => NOTES[id].topic))];
  // marks that no longer exist after an edit are dropped
  S.words = new Set([...S.words].filter(id => VOCAB[id]));
  S.notes = new Set([...S.notes].filter(id => NOTES[id]));
}

/* ====================== saving marks ====================== */
let saveTimer = 0, pendingStudy = 0, marksLoaded = false;
function scheduleSave(added = 0) {
  if (!marksLoaded) return;
  pendingStudy += Math.max(0, added);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveNow(false), 1200);
}
async function saveNow(keepalive) {
  saveTimer = 0;
  const body = { content: CONTENT, marks: { words: [...S.words], notes: [...S.notes], lessons: [...S.lessons] } };
  if (pendingStudy && ME.role === "student") body.activity = { day: dayOf(), kind: "study", n: pendingStudy };
  pendingStudy = 0;
  try { await api("POST", "/api/me?action=marks", body, { keepalive }); }
  catch (e) { if (e.status === 401) return toLogin(); toast("Your marks were not saved: " + e.message); }
}
window.addEventListener("pagehide", () => { if (saveTimer) { clearTimeout(saveTimer); saveNow(true); } });

/* ====================== episode ====================== */
function highlight(seg, ids) {
  const low = seg.toLowerCase(), marks = [];
  ids.forEach(id => {
    if (!VOCAB[id]) return;
    const f = VOCAB[id].f.toLowerCase();
    let i = low.indexOf(f);
    while (i >= 0) {
      const before = i ? low[i - 1] : " ", after = low[i + f.length] || " ";
      if (!/[a-z']/.test(before) && !/[a-z]/.test(after)) { marks.push([i, i + f.length, id]); break; }
      i = low.indexOf(f, i + 1);
    }
  });
  marks.sort((a, b) => a[0] - b[0]);
  let out = "", pos = 0;
  marks.forEach(([a, b, id]) => {
    if (a < pos) return;
    out += tagText(seg.slice(pos, a)) + '<span class="vw' + (S.words.has(id) ? " on" : "") + '" data-v="' + id + '">' + esc(seg.slice(a, b)) + "</span>";
    pos = b;
  });
  return out + tagText(seg.slice(pos));
}
const tagText = s => esc(s).replace(/\[([^\]]*)\]/g, '<span class="tag">[$1]</span>');

function blocks(l) {
  const nr = new Set(l.nr || []), out = [];
  l.en.forEach((seg, i) => {
    const prev = out[out.length - 1];
    if (prev && !/^-\s/.test(seg) && prev.nr === nr.has(i)) prev.text += " " + seg;
    else out.push({ text: seg, nr: nr.has(i) });
  });
  return out;
}
const SAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const CHECK = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5 5 9.2 10.2 3" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export let lineTools = () => "";

function lineHTML(l) {
  const cls = "ln" + (l.k === "sfx" ? " sfx" : "") + (l.k === "light" ? " light" : "");
  const ids = (l.v || []).filter(id => VOCAB[id]);
  let h = '<article class="' + cls + '" id="' + l.id + '"><div class="tc">' + l.t + "</div><div>" + lineTools(l.id);
  h += '<p class="en" lang="en">';
  const bl = blocks(l), say = l.k !== "sfx" ? ' <button class="say" type="button" data-say="' + l.id + '" aria-label="Listen to the line">' + SAY_ICON + "</button>" : "";
  bl.forEach((b, i) => {
    h += '<span class="sg' + (b.nr ? " nr" : "") + '">' + (b.nr && (i === 0 || !bl[i - 1].nr) ? '<span class="vo">voice-over</span>' : "") + highlight(b.text, ids) + (i === bl.length - 1 ? say : "") + "</span>";
  });
  h += "</p>";
  h += '<p class="ru" tabindex="0">' + esc(l.ru) + "</p>";
  if (ids.length || (l.g && l.g.length)) {
    h += '<div class="notes">';
    if (ids.length) h += '<div class="vocab">' + ids.map(chipHTML).join("") + "</div>";
    (l.g || []).forEach((g, i) => {
      const id = l.id + "-g" + i, tp = TOPICS[g[0]] || { t: g[0], lv: "" }, on = S.notes.has(id);
      const path = topicPath(g[0]);
      h += '<label class="g' + (on ? " on" : "") + '" data-note="' + id + '"><input type="checkbox" data-g="' + id + '"' + (on ? " checked" : "") + ' aria-label="I don’t understand: ' + esc(g[1]) + '"><span class="box">' + CHECK + '</span><span><span class="gp" lang="en">' + esc(g[1]) + "</span>" + esc(g[2]) + '<span class="gt">' + (path ? '<a href="' + path + '" title="Open the grammar topic">' + esc(tp.t) + "</a>" : esc(tp.t)) + '<span class="lv">' + esc(tp.lv) + "</span></span></span></label>";
    });
    h += "</div>";
  }
  return h + "</div></article>";
}
function chipHTML(id) {
  const v = VOCAB[id], on = S.words.has(id), learned = S.learned[id] > 0;
  return '<button type="button" class="vc' + (learned && on ? " learned" : "") + '" data-v="' + id + '" aria-pressed="' + on + '" title="' + (on ? "Marked as unknown. Click to remove the mark" : "Click if you don’t know this word") + '"><span class="st" aria-hidden="true"></span><span class="w" lang="en">' + esc(v.w) + '</span><span class="m">' + esc(first(v.ru)) + "</span></button>";
}
function renderGuide() {
  let h = "";
  SCENES.forEach(sc => {
    h += '<section class="scene" id="' + sc.id + '"><div class="scene-h"><div class="rng">' + sc.from_t + "–" + sc.to_t + "</div><div><h2>" + esc(sc.title) + "</h2><p>" + esc(sc.note) + "</p></div></div>";
    LINES.filter(l => l.n >= sc.a && l.n <= sc.b).forEach(l => { h += lineHTML(l); });
    h += "</section>";
  });
  $("#guide").innerHTML = h;
}
function renderMap() {
  $("#mapCap").textContent = SCENES.length + " scenes, " + Math.round(DATA.length / 60) + " minutes";
  $("#map").innerHTML = SCENES.map(sc =>
    '<button class="seg" role="listitem" type="button" data-scene="' + sc.id + '" style="flex-grow:' + Math.max(1, sc.to - sc.from) + '" title="' + sc.from_t + ": " + esc(sc.title) + '" aria-label="' + esc(sc.title) + ", " + sc.from_t + '"><span class="st">' + sc.from_t + '</span><span class="sn">' + esc(sc.title) + "</span></button>").join("");
  updateMapDots();
}
function updateMapDots() {
  $$(".seg").forEach(b => {
    const sc = SCENES.find(s => s.id === b.dataset.scene);
    const has = LINES.some(l => l.n >= sc.a && l.n <= sc.b && ((l.v || []).some(id => S.words.has(id)) || (l.g || []).some((g, i) => S.notes.has(l.id + "-g" + i))));
    let d = b.querySelector(".dot");
    if (has && !d) { d = document.createElement("i"); d.className = "dot"; b.appendChild(d); }
    if (!has && d) d.remove();
  });
}
let io;
function observeScenes() {
  if (io) io.disconnect();
  const segs = $$(".seg");
  io = new IntersectionObserver(en => en.forEach(x => { if (x.isIntersecting) segs.forEach(s => s.classList.toggle("cur", s.dataset.scene === x.target.id)); }), { rootMargin: "-35% 0px -60% 0px" });
  $$(".scene").forEach(s => io.observe(s));
}

/* ---------- marks ---------- */
function toggleWord(id) {
  if (!VOCAB[id]) return;
  const on = !S.words.has(id);
  on ? S.words.add(id) : S.words.delete(id);
  syncWord(id); afterChange(); scheduleSave(on ? 1 : 0);
}
function syncWord(id) {
  const on = S.words.has(id), learned = S.learned[id] > 0;
  $$('.vc[data-v="' + id + '"]').forEach(b => { b.setAttribute("aria-pressed", on); b.classList.toggle("learned", on && learned); b.title = on ? "Marked as unknown. Click to remove the mark" : "Click if you don’t know this word"; });
  $$('.vw[data-v="' + id + '"]').forEach(s => s.classList.toggle("on", on));
}
function setNote(id, on) {
  on ? S.notes.add(id) : S.notes.delete(id);
  const inp = $('input[data-g="' + id + '"]');
  if (inp) { inp.checked = on; inp.closest(".g").classList.toggle("on", on); }
  afterChange(); scheduleSave(on ? 1 : 0);
}
function afterChange() {
  $("#cW").textContent = S.words.size;
  $("#cG").textContent = S.notes.size;
  $("#navWords").textContent = S.words.size || "";
  $("#openPanel").textContent = "My selection (" + (S.words.size + S.notes.size) + ")";
  $("#clearW").disabled = !S.words.size;
  $("#clearG").disabled = $("#copyPlan").disabled = !S.notes.size;
  renderWordsPane(); renderPlanPane(); updateMapDots();
  if (!$("#view-progress").hidden) renderProgress();
}

/* ---------- panel: words ---------- */
const statLine = (n, total, what) => '<p class="hint" style="margin:0 0 10px">' + n + " of " + total + " " + what + " in this episode, " + pctLabel(n, total) + '. <a class="link" href="#/progress">All progress</a></p>';
function renderWordsPane() {
  const el = $("#paneW");
  if (!S.words.size) { el.innerHTML = '<div class="empty"><b>Nothing marked yet.</b>Click the word under a line, or a highlighted word in the text, if you don’t know it. It appears here and goes to Training.</div>'; return; }
  const list = [...S.words].sort((a, b) => LINES.findIndex(l => l.id === VOCAB[a].line) - LINES.findIndex(l => l.id === VOCAB[b].line));
  el.innerHTML = statLine(S.words.size, VOCAB_IDS.length, "words and phrases") + '<ul class="wl">' + list.map(id => {
    const v = VOCAB[id], l = LINE_BY_ID[v.line];
    return '<li><div><span class="w" lang="en">' + esc(v.w) + "</span>" + (S.learned[id] > 0 ? '<span class="ok">learned</span>' : "") + '<span class="m">' + esc(v.ru) + '</span></div><div class="acts"><button class="say" type="button" data-say-text="' + esc(v.w) + '" aria-label="Listen to the word">' + SAY_ICON + '</button><button class="link" type="button" data-jump="' + l.id + '" style="font-size:13px">' + l.t + '</button><button class="x" type="button" data-unmark="' + id + '">remove</button></div></li>';
  }).join("") + "</ul>";
}

/* ---------- panel: grammar and lessons ---------- */
function compilePlan() {
  const by = {};
  S.notes.forEach(id => { const n = NOTES[id]; if (n) (by[n.topic] = by[n.topic] || []).push(n); });
  return Object.entries(by).map(([k, items]) => ({ k, items: items.sort((a, b) => a.line.localeCompare(b.line)), ...(TOPICS[k] || { t: k, lv: "" }) }))
    .sort((a, b) => b.items.length - a.items.length || (LV_ORDER[a.lv] ?? 9) - (LV_ORDER[b.lv] ?? 9));
}
const lessonsFor = keys => LESSONS.filter(ls => (ls.topics || []).some(t => keys.includes(t)));
function advice(list) {
  const easy = list.filter(t => (LV_ORDER[t.lv] ?? 9) <= 4).length, hard = list.length - easy;
  if (easy && hard) return "Start with the A2–B1 topics: everything else builds on them. Leave the B2 topics for later.";
  if (easy) return "All the topics you marked are B1 or below. Review them first.";
  return "The topics you marked are B2. Review them after the basic tenses and modal verbs.";
}
function renderPlanPane() {
  const el = $("#paneG"), list = compilePlan();
  if (!list.length) { el.innerHTML = '<div class="empty"><b>Your plan is empty.</b>Mark the grammar notes you don’t understand. The topics appear here in order of importance, with the school’s lessons on them below.</div>' + lessonsStepHTML([]); return; }
  let h = statLine(S.notes.size, NOTE_IDS.length, "grammar notes") + '<div class="adv">' + esc(advice(list)) + "</div>";
  list.forEach((t, i) => {
    h += '<div class="topic"><h3><span class="rank">' + (i + 1) + "</span>" + esc(t.t) + '</h3><div class="meta">Level ' + esc(t.lv) + ", marked: " + t.items.length + "</div>";
    h += "<dl><dt>Why</dt><dd>" + esc(t.why) + "</dd><dt>What to review</dt><dd>" + esc(t.study) + "</dd><dt>Exercise</dt><dd>" + esc(t.task) + "</dd></dl>";
    h += "<ul>" + t.items.map(n => '<li><a href="#' + n.line + '" data-jump="' + n.line + '">' + n.t + '</a><span class="en" lang="en">' + esc(n.pat) + "</span></li>").join("") + "</ul></div>";
  });
  el.innerHTML = h + lessonsStepHTML(list.map(t => t.k));
}
function lessonsStepHTML(keys) {
  const found = lessonsFor(keys);
  const h = '<div class="lessons-step"><h3>School lessons on your topics</h3>';
  if (!keys.length) return h + "<p>When you mark topics, matching lessons appear here.</p></div>";
  if (!found.length) return h + '<p>The school library has no lessons on these topics yet. When Natalia adds them, you can choose them here.</p><a class="btn small" href="#/lessons">Open the lesson library</a></div>';
  return h + "<p>Choose the lessons you want to take.</p>" + found.map(ls => '<label class="tg" style="display:flex;margin:6px 0"><input type="checkbox" data-lesson="' + esc(ls.id) + '"' + (S.lessons.has(ls.id) ? " checked" : "") + '><span class="sw"></span>' + esc(ls.title) + "</label>").join("") + "</div>";
}
function planText() {
  const list = compilePlan(), L = ["Grammar review plan", "Episode: " + (INFO.title || ID) + (INFO.episode ? ", " + INFO.episode : ""), ""];
  if (ME && ME.role === "student") L.splice(1, 0, "Student: " + ME.name);
  L.push(advice(list), "");
  list.forEach((t, i) => {
    L.push((i + 1) + ". " + t.t + " (" + t.lv + "), marked: " + t.items.length, "   Why: " + t.why, "   What to review: " + t.study, "   Exercise: " + t.task, "   Examples from the episode:");
    t.items.forEach(n => L.push("     " + n.t + "  " + n.pat)); L.push("");
  });
  return L.join("\n");
}

/* ====================== progress ====================== */
function ringSVG(p, color) {
  const r = 52, c = 2 * Math.PI * r;
  return '<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="' + r + '" fill="none" stroke="var(--lilac)" stroke-width="14"/>' + (p > 0 ? '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + (c * p / 100).toFixed(1) + " " + c.toFixed(1) + '"/>' : "") + "</svg>";
}
function sceneStats(sc) {
  const ls = LINES.filter(l => l.n >= sc.a && l.n <= sc.b);
  const v = new Set(), g = [];
  ls.forEach(l => { (l.v || []).forEach(id => v.add(id)); (l.g || []).forEach((x, i) => g.push(l.id + "-g" + i)); });
  return { v: v.size, vu: [...v].filter(id => S.words.has(id)).length, g: g.length, gu: g.filter(id => S.notes.has(id)).length };
}
function renderProgress() {
  const wN = S.words.size, gN = S.notes.size, VT = VOCAB_IDS.length, GT = NOTE_IDS.length;
  const learned = [...S.words].filter(id => S.learned[id] > 0).length;
  const topicsHit = new Set([...S.notes].map(id => NOTES[id].topic)).size;
  const wp = pct(wN, VT), gp = pct(gN, GT);
  let h = '<div class="rings">';
  h += '<div class="ring-card"><div class="ring">' + ringSVG(Math.max(wp, wN ? 1 : 0), "var(--apple)") + '<div class="num">' + pctLabel(wN, VT) + '</div></div><div><h2>Unknown words</h2><p><b>' + wN + "</b> of " + VT + " words and phrases in the episode</p><p>Learned in Training: <b>" + learned + "</b> of " + wN + "</p>" + (wN ? '<a class="btn small primary" href="/training?ep=' + ID + '">Train</a>' : "") + "</div></div>";
  h += '<div class="ring-card"><div class="ring">' + ringSVG(Math.max(gp, gN ? 1 : 0), "var(--violet)") + '<div class="num">' + pctLabel(gN, GT) + '</div></div><div><h2>Grammar you don’t understand</h2><p><b>' + gN + "</b> of " + GT + " grammar notes in the episode</p><p>Topics touched: <b>" + topicsHit + "</b> of " + TOPICS_IN_EP.length + '</p><button class="btn small" type="button" data-open-plan>My plan</button></div></div>';
  h += "</div>";
  h += '<div class="sec"><h2>By scene</h2><div class="legend"><span><i style="background:var(--apple)"></i>unknown words</span><span><i style="background:var(--violet)"></i>grammar you don’t understand</span></div><div class="sbars">';
  SCENES.forEach(sc => {
    const s = sceneStats(sc), tot = s.v + s.g;
    h += '<div class="sbar"><div class="nm"><a href="#' + sc.id + '" data-jump-scene="' + sc.id + '">' + esc(sc.title) + '</a></div><div class="tr" title="Words: ' + s.vu + " of " + s.v + ", grammar: " + s.gu + " of " + s.g + '"><i class="w" style="width:' + pct(s.vu, tot) + '%"></i><i class="gg" style="width:' + pct(s.gu, tot) + '%"></i></div><div class="n">' + (s.vu + s.gu) + " of " + tot + "</div></div>";
  });
  h += "</div></div>";
  const chosen = LESSONS.filter(l => S.lessons.has(l.id));
  h += '<div class="sec"><h2>Chosen lessons</h2>' + (chosen.length ? '<ul class="wl">' + chosen.map(l => "<li><div>" + esc(l.title) + "</div></li>").join("") + "</ul>" : '<p class="hint">You haven’t chosen any lessons yet. <a class="link" href="#/lessons">Open lessons</a></p>') + "</div>";
  h += '<div class="sec"><h2>Saved to your account</h2><p class="hint">Your marks and chosen lessons are saved automatically, on this and any other device. Your teacher can see this progress too.</p></div>';
  $("#progressBody").innerHTML = h;
}

/* ====================== lessons ====================== */
function renderLessons() {
  const keys = compilePlan().map(t => t.k);
  const el = $("#lessonsBody");
  if (!LESSONS.length) {
    el.innerHTML = '<div class="les-empty"><svg viewBox="0 0 96 96" aria-hidden="true"><rect x="14" y="24" width="68" height="52" rx="8" fill="var(--lilac)"/><path d="M48 30v40M48 30c-8-6-20-6-28-3v40c8-3 20-3 28 3m0-40c8-6 20-6 28-3v40c-8-3-20-3-28 3" fill="none" stroke="var(--violet)" stroke-width="3.5" stroke-linejoin="round"/></svg><h2>No lessons yet</h2><p>The school library is still growing. When lessons appear here, you can choose the ones that match your topics.</p>' +
      (keys.length ? '<div class="chips">' + keys.map(k => '<span class="chip">' + esc((TOPICS[k] ? TOPICS[k].t : k).split(":")[0]) + "</span>").join("") + '</div><p class="hint" style="margin-top:8px">These are the topics you marked. Lessons on them will be shown first.</p>' : '<p class="hint" style="margin-top:12px"><a class="link" href="#/episode">Mark topics in the episode</a> to match lessons.</p>') + "</div>";
    return;
  }
  const sorted = LESSONS.slice().sort((a, b) => (b.topics || []).filter(t => keys.includes(t)).length - (a.topics || []).filter(t => keys.includes(t)).length);
  el.innerHTML = '<div class="les">' + sorted.map(ls => '<label class="les-item"><input type="checkbox" data-lesson="' + esc(ls.id) + '"' + (S.lessons.has(ls.id) ? " checked" : "") + '><span><b>' + esc(ls.title) + "</b> " + (ls.level ? '<span class="lv">' + esc(ls.level) + "</span>" : "") + '<span class="hint" style="display:block;margin:2px 0 0">' + (ls.topics || []).map(t => TOPICS[t] ? esc(TOPICS[t].t.split(":")[0]) : esc(t)).join(", ") + "</span></span></label>").join("") + "</div>";
}

/* ====================== navigation ====================== */
function route() {
  if (/^#\/practice/.test(location.hash)) { location.href = "/training?ep=" + ID; return; }
  const m = location.hash.match(/^#\/(episode|progress|lessons)/);
  const lineJump = location.hash.match(/^#(L\d{3,}|s\d+)$/);
  const view = m ? m[1] : "episode";
  ["episode", "progress", "lessons"].forEach(v => { $("#view-" + v).hidden = v !== view; });
  $$(".ep-nav a[data-view]").forEach(a => a.dataset.view === view ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  if (view === "progress") renderProgress();
  if (view === "lessons") renderLessons();
  if (lineJump) { const el = document.getElementById(lineJump[1]); if (el) el.scrollIntoView({ block: "center" }); }
  else if (m) window.scrollTo(0, 0);
}
function jumpTo(id) {
  setPanel(false);
  if ($("#view-episode").hidden) location.hash = "#/episode";
  setTimeout(() => { const el = document.getElementById(id); if (el) { el.scrollIntoView({ block: "center" }); if (el.animate) el.animate([{ background: "var(--sun-soft)" }, { background: "transparent" }], { duration: 1400 }); } }, 40);
}
function setTab(x) { ["W", "G"].forEach(k => { $("#tab" + k).setAttribute("aria-selected", k === x); $("#pane" + k).hidden = k !== x; $("#foot" + k).hidden = k !== x; }); }
function setPanel(open) { $("#side").classList.toggle("open", open); $("#scrim").classList.toggle("show", open); }
async function copyText(txt, ok) {
  try { await navigator.clipboard.writeText(txt); toast(ok); }
  catch { const ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); let r = false; try { r = document.execCommand("copy"); } catch { /* ignore */ } ta.remove(); toast(r ? ok : "Could not copy the text"); }
}

function bindEvents() {
  const body = document.body;
  $("#tRu").addEventListener("change", e => { body.classList.toggle("hide-ru", e.target.checked); $$(".ru.shown").forEach(x => x.classList.remove("shown")); });
  $("#tHl").addEventListener("change", e => body.classList.toggle("no-hl", !e.target.checked));
  $("#tCompact").addEventListener("change", e => body.classList.toggle("compact", e.target.checked));
  document.addEventListener("click", e => {
    const t = e.target;
    if (t.closest(".gt a")) return; // grammar topic link
    const vc = t.closest(".vc"); if (vc && vc.closest("#guide")) { toggleWord(vc.dataset.v); return; }
    const vw = t.closest(".vw"); if (vw && !body.classList.contains("no-hl")) { toggleWord(vw.dataset.v); return; }
    const ru = t.closest(".ln .ru"); if (ru && body.classList.contains("hide-ru")) { ru.classList.toggle("shown"); return; }
    const say = t.closest("[data-say]"); if (say) { const l = LINE_BY_ID[say.dataset.say]; if (l) speak(l.en.join(" ")); return; }
    const sayT = t.closest("[data-say-text]"); if (sayT) { speak(sayT.dataset.sayText); return; }
    const j = t.closest("[data-jump]"); if (j) { e.preventDefault(); jumpTo(j.dataset.jump); return; }
    const js = t.closest("[data-jump-scene]"); if (js) { e.preventDefault(); jumpTo(js.dataset.jumpScene); return; }
    const seg = t.closest(".seg"); if (seg) { document.getElementById(seg.dataset.scene).scrollIntoView({ block: "start" }); return; }
    const un = t.closest("[data-unmark]"); if (un) { toggleWord(un.dataset.unmark); return; }
    if (t.closest("[data-open-plan]")) { location.hash = "#/episode"; setTimeout(() => { setTab("G"); setPanel(true); }, 40); }
  });
  document.addEventListener("change", e => {
    const t = e.target;
    if (t.matches("input[data-g]")) setNote(t.dataset.g, t.checked);
    if (t.matches("input[data-lesson]")) { t.checked ? S.lessons.add(t.dataset.lesson) : S.lessons.delete(t.dataset.lesson); scheduleSave(0); }
  });
  document.addEventListener("keydown", e => {
    const ru = e.target.closest && e.target.closest(".ln .ru");
    if (ru && (e.key === "Enter" || e.key === " ") && body.classList.contains("hide-ru")) { e.preventDefault(); ru.classList.toggle("shown"); }
  });
  $("#tabW").addEventListener("click", () => setTab("W"));
  $("#tabG").addEventListener("click", () => setTab("G"));
  $("#openPanel").addEventListener("click", () => setPanel(true));
  $("#closePanel").addEventListener("click", () => setPanel(false));
  $("#scrim").addEventListener("click", () => setPanel(false));
  $("#clearW").addEventListener("click", () => { [...S.words].forEach(id => { S.words.delete(id); syncWord(id); }); afterChange(); scheduleSave(0); toast("Word marks cleared"); });
  $("#clearG").addEventListener("click", () => { [...S.notes].forEach(id => { S.notes.delete(id); const inp = $('input[data-g="' + id + '"]'); if (inp) { inp.checked = false; inp.closest(".g").classList.remove("on"); } }); afterChange(); scheduleSave(0); toast("Grammar marks cleared"); });
  $("#copyPlan").addEventListener("click", () => copyText(planText(), "Plan copied"));
  window.addEventListener("hashchange", route);
}

function renderHero() {
  document.title = (INFO.title || "Episode") + " — Natalia’s Language School";
  $("#heroLabel").textContent = INFO.label || "Episode";
  $("#heroLabel").hidden = !INFO.label;
  $("#heroTitle").textContent = INFO.title || ID;
  $("#heroSub").textContent = [INFO.episode, INFO.lede].filter(Boolean).join(". ").replace(/\.\./g, ".");
  const q = INFO.quoteLine && LINE_BY_ID[INFO.quoteLine];
  $("#heroQuote").hidden = !q;
  if (q) {
    $("#quoteEn").textContent = q.en.join(" ");
    $("#quoteRu").textContent = INFO.quoteNote || q.ru;
    $("#quoteJump").textContent = "Start at " + q.t;
    $("#quoteJump").dataset.jump = q.id;
    $("#quoteSay").dataset.sayText = q.en.join(" ");
  }
  $("#trainLink").href = $("#goPractice").href = "/training?ep=" + ID;
}

/* Re-render everything after an edit, keeping the edited line in place on screen. */
function refresh(anchorId) {
  const el = anchorId && document.getElementById(anchorId);
  const top = el ? el.getBoundingClientRect().top : null;
  index(DATA);
  renderMap(); renderGuide(); observeScenes(); afterChange();
  const again = anchorId && document.getElementById(anchorId);
  if (again && top != null) window.scrollBy(0, again.getBoundingClientRect().top - top);
}

/* What the editor (english-editor.js) may use. */
export const engine = {
  id: ID,
  get data() { return DATA; },
  get etag() { return ETAG; },
  set etag(v) { ETAG = v; },
  get me() { return ME; },
  lineById: id => LINE_BY_ID[id],
  setLineTools: fn => { lineTools = fn; },
  replaceData(data, anchorId) { index(data); refresh(anchorId); },
  refresh, api, toast, fmt,
};

async function boot() {
  try { ME = (await api("GET", "/api/me")).data; }
  catch (e) { if (e.status === 401) return toLogin(); $("#bootView").textContent = "The page could not load. " + e.message; return; }
  mountShell($("#shell"), ME, "vocabulary");
  let res;
  try { res = await api("GET", "/api/english?id=" + encodeURIComponent(ID)); }
  catch (e) {
    $("#bootView").innerHTML = '<a class="link" href="/vocabulary">← Vocabulary</a><h1>' + (e.status === 404 ? "Coming soon" : "Not available") + "</h1><p>" + esc(e.status === 404 ? "Episodes of this series are being prepared. They will appear here when they are ready." : e.message) + "</p>";
    return;
  }
  ETAG = res.res.headers.get("ETag") || "";
  try {
    const mk = (await api("GET", "/api/me?part=marks&content=" + encodeURIComponent(CONTENT))).data.marks;
    if (mk) { S.words = new Set(mk.words || []); S.notes = new Set(mk.notes || []); S.learned = mk.learned || {}; S.lessons = new Set(mk.lessons || []); }
  } catch (e) { toast("Your saved marks could not be loaded: " + e.message); }
  index(res.data);
  marksLoaded = true;
  if (ME.role === "teacher") {
    try { await (await import("./english-editor.js")).initEditor(engine); }
    catch (e) { console.error(e); toast("Edit mode could not start: " + e.message); }
  }
  renderHero(); renderMap(); renderGuide(); observeScenes(); bindEvents(); afterChange(); setTab("W");
  $("#bootView").hidden = true; $("#appView").hidden = false;
  route();
}

boot();
