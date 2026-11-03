/* Grammar tab, laid out like a reference index: big headings for the parts, bold topic areas,
   the lessons as plain links under them, and subsections for lessons that belong together.
     /grammar                  every part, area and lesson
     /grammar/<area>           one area and its lessons
     /grammar/<area>/<lesson>  one lesson, with the area's lessons on the left (can be hidden)
   The look is in /css/grammar.css. The contents (areas, lessons, subsections, parts) are in grammar-data.js. */
import { esc } from "./api.js";
import { AREAS, CATEGORIES, TOPICS, PARTS } from "./grammar-data.js";

const ORDER = ["A1", "A1–A2", "A2", "A2–B1", "B1", "B1–B2", "B2", "B2–C1", "C1", "C2"];
const inCat = id => TOPICS.filter(t => t.cat === id);
function range(list) {
  const idx = list.flatMap(t => (t.lv || "").split("–")).map(l => ORDER.indexOf(l)).filter(i => i >= 0).sort((a, b) => a - b);
  if (!idx.length) return "";
  const lo = ORDER[idx[0]], hi = ORDER[idx[idx.length - 1]];
  return lo === hi ? lo : lo + "–" + hi;
}
const lessonHref = (catId, id) => "/grammar/" + catId + "/" + id;
const areaHref = c => "/grammar/" + c.id;
/* A word that starts with a hyphen (-ing, -ed, -’s) must not break after the hyphen: use a non-breaking one on screen. */
const txt = s => esc(s).replace(/(^|[\s(/])-(?=[\w’])/g, "$1\u2011");
const link = (href, text, extra = "") => '<a href="' + href + '" data-nav' + extra + ">" + txt(text) + "</a>";
/* "Relative clauses: whose/whom/where" for a lesson inside a subsection; the plain title otherwise. */
const fullTitle = t => (t.sub && !t.head ? t.sub + ": " + t.title : t.title);
const plural = n => n + (n === 1 ? " lesson" : " lessons");

/* The parts in order. Areas missing from PARTS go at the end of the last part. */
function parts() {
  if (!PARTS || !PARTS.length) return [{ id: "all", title: "Grammar", cats: CATEGORIES }];
  const listed = new Set(PARTS.flatMap(p => p.cats));
  const rest = CATEGORIES.filter(c => !listed.has(c.id)).map(c => c.id);
  return PARTS.map((p, i) => ({
    ...p,
    cats: (i === PARTS.length - 1 ? [...p.cats, ...rest] : p.cats).map(id => CATEGORIES.find(c => c.id === id)).filter(Boolean),
  }));
}

/* An area's lessons as nested lists. detail: also show a lesson's level and summary, if it has them. */
function lessonsHtml(area, currentId, detail = false) {
  const t = id => TOPICS.find(x => x.cat === area.id && x.id === id);
  const item = (id, title) => {
    const info = t(id);
    const more = detail && info && (info.lv || info.sum) ? "<p>" + (info.lv ? '<span class="gm-lv">' + esc(info.lv) + "</span>" : "") + esc(info.sum) + "</p>" : "";
    return "<li>" + link(lessonHref(area.id, id), title, id === currentId ? ' aria-current="page"' : "") + more + "</li>";
  };
  return "<ul>" + area.lessons.map(entry => {
    if (Array.isArray(entry)) return item(entry[0], entry[1]);
    const inner = entry.lessons.map(l => item(l[0], l[1])).join("");
    // a subsection that is the whole area and has the area's name needs no heading of its own
    if (area.lessons.length === 1 && entry.sub === area.title && !entry.id) return inner;
    const head = entry.id ? link(lessonHref(area.id, entry.id), entry.sub, entry.id === currentId ? ' aria-current="page"' : "") : txt(entry.sub);
    return '<li class="gm-sub"><span class="gm-sub-h">' + head + "</span><ul>" + inner + "</ul></li>";
  }).join("") + "</ul>";
}

function group(area, currentId) {
  return '<section class="gm-group"><h3>' + link(areaHref(area), area.title) + "</h3>" + lessonsHtml(area, currentId) + "</section>";
}

function indexView() {
  return '<div class="gm"><h1 class="gm-sr">Grammar</h1><div class="gm-parts">' +
    parts().map(p => '<section class="gm-part" aria-labelledby="gm-' + esc(p.id) + '"><h2 class="gm-h" id="gm-' + esc(p.id) + '">' + esc(p.title) + "</h2>" +
      '<div class="gm-cols">' + p.cats.map(c => group(AREAS.find(a => a.id === c.id))).join("") + "</div></section>").join("") +
    "</div></div>";
}

function areaView(area) {
  const list = inCat(area.id), lv = range(list);
  return '<div class="gm gm-area"><a class="gm-back" href="/grammar" data-nav>← Grammar</a>' +
    '<h1 class="gm-h">' + txt(area.title) + "</h1>" + (area.blurb ? '<p class="gm-blurb">' + esc(area.blurb) + "</p>" : "") +
    '<p class="gm-meta">' + plural(list.length) + (lv ? ", " + lv : "") + "</p>" +
    '<div class="gm-lessons">' + lessonsHtml(area, null, true) + "</div></div>";
}

const SIDE_KEY = "nls-grammar-side";
const sideOpen = () => { try { return localStorage.getItem(SIDE_KEY) !== "0"; } catch { return true; } };

function sidebar(area, topicId) {
  return '<aside class="gm-side" aria-label="Grammar topics"><div class="gm-side-h"><span>Topics</span><button type="button" class="link-b" data-side-hide>Hide</button></div>' +
    group(area, topicId) +
    '<p class="gm-side-k">Other topic areas</p><ul class="gm-side-other">' +
    CATEGORIES.filter(c => c.id !== area.id).map(c => "<li>" + link(areaHref(c), c.title) + "</li>").join("") + "</ul></aside>";
}

function lessonView(area, t, prev, next) {
  return '<div class="gm gm-lesson' + (sideOpen() ? "" : " side-closed") + '">' + sidebar(area, t.id) +
    '<article class="gm-main"><button type="button" class="link-b gm-show" data-side-show>Show topics</button>' +
    '<nav class="gm-crumbs" aria-label="You are here">' + link("/grammar", "Grammar") + '<span aria-hidden="true">/</span>' + link(areaHref(area), area.title) + "</nav>" +
    '<h1 class="gm-h">' + txt(fullTitle(t)) + "</h1>" + (t.lv ? '<p class="gm-meta"><span class="gm-lv">' + esc(t.lv) + "</span></p>" : "") + (t.sum ? '<p class="gm-blurb">' + esc(t.sum) + "</p>" : "") +
    '<section class="gm-draft"><h2>This lesson is being written</h2><p>The explanation, examples from episodes and exercises for this topic will appear here.</p>' +
    "<ul><li>Explanation</li><li>Examples from episodes</li><li>Exercises</li></ul></section>" +
    '<nav class="gm-pn" aria-label="Previous and next lesson">' +
    (prev ? '<a href="' + lessonHref(area.id, prev.id) + '" data-nav><small>Previous</small>' + txt(fullTitle(prev)) + "</a>" : "<span></span>") +
    (next ? '<a class="nx" href="' + lessonHref(area.id, next.id) + '" data-nav><small>Next</small>' + txt(fullTitle(next)) + "</a>" : "") +
    "</nav></article></div>";
}

function bindSidebar(main) {
  const box = main.querySelector(".gm-lesson");
  if (!box) return;
  const set = open => { box.classList.toggle("side-closed", !open); try { localStorage.setItem(SIDE_KEY, open ? "1" : "0"); } catch { /* ignore */ } };
  main.querySelector("[data-side-hide]").addEventListener("click", () => set(false));
  main.querySelector("[data-side-show]").addEventListener("click", () => set(true));
}

const notFound = (what, back) => '<div class="state"><a class="back" href="' + back + '" data-nav>← Back</a><h1>Not found</h1><p>This ' + what + " does not exist.</p></div>";

export function grammarPage(main, catId, topicId) {
  if (!catId) {
    document.title = "Grammar — Natalia’s Language School";
    main.innerHTML = indexView();
    return;
  }
  const area = AREAS.find(a => a.id === catId);
  if (!area) { main.innerHTML = notFound("topic area", "/grammar"); return; }
  if (!topicId) {
    document.title = area.title + " — Grammar";
    main.innerHTML = areaView(area);
    return;
  }
  const list = inCat(area.id), i = list.findIndex(t => t.id === topicId);
  if (i < 0) { main.innerHTML = notFound("lesson", areaHref(area)); return; }
  document.title = fullTitle(list[i]) + " — Grammar";
  main.innerHTML = lessonView(area, list[i], list[i - 1], list[i + 1]);
  bindSidebar(main);
}
