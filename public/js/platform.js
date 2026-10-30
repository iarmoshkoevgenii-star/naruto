/* Natalia's Language School: one page app for the cabinet and the tabs.
   Episode pages (/en/<slug>, /ja/naruto) are separate pages that share the top bar. */
import { api, esc, toast } from "./api.js";
import { mountShell } from "./shell.js";
import { cabinetHtml, bindCabinet } from "./cabinet.js";
import { teacherHome, studentView } from "./teacher.js";
import { grammarPage } from "./grammar.js";
import { trainingPage } from "./training.js";

const $ = id => document.getElementById(id);
const S = { me: null };

/* ---------- library ---------- */
const SERIES = [
  { lang: "en", slug: "desperate-housewives", title: "Desperate Housewives", sub: "Отчаянные домохозяйки" },
  { lang: "en", slug: "friends", title: "Friends", sub: "Друзья" },
  { lang: "en", slug: "sherlock-holmes", title: "Sherlock Holmes", sub: "Шерлок Холмс" },
  { lang: "ja", slug: "naruto", title: "Naruto", sub: "ナルト" },
  { lang: "ja", slug: "bleach", title: "Bleach", sub: "ブリーチ" },
  { lang: "ja", slug: "jojo", title: "JoJo’s Bizarre Adventure", sub: "ジョジョの奇妙な冒険" },
  { lang: "ja", slug: "one-piece", title: "One Piece", sub: "ワンピース" },
];
const LANG = { en: "English", ja: "Japanese" };
const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/></svg>';

async function vocabularyPage(main) {
  document.title = "Vocabulary — Natalia’s Language School";
  const me = S.me, canJa = me.langs.includes("ja");
  main.innerHTML = '<p class="loading">Loading…</p>';
  const [en, ja] = await Promise.all([
    api("GET", "/api/english").then(r => r.data.episodes).catch(() => []),
    canJa ? api("GET", "/api/data").then(r => r.data.episodes).catch(() => null) : Promise.resolve(null),
  ]);
  const ready = { "en/desperate-housewives": null };
  en.forEach(e => { ready["en/" + e.id] = e.id === "desperate-housewives" ? "Season 1, episode 1" : (e.episode || "Ready"); });
  if (ja && ja.length) ready["ja/naruto"] = ja.length + " episodes";
  const card = s => {
    const key = s.lang + "/" + s.slug, locked = !me.langs.includes(s.lang), isReady = ready[key] != null && ready[key] !== undefined && !!ready[key];
    const status = locked ? "Not in your plan yet" : isReady ? ready[key] : "Coming soon";
    const cls = "lib-card" + (isReady && !locked ? " ready" : "") + (locked ? " locked" : "");
    const inner = '<span class="lib-lang">' + LANG[s.lang] + '</span><b>' + esc(s.title) + '</b><span class="lib-sub" lang="' + (s.lang === "ja" ? "ja" : "ru") + '">' + esc(s.sub) + '</span><span class="lib-st">' + (locked ? LOCK : "") + esc(status) + "</span>";
    if (locked) return '<div class="' + cls + '" data-lang="' + s.lang + '" aria-disabled="true" title="Japanese is not included in your plan yet">' + inner + "</div>";
    const href = "/" + s.lang + "/" + s.slug;
    return '<a class="' + cls + '" data-lang="' + s.lang + '" href="' + href + '"' + (isReady ? "" : " data-nav") + ">" + inner + "</a>";
  };
  const ghost = (title, sub) => '<div class="lib-card ghost"><span class="lib-lang">Coming soon</span><b>' + esc(title) + '</b><span class="lib-sub">' + esc(sub) + "</span></div>";
  main.innerHTML = '<div class="page-h"><div><h1>Vocabulary</h1><p class="lede">Learn words from what you watch. Open an episode, mark the words you don’t know, then practise them in Training.</p></div>' +
    '<div class="seg-ctl" role="group" aria-label="Language"><button type="button" data-f="all" aria-pressed="true">All</button><button type="button" data-f="en" aria-pressed="false">English</button><button type="button" data-f="ja" aria-pressed="false">Japanese</button></div></div>' +
    '<section class="lib"><h2>TV series</h2><div class="lib-grid">' + SERIES.map(card).join("") + "</div></section>" +
    '<section class="lib"><h2>Movies</h2><div class="lib-grid">' + ghost("Feature films", "Full-length movies with the same word marking") + ghost("Short films", "Ten to twenty minutes, good for one sitting") + ghost("Cartoons", "Simple language for beginners and children") + "</div></section>" +
    '<section class="lib"><h2>Other</h2><div class="lib-grid">' + ghost("Podcasts", "Listening practice with transcripts") + ghost("YouTube", "Short videos on everyday topics") + ghost("Books", "Graded readers and short stories") + "</div></section>";
  main.querySelector(".seg-ctl").addEventListener("click", e => {
    const b = e.target.closest("button[data-f]");
    if (!b) return;
    main.querySelectorAll(".seg-ctl button").forEach(x => x.setAttribute("aria-pressed", x === b));
    main.querySelectorAll(".lib-card[data-lang]").forEach(c => { c.hidden = b.dataset.f !== "all" && c.dataset.lang !== b.dataset.f; });
  });
}

