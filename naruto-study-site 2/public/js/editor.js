/* Developer mode. Loaded only after a developer login; the server also refuses
   every change that does not come with a developer session. */
import * as M from "./model.js";

const { esc, plain, LV_ORDER, LEVELS } = M;

export function initEditor(E) {
  const S = E.S;
  const body = document.body;
  const guide = document.getElementById("guide");
  const field = (form, name) => form.elements.namedItem(name);
  const val = (form, name) => (field(form, name)?.value ?? "").trim();

  /* ---------------- toolbar ---------------- */
  const barIn = document.getElementById("barIn");
  const spacer = barIn.querySelector(".spacer");
  const tg = document.createElement("label");
  tg.className = "tg tg-edit";
  tg.innerHTML = '<input type="checkbox" id="tEdit"><span class="sw"></span>Правка';
  barIn.insertBefore(tg, spacer);
  const dataBtn = document.createElement("button");
  dataBtn.type = "button"; dataBtn.className = "btn data-btn"; dataBtn.id = "dataBtn"; dataBtn.textContent = "Данные";
  spacer.after(dataBtn);
  const hint = document.createElement("div");
  hint.className = "edit-hint";
  hint.innerHTML = '<div class="edit-hint-in"><b>Режим правки.</b> Выделите часть реплики, чтобы отметить слово или грамматику. Нажмите на отметку, чтобы изменить её или удалить.<span class="warn" id="storeWarn" hidden></span></div>';
  document.querySelector(".bar").appendChild(hint);
  const tEdit = document.getElementById("tEdit");

  function updateStorageWarning() {
    const w = document.getElementById("storeWarn");
    w.hidden = S.storage.writable;
    w.textContent = "Хранилище не подключено: правки не сохранятся. Подключите Vercel Blob (Private) к проекту и сделайте Redeploy.";
  }
  updateStorageWarning();

  /* The toolbar grows by the hint row in edit mode: keep the plan panel and
     jump-to-line scrolling clear of it. */
  const barEl = document.querySelector(".bar");
  const syncBarHeight = () => {
    const h = barEl.offsetHeight;
    document.documentElement.style.setProperty("--bar-h", h + "px");
    document.documentElement.style.scrollPaddingTop = body.classList.contains("editing") ? "calc(env(safe-area-inset-top, 0px) + " + (h + 12) + "px)" : "";
  };
  if (window.ResizeObserver) new ResizeObserver(syncBarHeight).observe(barEl);

  function setEditing(on) {
    body.classList.toggle("editing", on);
    syncBarHeight();
    tEdit.checked = on;
    try { localStorage.setItem("ns-edit", on ? "1" : "0"); } catch { /* private mode */ }
    if (!on) hideBar();
  }
  tEdit.addEventListener("change", () => setEditing(tEdit.checked));

  /* ---------------- selection → floating bar ---------------- */
  const bar = document.createElement("div");
  bar.className = "markbar"; bar.hidden = true;
  bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "Разметка выделенного текста");
  bar.innerHTML = '<span class="mb-sel" lang="ja"></span><button type="button" data-mark="v">＋ Слово</button><button type="button" data-mark="g">＋ Грамматика</button>';
  document.body.appendChild(bar);
  let pending = null;

  const jplOf = node => { const el = node && (node.nodeType === 1 ? node : node.parentElement); return el ? el.closest(".jpl") : null; };

  function readSelection() {
    if (!body.classList.contains("editing")) return null;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0).cloneRange();
    const jpl = jplOf(range.startContainer);
    if (!jpl || jpl !== jplOf(range.endContainer) || !guide.contains(jpl)) return null;
    const art = jpl.closest("article.ln");
    const ref = art && E.lineRef(art.id.slice(2));
    if (!ref) return null;
    // A drag that starts or ends on furigana snaps to the whole kanji block.
    const rtStart = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement).closest("rt");
    if (rtStart) range.setStartBefore(rtStart.parentElement);
    const rtEnd = (range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement).closest("rt");
    if (rtEnd) range.setEndAfter(rtEnd.parentElement);
    const lenTo = (node, offset) => {
      const r = document.createRange();
      r.setStart(jpl, 0); r.setEnd(node, offset);
      const frag = r.cloneContents();
      frag.querySelectorAll("rt,rp,.tag-echo").forEach(x => x.remove());
      return frag.textContent.length;
    };
    const text = plain(ref.ln.j);
    let a = Math.min(lenTo(range.startContainer, range.startOffset), text.length);
    let b = Math.min(lenTo(range.endContainer, range.endOffset), text.length);
    [a, b] = M.trimRange(text, a, b);
    if (a >= b) return null;
    return { lid: ref.ln._lid, a, b, text: text.slice(a, b), rect: sel.getRangeAt(0).getBoundingClientRect() };
  }

  function showBar(p) {
    pending = p;
    bar.querySelector(".mb-sel").textContent = p.text;
    bar.hidden = false;
    const bw = bar.offsetWidth, bh = bar.offsetHeight, r = p.rect;
    const coarse = matchMedia("(pointer: coarse)").matches;
    let top = coarse ? r.bottom + 14 : r.top - bh - 10;
    if (!coarse && top < 72) top = r.bottom + 10;
    const maxLeft = document.documentElement.clientWidth - bw - 8;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - bw / 2, maxLeft));
    bar.style.top = (top + window.scrollY) + "px";
    bar.style.left = (left + window.scrollX) + "px";
  }
  function hideBar() { bar.hidden = true; pending = null; }

  let selTimer = 0;
  document.addEventListener("selectionchange", () => {
    clearTimeout(selTimer);
    selTimer = setTimeout(() => { if (dlg.open) return; const p = readSelection(); p ? showBar(p) : hideBar(); }, 120);
  });
  window.addEventListener("resize", () => { if (!bar.hidden) { const p = readSelection(); p ? showBar(p) : hideBar(); } });
  // Keep the text selected while the bar's buttons are pressed.
  bar.addEventListener("pointerdown", e => e.preventDefault());
  bar.addEventListener("mousedown", e => e.preventDefault());
  bar.addEventListener("click", e => {
    const b = e.target.closest("button[data-mark]");
    if (!b || !pending) return;
    const p = pending;
    hideBar();
    window.getSelection().removeAllRanges();
    if (b.dataset.mark === "v") openVocab({ lid: p.lid, a: p.a, b: p.b });
    else openGrammar({ lid: p.lid, a: p.a, b: p.b });
  });

  /* ---------------- clicks on the page in edit mode ---------------- */
  guide.addEventListener("click", e => {
    const tool = e.target.closest(".ed-tools button[data-ed]");
    if (tool) {
      e.preventDefault(); e.stopPropagation();
      const lid = tool.dataset.lid;
      if (tool.dataset.ed === "line") openLine(lid);
      else if (tool.dataset.ed === "v") openVocab({ lid });
      else openGrammar({ lid });
      return;
    }
    if (!body.classList.contains("editing")) return;
    const vc = e.target.closest("button.vc");
    if (vc) { e.preventDefault(); e.stopPropagation(); openVocab({ vkey: vc.dataset.vkey }); return; }
    const g = e.target.closest("label.g");
    if (g) { e.preventDefault(); e.stopPropagation(); openGrammar({ id: g.dataset.id }); }
  }, true);

  /* ---------------- dialog plumbing ---------------- */
  const dlg = document.createElement("dialog");
  dlg.className = "ed-dlg";
  dlg.setAttribute("aria-labelledby", "edTitle");
  document.body.appendChild(dlg);
  let busy = false, downOnBackdrop = false;
  dlg.addEventListener("cancel", e => { if (busy) e.preventDefault(); });
  dlg.addEventListener("mousedown", e => { downOnBackdrop = e.target === dlg; });
  dlg.addEventListener("click", e => { if (e.target === dlg && downOnBackdrop && !busy) dlg.close(); });

  const head = (title, sub) => '<div class="ed-head"><h2 id="edTitle">' + esc(title) + '</h2>' + (sub ? '<p class="ed-src">' + esc(sub) + '</p>' : '') + '</div>';
  const foot = (submitLabel, canDelete, deleteLabel = "Удалить") =>
    '<div class="ed-foot">' + (canDelete ? '<button type="button" class="btn danger" data-act="delete">' + esc(deleteLabel) + '</button>' : '') +
    '<span class="spacer"></span><button type="button" class="btn" data-act="cancel">Отмена</button>' +
    (submitLabel ? '<button type="submit" class="btn primary">' + esc(submitLabel) + '</button>' : '') + '</div>';
  const input = (name, label, value, { lang, hint, required, textarea, rows = 3, placeholder } = {}) =>
    '<label class="ed-field"><span>' + esc(label) + '</span>' +
    (textarea
      ? '<textarea name="' + name + '" rows="' + rows + '"' + (lang ? ' lang="' + lang + '"' : '') + (required ? ' required' : '') + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + '>' + esc(value || "") + '</textarea>'
      : '<input name="' + name + '" value="' + esc(value || "") + '"' + (lang ? ' lang="' + lang + '"' : '') + (required ? ' required' : '') + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + ' autocomplete="off" spellcheck="false">') +
    (hint ? '<small>' + esc(hint) + '</small>' : '') + '</label>';
  const speakerName = ln => { const key = ln.s.replace("?", ""); return (E.speakers[key] || { name: key }).name; };
  const srcLine = ref => "Эпизод " + ref.num + ", " + ref.ln.t + ", " + speakerName(ref.ln);
  const linePreview = (ln, range) =>
    '<div><p class="ed-line" lang="ja">' + M.rubyWithMark(ln.j, range ? range[0] : null, range ? range[1] : null) + '</p><p class="ed-line-ru">' + esc(ln.r) + '</p></div>';

  function showErrors(form, err) {
    const box = form.querySelector(".ed-errs");
    const list = [err.message, ...((err.data && err.data.errors) || [])];
    box.innerHTML = list.map(x => "<li>" + esc(x) + "</li>").join("");
    box.scrollIntoView({ block: "nearest" });
  }

  /* Runs a save action with the dialog locked; closes it on success. */
  async function runAction(form, button, label, fn) {
    if (busy) return;
    busy = true;
    const buttons = [...form.querySelectorAll(".ed-foot button")];
    buttons.forEach(b => { b.disabled = true; });
    const original = button ? button.textContent : "";
    if (button) button.textContent = label;
    form.querySelector(".ed-errs").innerHTML = "";
    try {
      const keepOpen = await fn();
      busy = false;
      if (!keepOpen) dlg.close();
    } catch (err) {
      busy = false;
      showErrors(form, err);
      if (err.status === 401) dlg.close();
    } finally {
      buttons.forEach(b => { b.disabled = false; });
      if (button && dlg.open) button.textContent = original;
    }
  }

  function openDialog(html, { onSubmit, onDelete, setup, focus } = {}) {
    hideBar();
    dlg.innerHTML = '<form class="ed-form" novalidate>' + html + '</form>';
    const form = dlg.querySelector("form");
    form.addEventListener("submit", e => {
      e.preventDefault();
      if (onSubmit) runAction(form, form.querySelector('button[type="submit"]'), "Сохраняю…", () => onSubmit(form));
    });
    form.addEventListener("click", e => {
      const act = e.target.closest("button[data-act]");
      if (!act) return;
      if (act.dataset.act === "cancel") { if (!busy) dlg.close(); return; }
      if (act.dataset.act === "delete" && onDelete) {
        if (!act.dataset.armed) { act.dataset.armed = "1"; act.textContent = "Точно удалить?"; return; }
        runAction(form, act, "Удаляю…", () => onDelete(form));
      }
    });
    if (setup) setup(form);
    // On touch screens focusing a field opens the keyboard over the sheet: focus the heading instead.
    const touch = matchMedia("(pointer: coarse)").matches;
    const title = form.querySelector("#edTitle");
    if (touch && title) { title.tabIndex = -1; title.setAttribute("autofocus", ""); }
    if (!dlg.open) dlg.showModal();
    if (touch) { if (title) title.focus({ preventScroll: true }); return form; }
    const first = focus ? form.querySelector(focus) : form.querySelector("input:not([type=search]):not([type=checkbox]):not([type=file]),textarea");
    if (first) {
      first.focus();
      if (first.selectionStart != null) { const n = first.value.length; first.setSelectionRange(n, n); } // text fields only
    }
    return form;
  }

  const rejectPipes = (...values) => {
    if (values.some(v => v.includes("|"))) throw new E.ApiError(0, "Символ | нельзя использовать: он разделяет поля слова.");
  };
  const meanings = m => m.split(/[;；]/).map(s => s.trim()).filter(Boolean).join("; ");

  /* ---------------- word (Anki chip) ---------------- */
  function vocabUses(w, exceptKey) {
    return Object.entries(E.VOCAB).filter(([k, v]) => k !== exceptKey && (v.w === w || M.stripParen(v.w) === M.stripParen(w)));
  }

  function openVocab({ lid, a, b, vkey }) {
    let vi = -1, init = { w: "", r: "", m: "" }, range = null, readingHint = "";
    if (vkey) {
      const v = E.VOCAB[vkey];
      if (!v) return;
      lid = v.lid; vi = Number(vkey.split("~").pop());
      init = { w: v.w, r: v.r, m: v.m };
    }
    const ref = E.lineRef(lid);
    if (!ref) return;
    if (vkey) range = M.locate(ref.ln.j, init.w);
    else if (a != null) {
      const rd = M.readingFor(ref.ln.j, a, b);
      init = { w: rd.text, r: rd.reading, m: "" };
      range = [a, b];
      if (!rd.complete) readingHint = "Чтение не удалось взять из фуриганы: выделение режет слово с одним общим чтением или в нём есть кандзи без чтения. Впишите его сами.";
    }
    const html = head(vkey ? "Слово для карточек" : "Новое слово для карточек", srcLine(ref)) + '<div class="ed-body">' +
      linePreview(ref.ln, range) +
      input("w", "Слово в словарной форме", init.w, { lang: "ja", required: true, hint: "Например, 倒す, а не 倒せない. Слово с редким кандзи пишите сначала каной: ぐち（愚痴）, чтение тогда пустое." }) +
      input("r", "Чтение", init.r, { lang: "ja", hint: readingHint || "Каной. Оставьте пустым, если слово записано только каной. Для словарной формы поправьте и чтение." }) +
      input("m", "Переводы", init.m, { required: true, hint: "2–4 варианта через «; ». В карточке можно будет выбрать любой из них.", placeholder: "догнать; угнаться; поспеть" }) +
      '<p class="ed-note" data-note hidden></p>' +
      '<div class="ed-prev"><span>Так слово будет выглядеть в разборе</span><div class="vocab" data-prev></div></div>' +
      '<ul class="ed-errs"></ul></div>' +
      foot(vkey ? "Сохранить слово" : "Добавить слово", !!vkey, "Удалить слово");

    openDialog(html, {
      focus: vkey ? 'input[name="m"]' : 'input[name="w"]',
      setup(form) {
        const note = form.querySelector("[data-note]"), prev = form.querySelector("[data-prev]");
        const refresh = () => {
          const w = val(form, "w"), r = val(form, "r"), m = meanings(val(form, "m"));
          prev.innerHTML = w ? E.chipHtml({ w, r, m: m || "…" }, "preview") : "";
          const uses = w ? vocabUses(w, vkey) : [];
          const here = uses.filter(([, v]) => v.ep === ref.num);
          const elsewhere = uses.filter(([, v]) => v.ep !== ref.num);
          let msg = "";
          if (here.length) msg = "Это слово уже отмечено в этом эпизоде (" + here.map(([, v]) => v.t).join(", ") + "). Обычно слово отмечают один раз, в самой понятной реплике.";
          else if (elsewhere.length) { const [, v] = elsewhere[0]; msg = "Слово уже было в эпизоде " + v.ep + " (" + v.t + "): «" + v.m + "»."; }
          note.innerHTML = esc(msg) + (elsewhere.length && !here.length && !val(form, "m") ? ' <button type="button" class="link-btn" data-copy-m>Взять этот перевод</button>' : "");
          note.hidden = !msg;
        };
        form.addEventListener("input", refresh);
        form.addEventListener("click", e => {
          if (!e.target.closest("[data-copy-m]")) return;
          const hit = vocabUses(val(form, "w"), vkey).find(([, v]) => v.ep !== ref.num);
          if (hit) { field(form, "m").value = hit[1].m; if (!val(form, "r")) field(form, "r").value = hit[1].r; refresh(); }
        });
        refresh();
      },
      async onSubmit(form) {
        const w = val(form, "w"), r = val(form, "r"), m = meanings(val(form, "m"));
        if (!w || !m) throw new E.ApiError(0, "Заполните слово и хотя бы один перевод.");
        rejectPipes(w, r, m);
        const entry = w + "|" + r + "|" + m;
        await E.commitLine(lid, ln => {
          ln.v = ln.v || [];
          if (vi >= 0) ln.v[vi] = entry; else ln.v.push(entry);
        });
        E.toast(vi >= 0 ? "Слово сохранено" : "Слово добавлено");
      },
      async onDelete() {
        await E.commitLine(lid, ln => { ln.v.splice(vi, 1); });
        E.toast("Слово удалено");
      },
    });
  }

  /* ---------------- grammar (plan note) ---------------- */
  const sortedTopics = () => Object.entries(E.topics).sort(([, x], [, y]) =>
    (LV_ORDER[x.lv] || 9) - (LV_ORDER[y.lv] || 9) || x.t.localeCompare(y.t, "ru"));

  function topicByPattern(p) {
    const key = p.replace(/^[〜~]/, "");
    const count = {};
    for (const n of Object.values(E.NOTE_INDEX)) if (n.pat.replace(/^[〜~]/, "") === key) count[n.topic] = (count[n.topic] || 0) + 1;
    const best = Object.entries(count).sort((x, y) => y[1] - x[1])[0];
    return best ? best[0] : "";
  }

  function openGrammar({ lid, a, b, id }) {
    let gi = -1, init = { topic: "", p: "", x: "" }, range = null, suggested = false;
    if (id) {
      const n = E.NOTE_INDEX[id];
      if (!n) return;
      lid = n.lid; gi = Number(id.split("-").pop());
      init = { topic: n.topic, p: n.pat, x: n.txt };
    }
    const ref = E.lineRef(lid);
    if (!ref) return;
    if (id) range = M.locate(ref.ln.j, init.p);
    else if (a != null) {
      init.p = plain(ref.ln.j).slice(a, b);
      range = [a, b];
      init.topic = topicByPattern(init.p);
      suggested = !!init.topic;
    }
    const levelOptions = LEVELS.map(l => '<option' + (l === "N4" ? " selected" : "") + '>' + l + '</option>').join("");
    const html = head(id ? "Разбор грамматики" : "Новый разбор грамматики", srcLine(ref)) + '<div class="ed-body">' +
      linePreview(ref.ln, range) +
      input("p", "Форма, как в реплике", init.p, { lang: "ja", required: true, hint: "Например, 吐かせて или 〜てから." }) +
      '<div class="ed-field tp"><span>Тема в плане повторения</span>' +
      '<p class="tp-chosen" data-chosen></p>' +
      '<input type="search" class="tp-search" placeholder="Найти тему: ておく, условие, пассив…" aria-label="Найти тему">' +
      '<div class="tp-list" role="listbox" aria-label="Темы"></div>' +
      (suggested ? '<small>Тема подобрана по такому же разбору в другой реплике. Проверьте её.</small>' : '') +
      '<button type="button" class="tp-new" data-newtopic>Новая тема…</button></div>' +
      '<div class="tp-form" data-tpform hidden><h3>Новая тема</h3>' +
      '<div class="ed-row">' + input("tid", "Код темы", "", { hint: "Латиница, цифры и _: например, te_kara. На странице не виден." }) +
      '<label class="ed-field"><span>Уровень</span><select name="tlv">' + levelOptions + '</select></label></div>' +
      input("tt", "Название", "", { hint: "Шаблон и смысл через двоеточие: «〜ておく: заранее, на будущее». В разборе видна часть до двоеточия." }) +
      input("tref", "Раздел справочника", "", { hint: "Например, §3. Можно оставить пустым." }) +
      input("twhy", "Зачем", "", { textarea: true, rows: 2, hint: "Одно предложение: почему тема важна." }) +
      input("tstudy", "Что повторить", "", { textarea: true, rows: 2, hint: "Шаблоны для повторения, с примерами из серий." }) +
      input("ttask", "Упражнение", "", { textarea: true, rows: 2, hint: "Одно конкретное задание." }) +
      '<label class="tp-check"><input type="checkbox" name="trec">Достаточно узнавать на слух (грубая или старомодная речь)</label>' +
      '<button type="button" class="tp-new" data-pickexisting>Выбрать тему из списка</button></div>' +
      input("x", "Пояснение", init.x, { textarea: true, rows: 3, required: true, hint: "Одно-два коротких предложения по-русски: что это за форма и что она делает здесь. Кавычки «», шаблоны с 〜." }) +
      '<div class="ed-prev"><span>Так разбор будет выглядеть</span><div data-prev></div></div>' +
      '<ul class="ed-errs"></ul></div>' +
      foot(id ? "Сохранить разбор" : "Добавить разбор", !!id, "Удалить разбор");

    let topic = init.topic, newTopic = false;
    openDialog(html, {
      focus: id ? 'textarea[name="x"]' : (init.topic ? 'textarea[name="x"]' : ".tp-search"),
      setup(form) {
        const list = form.querySelector(".tp-list"), search = form.querySelector(".tp-search");
        const tpForm = form.querySelector("[data-tpform]"), newBtn = form.querySelector("[data-newtopic]");
        const prev = form.querySelector("[data-prev]");
        const renderList = () => {
          const q = search.value.trim().toLowerCase();
          const items = sortedTopics().filter(([k, t]) => !q || (t.t + " " + k + " " + (t.ref || "")).toLowerCase().includes(q));
          list.innerHTML = items.length ? items.map(([k, t]) =>
            '<button type="button" role="option" data-topic="' + esc(k) + '" aria-selected="' + (k === topic && !newTopic) + '">' + esc(t.t) + '<span class="lv">' + esc(t.lv) + '</span></button>').join("")
            : '<div class="tp-empty">Ничего не нашлось. Создайте новую тему.</div>';
        };
        const chosen = form.querySelector("[data-chosen]");
        const refresh = () => {
          const cur = E.topics[topic];
          chosen.innerHTML = newTopic ? "Будет создана новая тема." : cur ? "Выбрано: <b>" + esc(cur.t) + "</b> " + esc(cur.lv) : "Тема не выбрана: найдите её в списке.";
          const t = newTopic ? (val(form, "tid") || "new") : topic;
          const g = [t, val(form, "p") || "…", val(form, "x") || "…"];
          prev.innerHTML = E.noteHtml("preview", g).replace('class="g"', 'class="g" style="pointer-events:none"');
          if (newTopic) {
            const name = val(form, "tt"), lv = val(form, "tlv");
            const gt = prev.querySelector(".gt");
            if (gt) gt.innerHTML = esc(name.split(":")[0]) + (lv ? '<span class="lv">' + esc(lv) + '</span>' : "");
          }
        };
        const setNew = on => {
          newTopic = on;
          tpForm.hidden = !on; newBtn.hidden = on;
          list.parentElement.querySelectorAll(".tp-list, .tp-search").forEach(el => { el.hidden = on; });
          renderList(); refresh();
          if (on) field(form, "tid").focus();
        };
        search.addEventListener("input", renderList);
        search.addEventListener("keydown", e => {
          if (e.key === "Enter") { e.preventDefault(); const firstItem = list.querySelector("button[data-topic]"); if (firstItem) firstItem.click(); }
        });
        list.addEventListener("click", e => {
          const item = e.target.closest("button[data-topic]");
          if (!item) return;
          topic = item.dataset.topic;
          list.querySelectorAll("button[data-topic]").forEach(x => x.setAttribute("aria-selected", x === item));
          refresh();
        });
        newBtn.addEventListener("click", () => setNew(true));
        form.querySelector("[data-pickexisting]").addEventListener("click", () => { setNew(false); search.focus(); });
        form.addEventListener("input", e => { if (e.target !== search) refresh(); });
        form.addEventListener("change", refresh);
        renderList(); refresh();
        requestAnimationFrame(() => {
          const sel = list.querySelector('[aria-selected="true"]');
          if (sel) list.scrollTop = sel.offsetTop - list.clientHeight / 2 + sel.offsetHeight / 2;
        });
      },
      async onSubmit(form) {
        const p = val(form, "p"), x = val(form, "x");
        if (!p || !x) throw new E.ApiError(0, "Заполните форму и пояснение.");
        let topicId = topic;
        if (newTopic) {
          topicId = val(form, "tid");
          const t = { t: val(form, "tt"), lv: val(form, "tlv"), ref: val(form, "tref"), why: val(form, "twhy"), study: val(form, "tstudy"), task: val(form, "ttask") };
          if (field(form, "trec").checked) t.rec = true;
          const errors = M.topicErrors(topicId, t);
          if (E.topics[topicId]) errors.push("тема с кодом «" + topicId + "» уже есть: выберите её в списке или придумайте другой код");
          if (errors.length) throw new E.ApiError(0, "Тема не сохранена.", { errors });
          const { data } = await E.api("POST", "/api/data?action=topic", { id: topicId, topic: t });
          E.applyCatalog(data);
        }
        if (!topicId) throw new E.ApiError(0, "Выберите тему из списка или создайте новую.");
        const note = [topicId, p, x];
        await E.commitLine(lid, ln => {
          ln.g = ln.g || [];
          if (gi >= 0) ln.g[gi] = note; else ln.g.push(note);
        });
        E.toast(gi >= 0 ? "Разбор сохранён" : "Разбор добавлен");
      },
      async onDelete() {
        await E.commitLine(lid, ln => { ln.g.splice(gi, 1); });
        E.toast("Разбор удалён");
      },
    });
  }

  /* ---------------- the line itself ---------------- */
  function openLine(lid) {
    const ref = E.lineRef(lid);
    if (!ref) return;
    const ln = ref.ln;
    const html = head("Реплика " + ln.t, "Эпизод " + ref.num + ", " + speakerName(ln)) + '<div class="ed-body">' +
      input("j", "Японский текст с фуриганой", ln.j, { lang: "ja", textarea: true, rows: 2, required: true, hint: "Чтение в квадратных скобках сразу после кандзи: 作戦[さくせん], 倒[たお]せる." }) +
      '<div class="ed-prev"><span>Предпросмотр</span><p class="ed-line" lang="ja" data-prev></p></div>' +
      '<p class="ed-note" data-note hidden></p>' +
      input("r", "Перевод", ln.r, { textarea: true, rows: 2, required: true }) +
      '<ul class="ed-errs"></ul></div>' +
      foot("Сохранить реплику", false);
    openDialog(html, {
      setup(form) {
        const prev = form.querySelector("[data-prev]"), note = form.querySelector("[data-note]");
        const refresh = () => {
          const j = val(form, "j");
          prev.innerHTML = M.furi(j);
          const errs = M.furiErrors(j), bare = M.bareKanji(j);
          const msgs = [...errs.map(e => "Ошибка: " + e + "."), ...(bare && !ln.k ? ["Кандзи без чтения: " + bare + ". Это допустимо только для чтений вроде ２人, которые даны в слове."] : [])];
          note.textContent = msgs.join(" ");
          note.hidden = !msgs.length;
        };
        form.addEventListener("input", refresh);
        refresh();
      },
      async onSubmit(form) {
        const j = val(form, "j"), r = val(form, "r");
        if (!j || !r) throw new E.ApiError(0, "Нужны и японский текст, и перевод.");
        const errs = M.furiErrors(j);
        if (errs.length) throw new E.ApiError(0, "Исправьте фуригану.", { errors: errs });
        await E.commitLine(lid, line => { line.j = j; line.r = r; });
        E.toast("Реплика сохранена");
      },
    });
  }

  /* ---------------- data: export and import ---------------- */
  dataBtn.addEventListener("click", openData);

  function openData() {
    const where = S.storage.kind === "blob" ? "в хранилище Vercel Blob этого проекта"
      : S.storage.kind === "local" ? "в локальной папке (режим разработки на компьютере)" : null;
    const html = head("Данные сайта", where ? "Правки хранятся " + where + "." : "Хранилище не подключено: правки и загрузка файлов не сохранятся.") + '<div class="ed-body">' +
      '<p class="data-p"><b>Скачать файл сайта.</b> Один HTML-файл со всеми эпизодами и вашими правками, в том же формате, что naruto_study_site.html. Он открывается без интернета, и его можно отдать Claude, чтобы добавить следующую серию.</p>' +
      '<div class="data-acts"><button type="button" class="btn primary" data-export>Скачать файл сайта</button></div>' +
      '<p class="data-p"><b>Загрузить файл сайта.</b> Например, файл, который вернул Claude с новой серией. Перед загрузкой будет видно, какие эпизоды новые, а какие отличаются от версии на сайте.</p>' +
      '<div class="data-acts"><label class="btn"><input type="file" accept=".html,.htm,text/html" data-file hidden>Выбрать файл…</label></div>' +
      '<ul class="ed-errs"></ul></div>' + foot("", false);
    openDialog(html, {
      setup(form) {
        form.querySelector("[data-export]").addEventListener("click", e => runAction(form, e.currentTarget, "Собираю файл…", async () => { await exportSite(); return true; }));
        form.querySelector("[data-file]").addEventListener("change", async e => {
          const file = e.target.files && e.target.files[0];
          e.target.value = "";
          if (!file) return;
          try { await prepareImport(file); }
          catch (err) { if (dlg.open) showErrors(form, err); }
        });
      },
    });
  }

  async function exportSite() {
    await E.refreshCatalog();
    for (const n of S.nums) await E.fetchEpisode(n);
    const res = await fetch("/api/template", { credentials: "same-origin" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new E.ApiError(res.status, (data && data.error) || "Не удалось получить шаблон сайта.");
    }
    const html = M.buildSiteHtml(await res.text(), {
      topics: E.topics, speakers: E.speakers, known: E.knownList,
      episodes: S.nums.map(n => E.epByNum(n)),
    });
    E.download(html, "naruto_study_site.html", "text/html;charset=utf-8", "Файл сайта сохранён");
  }

  async function prepareImport(file) {
    let data;
    try { data = M.parseSiteHtml(await file.text()); }
    catch (e) { throw new E.ApiError(0, "Файл не прочитан: " + e.message); }
    if (!data.episodes.length) throw new E.ApiError(0, "В файле нет эпизодов.");
    await E.refreshCatalog();
    for (const n of S.nums) await E.fetchEpisode(n);
    const topics = { ...E.topics, ...data.topics }, speakers = { ...E.speakers, ...data.speakers };
    const rows = data.episodes.map(ep => {
      const cur = E.epByNum(ep.num);
      const errors = M.episodeErrors(ep, topics, speakers);
      const status = errors.length ? "error" : !cur ? "new" : M.canonical(M.clean(cur)) === M.canonical(ep) ? "same" : "diff";
      return { ep, status, errors };
    });
    const newTopics = Object.keys(data.topics).filter(k => !E.topics[k]).length;
    const changedTopics = Object.keys(data.topics).filter(k => E.topics[k] && M.canonical(E.topics[k]) !== M.canonical(data.topics[k])).length;
    const newSpeakers = Object.keys(data.speakers).filter(k => !E.speakers[k]).length;
    const knownSet = new Set(E.knownList);
    const newKnown = data.known.filter(w => !knownSet.has(w)).length;
    const label = { new: "новый", same: "без изменений", diff: "отличается от сайта", error: "есть ошибки" };
    const summary = [
      newTopics || changedTopics ? "Темы: новых " + newTopics + ", изменённых " + changedTopics + "." : "",
      newSpeakers ? "Новых говорящих: " + newSpeakers + "." : "",
      newKnown ? "Слов «в колоде» добавится: " + newKnown + "." : "",
    ].filter(Boolean).join(" ");
    const html = head("Загрузка файла", file.name) + '<div class="ed-body">' +
      '<p class="data-p">Отмеченные эпизоды заменят версии на сайте. Эпизоды, которые «отличаются от сайта», по умолчанию не отмечены: в них могут быть ваши правки, сделанные здесь после того, как файл был скачан.</p>' +
      '<div class="imp-list">' + rows.map((r, i) =>
        '<label class="imp-row"><input type="checkbox" data-i="' + i + '"' + (r.status === "new" ? " checked" : "") + (r.status === "same" || r.status === "error" ? " disabled" : "") + '>' +
        '<span>Эпизод ' + r.ep.num + (r.ep.jp ? ' <span lang="ja">' + esc(r.ep.jp) + '</span>' : '') + '</span>' +
        '<span class="st ' + r.status + '">' + label[r.status] + (r.errors.length ? ": " + esc(r.errors[0]) : "") + '</span></label>').join("") + '</div>' +
      (summary ? '<p class="imp-sum">' + esc(summary) + ' Темы, говорящие и слова обновятся при любой загрузке.</p>' : '') +
      '<ul class="ed-errs"></ul></div>' + foot("Загрузить отмеченное", false);
    openDialog(html, {
      focus: ".imp-list input:not([disabled])",
      async onSubmit(form) {
        const chosen = [...form.querySelectorAll(".imp-list input:checked")].map(x => rows[+x.dataset.i].ep);
        if (!chosen.length && !summary) throw new E.ApiError(0, "Отметьте хотя бы один эпизод.");
        const button = form.querySelector('button[type="submit"]');
        button.textContent = "Обновляю темы и слова…";
        const { data: cat } = await E.api("POST", "/api/data?action=merge", { topics: data.topics, speakers: data.speakers, known: data.known });
        E.applyCatalog(cat);
        let done = 0;
        for (const ep of chosen) {
          button.textContent = "Загружаю эпизод " + ep.num + " (" + (++done) + " из " + chosen.length + ")…";
          await E.saveEpisode(JSON.parse(JSON.stringify(ep)), { force: true });
        }
        await E.refreshCatalog();
        const target = E.currentNum() ?? (chosen.length ? chosen[chosen.length - 1].num : null);
        if (target != null) await E.showEpisode(target);
        E.toast(chosen.length ? "Загружено эпизодов: " + chosen.length : "Темы и слова обновлены");
      },
    });
  }

  /* Restore the edit-mode switch last: everything it touches now exists. */
  let startEditing = false;
  try { startEditing = localStorage.getItem("ns-edit") === "1"; } catch { /* ignore */ }
  setEditing(startEditing);
}
