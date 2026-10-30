/* Teacher mode for English episodes: mark words and grammar by selecting text, edit or delete marks,
   edit lines. Every save is validated (english-model.js) and written with the episode's ETag. */
import { POS, CEFR, englishErrors, topicErrors, vocabId } from "./english-model.js";

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const first = ru => ru.split(";")[0].trim();
const meanings = m => m.split(/[;；]/).map(s => s.trim()).filter(Boolean).join("; ");

export async function initEditor(E) {
  const body = document.body, guide = document.getElementById("guide");

  /* ---------- toolbar ---------- */
  const barIn = document.getElementById("barIn"), spacer = barIn.querySelector(".spacer");
  const tg = document.createElement("label");
  tg.className = "tg tg-edit";
  tg.innerHTML = '<input type="checkbox" id="tEdit"><span class="sw"></span>Edit';
  barIn.insertBefore(tg, spacer);
  const hint = document.createElement("div");
  hint.className = "edit-hint";
  hint.innerHTML = '<div class="edit-hint-in"><b>Edit mode.</b> Select part of a line to mark a word or a grammar point. Click a word or a note to change or delete it.</div>';
  document.querySelector(".bar").appendChild(hint);
  const tEdit = document.getElementById("tEdit");
  const setEditing = on => {
    body.classList.toggle("editing", on); tEdit.checked = on;
    try { localStorage.setItem("nls-edit", on ? "1" : "0"); } catch { /* ignore */ }
    if (!on) hideBar();
  };
  tEdit.addEventListener("change", () => setEditing(tEdit.checked));

  E.setLineTools(id => '<span class="ed-tools"><button type="button" data-ed="line" data-lid="' + id + '">Edit line</button><button type="button" data-ed="v" data-lid="' + id + '">＋ Word</button><button type="button" data-ed="g" data-lid="' + id + '">＋ Grammar</button></span>');

  /* ---------- selection bar ---------- */
  const bar = document.createElement("div");
  bar.className = "markbar"; bar.hidden = true;
  bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "Mark the selected text");
  bar.innerHTML = '<span class="mb-sel" lang="en"></span><button type="button" data-mark="v">＋ Word</button><button type="button" data-mark="g">＋ Grammar</button>';
  document.body.appendChild(bar);
  let pending = null;
  function hideBar() { bar.hidden = true; pending = null; }
  function readSelection() {
    if (!body.classList.contains("editing")) return null;
    const sel = getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const host = n => { const el = n && (n.nodeType === 1 ? n : n.parentElement); return el ? el.closest("p.en") : null; };
    const p = host(range.startContainer);
    if (!p || p !== host(range.endContainer) || !guide.contains(p)) return null;
    const art = p.closest("article.ln");
    const frag = range.cloneContents();
    frag.querySelectorAll(".vo,.say").forEach(x => x.remove());
    const text = frag.textContent.replace(/\s+/g, " ").trim().replace(/^[^\w']+|[^\w']+$/g, "");
    if (!text || !art) return null;
    return { lid: art.id, text, rect: range.getBoundingClientRect() };
  }
  document.addEventListener("selectionchange", () => {
    clearTimeout(readSelection.t);
    readSelection.t = setTimeout(() => {
      if (dlg.open) return;
      const p = readSelection();
      if (!p) return hideBar();
      pending = p;
      bar.querySelector(".mb-sel").textContent = p.text;
      bar.hidden = false;
      const coarse = matchMedia("(pointer: coarse)").matches, bw = bar.offsetWidth, bh = bar.offsetHeight, r = p.rect;
      let top = coarse ? r.bottom + 14 : r.top - bh - 10;
      if (!coarse && top < 10) top = r.bottom + 10;
      const left = Math.max(8, Math.min(r.left + r.width / 2 - bw / 2, document.documentElement.clientWidth - bw - 8));
      bar.style.top = (top + scrollY) + "px"; bar.style.left = (left + scrollX) + "px";
    }, 120);
  });
  bar.addEventListener("pointerdown", e => e.preventDefault());
  bar.addEventListener("mousedown", e => e.preventDefault());
  bar.addEventListener("click", e => {
    const b = e.target.closest("button[data-mark]");
    if (!b || !pending) return;
    const p = pending; hideBar(); getSelection().removeAllRanges();
    b.dataset.mark === "v" ? openWord({ lid: p.lid, text: p.text }) : openGrammar({ lid: p.lid, text: p.text });
  });

  /* ---------- clicks in edit mode ---------- */
  guide.addEventListener("click", e => {
    const tool = e.target.closest(".ed-tools button[data-ed]");
    if (tool) {
      e.preventDefault(); e.stopPropagation();
      const lid = tool.dataset.lid;
      ({ line: () => openLine(lid), v: () => openWord({ lid }), g: () => openGrammar({ lid }) })[tool.dataset.ed]();
      return;
    }
    if (!body.classList.contains("editing")) return;
    const vc = e.target.closest(".vc, .vw");
    if (vc) { e.preventDefault(); e.stopPropagation(); openWord({ vid: vc.dataset.v }); return; }
    const g = e.target.closest("label.g");
    if (g) { e.preventDefault(); e.stopPropagation(); openGrammar({ noteId: g.dataset.note }); }
  }, true);

  /* ---------- dialogs ---------- */
  const dlg = document.createElement("dialog");
  dlg.className = "ed-dlg";
  document.body.appendChild(dlg);
  let busy = false;
  dlg.addEventListener("cancel", e => { if (busy) e.preventDefault(); });

  function open(html, { submit, remove, setup }) {
    hideBar();
    dlg.innerHTML = '<form class="ed-form" novalidate>' + html + '<ul class="ed-errs"></ul></form>';
    const form = dlg.querySelector("form");
    const errs = err => { form.querySelector(".ed-errs").innerHTML = [err.message, ...((err.data && err.data.errors) || [])].map(x => "<li>" + esc(x) + "</li>").join(""); };
    const run = async (btn, fn) => {
      if (busy) return;
      busy = true;
      const label = btn.textContent;
      form.querySelectorAll(".ed-foot button").forEach(b => { b.disabled = true; });
      btn.textContent = "Saving…";
      form.querySelector(".ed-errs").innerHTML = "";
      try { await fn(form); busy = false; dlg.close(); }
      catch (err) { busy = false; errs(err); }
      finally { form.querySelectorAll(".ed-foot button").forEach(b => { b.disabled = false; }); if (dlg.open) btn.textContent = label; }
    };
    form.addEventListener("submit", e => { e.preventDefault(); run(form.querySelector('button[type="submit"]'), submit); });
    form.addEventListener("click", e => {
      const act = e.target.closest("button[data-act]");
      if (!act) return;
      if (act.dataset.act === "cancel") { if (!busy) dlg.close(); return; }
      if (act.dataset.act === "delete") {
        if (!act.dataset.armed) { act.dataset.armed = "1"; act.textContent = "Really delete?"; return; }
        run(act, remove);
      }
    });
    if (setup) setup(form);
    if (!dlg.open) dlg.showModal();
    if (!matchMedia("(pointer: coarse)").matches) { const f = form.querySelector("input:not([type=search]),textarea"); if (f) f.focus(); }
    return form;
  }
  const field = (name, label, value, { hint, textarea, rows = 3, placeholder } = {}) =>
    '<label class="ed-field"><span>' + label + "</span>" + (textarea
      ? '<textarea name="' + name + '" rows="' + rows + '"' + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : "") + ">" + esc(value || "") + "</textarea>"
      : '<input name="' + name + '" value="' + esc(value || "") + '" autocomplete="off" spellcheck="false"' + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : "") + ">") +
    (hint ? "<small>" + hint + "</small>" : "") + "</label>";
  const val = (form, n) => (form.elements.namedItem(n)?.value ?? "").trim();
  const head = (title, l) => '<div class="ed-head"><h2>' + esc(title) + '</h2><p class="ed-src">' + (l ? "Line " + esc(l.t) : "") + "</p></div>";
  const foot = (label, canDelete) => '<div class="ed-foot">' + (canDelete ? '<button type="button" class="btn small danger" data-act="delete">Delete</button>' : "") + '<span class="spacer"></span><button type="button" class="btn small" data-act="cancel">Cancel</button><button type="submit" class="btn small primary">' + esc(label) + "</button></div>";
  const linePreview = l => '<div class="ed-line"><p lang="en">' + esc(l.en.join(" ")) + "</p><small>" + esc(l.ru) + "</small></div>";

  /* Save a change: mutate a copy, validate, PUT with the ETag, then re-render around the line. */
  async function commit(mutate, anchor) {
    const draft = JSON.parse(JSON.stringify(E.data));
    mutate(draft);
    const errors = englishErrors(draft);
    if (errors.length) throw Object.assign(new Error("Not saved: please fix these problems."), { data: { errors } });
    try {
      const { data } = await E.api("PUT", "/api/english?id=" + encodeURIComponent(E.id), { data: draft, baseEtag: E.etag });
      E.etag = data.etag;
      E.replaceData(draft, anchor);
    } catch (err) {
      if (err.status === 409) {
        const { data, res } = await E.api("GET", "/api/english?id=" + encodeURIComponent(E.id));
        E.etag = res.headers.get("ETag") || ""; E.replaceData(data, anchor);
      }
      throw err;
    }
  }

  /* ---------- word ---------- */
  function openWord({ lid, text, vid }) {
    const D = E.data, existing = vid ? D.vocab[vid] : null;
    if (vid && !existing) return;
    const l = E.lineById(existing ? existing.line : lid);
    if (!l) return;
    const init = existing || { w: text || "", f: text || "", ru: "", pos: text && text.includes(" ") ? "выраж." : "сущ." };
    const posOptions = POS.concat(POS.includes(init.pos) ? [] : [init.pos]).map(p => '<option' + (p === init.pos ? " selected" : "") + ">" + esc(p) + "</option>").join("");
    open(head(existing ? "Word" : "New word", l) + '<div class="ed-body">' + linePreview(l) +
      field("w", "Word or phrase, dictionary form", init.w, { hint: "For example: come across, not came across." }) +
      field("f", "Form in this line", init.f, { hint: "Exactly as it appears in the line. It is highlighted in the text and used for the fill-the-gap exercise." }) +
      field("ru", "Translations", init.ru, { hint: "2–4 options separated by «; ». The first one is used in multiple choice.", placeholder: "наткнуться; случайно найти" }) +
      '<label class="ed-field"><span>Part of speech</span><select name="pos">' + posOptions + "</select></label>" +
      '<p class="ed-note" data-note hidden></p></div>' + foot(existing ? "Save word" : "Add word", !!existing), {
      setup(form) {
        const note = form.querySelector("[data-note]");
        const check = () => {
          const w = val(form, "w").toLowerCase(), f = val(form, "f").toLowerCase();
          const dup = Object.values(E.data.vocab).find(v => v.id !== vid && v.w.toLowerCase() === w);
          const inLine = !f || l.en.join(" ").toLowerCase().includes(f);
          const msgs = [];
          if (dup) msgs.push("This word is already marked in the episode at " + E.lineById(dup.line).t + ". Usually a word is marked once.");
          if (!inLine) msgs.push("The form is not found in this line, so it will not be highlighted.");
          note.textContent = msgs.join(" "); note.hidden = !msgs.length;
        };
        form.addEventListener("input", check); check();
      },
      async submit(form) {
        const w = val(form, "w"), f = val(form, "f"), ru = meanings(val(form, "ru")), pos = val(form, "pos");
        if (!w || !f || !ru) throw new Error("Fill in the word, its form in the line and at least one translation.");
        await commit(d => {
          if (existing) Object.assign(d.vocab[vid], { w, f, ru, pos });
          else {
            const id = vocabId(w, d.vocab);
            d.vocab[id] = { id, w, ru, pos, f, line: l.id };
            const line = d.lines.find(x => x.id === l.id);
            line.v = (line.v || []).concat(id);
          }
        }, l.id);
        E.toast(existing ? "Word saved" : "Word added");
      },
      async remove() {
        await commit(d => {
          delete d.vocab[vid];
          d.lines.forEach(x => { if (x.v) { x.v = x.v.filter(id => id !== vid); if (!x.v.length) delete x.v; } });
        }, l.id);
        E.toast("Word deleted");
      },
    });
  }

  /* ---------- grammar ---------- */
  function openGrammar({ lid, text, noteId }) {
    const D = E.data;
    let gi = -1, init = { topic: "", pat: text || "", txt: "" };
    if (noteId) {
      const m = /^(L\d+)-g(\d+)$/.exec(noteId);
      if (!m) return;
      lid = m[1]; gi = +m[2];
      const g = (E.lineById(lid).g || [])[gi];
      if (!g) return;
      init = { topic: g[0], pat: g[1], txt: g[2] };
    }
    const l = E.lineById(lid);
    if (!l) return;
    let topic = init.topic, newTopic = false;
    const sorted = () => Object.entries(E.data.topics).sort(([, a], [, b]) => CEFR.indexOf(a.lv) - CEFR.indexOf(b.lv) || a.t.localeCompare(b.t, "ru"));
    const levelOpts = CEFR.map(c => "<option" + (c === "B1" ? " selected" : "") + ">" + c + "</option>").join("");
    open(head(noteId ? "Grammar note" : "New grammar note", l) + '<div class="ed-body">' + linePreview(l) +
      field("pat", "Form as in the line", init.pat, { hint: "For example: may come across." }) +
      '<div class="ed-field"><span>Topic</span><p class="tp-chosen" data-chosen></p><input type="search" class="tp-search" placeholder="Find a topic" aria-label="Find a topic"><div class="tp-list" role="listbox" aria-label="Topics"></div><button type="button" class="tp-new" data-newtopic>New topic…</button></div>' +
      '<div class="tp-form" data-tpform hidden><b>New topic</b>' +
      field("tid", "Topic id", "", { hint: "Lowercase Latin letters, digits and _: for example, past_simple_passive." }) +
      field("tt", "Title", "", { hint: "As in the other topics: «Present Simple: привычки и факты»." }) +
      '<label class="ed-field"><span>Level</span><select name="tlv">' + levelOpts + "</select></label>" +
      field("twhy", "Why it matters", "", { textarea: true, rows: 2 }) + field("tstudy", "What to review", "", { textarea: true, rows: 2 }) + field("ttask", "Exercise", "", { textarea: true, rows: 2 }) +
      '<button type="button" class="tp-new" data-picktopic>Choose an existing topic</button></div>' +
      field("txt", "Explanation", init.txt, { textarea: true, rows: 3, hint: "One or two short sentences, in Russian like the other notes: what the form is and what it does here." }) +
      "</div>" + foot(noteId ? "Save note" : "Add note", !!noteId), {
      setup(form) {
        const list = form.querySelector(".tp-list"), search = form.querySelector(".tp-search"), chosen = form.querySelector("[data-chosen]");
        const tpForm = form.querySelector("[data-tpform]"), newBtn = form.querySelector("[data-newtopic]");
        const render = () => {
          const q = search.value.trim().toLowerCase();
          const items = sorted().filter(([k, t]) => !q || (t.t + " " + k).toLowerCase().includes(q));
          list.innerHTML = items.map(([k, t]) => '<button type="button" role="option" data-topic="' + esc(k) + '" aria-selected="' + (k === topic && !newTopic) + '">' + esc(t.t) + '<span class="lv">' + esc(t.lv) + "</span></button>").join("") || '<p class="tp-empty">Nothing found. Create a new topic.</p>';
          const cur = E.data.topics[topic];
          chosen.textContent = newTopic ? "A new topic will be created." : cur ? "Chosen: " + cur.t : "No topic chosen yet.";
        };
        const setNew = on => { newTopic = on; tpForm.hidden = !on; newBtn.hidden = on; list.hidden = search.hidden = on; render(); };
        search.addEventListener("input", render);
        search.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); const b = list.querySelector("button[data-topic]"); if (b) b.click(); } });
        list.addEventListener("click", e => { const b = e.target.closest("button[data-topic]"); if (b) { topic = b.dataset.topic; render(); } });
        newBtn.addEventListener("click", () => setNew(true));
        form.querySelector("[data-picktopic]").addEventListener("click", () => setNew(false));
        render();
        requestAnimationFrame(() => { const s = list.querySelector('[aria-selected="true"]'); if (s) list.scrollTop = s.offsetTop - list.clientHeight / 2; });
      },
      async submit(form) {
        const pat = val(form, "pat"), txt = val(form, "txt");
        if (!pat || !txt) throw new Error("Fill in the form and the explanation.");
        let tid = topic, t = null;
        if (newTopic) {
          tid = val(form, "tid");
          t = { t: val(form, "tt"), lv: val(form, "tlv"), why: val(form, "twhy"), study: val(form, "tstudy"), task: val(form, "ttask") };
          const errors = topicErrors(tid, t);
          if (E.data.topics[tid]) errors.push("A topic with this id already exists: choose it from the list.");
          if (errors.length) throw Object.assign(new Error("The topic is not complete."), { data: { errors } });
        }
        if (!tid) throw new Error("Choose a topic or create a new one.");
        await commit(d => {
          if (t) d.topics[tid] = t;
          const line = d.lines.find(x => x.id === l.id);
          line.g = line.g || [];
          if (gi >= 0) line.g[gi] = [tid, pat, txt]; else line.g.push([tid, pat, txt]);
        }, l.id);
        E.toast(noteId ? "Note saved" : "Note added");
      },
      async remove() {
        await commit(d => { const line = d.lines.find(x => x.id === l.id); line.g.splice(gi, 1); if (!line.g.length) delete line.g; }, l.id);
        E.toast("Note deleted");
      },
    });
  }

  /* ---------- line ---------- */
  function openLine(lid) {
    const l = E.lineById(lid);
    if (!l) return;
    open(head("Line", l) + '<div class="ed-body">' +
      field("en", "English text", l.en.join("\n"), { textarea: true, rows: 3, hint: "One subtitle line per row. Start a row with “- ” when another character speaks." }) +
      field("ru", "Translation", l.ru, { textarea: true, rows: 2 }) + "</div>" + foot("Save line", false), {
      async submit(form) {
        const en = val(form, "en").split("\n").map(s => s.trim()).filter(Boolean), ru = val(form, "ru");
        if (!en.length) throw new Error("The English text is required.");
        await commit(d => {
          const line = d.lines.find(x => x.id === l.id);
          line.en = en; line.ru = ru;
          if (line.nr) { line.nr = line.nr.filter(i => i < en.length); if (!line.nr.length) delete line.nr; }
        }, l.id);
        E.toast("Line saved");
      },
    });
  }

  let start = false;
  try { start = localStorage.getItem("nls-edit") === "1"; } catch { /* ignore */ }
  setEditing(start);
}
