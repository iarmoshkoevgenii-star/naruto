/* Home page: login, language choice, series list, empty series pages.
   Series with a page in content/ (or Naruto) are marked ready automatically. */
const CATALOG = {
  ja: {
    name: "Японский", native: "日本語",
    series: [
      { slug: "naruto", title: "Наруто", orig: "ナルト" },
      { slug: "bleach", title: "Блич", orig: "ブリーチ" },
      { slug: "jojo", title: "ДжоДжо", orig: "ジョジョの奇妙な冒険" },
      { slug: "one-piece", title: "Ван-Пис", orig: "ワンピース" },
    ],
  },
  en: {
    name: "Английский", native: "English",
    series: [
      { slug: "friends", title: "Друзья", orig: "Friends" },
      { slug: "desperate-housewives", title: "Отчаянные домохозяйки", orig: "Desperate Housewives", note: "Готова серия 1: «Pilot»" },
      { slug: "sherlock-holmes", title: "Шерлок Холмс", orig: "Sherlock Holmes" },
    ],
  },
};

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const state = { role: null, pages: new Set(), naruto: null };

async function api(method, url, body) {
  const init = { method, credentials: "same-origin", headers: { "X-Requested-With": "naruto-study" } };
  if (body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, init); } catch { throw Object.assign(new Error("Нет связи с сервером. Проверьте интернет и повторите."), { status: 0 }); }
  const data = (res.headers.get("content-type") || "").includes("application/json") ? await res.json().catch(() => null) : null;
  if (!res.ok) throw Object.assign(new Error((data && data.error) || "Ошибка " + res.status), { status: res.status, data });
  return data;
}

function show(view) {
  $("bootView").hidden = view !== "boot";
  $("loginView").hidden = view !== "login";
  $("homeView").hidden = view !== "home";
}

/* "8–16, 18" from [8,...,16,18] */
function ranges(nums) {
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    out.push(j > i ? nums[i] + "–" + nums[j] : String(nums[i]));
    i = j;
  }
  return out.join(", ");
}

const isReady = (lang, slug) => (lang === "ja" && slug === "naruto") || state.pages.has(lang + "/" + slug);

function statusOf(lang, s) {
  if (lang === "ja" && s.slug === "naruto") {
    const n = state.naruto;
    return n && n.length ? (n.length === 1 ? "Готов эпизод " : "Готовы эпизоды ") + ranges(n) : "Готово";
  }
  return isReady(lang, s.slug) ? (s.note || "Готово") : "Пока пусто";
}

function countWord(n) {
  const n10 = n % 10, n100 = n % 100;
  return n + " " + (n10 === 1 && n100 !== 11 ? "сериал" : n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14) ? "сериала" : "сериалов");
}

function viewLanguages() {
  document.title = "Разборы сериалов";
  return '<h1>Какой язык?</h1><p class="lede">Внутри каждого языка: сериалы с разборами реплик, слов и грамматики.</p><div class="langs">' +
    Object.entries(CATALOG).map(([code, l]) => {
      const ready = l.series.filter(s => isReady(code, s.slug)).length;
      return '<a class="lang" href="#' + code + '"><span class="lang-native" lang="' + code + '">' + esc(l.native) + '</span>' +
        '<span class="lang-name">' + esc(l.name) + '</span><span class="lang-meta">' + countWord(l.series.length) + ', готово: ' + ready + '</span></a>';
    }).join("") + '</div>';
}

function heading(text, accent, lang) {
  return '<h1>' + esc(text) + '<span class="' + (lang === "ja" ? "jp" : "en") + '" lang="' + lang + '">' + esc(accent) + '</span></h1>';
}