function seriesPage(main, lang, slug) {
  const s = SERIES.find(x => x.lang === lang && x.slug === slug);
  document.title = (s ? s.title : "Not found") + " — Natalia’s Language School";
  const locked = !S.me.langs.includes(lang);
  main.innerHTML = '<div class="state"><a class="back" href="/vocabulary" data-nav>← Vocabulary</a>' + (s
    ? "<h1>" + esc(s.title) + ' <span class="lib-sub" lang="' + (lang === "ja" ? "ja" : "ru") + '">' + esc(s.sub) + "</span></h1><p>" + (locked ? "Japanese is not included in your plan yet. Ask Natalia if you would like to study it." : "Episodes of this series are being prepared. They will appear here when they are ready.") + "</p>"
    : "<h1>Not found</h1><p>There is no such page. Choose something from Vocabulary.</p>") + "</div>";
}

function homeworkPage(main) {
  document.title = "Homework — Natalia’s Language School";
  main.innerHTML = '<div class="page-h"><div><h1>Homework</h1><p class="lede">Your assignments will live here.</p></div></div>' +
    '<div class="card empty-card"><svg viewBox="0 0 96 96" aria-hidden="true"><rect x="22" y="14" width="52" height="68" rx="8" fill="var(--water-soft)"/><path d="M36 14h24v10H36z" fill="var(--water)"/><path d="M34 44l8 8 18-18" fill="none" stroke="var(--water)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg><h2>No homework yet</h2><p>When Natalia gives you homework, it appears here and in the notifications in your cabinet.</p></div>';
}

/* ---------- cabinet ---------- */
async function cabinetPage(main) {
  document.title = "Personal cabinet — Natalia’s Language School";
  if (S.me.role === "teacher") return teacherHome(main);
  let marks = {};
  try { marks = (await api("GET", "/api/me?part=marks")).data.marks || {}; } catch { /* the cabinet works without them */ }
  const draw = () => {
    main.innerHTML = cabinetHtml(S.me, marks);
    bindCabinet(main, S.me, { onChange: () => { draw(); renderShell(); } });
  };
  draw();
  if (location.hash === "#notifications") { const n = $("notifications"); if (n) n.scrollIntoView({ block: "start" }); }
}

