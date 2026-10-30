/* Personal cabinet: the student's own page (also shown read-only to the teacher). */
import { api, esc, toast } from "./api.js";
import { avatarHtml } from "./shell.js";
import { streakInfo, heatmapWeeks, dayOf, addDays, nextMilestone, weekday } from "./stats.js";

export const LEVELS = [["A1", "Beginner"], ["A2", "Elementary"], ["B1", "Intermediate"], ["B2", "Upper-intermediate"], ["C1", "Advanced"], ["C2", "Proficient"]];
const NOTE_LABEL = { class: "Class", homework: "Homework", test: "Test", message: "Message" };
const NOTE_ICON = {
  class: '<path d="M4 6.5h16v11H4z"/><path d="M9 20h6M12 17.5V20"/>',
  homework: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6V7H9zM8.5 12l2 2 4-4.5"/>',
  test: '<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4M9.5 12h6M9.5 15.5h6"/>',
  message: '<path d="M4.5 5.5h15v10h-9l-4 3.5v-3.5h-2z"/>',
};
const svg = (paths, cls = "") => '<svg class="' + cls + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + paths + "</svg>";

const dateOf = day => new Date(day + "T12:00:00");
const fmtDay = (day, opts = { weekday: "short", day: "numeric", month: "short" }) => dateOf(day).toLocaleDateString("en-GB", opts);
export function fmtWhen(when) {
  if (!when) return "";
  const day = when.slice(0, 10), today = dayOf();
  const label = day === today ? "Today" : day === addDays(today, 1) ? "Tomorrow" : day === addDays(today, -1) ? "Yesterday" : fmtDay(day);
  return when.length > 10 ? label + ", " + when.slice(11, 16) : label;
}
const plural = (n, one, many) => n + " " + (n === 1 ? one : many);

/* Unknown and learned words across English episodes, from the saved marks. */
export function wordStats(marks) {
  let unknown = 0, learned = 0;
  for (const [content, m] of Object.entries(marks || {})) {
    if (!content.startsWith("en/") || !m || !Array.isArray(m.words)) continue;
    for (const id of m.words) (m.learned && m.learned[id] > 0 ? learned++ : unknown++);
  }
  return { unknown, learned };
}

function sortNotes(list) {
  const now = dayOf();
  const upcoming = list.filter(n => n.when && n.when.slice(0, 10) >= now).sort((a, b) => a.when.localeCompare(b.when));
  const rest = list.filter(n => !upcoming.includes(n)).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return upcoming.concat(rest);
}

function streakCard(si) {
  const label = { studied: "studied", skipped: "covered by your free skip", missed: "no study", today: "today: not studied yet", none: "before your first study day" };
  const week = si.week.map(w => {
    if (w.state === "missed" && (!si.first || w.day < si.first)) w = { ...w, state: "none" };
    const name = w.state === "today" || w.day === dayOf() ? "Today" : fmtDay(w.day, { weekday: "short" });
    return '<li class="wk ' + w.state + (w.day === dayOf() && w.state === "studied" ? " is-today" : "") + '" title="' + esc(fmtDay(w.day) + ": " + label[w.state]) + '"><span class="wk-n">' + name + '</span><span class="wk-d" aria-hidden="true"></span><span class="sr">' + label[w.state] + "</span></li>";
  }).join("");
  const msg = si.studiedToday ? "Done for today. See you tomorrow!" : si.current ? "Study today to keep your streak going." : "Study today to start a new streak.";
  const next = nextMilestone(si.current);
  const skip = si.skipAvailable ? "Ready" : si.skipReadyOn === addDays(dayOf(), 1) ? "Back tomorrow" : "Back on " + fmtDay(si.skipReadyOn);
  return '<article class="card c-streak"><h2>Study streak</h2><p class="big"><b>' + si.current + "</b> " + (si.current === 1 ? "day" : "days") + "</p>" +
    '<ol class="week" aria-label="The last seven days">' + week + "</ol>" +
    '<p class="note">' + esc(msg) + (next ? " Next milestone: " + next + " days." : "") + "</p>" +
    '<dl class="mini"><div><dt>Best streak</dt><dd>' + plural(si.best, "day", "days") + '</dd></div><div><dt>Free skip</dt><dd title="One missed day is covered automatically. The skip comes back 7 days after it is used.">' + esc(skip) + "</dd></div></dl></article>";
}

