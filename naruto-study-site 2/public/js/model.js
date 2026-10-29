/* Shared by the browser (public/js) and the API functions (api/, lib/).
   Pure functions only: no DOM, no Node APIs. */

/* ---------- text helpers (same rules as the original single-file engine) ---------- */
export const KANJI = "\\u3400-\\u9fff\\u3005\\u30f6";
export const RUBY_SRC = "([" + KANJI + "]+)\\[([^\\]]+)\\]";
export const RUBY_RE = new RegExp(RUBY_SRC, "g");
export const KANJI_CH = new RegExp("[" + KANJI + "]");
export const LV_ORDER = { "N5": 0.5, "N5–N4": 1, "N4": 2, "N4–N3": 2.5, "N3": 3, "N3–N2": 3.5, "N2": 4 };
export const LEVELS = Object.keys(LV_ORDER);

export const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const furi = s => esc(s).replace(RUBY_RE, "<ruby>$1<rt>$2</rt></ruby>");
export const plain = s => s.replace(/\[[^\]]+\]/g, "");
export const toSec = t => t.split(":").map(Number).reduce((a, b) => a * 60 + b, 0);
export const stripParen = w => w.replace(/（.*?）|\(.*?\)/g, "").trim();

/* the word stays in kanji, everything around it turns into kana (rule B) */
export function kanaize(j, word) {
  const keep = new Set([...word].filter(c => KANJI_CH.test(c)));
  return j.replace(RUBY_RE, (m, k, r) => [...k].every(c => keep.has(c)) ? k : r);
}

export function options(m) {
  const full = m.trim();
  let parts = full.split(";").map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) parts = full.split(",").map(s => s.trim()).filter(Boolean);
  return [...new Set([full, ...(parts.length > 1 ? parts : [])])];
}

/* ---------- furigana segments with offsets in the plain text ---------- */
export function segments(j) {
  const out = [], re = new RegExp(RUBY_SRC, "g");
  let pos = 0, last = 0, m;
  const pushText = str => { for (const ch of str) { out.push({ ruby: false, text: ch, reading: "", a: pos, b: pos + ch.length }); pos += ch.length; } };
  while ((m = re.exec(j))) {
    pushText(j.slice(last, m.index));
    out.push({ ruby: true, text: m[1], reading: m[2], a: pos, b: pos + m[1].length });
    pos += m[1].length;
    last = re.lastIndex;
  }
  pushText(j.slice(last));
  return out;
}

const SPACE = /[\s\u3000]/;
/* Trim spaces around a plain-text range [a, b). */
export function trimRange(text, a, b) {
  while (a < b && SPACE.test(text[a])) a++;
  while (b > a && SPACE.test(text[b - 1])) b--;
  return [a, b];
}

/* What a selection [a, b) of the plain line means: its text, its kana reading
   (empty when the text is all kana), and whether the reading is certain. */
export function readingFor(j, a, b) {
  let reading = "", complete = true, hasKanji = false;
  for (const s of segments(j)) {
    if (s.b <= a || s.a >= b) continue;
    const whole = s.a >= a && s.b <= b;
    if (s.ruby) {
      hasKanji = true;
      if (whole) reading += s.reading;
      else { complete = false; }
    } else {
      if (KANJI_CH.test(s.text)) { hasKanji = true; complete = false; }
      reading += s.text;
    }
  }
  return { text: plain(j).slice(a, b), reading: hasKanji && complete ? reading : "", complete: !hasKanji || complete, hasKanji };
}

/* The line as ruby HTML with the plain range [a, b) wrapped in <mark>. */
export function rubyWithMark(j, a, b) {
  if (a == null || b == null || a >= b) return furi(j);
  let html = "", open = false;
  for (const s of segments(j)) {
    const inside = s.b > a && s.a < b;
    if (inside && !open) { html += "<mark>"; open = true; }
    if (!inside && open) { html += "</mark>"; open = false; }
    html += s.ruby ? "<ruby>" + esc(s.text) + "<rt>" + esc(s.reading) + "</rt></ruby>" : esc(s.text);
  }
  if (open) html += "</mark>";
  return html;
}

/* First occurrence of a word or pattern in the plain line (used to show an existing mark). */
export function locate(j, needle) {
  const text = plain(j);
  const variants = [needle, stripParen(needle), needle.replace(/^[〜~]+|[〜~]+$/g, "")].filter(Boolean);
  for (const v of variants) { const i = text.indexOf(v); if (i >= 0) return [i, i + v.length]; }
  return null;
}

/* ---------- validation (port of site_tool.py, messages in Russian) ---------- */
export const KINDS = ["scene", "recap", "fb", "song", "break", "preview"];
const TIME = /^\d{1,2}:\d{2}$/;
const KANA_ONLY = /^[ぁ-ゟ゠-ヿー・ 　]+$/;
const KANJI_ONE = new RegExp("[" + KANJI + "]");
const MAX_STR = 5000;

