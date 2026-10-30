/* Word training game, ported from the Desperate Housewives page.
   pool: {id: {id, w, ru, pos, f, ctx: {before, ans, after} | null, lineRu, lineEn, lineHref, lineT}} */
import { esc } from "./api.js";

const first = ru => ru.split(";")[0].trim();
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const norm = s => s.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim();
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const PLACEHOLDER = /\b(somebody|someone|something|one's|oneself)\b/i;
const TYPE_NAME = { flash: "Card: remember the translation", choice: "Choose the translation", typing: "Type the English word", cloze: "Fill the gap in the line" };
const maskOf = (w, n) => w.split("").map((ch, i) => ch === " " ? "\u2003" : (i < n ? ch : "_")).join(" ");
const SAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/* ---------- speech ---------- */
const TTS = typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
let VOICES = [];
if (TTS) { const load = () => { try { VOICES = speechSynthesis.getVoices(); } catch { /* ignore */ } }; load(); speechSynthesis.onvoiceschanged = load; }
export function speak(text) {
  if (!TTS) return;
  const clean = String(text).replace(/\[[^\]]*\]/g, " ").replace(/(^|\s)-\s/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = "en-US"; u.rate = .93;
    const v = VOICES.find(v => /en[-_]US/i.test(v.lang)) || VOICES.find(v => /^en/i.test(v.lang));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch { /* not available */ }
}
export const sayButton = (text, label = "Listen") => TTS ? '<button class="say" type="button" data-say-text="' + esc(text) + '" aria-label="' + esc(label) + '">' + SAY + "</button>" : "";

/* Builds the cloze context for a word from its line. */
export function clozeOf(word, lineText) {
  const i = lineText.toLowerCase().indexOf(String(word.f || "").toLowerCase());
  if (i < 0 || String(word.f || "").length < 3) return null;
  return { before: lineText.slice(0, i), ans: lineText.slice(i, i + word.f.length), after: lineText.slice(i + word.f.length) };
}

export function createTrainer(root, { pool, ids, mode, onAnswer, onLearned, onFinish }) {
  const POOL_IDS = Object.keys(pool);
  const canType = id => { const w = pool[id].w; return !PLACEHOLDER.test(w) && w.split(" ").length <= 3 && w.length <= 26 && /^[a-z' -]+$/i.test(w); };
  const GM = { mode, queue: ids.slice(), items: {}, total: ids.length, done: 0, score: 0, streak: 0, best: 0, right: 0, wrong: 0, cur: null };
  ids.forEach(id => GM.items[id] = { need: 1, errors: 0 });

  root.innerHTML = '<div class="box-card" data-game><div class="g-top"><div class="prog" aria-hidden="true"><i data-bar></i></div><div class="g-stats" aria-live="polite"><span>Learned <b data-done>0</b> of <b>' + GM.total + '</b></span><span>Points <b data-score>0</b></span><span>Run <b data-run>0</b></span></div></div><div data-card></div><div class="g-actions"><span class="spacer"></span><button class="p-btn small" type="button" data-quit>Stop training</button></div></div>';
  const card = root.querySelector("[data-card]");
  const q = s => root.querySelector(s);

  function pickType(id) {
    const can = { choice: true, flash: true, typing: canType(id), cloze: !!pool[id].ctx };
    if (GM.mode !== "mixed") return can[GM.mode] ? GM.mode : "choice";
    const p = ["choice", "choice"]; if (can.cloze) p.push("cloze", "cloze"); if (can.typing) p.push("typing");
    if (GM.items[id].errors === 0 && GM.items[id].need === 1 && Math.random() < .2) p.push("flash");
    return p[Math.floor(Math.random() * p.length)];
  }
  function distract(id, field) {
    const v = pool[id], val = x => field === "ru" ? first(pool[x].ru) : pool[x].f;
    const right = val(id).toLowerCase();
    const same = shuffle(POOL_IDS.filter(x => x !== id && pool[x].pos === v.pos)), rest = shuffle(POOL_IDS.filter(x => x !== id && pool[x].pos !== v.pos));
    const out = [], seen = new Set([right]);
    for (const x of same.concat(rest)) { const s = val(x); if (!seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push(s); } if (out.length === 3) break; }
    return out;
  }
  function bar() {
    q("[data-done]").textContent = GM.done; q("[data-score]").textContent = GM.score; q("[data-run]").textContent = GM.streak;
    q("[data-bar]").style.width = pct(GM.done, GM.total) + "%";
  }
  function next() {
    bar();
    if (!GM.queue.length) return finish(false);
    const id = GM.queue.shift(), type = pickType(id), v = pool[id];
    GM.cur = { id, type, answered: false };
    let h = '<div class="q-type">' + TYPE_NAME[type] + "</div>";
    if (type === "choice" || type === "flash") {
      h += '<p class="q-word" lang="en">' + esc(v.w) + sayButton(v.w, "Listen to the word") + '</p><div class="q-pos">' + esc(v.pos) + "</div>";
      if (v.ctx) h += '<div class="q-ctx" lang="en">' + esc(v.ctx.before) + "<mark>" + esc(v.ctx.ans) + "</mark>" + esc(v.ctx.after) + "</div>";
    }
    if (type === "choice") {
      const opts = shuffle([first(v.ru)].concat(distract(id, "ru")));
      GM.cur.right = first(v.ru);
      h += '<div class="opts">' + opts.map((o, i) => '<button class="opt" type="button" data-opt="' + esc(o) + '"><span class="k">' + (i + 1) + "</span>" + esc(o) + "</button>").join("") + "</div>";
    } else if (type === "flash") {
      h += '<div class="g-actions" data-flip-row><button class="p-btn primary" type="button" data-flip>Show translation</button><span class="hint">or press Space</span></div><div data-flip-area></div>';
    } else if (type === "typing") {
      h += '<p class="q-ru">' + esc(v.ru) + '</p><div class="q-pos">' + esc(v.pos) + '</div><div class="q-ctx"><small>' + esc(v.lineRu) + "</small></div>";
      GM.cur.hint = 1;
      h += '<div class="mask" data-mask aria-label="Hint">' + maskOf(v.w, 1) + '</div><div class="type-row"><input data-type type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="The English word" placeholder="Type the word"><button class="p-btn primary" type="button" data-check>Check</button><button class="p-btn" type="button" data-hint>Hint</button><button class="p-btn" type="button" data-giveup>I don’t know</button></div>';
    } else {
      GM.cur.right = v.ctx.ans;
      h += '<div class="q-ctx" lang="en">' + esc(v.ctx.before) + '<span class="gap" aria-label="gap"></span>' + esc(v.ctx.after) + "<small>" + esc(v.lineRu) + "</small></div>";
      const opts = shuffle([v.ctx.ans].concat(distract(id, "f")));
      h += '<div class="opts">' + opts.map((o, i) => '<button class="opt en" type="button" lang="en" data-opt="' + esc(o) + '"><span class="k">' + (i + 1) + "</span>" + esc(o) + "</button>").join("") + "</div>";
    }
    h += "<div data-fb></div>";
    card.innerHTML = h;
    const inp = q("[data-type]");
    if (inp) inp.focus(); else { const b = card.querySelector(".opt, [data-flip]"); if (b) b.focus({ preventScroll: true }); }
  }
  function answer(ok, chosen) {
    if (!GM.cur || GM.cur.answered) return;
    const c = GM.cur, it = GM.items[c.id], v = pool[c.id];
    c.answered = true;
    if (ok) {
      GM.right++; GM.streak++; GM.best = Math.max(GM.best, GM.streak);
      GM.score += 10 + (GM.streak >= 3 ? 5 : 0);
      it.need--;
      if (it.need <= 0) { GM.done++; if (onLearned) onLearned(c.id); }
      else GM.queue.splice(Math.min(4, GM.queue.length), 0, c.id);
    } else {
      GM.wrong++; GM.streak = 0; it.errors++; it.need = 2;
      GM.queue.splice(Math.min(2, GM.queue.length), 0, c.id);
    }
    if (onAnswer) onAnswer(ok);
    card.querySelectorAll(".opt").forEach(b => { b.disabled = true; if (b.dataset.opt === c.right) b.classList.add("right"); else if (b.dataset.opt === chosen) b.classList.add("wrong"); });
    let h = '<div class="fb ' + (ok ? "ok" : "bad") + '"><div class="v">' + (ok ? (it.need > 0 ? "Correct. The word will come back once more to make it stick." : "Correct") : "Not quite. This word will come back later.") + "</div>";
    h += '<div class="ans"><b lang="en">' + esc(v.w) + "</b> — " + esc(v.ru) + "</div>";
    if (v.ctx) h += '<div class="ex" lang="en">' + esc(v.ctx.before) + "<mark>" + esc(v.ctx.ans) + "</mark>" + esc(v.ctx.after) + " " + sayButton(v.lineEn, "Listen to the line") + '</div><div class="exr">' + esc(v.lineRu) + (v.lineHref ? ' <a class="link-b" href="' + esc(v.lineHref) + '">' + esc(v.lineT) + "</a>" : "") + "</div>";
    h += '</div><div class="g-actions"><button class="p-btn primary" type="button" data-next>Next</button><span class="hint">or press Enter</span></div>';
    q("[data-fb]").innerHTML = h;
    bar();
    q("[data-next]").focus({ preventScroll: true });
  }
  function flip() {
    const v = pool[GM.cur.id];
    q("[data-flip-row]").remove();
    q("[data-flip-area]").innerHTML = '<div class="flip"><p class="q-ru">' + esc(v.ru) + '</p><div class="q-pos">' + esc(v.lineRu) + '</div><div class="g-actions"><button class="p-btn" type="button" data-forgot>I didn’t remember</button><button class="p-btn primary" type="button" data-knew>I remembered</button></div></div>';
    q("[data-knew]").focus({ preventScroll: true });
  }
  function checkTyping() {
    const inp = q("[data-type]"); if (!inp || GM.cur.answered) return;
    const v = pool[GM.cur.id], val = norm(inp.value);
    if (!val) { inp.focus(); return; }
    inp.disabled = true;
    answer(val === norm(v.w) || val === norm(v.f));
  }
  function hint() {
    const v = pool[GM.cur.id]; GM.cur.hint = Math.min(v.w.length, GM.cur.hint + 1);
    q("[data-mask]").textContent = maskOf(v.w, GM.cur.hint);
    q("[data-type]").focus();
  }
  function finish(early) {
    document.removeEventListener("keydown", onKey);
    root.removeEventListener("click", onClick);
    const asked = GM.right + GM.wrong;
    const learned = Object.keys(GM.items).filter(id => GM.items[id].need <= 0);
    const clean = learned.filter(id => !GM.items[id].errors);
    const errs = Object.keys(GM.items).filter(id => GM.items[id].errors > 0).sort((a, b) => GM.items[b].errors - GM.items[a].errors);
    if (onFinish) onFinish({ early, asked, right: GM.right, learned, errs, score: GM.score, best: GM.best, total: GM.total, accuracy: pct(GM.right, asked) });
  }
  function onClick(e) {
    const t = e.target;
    const say = t.closest("[data-say-text]"); if (say) { speak(say.dataset.sayText); return; }
    const opt = t.closest(".opt"); if (opt && !GM.cur.answered) { answer(opt.dataset.opt === GM.cur.right, opt.dataset.opt); return; }
    if (t.closest("[data-flip]")) return flip();
    if (t.closest("[data-knew]")) return answer(true);
    if (t.closest("[data-forgot]")) return answer(false);
    if (t.closest("[data-check]")) return checkTyping();
    if (t.closest("[data-hint]")) return hint();
    if (t.closest("[data-giveup]")) return answer(false);
    if (t.closest("[data-next]")) return next();
    if (t.closest("[data-quit]")) return finish(true);
  }
  function onKey(e) {
    if (!GM.cur || !root.isConnected) return;
    if (e.target.matches && e.target.matches("[data-type]")) { if (e.key === "Enter") { e.preventDefault(); GM.cur.answered ? next() : checkTyping(); } return; }
    if (e.key === "Enter" && GM.cur.answered) { e.preventDefault(); next(); return; }
    if (e.key === " " && GM.cur.type === "flash" && !GM.cur.answered && q("[data-flip]")) { e.preventDefault(); flip(); return; }
    if (/^[1-4]$/.test(e.key) && !GM.cur.answered) { const b = card.querySelectorAll(".opt")[+e.key - 1]; if (b) b.click(); }
  }
  root.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  next();
  return { stop: () => finish(true) };
}