function viewSeriesList(code) {
  const l = CATALOG[code];
  document.title = l.name + " — разборы сериалов";
  return '<a class="back" href="/">← Все языки</a>' + heading(l.name, l.native, code) +
    '<p class="lede">Готовые разборы отмечены оранжевой полосой. Остальные появятся позже.</p><div class="series">' +
    l.series.map(s => {
      const ready = isReady(code, s.slug);
      return '<a class="sr' + (ready ? " ready" : "") + '" href="/' + code + '/' + s.slug + '">' +
        '<span class="sr-orig" lang="' + code + '">' + esc(s.orig) + '</span><span class="sr-title">' + esc(s.title) + '</span>' +
        '<span class="sr-status">' + esc(statusOf(code, s)) + '</span></a>';
    }).join("") + '</div>';
}

function viewEmpty(code, slug) {
  const l = CATALOG[code], s = l && l.series.find(x => x.slug === slug);
  const back = l ? '<a class="back" href="/#' + code + '">← ' + esc(l.name) + ': все сериалы</a>' : '<a class="back" href="/">← Все языки</a>';
  if (!s) { document.title = "Страница не найдена"; return back + '<div class="empty-page"><h1>Такой страницы нет</h1><p class="lede">Проверьте адрес или выберите сериал из списка.</p></div>'; }
  document.title = s.title + " — разборы сериалов";
  return back + '<div class="empty-page">' + heading(s.title, s.orig, code) + '<p class="lede">Разборов этого сериала пока нет. Они появятся здесь, когда будут готовы.</p></div>';
}

function render() {
  const path = location.pathname.replace(/\/+$/, "");
  const m = /^\/(ja|en)\/([a-z0-9-]+)$/.exec(path);
  const hash = location.hash.slice(1);
  let html;
  if (m) html = viewEmpty(m[1], m[2]);
  else if (CATALOG[hash]) html = viewSeriesList(hash);
  else html = viewLanguages();
  $("homeMain").innerHTML = html;
}

function renderAccount() {
  $("acct").innerHTML = (state.role === "dev" ? '<span class="role">Разработчик</span>' : "") + '<button type="button" class="link-btn" id="logoutBtn">Выйти</button>';
  $("logoutBtn").addEventListener("click", async () => {
    try { await api("POST", "/api/auth?action=logout", {}); } catch { /* ignore */ }
    location.href = "/";
  });
}

function safeNext() {
  const next = new URLSearchParams(location.search).get("next") || "";
  return /^\/(?!\/)[\w\-/#.]*$/.test(next) ? next : null;
}

function bindLogin() {
  const form = $("loginForm"), btn = form.querySelector("button[type=submit]"), err = $("loginErr");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (!form.login.value.trim() || !form.password.value) { err.textContent = "Введите логин и пароль."; err.hidden = false; return; }
    err.hidden = true; btn.disabled = true; btn.textContent = "Вхожу…";
    try {
      await api("POST", "/api/auth?action=login", { login: form.login.value, password: form.password.value });
      const next = safeNext();
      if (next) location.href = next; else location.reload();
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
      btn.disabled = false; btn.textContent = "Войти";
      form.password.select();
    }
  });
}

function showLogin(message) {
  show("login");
  const err = $("loginErr");
  err.textContent = message || ""; err.hidden = !message;
  setTimeout(() => $("loginName").focus(), 0);
}

async function boot() {
  bindLogin();
  let me;
  try { me = await api("GET", "/api/auth"); }
  catch (e) {
    if (e.status === 401) return showLogin();
    if (e.data && e.data.setup) return showLogin(e.message);
    $("bootView").textContent = "Не удалось загрузить сайт. " + e.message;
    return;
  }
  const next = safeNext();
  if (next) { location.replace(next); return; }
  state.role = me.role;
  const [pages, data] = await Promise.all([
    api("GET", "/api/content?list=1").catch(() => ({ pages: [] })),
    api("GET", "/api/data").catch(() => null),
  ]);
  state.pages = new Set((pages.pages || []).map(p => p.id));
  state.naruto = data ? data.episodes : null;
  renderAccount();
  show("home");
  render();
  window.addEventListener("hashchange", () => { render(); $("homeMain").focus({ preventScroll: true }); window.scrollTo(0, 0); });
}

boot();
