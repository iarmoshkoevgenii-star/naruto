/* Training tab: word practice across English episodes, using the words the student marked. */
import { api, esc, toast } from "./api.js";
import { createTrainer, clozeOf, sayButton, speak } from "./trainer.js";
import { dayOf } from "./stats.js";
import { reportActivity } from "./rewards.js";

const cache = new Map(); // episode id -> data
const words = n => n + " " + (n === 1 ? "word" : "words");

async function loadEpisode(id) {
  if (!cache.has(id)) cache.set(id, api("GET", "/api/english?id=" + encodeURIComponent(id)).then(r => r.data));
  return cache.get(id);
}

/* All words of an episode as trainer items, keyed "episode|word". */
function itemsOf(epId, data) {
  const lines = {};
  data.lines.forEach(l => { lines[l.id] = l; });
  const out = {};
  for (const v of Object.values(data.vocab)) {
    const l = lines[v.line];
    const text = l ? l.en.join(" ") : "";
    out[epId + "|" + v.id] = { id: epId + "|" + v.id, ep: epId, vid: v.id, w: v.w, ru: v.ru, pos: v.pos, f: v.f, ctx: clozeOf(v, text), lineEn: text, lineRu: l ? l.ru : "", lineT: l ? l.t : "", lineHref: "/en/" + epId + "#" + v.line };
  }
  return out;
}