function tooLong(obj, path = "") {
  if (typeof obj === "string") return obj.length > MAX_STR ? path || "текст" : null;
  if (Array.isArray(obj)) { for (let i = 0; i < obj.length; i++) { const r = tooLong(obj[i], path + "[" + i + "]"); if (r) return r; } return null; }
  if (obj && typeof obj === "object") { for (const k of Object.keys(obj)) { const r = tooLong(obj[k], path ? path + "." + k : k); if (r) return r; } }
  return null;
}

export function furiErrors(j) {
  const errors = [];
  if ((j.match(/\[/g) || []).length !== (j.match(/\]/g) || []).length) errors.push("непарные квадратные скобки фуриганы");
  for (const mm of j.matchAll(/\[([^\]]*)\]/g)) {
    const before = j.slice(0, mm.index);
    if (!before || !KANJI_ONE.test(before[before.length - 1])) errors.push("чтение [" + mm[1] + "] должно стоять сразу после кандзи");
    if (!KANA_ONLY.test(mm[1])) errors.push("чтение [" + mm[1] + "] должно быть записано каной");
  }
  return errors;
}

export function bareKanji(j) {
  const bare = j.replace(new RegExp(RUBY_SRC, "g"), "").replace(/\[[^\]]*\]/g, "");
  return [...bare].filter(c => KANJI_ONE.test(c)).join("");
}

export function lineErrors(ln, topics, speakers) {
  const errors = [];
  if (!ln || typeof ln !== "object") return ["реплика должна быть объектом"];
  if (ln._auto || ln.r === "TODO" || String(ln.j || "").includes("[？]")) errors.push("реплика не закончена (черновые чтения или TODO)");
  if (!TIME.test(ln.t || "")) errors.push("неверный таймкод «" + ln.t + "»");
  if (!Object.prototype.hasOwnProperty.call(speakers, String(ln.s || "").replace(/\?+$/, ""))) errors.push("неизвестный говорящий «" + ln.s + "»");
  if (typeof ln.j !== "string" || typeof ln.r !== "string" || !ln.j || !ln.r) errors.push("нужны японский текст и перевод");
  if (ln.k != null && ln.k !== "light" && ln.k !== "echo") errors.push("поле k может быть только light или echo");
  const j = typeof ln.j === "string" ? ln.j : "";
  if (j.includes("♪")) errors.push("в реплике текст песни: его нельзя копировать");
  errors.push(...furiErrors(j));
  if (ln.v != null && !Array.isArray(ln.v)) errors.push("v должно быть списком");
  for (const v of Array.isArray(ln.v) ? ln.v : []) {
    const p = typeof v === "string" ? v.split("|") : [];
    if (p.length !== 3 || !p[0] || !p[2]) errors.push("слово «" + v + "» должно иметь вид «слово|чтение|перевод; перевод»");
  }
  if (ln.g != null && !Array.isArray(ln.g)) errors.push("g должно быть списком");
  for (const g of Array.isArray(ln.g) ? ln.g : []) {
    if (!Array.isArray(g) || g.length !== 3 || g.some(x => typeof x !== "string")) errors.push("разбор грамматики должен быть [тема, форма, пояснение]");
    else if (!Object.prototype.hasOwnProperty.call(topics, g[0])) errors.push("неизвестная тема «" + g[0] + "»");
  }
  return errors;
}

export function episodeErrors(ep, topics, speakers) {
  const errors = [];
  if (!ep || typeof ep !== "object" || Array.isArray(ep)) return ["эпизод должен быть объектом"];
  if (!Number.isInteger(ep.num) || ep.num < 1 || ep.num > 9999) errors.push("номер эпизода должен быть целым числом");
  for (const f of ["title", "length", "scenes"]) if (!ep[f]) errors.push("у эпизода нет поля «" + f + "»");
  if (ep.length && !TIME.test(ep.length)) errors.push("длина эпизода должна быть в виде м:сс");
  if (String(ep.jp || "") === "TODO" || String(ep.lede || "") === "TODO") errors.push("jp или lede ещё TODO");
  const big = tooLong(ep);
  if (big) errors.push("слишком длинный текст в поле " + big);
  const ids = new Set();
  for (const sc of Array.isArray(ep.scenes) ? ep.scenes : []) {
    const where = "сцена " + (sc && sc.id);
    if (!sc || typeof sc !== "object") { errors.push("сцена должна быть объектом"); continue; }
    if (ids.has(sc.id)) errors.push(where + ": повторяется id");
    ids.add(sc.id);
    if (!KINDS.includes(sc.kind)) errors.push(where + ": тип должен быть одним из " + KINDS.join(", "));
    for (const f of ["from", "to"]) if (!TIME.test(sc[f] || "")) errors.push(where + ": неверное время " + f + " «" + sc[f] + "»");
    if (sc.kind === "song" && sc.lines && sc.lines.length) errors.push(where + ": в песне не должно быть реплик");
    if (String(sc.title || "").includes("TODO") || String(sc.note || "").includes("TODO")) errors.push(where + ": заголовок или заметка ещё TODO");
    if (sc.lines != null && !Array.isArray(sc.lines)) { errors.push(where + ": lines должно быть списком"); continue; }
    (sc.lines || []).forEach((ln, i) => lineErrors(ln, topics, speakers).forEach(e => errors.push(where + ", реплика " + (i + 1) + " (" + (ln && ln.t) + "): " + e)));
  }
  return errors;
}