/* ---------- routing ---------- */
const ROUTES = [
  [/^\/$/, "cabinet", m => cabinetPage(m)],
  [/^\/grammar\/?$/, "grammar", m => grammarPage(m)],
  [/^\/grammar\/([a-z0-9-]+)\/?$/, "grammar", (m, a) => grammarPage(m, a[1])],
  [/^\/grammar\/([a-z0-9-]+)\/([a-z0-9_-]+)\/?$/, "grammar", (m, a) => grammarPage(m, a[1], a[2])],
  [/^\/vocabulary\/?$/, "vocabulary", m => vocabularyPage(m)],
  [/^\/(ja|en)\/([a-z0-9-]+)\/?$/, "vocabulary", (m, a) => seriesPage(m, a[1], a[2])],
  [/^\/homework\/?$/, "homework", m => homeworkPage(m)],
  [/^\/training\/?$/, "training", m => trainingPage(m, S.me)],
  [/^\/students\/([a-z0-9]+)\/?$/, "cabinet", (m, a) => S.me.role === "teacher" ? studentView(m, a[1]) : notFound(m)],
];
const notFound = m => { m.innerHTML = '<div class="state"><h1>Not found</h1><p>There is no such page. <a href="/" data-nav>Go to your cabinet</a>.</p></div>'; };
const handled = path => ROUTES.some(([re]) => re.test(path)) && !/^\/ja\/naruto\/?$/.test(path) && !/^\/en\//.test(path);
let active = "cabinet";

function renderShell() { mountShell($("shell"), S.me, active); }

async function render() {
  const path = location.pathname;
  const route = ROUTES.find(([re]) => re.test(path));
  active = route ? route[1] : "cabinet";
  renderShell();
  const main = $("main");
  main.className = "main" + (active === "grammar" ? " wide" : "");
  try {
    if (route) await route[2](main, route[0].exec(path));
    else notFound(main);
  } catch (e) {
    if (e.status === 401) return showLogin("Your session has ended. Please sign in again.");
    main.innerHTML = '<div class="state"><h1>Something went wrong</h1><p>' + esc(e.message) + "</p></div>";
  }
  if (location.hash !== "#notifications") window.scrollTo(0, 0);
}

export function navigate(url) {
  history.pushState(null, "", url);
  render();
}

document.addEventListener("click", e => {
  const a = e.target.closest("a[href]");
  if (!a || a.target || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || !handled(url.pathname)) return;
  e.preventDefault();
  if (url.pathname === location.pathname && url.hash) { location.hash = url.hash; const t = document.getElementById(url.hash.slice(1)); if (t) t.scrollIntoView({ block: "start" }); return; }
  navigate(url.pathname + url.search + url.hash);
});
window.addEventListener("popstate", render);

/* ---------- login ---------- */
function safeNext() {
  const next = new URLSearchParams(location.search).get("next") || "";
  return /^\/(?!\/)[\w\-/#.?=&%]*$/.test(next) ? next : null;
}

function showLogin(message) {
  $("bootView").hidden = true; $("appView").hidden = true; $("loginView").hidden = false;
  const err = $("loginErr");
  err.textContent = message || ""; err.hidden = !message;
  setTimeout(() => $("loginName").focus(), 0);
}

function bindLogin() {
  const form = $("loginForm"), btn = form.querySelector("button[type=submit]"), err = $("loginErr");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (!form.login.value.trim() || !form.password.value) { err.textContent = "Enter your login and password."; err.hidden = false; return; }
    err.hidden = true; btn.disabled = true; btn.textContent = "Signing in…";
    try {
      await api("POST", "/api/auth?action=login", { login: form.login.value, password: form.password.value });
      const next = safeNext();
      location.replace(next || "/");
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
      btn.disabled = false; btn.textContent = "Sign in";
      form.password.select();
    }
  });
}

async function boot() {
  bindLogin();
  try { S.me = (await api("GET", "/api/me")).data; }
  catch (e) {
    if (e.status === 401) return showLogin();
    if (e.data && e.data.setup) return showLogin(e.message);
    $("bootView").textContent = "The site could not load. " + e.message;
    return;
  }
  const next = safeNext();
  if (next) { location.replace(next); return; }
  $("bootView").hidden = true; $("appView").hidden = false;
  await render();
}

boot();