export async function trainingPage(main, me) {
  main.innerHTML = '<p class="loading">Loading…</p>';
  let episodes, marks;
  try {
    const [a, b] = await Promise.all([api("GET", "/api/english"), api("GET", "/api/me?part=marks")]);
    episodes = a.data.episodes.filter(e => !e.locked); marks = b.data.marks || {};
  } catch (e) { main.innerHTML = '<div class="state"><h1>Training</h1><p>' + esc(e.message) + "</p></div>"; return; }

  if (!episodes.length) {
    main.innerHTML = '<div class="trn"><div class="page-h"><div><h1>Training</h1><p class="lede">Practise the words from the episodes you study.</p></div></div><div class="card empty-card"><h2>No episodes yet</h2><p>Unlock an episode in the shop, mark the words you don’t know, and train them here.</p><p><a class="p-btn primary" href="/shop" data-nav>Go to the shop</a></p></div></div>';
    return;
  }
  const unknownBy = {};
  for (const ep of episodes) {
    const m = marks["en/" + ep.id];
    unknownBy[ep.id] = m && Array.isArray(m.words) ? m.words.slice() : [];
  }
  const totalUnknown = Object.values(unknownBy).reduce((n, l) => n + l.length, 0);
  const wanted = new URLSearchParams(location.search).get("ep");
  const preset = episodes.find(e => e.id === wanted) || episodes[0];
  const startAll = !totalUnknown;

  main.innerHTML = '<div class="trn"><div class="page-h"><div><h1>Training</h1><p class="lede">Practise the words you marked as unknown, or any words from an episode. A word you get wrong comes back until you answer it correctly.</p></div></div>' +
    '<div class="box-card" data-setup>' +
    '<div class="field"><span class="lbl">Which words</span><div class="pills" role="radiogroup" aria-label="Which words">' +
    '<label class="pill"><input type="radio" name="src" value="unknown"' + (startAll ? "" : " checked") + (totalUnknown ? "" : " disabled") + "><span>My unknown words<small>" + words(totalUnknown) + "</small></span></label>" +
    '<label class="pill"><input type="radio" name="src" value="episode"' + (startAll ? " checked" : "") + "><span>All words from an episode<small data-all-count>" + words(preset ? preset.words : 0) + "</small></span></label></div>" +
    '<select class="p-select" data-ep aria-label="Episode">' + episodes.map(e => '<option value="' + esc(e.id) + '"' + (preset && e.id === preset.id ? " selected" : "") + ">" + esc(e.title + (e.episode ? ", " + e.episode : "")) + "</option>").join("") + "</select></div>" +
    '<div class="field"><span class="lbl">Format</span><div class="pills" role="radiogroup" aria-label="Format">' +
    [["mixed", "Mixed", "all task types in turn"], ["flash", "Cards", "remember it yourself"], ["choice", "Choose the translation", "four options"], ["typing", "Type the word", "in English"], ["cloze", "Fill the gap", "a line from the episode"]]
      .map(([v, t, s], i) => '<label class="pill"><input type="radio" name="mode" value="' + v + '"' + (i === 0 ? " checked" : "") + "><span>" + t + "<small>" + s + "</small></span></label>").join("") + "</div></div>" +
    '<div class="field"><span class="lbl">How many words</span><div class="pills" role="radiogroup" aria-label="How many words">' +
    [["10", "10"], ["20", "20"], ["0", "All"]].map(([v, t]) => '<label class="pill"><input type="radio" name="len" value="' + v + '"' + (v === (startAll ? "20" : "0") ? " checked" : "") + "><span>" + t + "</span></label>").join("") + "</div></div>" +
    '<div class="g-actions"><button class="p-btn primary" type="button" data-start>Start training</button><span class="hint" data-setup-hint>' + (totalUnknown ? "" : "You haven’t marked any words yet, so this uses all words from the episode. Mark unknown words while you watch to train just those.") + "</span></div></div>" +
    '<div data-game hidden></div><div class="box-card" data-result hidden></div></div>';

  const $ = s => main.querySelector(s);
  const val = name => main.querySelector('input[name="' + name + '"]:checked').value;
  $("[data-ep]").addEventListener("change", () => { const e = episodes.find(x => x.id === $("[data-ep]").value); $("[data-all-count]").textContent = words(e ? e.words : 0); });
  main.addEventListener("change", e => { if (e.target.name === "src") main.querySelector('input[name="len"][value="' + (e.target.value === "episode" ? "20" : "0") + '"]').checked = true; });

  let answers = 0, learnedNow = [];
  async function start(fixedIds) {
    const src = val("src"), mode = val("mode"), len = +val("len");
    const btn = $("[data-start]");
    btn.disabled = true; btn.textContent = "Loading words…";
    try {
      const epIds = src === "unknown" ? episodes.filter(e => unknownBy[e.id].length).map(e => e.id) : [$("[data-ep]").value];
      const pool = {};
      for (const id of epIds) Object.assign(pool, itemsOf(id, await loadEpisode(id)));
      let ids = fixedIds || (src === "unknown" ? epIds.flatMap(id => unknownBy[id].map(v => id + "|" + v)) : Object.keys(pool));
      ids = ids.filter(id => pool[id]);
      if (!fixedIds) { ids = ids.sort(() => Math.random() - .5); if (len) ids = ids.slice(0, len); }
      if (!ids.length) { toast("No words to train"); return; }
      answers = 0; learnedNow = [];
      $("[data-setup]").hidden = true; $("[data-result]").hidden = true;
      const game = $("[data-game]"); game.hidden = false;
      createTrainer(game, {
        pool, ids, mode,
        onAnswer: () => { answers++; },
        onLearned: id => learnedNow.push(id),
        onFinish: res => finish(res, pool),
      });
    } catch (e) { toast(e.message); }
    finally { btn.disabled = false; btn.textContent = "Start training"; }
  }

  async function save() {
    if (!answers && !learnedNow.length) return;
    const byEp = {};
    learnedNow.forEach(id => { const [ep, vid] = id.split("|"); (byEp[ep] = byEp[ep] || []).push(vid); });
    try {
      const fresh = (await api("GET", "/api/me?part=marks")).data.marks || {};
      const eps = Object.keys(byEp);
      if (!eps.length && answers) { await api("POST", "/api/me?action=activity", { day: dayOf(), kind: "practice", n: answers }); return; }
      for (let i = 0; i < eps.length; i++) {
        const content = "en/" + eps[i];
        const learned = { ...((fresh[content] && fresh[content].learned) || {}) };
        byEp[eps[i]].forEach(vid => { learned[vid] = (learned[vid] || 0) + 1; });
        await api("POST", "/api/me?action=marks", { content, marks: { learned }, activity: i === 0 && answers ? { day: dayOf(), kind: "practice", n: answers } : undefined });
      }
    } catch (e) { toast("Your results were not saved: " + e.message); }
  }

  async function finish(res, pool) {
    const game = $("[data-game]"); game.hidden = true; game.innerHTML = "";
    const li = id => '<li><div><span class="w" lang="en">' + esc(pool[id].w) + '</span><span class="m">' + esc(pool[id].ru) + "</span></div>" + sayButton(pool[id].w) + "</li>";
    const clean = res.learned.filter(id => !res.errs.includes(id));
    const r = $("[data-result]");
    r.innerHTML = "<h2>" + (res.early ? "Training stopped" : "Training finished") + "</h2>" +
      '<div class="res-big"><div><b>' + res.accuracy + "%</b>correct answers</div><div><b>" + res.learned.length + "</b>of " + res.total + " words learned</div><div><b>" + res.score + "</b>points, best run " + res.best + "</div></div>" +
      '<div class="res-cols"><div><h3>Knew right away</h3>' + (clean.length ? '<ul class="wl">' + clean.map(li).join("") + "</ul>" : '<p class="hint">None this time.</p>') + "</div>" +
      "<div><h3>Had mistakes</h3>" + (res.errs.length ? '<ul class="wl">' + res.errs.map(li).join("") + "</ul>" : '<p class="hint">No mistakes at all. Well done!</p>') + "</div></div>" +
      '<div class="g-actions">' + (res.errs.length ? '<button class="p-btn primary" type="button" data-again>Practise the words with mistakes</button>' : "") + '<button class="p-btn" type="button" data-new>New training</button><a class="p-btn" href="/" data-nav>My cabinet</a></div>';
    r.hidden = false;
    r.querySelector("[data-new]").addEventListener("click", () => { r.hidden = true; $("[data-setup]").hidden = false; });
    const again = r.querySelector("[data-again]");
    if (again) again.addEventListener("click", () => start(res.errs));
    r.addEventListener("click", e => { const s = e.target.closest("[data-say-text]"); if (s) speak(s.dataset.sayText); });
    await save();
    if (!res.early && me.role === "student") reportActivity("training", "t" + Date.now().toString(36), { answers: res.asked });
  }

  $("[data-start]").addEventListener("click", () => start());
}