export function topicErrors(id, t) {
  const errors = [];
  if (!/^[a-z][a-z0-9_]{0,39}$/.test(id || "")) errors.push("id темы: латиница в нижнем регистре, цифры и _, начинается с буквы");
  if (!t || typeof t !== "object") return errors.concat("тема должна быть объектом");
  for (const f of ["t", "lv", "why", "study", "task"]) if (typeof t[f] !== "string" || !t[f].trim()) errors.push("не заполнено поле «" + f + "»");
  if (t.lv && !LEVELS.includes(t.lv)) errors.push("уровень должен быть одним из " + LEVELS.join(", "));
  if (t.ref != null && typeof t.ref !== "string") errors.push("ref должно быть строкой");
  if (t.rec != null && typeof t.rec !== "boolean") errors.push("rec должно быть true или false");
  const big = tooLong(t);
  if (big) errors.push("слишком длинный текст в поле " + big);
  return errors;
}

export function speakerErrors(id, s) {
  const errors = [];
  if (!/^[a-z0-9_]{1,40}$/.test(id || "")) errors.push("ключ говорящего «" + id + "»: латиница, цифры и _");
  if (!s || typeof s.name !== "string" || !s.name.trim()) errors.push("у говорящего «" + id + "» нет имени");
  if (s && s.color != null && s.color !== "" && !/^#[0-9a-fA-F]{6}$/.test(s.color)) errors.push("цвет говорящего «" + id + "» должен быть в виде #RRGGBB");
  return errors;
}

/* ---------- serialisation ---------- */
/* Drop runtime-only keys (those starting with "_") before saving or exporting. */
export const clean = obj => JSON.parse(JSON.stringify(obj, (k, v) => (k && k[0] === "_") ? undefined : v));

/* Stable JSON for comparisons (sorted keys). */
export function canonical(v) {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().filter(k => k[0] !== "_" && v[k] !== undefined).map(k => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
  return JSON.stringify(v);
}

/* ---------- the single-file site (the format the naruto-study-site skill reads and writes) ---------- */
const blockRe = name => new RegExp("/\\*" + name + ":BEGIN\\*/([\\s\\S]*?)/\\*" + name + ":END\\*/");

export function parseSiteHtml(html) {
  const get = name => {
    const m = html.match(blockRe(name));
    if (!m) throw new Error("В файле нет блока " + name + ": это не файл сайта с разборами.");
    return JSON.parse(m[1]);
  };
  const topics = get("TOPICS"), speakers = get("SPEAKERS"), known = get("KNOWN");
  const episodes = [];
  for (const m of html.matchAll(/\/\*EP:(\d+):BEGIN\*\/EPISODES\.push\(([\s\S]*?)\);\/\*EP:\1:END\*\//g)) {
    const ep = JSON.parse(m[2]);
    if (ep.num !== Number(m[1])) throw new Error("Эпизод " + m[1] + ": номер внутри не совпадает с меткой.");
    episodes.push(ep);
  }
  episodes.sort((a, b) => a.num - b.num);
  return { topics, speakers, known, episodes };
}

/* JSON that is safe inside a <script> element. */
const scriptJson = o => JSON.stringify(o).replace(/</g, "\\u003c");

export function buildSiteHtml(template, { topics, speakers, known, episodes }) {
  let html = template;
  const set = (name, json) => {
    if (!blockRe(name).test(html)) throw new Error("В шаблоне нет блока " + name);
    html = html.replace(blockRe(name), () => "/*" + name + ":BEGIN*/" + json + "/*" + name + ":END*/");
  };
  set("TOPICS", scriptJson(topics));
  set("SPEAKERS", scriptJson(speakers));
  set("KNOWN", scriptJson(known));
  const inner = "\n" + episodes.slice().sort((a, b) => a.num - b.num)
    .map(ep => "/*EP:" + ep.num + ":BEGIN*/EPISODES.push(" + scriptJson(clean(ep)) + ");/*EP:" + ep.num + ":END*/\n").join("");
  html = html.replace(/(\/\*EPISODES:BEGIN\*\/)[\s\S]*?(\/\*EPISODES:END\*\/)/, (m, a, b) => a + inner + b);
  return html;
}
