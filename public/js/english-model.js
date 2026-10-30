/* English episode data: validation shared by the editor and the API. */
export const POS = ["сущ.", "гл.", "фраз. гл.", "прил.", "нареч.", "выраж.", "идиома", "союз", "предл.", "местоим.", "междом.", "культ."];
export const CEFR = ["A1", "A1–A2", "A2", "A2–B1", "B1", "B1–B2", "B2", "B2–C1", "C1", "C2"];
const TIME = /^\d{1,2}:\d{2}$/;
const str = (v, max = 3000) => typeof v === "string" && v.length <= max;

export function topicErrors(id, t) {
  const e = [];
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(id || "")) e.push("Topic id: lowercase Latin letters, digits and _.");
  for (const f of ["t", "lv", "why", "study", "task"]) if (!str(t && t[f]) || !t[f].trim()) e.push("Topic field «" + f + "» is required.");
  if (t && t.lv && !CEFR.includes(t.lv)) e.push("Level must be one of " + CEFR.join(", ") + ".");
  return e;
}

export function englishErrors(doc) {
  const e = [];
  if (!doc || typeof doc !== "object") return ["The episode must be an object."];
  const lines = Array.isArray(doc.lines) ? doc.lines : (e.push("lines must be a list."), []);
  const vocab = doc.vocab && typeof doc.vocab === "object" ? doc.vocab : (e.push("vocab must be an object."), {});
  const topics = doc.topics && typeof doc.topics === "object" ? doc.topics : (e.push("topics must be an object."), {});
  if (!Array.isArray(doc.scenes)) e.push("scenes must be a list.");
  const ids = new Set();
  for (const l of lines) {
    const w = "line " + (l && l.id);
    if (!l || !/^L\d{3,}$/.test(l.id || "")) { e.push(w + ": invalid id"); continue; }
    if (ids.has(l.id)) e.push(w + ": duplicate id");
    ids.add(l.id);
    if (!TIME.test(l.t || "")) e.push(w + ": invalid time");
    if (!Array.isArray(l.en) || !l.en.length || l.en.some(s => !str(s, 600) || !s.trim())) e.push(w + ": the English text is required");
    if (!str(l.ru, 1500)) e.push(w + ": the translation must be text");
    if (l.k != null && l.k !== "sfx" && l.k !== "light") e.push(w + ": k must be sfx or light");
    for (const v of l.v || []) if (!vocab[v]) e.push(w + ": unknown word id " + v);
    for (const g of l.g || []) {
      if (!Array.isArray(g) || g.length !== 3 || g.some(x => !str(x, 1200))) e.push(w + ": grammar must be [topic, form, explanation]");
      else if (!topics[g[0]]) e.push(w + ": unknown topic " + g[0]);
    }
  }
  for (const [id, v] of Object.entries(vocab)) {
    const w = "word " + id;
    if (!v || v.id !== id || !/^v-[a-z0-9-]{1,60}$/.test(id)) { e.push(w + ": invalid id"); continue; }
    if (!str(v.w, 120) || !v.w.trim()) e.push(w + ": the word is required");
    if (!str(v.ru, 300) || !v.ru.trim()) e.push(w + ": the translation is required");
    if (!str(v.pos, 30)) e.push(w + ": the part of speech must be text");
    if (!str(v.f, 120) || !v.f.trim()) e.push(w + ": the form in the line is required");
    if (!ids.has(v.line)) e.push(w + ": unknown line " + v.line);
  }
  for (const [id, t] of Object.entries(topics)) e.push(...topicErrors(id, t).map(x => "topic " + id + ": " + x));
  return e.slice(0, 50);
}

/* "come across" -> "v-come-across", unique within the vocabulary. */
export function vocabId(word, vocab) {
  const base = "v-" + (word.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "word");
  let id = base, n = 2;
  while (vocab[id]) id = base + "-" + n++;
  return id;
}
