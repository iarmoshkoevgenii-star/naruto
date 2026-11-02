/* Grammar tab, laid out like a reference index: big headings for the parts, bold topic areas,
   and the lessons as plain links under them.
     /grammar                  every part, area and lesson
     /grammar/<area>           one area: its lessons with a one-line summary
     /grammar/<area>/<lesson>  one lesson, with the area's lessons on the left (can be hidden)
   The look is in /css/grammar.css. The content (parts, areas, lessons) is in grammar-data.js. */
import { esc } from "./api.js";
import { CATEGORIES, TOPICS, PARTS } from "./grammar-data.js";

const ORDER = ["A1", "A1–A2", "A2", "A2–B1", "B1", "B1–B2", "B2", "B2–C1", "C1", "C2"];
const inCat = id => TOPICS.filter(t => t.cat === id);
function range(list) {
  const idx = list.flatMap(t => t.lv.split("–")).map(l => ORDER.indexOf(l)).filter(i => i >= 0).sort((a, b) => a - b);
  if (!idx.length) return "";
  const lo = ORDER[idx[0]], hi = ORDER[idx[idx.length - 1]];
  return lo === hi ? lo : lo + "–" + hi;
}
const lessonHref = t => "/grammar/" + t.cat + "/" + t.id;
const areaHref = c => "/grammar/" + c.id;
const link = (href, text, extra = "") => '<a href="' + href + '" data-nav' + extra + ">" + esc(text) + "</a>";

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

/* One area: its title in bold, its lessons as links. */
function group(c, currentId) {
  return '<section class="gm-group"><h3>' + link(areaHref(c), c.title) + "</h3><ul>" +
    inCat(c.id).map(t => "<li>" + link(lessonHref(t), t.title, t.id === currentId ? ' aria-current="page"' : "") + "</li>").join("") +
    "</ul></section>";
}

function indexView() {
  return '<div class="gm"><h1 class="gm-sr">Grammar</h1><div class="gm-parts">' +
    parts().map(p => '<section class="gm-part" aria-labelledby="gm-' + esc(p.id) + '"><h2 class="gm-h" id="gm-' + esc(p.id) + '">' + esc(p.title) + "</h2>" +
      '<div class="gm-cols">' + p.cats.map(c => group(c)).join("") + "</div></section>").join("") +
    "</div></div>";
}

function areaView(cat) {
  const list = inCat(cat.id);
  return '<div class="gm gm-area"><a class="gm-back" href="/grammar" data-nav>← Grammar</a>' +
    '<h1 class="gm-h">' + esc(cat.title) + '</h1><p class="gm-blurb">' + esc(cat.blurb) + '</p><p class="gm-meta">' + list.length + (list.length === 1 ? " topic" : " topics") + (range(list) ? ", " + range(list) : "") + "</p>" +
    '<ol class="gm-lessons">' + list.map(t => "<li>" + link(lessonHref(t), t.title) + '<p><span class="gm-lv">' + esc(t.lv) + "</span>" + esc(t.sum) + "</p></li>").join("") + "</ol></div>";
}

const SIDE_KEY = "nls-grammar-side";
const sideOpen = () => { try { return localStorage.getItem(SIDE_KEY) !== "0"; } catch { return true; } };

function sidebar(cat, topicId) {
  return '<aside class="gm-side" aria-label="Grammar topics"><div class="gm-side-h"><span>Topics</span><button type="button" class="link-b" data-side-hide>Hide</button></div>' +
    group(cat, topicId) +
    '<p class="gm-side-k">Other topic areas</p><ul class="gm-side-other">' +
    CATEGORIES.filter(c => c.id !== cat.id).map(c => "<li>" + link(areaHref(c), c.title) + "</li>").join("") + "</ul></aside>";
}

function lessonView(cat, t, prev, next) {
  return '<div class="gm gm-lesson' + (sideOpen() ? "" : " side-closed") + '">' + sidebar(cat, t.id) +
    '<article class="gm-main"><button type="button" class="link-b gm-show" data-side-show>Show topics</button>' +
    '<nav class="gm-crumbs" aria-label="You are here">' + link("/grammar", "Grammar") + '<span aria-hidden="true">/</span>' + link(areaHref(cat), cat.title) + "</nav>" +
    '<h1 class="gm-h">' + esc(t.title) + '</h1><p class="gm-meta"><span class="gm-lv">' + esc(t.lv) + '</span></p><p class="gm-blurb">' + esc(t.sum) + "</p>" +
    '<section class="gm-draft"><h2>This lesson is being written</h2><p>The explanation, examples from episodes and exercises for this topic will appear here.</p>' +
    "<ul><li>Explanation</li><li>Examples from episodes</li><li>Exercises</li></ul></section>" +
    '<nav class="gm-pn" aria-label="Previous and next lesson">' +
    (prev ? '<a href="' + lessonHref(prev) + '" data-nav><small>Previous</small>' + esc(prev.title) + "</a>" : "<span></span>") +
    (next ? '<a class="nx" href="' + lessonHref(next) + '" data-nav><small>Next</small>' + esc(next.title) + "</a>" : "") +
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
  const cat = CATEGORIES.find(c => c.id === catId);
  if (!cat) { main.innerHTML = notFound("topic area", "/grammar"); return; }
  if (!topicId) {
    document.title = cat.title + " — Grammar";
    main.innerHTML = areaView(cat);
    return;
  }
  const list = inCat(cat.id), i = list.findIndex(t => t.id === topicId);
  if (i < 0) { main.innerHTML = notFound("topic", areaHref(cat)); return; }
  document.title = list[i].title + " — Grammar";
  main.innerHTML = lessonView(cat, list[i], list[i - 1], list[i + 1]);
  bindSidebar(main);
}