function daysCard(si, me) {
  const digits = String(si.totalDays).padStart(3, "0").split("").map(d => "<span>" + d + "</span>").join("");
  const month = dayOf().slice(0, 7);
  const since = si.first ? "since " + fmtDay(si.first, { day: "numeric", month: "long", year: "numeric" }) : me.createdAt ? "account opened " + new Date(me.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "";
  return '<article class="card c-days"><h2>Days studied</h2><p class="digits" aria-label="' + si.totalDays + ' days">' + digits + '</p><p class="note">' + esc(since) + '</p><p class="note" data-month="' + month + '"></p></article>';
}

function levelCard(me) {
  const cur = Math.max(0, LEVELS.findIndex(l => l[0] === me.level));
  const ladder = LEVELS.map(([code, name], i) => '<li class="' + (i < cur ? "past" : i === cur ? "now" : "") + '" title="' + code + ": " + name + '">' + code + "</li>").join("");
  return '<article class="card c-level"><h2>Level <span class="tag-preview">Preview</span></h2><p class="big"><b>' + esc(LEVELS[cur][0]) + "</b> " + esc(LEVELS[cur][1]) + '</p><ol class="ladder">' + ladder + "</ol>" +
    '<div class="lvl-bar" aria-hidden="true"><i style="width:40%"></i></div><p class="note">How progress within a level is measured is still being decided. For now your teacher sets your level.</p></article>';
}

function classCard(notes, readOnly) {
  const now = dayOf();
  const next = notes.filter(n => n.type === "class" && n.when && n.when.slice(0, 10) >= now).sort((a, b) => a.when.localeCompare(b.when))[0];
  return '<article class="card c-class"><h2>Next class</h2>' + (next
    ? '<p class="big when">' + esc(fmtWhen(next.when)) + '</p><p class="note">' + esc(next.title) + "</p>"
    : '<p class="note">No class booked yet.</p>') +
    (readOnly ? "" : '<button type="button" class="p-btn primary" data-book>Book a class</button>') + "</article>";
}

function wordsCard(ws, readOnly) {
  const empty = !ws.unknown && !ws.learned;
  return '<article class="card c-words"><h2>Words</h2>' + (empty
    ? '<p class="note">Mark the words you don’t know while you watch, and they appear here for training.</p>' + (readOnly ? "" : '<a class="p-btn" href="/vocabulary" data-nav>Choose something to watch</a>')
    : '<dl class="mini two"><div><dt>To learn</dt><dd class="big-n">' + ws.unknown + '</dd></div><div><dt>Learned</dt><dd class="big-n good">' + ws.learned + "</dd></div></dl>" + (readOnly ? "" : '<a class="p-btn primary" href="/training" data-nav>Train words</a>')) + "</article>";
}

export function notesHtml(notes, filter = "all", { teacher = false } = {}) {
  const list = sortNotes(notes).filter(n => filter === "all" || n.type === filter);
  if (!list.length) return '<p class="empty-s">' + (notes.length ? "Nothing in this section." : teacher ? "No reminders sent to this student yet." : "No notifications yet. Reminders about classes, homework and tests from your teacher appear here.") + "</p>";
  return '<ul class="nl">' + list.map(n => {
    const past = n.when && n.when.slice(0, 10) < dayOf();
    return '<li class="nt-' + n.type + (n.read ? "" : " unread") + (past ? " past" : "") + '">' + svg(NOTE_ICON[n.type] || NOTE_ICON.message, "nt-i") +
      '<div class="nt-b"><span class="nt-k">' + NOTE_LABEL[n.type] + (n.when ? ", " + esc(fmtWhen(n.when)) : "") + "</span><b>" + esc(n.title) + "</b>" + (n.body ? "<p>" + esc(n.body) + "</p>" : "") + "</div>" +
      (teacher ? '<button type="button" class="link-b" data-unnote="' + n.id + '">Delete</button>' : n.read ? "" : '<button type="button" class="link-b" data-read="' + n.id + '">Mark as read</button>') + "</li>";
  }).join("") + "</ul>";
}

function heatHtml(activity) {
  const weeks = heatmapWeeks(activity), today = dayOf();
  let months = "", lastMonth = "";
  weeks.forEach((col, i) => {
    const m = col[0].day.slice(0, 7);
    if (m === lastMonth) return;
    lastMonth = m;
    // skip a label when the next month starts within two weeks, so labels never overlap
    const nextStart = weeks.findIndex((c, j) => j > i && c[0].day.slice(0, 7) !== m);
    if (nextStart !== -1 && nextStart - i < 3) return;
    months += '<span style="grid-column:' + (i + 1) + '">' + dateOf(col[0].day).toLocaleDateString("en-GB", { month: "short" }) + "</span>";
  });
  const desc = a => {
    if (!a) return "no study";
    const parts = [];
    if (a.practice) parts.push(plural(a.practice, "training answer", "training answers"));
    if (a.study) parts.push(plural(a.study, "word or grammar mark", "words and grammar marks"));
    if (a.class) parts.push(plural(a.class, "class", "classes"));
    return parts.join(", ") || "no study";
  };
  const cells = weeks.map(col => col.map(c => c.future ? '<i class="h-f"></i>' : '<i class="h' + c.level + (c.day === today ? " h-today" : "") + '" title="' + esc(fmtDay(c.day, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) + ": " + desc(c.a)) + '"></i>').join("")).join("");
  const yearDays = Object.keys(activity || {}).filter(d => d > addDays(today, -365) && d <= today && Object.values(activity[d]).some(v => v > 0)).length;
  return '<section class="card c-heat"><div class="card-h"><h2>Study activity</h2><span class="note">' + plural(yearDays, "study day", "study days") + " in the last year</span></div>" +
    '<div class="heat-scroll" data-heat><div class="heat"><div class="heat-m">' + months + '</div><div class="heat-d"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span></span></div><div class="heat-g" role="img" aria-label="Study activity for the last 12 months">' + cells + "</div></div></div>" +
    '<div class="heat-l"><span>Less</span><i class="h0"></i><i class="h1"></i><i class="h2"></i><i class="h3"></i><i class="h4"></i><span>More</span></div></section>';
}

export function cabinetHtml(me, marks, { readOnly = false, words = null } = {}) {
  const si = streakInfo(me.activity);
  const notes = me.notifications || [];
  const since = me.createdAt ? "Student since " + new Date(me.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "";
  const lvl = LEVELS.find(l => l[0] === me.level) || LEVELS[0];
  const unread = notes.filter(n => !n.read).length;
  return '<div class="cab">' +
    '<section class="cab-head">' + (readOnly ? avatarHtml(me, "cab-av") : '<button type="button" class="cab-photo" data-photo aria-label="Change photo">' + avatarHtml(me, "cab-av") + '<span class="cab-edit">Change photo</span></button><input type="file" accept="image/png,image/jpeg,image/webp" hidden data-photo-file>') +
    '<div><h1>' + esc(me.name) + '</h1><p class="cab-meta"><span class="chip">' + esc(lvl[0] + " " + lvl[1]) + "</span>" + (since ? "<span>" + esc(since) + "</span>" : "") + "</p></div></section>" +
    '<div class="cab-grid">' + streakCard(si) + daysCard(si, me) + levelCard(me) + classCard(notes, readOnly) + wordsCard(words || wordStats(marks), readOnly) + "</div>" +
    '<section class="card c-notes" id="notifications"><div class="card-h"><h2>Notifications' + (unread ? ' <span class="count">' + unread + "</span>" : "") + "</h2>" + (readOnly || !unread ? "" : '<button type="button" class="link-b" data-read-all>Mark all as read</button>') + "</div>" +
    '<div class="filters" role="group" aria-label="Show">' + [["all", "All"], ["class", "Classes"], ["homework", "Homework"], ["test", "Tests"], ["message", "Messages"]].map(([k, l], i) => '<button type="button" data-filter="' + k + '" aria-pressed="' + (i === 0) + '">' + l + "</button>").join("") + "</div>" +
    '<div data-notes>' + notesHtml(notes, "all", { teacher: readOnly }) + "</div></section>" +
    heatHtml(me.activity) + "</div>";
}

/* ---------- interactions ---------- */
async function resizePhoto(file) {
  // Read as a data: URL: the site's security policy allows data: images but not blob: URLs.
  const src = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("The file could not be read."));
    r.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("This file is not an image the browser can read."));
    im.src = src;
  });
  const size = 256, side = Math.min(img.naturalWidth, img.naturalHeight);
  const c = document.createElement("canvas"); c.width = c.height = size;
  c.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
  return c.toDataURL("image/jpeg", 0.86);
}

