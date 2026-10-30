/* Grammar tab: broad categories first, then the topics of one category, then a topic page.
   Topic pages keep a compact list of topics on the left that can be hidden. */
import { esc } from "./api.js";
import { CATEGORIES, TOPICS } from "./grammar-data.js";

const ORDER = ["A1", "A1–A2", "A2", "A2–B1", "B1", "B1–B2", "B2", "B2–C1", "C1", "C2"];
const inCat = id => TOPICS.filter(t => t.cat === id);
function range(list) {
  const idx = list.flatMap(t => t.lv.split("–")).map(l => ORDER.indexOf(l)).filter(i => i >= 0).sort((a, b) => a - b);
  if (!idx.length) return "";
  const lo = ORDER[idx[0]], hi = ORDER[idx[idx.length - 1]];
  return lo === hi ? lo : lo + "–" + hi;
}
const SIDE_KEY = "nls-grammar-side";
const sideOpen = () => { try { return localStorage.getItem(SIDE_KEY) !== "0"; } catch { return true; } };

function sidebar(catId, topicId) {
  return '<aside class="gr-side" aria-label="Grammar topics"><div class="gr-side-h"><b>Topics</b><button type="button" class="link-b" data-side-hide>Hide</button></div><nav class="gr-nav">' +
    CATEGORIES.map(c => {
      const open = c.id === catId;
      return '<div class="gr-cat' + (open ? " open" : "") + '"><a href="/grammar/' + c.id + '" data-nav' + (open && !topicId ? ' aria-current="page"' : "") + "><span>" + esc(c.title) + "</span><small>" + inCat(c.id).length + "</small></a>" +
        (open ? "<ul>" + inCat(c.id).map(t => '<li><a href="/grammar/' + c.id + "/" + t.id + '" data-nav' + (t.id === topicId ? ' aria-current="page"' : "") + ">" + esc(t.title) + "</a></li>").join("") + "</ul>" : "") + "</div>";
    }).join("") + "</nav></aside>";
}

function shell(catId, topicId, body) {
  return '<div class="gr' + (sideOpen() ? "" : " side-closed") + '">' + sidebar(catId, topicId) +
    '<div class="gr-main"><button type="button" class="p-btn small gr-show" data-side-show>Show topics</button>' + body + "</div></div>";
}

function bind(main) {
  const gr = main.querySelector(".gr");
  if (!gr) return;
  const set = open => { gr.classList.toggle("side-closed", !open); try { localStorage.setItem(SIDE_KEY, open ? "1" : "0"); } catch { /* ignore */ } };
  main.querySelector("[data-side-hide]").addEventListener("click", () => set(false));
  main.querySelector("[data-side-show]").addEventListener("click", () => set(true));
}

export function grammarPage(main, catId, topicId) {
  if (!catId) {
    document.title = "Grammar — Natalia’s Language School";
    main.innerHTML = '<div class="page-h"><div><h1>Grammar</h1><p class="lede">Start with a topic area, then open a lesson inside it.</p></div></div>' +
      '<div class="gr-cats">' + CATEGORIES.map(c => {
        const list = inCat(c.id);
        return '<a class="gr-card" href="/grammar/' + c.id + '" data-nav><b>' + esc(c.title) + "</b><span>" + esc(c.blurb) + '</span><small>' + list.length + " topics, " + range(list) + "</small></a>";
      }).join("") + "</div>";
    return;
  }
  const cat = CATEGORIES.find(c => c.id === catId);
  if (!cat) { main.innerHTML = '<div class="state"><a class="back" href="/grammar" data-nav>← Grammar</a><h1>Not found</h1><p>This topic area does not exist.</p></div>'; return; }
  const list = inCat(cat.id);
  if (!topicId) {
    document.title = cat.title + " — Grammar";
    main.innerHTML = shell(cat.id, null, '<nav class="crumbs"><a href="/grammar" data-nav>Grammar</a></nav><h1>' + esc(cat.title) + '</h1><p class="lede">' + esc(cat.blurb) + "</p>" +
      '<ol class="gr-list">' + list.map((t, i) => '<li><a href="/grammar/' + cat.id + "/" + t.id + '" data-nav><span class="n">' + String(i + 1).padStart(2, "0") + '</span><span class="t"><b>' + esc(t.title) + "</b><span>" + esc(t.sum) + '</span></span><span class="lv">' + esc(t.lv) + "</span></a></li>").join("") + "</ol>");
    bind(main);
    return;
  }
  const i = list.findIndex(t => t.id === topicId);
  const t = list[i];
  if (!t) { main.innerHTML = shell(cat.id, null, '<nav class="crumbs"><a href="/grammar" data-nav>Grammar</a> / <a href="/grammar/' + cat.id + '" data-nav>' + esc(cat.title) + "</a></nav><h1>Not found</h1><p class=\"lede\">This topic does not exist.</p>"); bind(main); return; }
  document.title = t.title + " — Grammar";
  const prev = list[i - 1], next = list[i + 1];
  main.innerHTML = shell(cat.id, t.id,
    '<nav class="crumbs"><a href="/grammar" data-nav>Grammar</a> / <a href="/grammar/' + cat.id + '" data-nav>' + esc(cat.title) + "</a></nav>" +
    '<div class="gr-title"><h1>' + esc(t.title) + '</h1><span class="lv">' + esc(t.lv) + '</span></div><p class="lede">' + esc(t.sum) + "</p>" +
    '<section class="card lesson-empty"><h2>This lesson is being written</h2><p>The explanation, examples from episodes and exercises for this topic will appear here.</p>' +
    '<ul class="ghost"><li>Explanation</li><li>Examples from episodes</li><li>Exercises</li></ul></section>' +
    '<nav class="gr-pn">' + (prev ? '<a href="/grammar/' + cat.id + "/" + prev.id + '" data-nav><small>Previous</small>' + esc(prev.title) + "</a>" : "<span></span>") +
    (next ? '<a class="nx" href="/grammar/' + cat.id + "/" + next.id + '" data-nav><small>Next</small>' + esc(next.title) + "</a>" : "") + "</nav>");
  bind(main);
}