function bookingDialog() {
  const dlg = document.createElement("dialog");
  dlg.className = "p-dlg";
  const today = dayOf();
  const days = [1, 2, 3, 4, 5].map(i => addDays(today, i)).filter(d => weekday(d) < 6);
  const times = ["10:00", "12:30", "16:00", "18:30"];
  dlg.innerHTML = '<form method="dialog" class="p-form"><div class="p-dh"><h2>Book a class <span class="tag-preview">Preview</span></h2><p class="note">Pick a time that suits you. This is a preview of how booking will work.</p></div>' +
    '<div class="p-db"><div class="slots">' + days.map(d => '<div class="slot-day"><b>' + esc(fmtDay(d)) + "</b>" + times.map((t, i) => (i + d.length) % 3 === 0 ? '<span class="slot taken">' + t + "</span>" : '<button type="button" class="slot" data-slot="' + d + "T" + t + '">' + t + "</button>").join("") + "</div>").join("") + "</div>" +
    '<p class="book-done" hidden>Online booking isn’t open yet, so nothing was booked. For now, message Natalia to arrange a class.</p></div>' +
    '<div class="p-df"><span class="grow"></span><button type="button" class="p-btn" data-close>Close</button><button type="button" class="p-btn primary" data-request disabled>Request this time</button></div></form>';
  document.body.appendChild(dlg);
  dlg.addEventListener("click", e => {
    const s = e.target.closest("button[data-slot]");
    if (s) { dlg.querySelectorAll(".slot").forEach(x => x.setAttribute("aria-pressed", x === s)); dlg.querySelector("[data-request]").disabled = false; }
    if (e.target.closest("[data-close]")) dlg.close();
    if (e.target.closest("[data-request]")) { dlg.querySelector(".book-done").hidden = false; e.target.closest("[data-request]").disabled = true; }
  });
  dlg.addEventListener("close", () => dlg.remove());
  dlg.showModal();
}

export function bindCabinet(root, me, { readOnly = false, onChange } = {}) {
  const notesBox = root.querySelector("[data-notes]");
  let filter = "all";
  const renderNotes = () => { notesBox.innerHTML = notesHtml(me.notifications || [], filter, { teacher: readOnly }); };
  const m = root.querySelector("[data-month]");
  if (m) { const n = Object.keys(me.activity || {}).filter(d => d.startsWith(m.dataset.month)).length; m.textContent = "This month: " + plural(n, "day", "days"); }
  const heat = root.querySelector("[data-heat]");
  if (heat) heat.scrollLeft = heat.scrollWidth;
  root.addEventListener("click", async e => {
    const f = e.target.closest("button[data-filter]");
    if (f) { filter = f.dataset.filter; root.querySelectorAll("[data-filter]").forEach(b => b.setAttribute("aria-pressed", b === f)); renderNotes(); return; }
    if (readOnly) return;
    if (e.target.closest("[data-book]")) { bookingDialog(); return; }
    if (e.target.closest("[data-photo]")) { root.querySelector("[data-photo-file]").click(); return; }
    const r = e.target.closest("button[data-read]"), all = e.target.closest("[data-read-all]");
    if (r || all) {
      try {
        const { data } = await api("POST", "/api/me?action=read", all ? { all: true } : { ids: [r.dataset.read] });
        me.notifications = data.notifications;
        if (onChange) onChange();
      } catch (err) { toast(err.message); }
    }
  });
  const file = root.querySelector("[data-photo-file]");
  if (file) file.addEventListener("change", async () => {
    const f = file.files && file.files[0];
    file.value = "";
    if (!f) return;
    try {
      const dataUrl = await resizePhoto(f);
      await api("POST", "/api/me?action=photo", { dataUrl });
      me.photo = dataUrl;
      toast("Photo updated");
      if (onChange) onChange();
    } catch (err) { toast(err.message); }
  });
}
