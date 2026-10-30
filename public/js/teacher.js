/* Teacher mode: student accounts, reminders, classes, and a read-only view of each student's cabinet. */
import { api, esc, toast } from "./api.js";
import { streakInfo, dayOf } from "./stats.js";
import { cabinetHeadHtml, notesHtml, LEVELS, fmtWhen } from "./cabinet.js";
import { mountRoom } from "./room.js";

const plural = (n, one, many) => n + " " + (n === 1 ? one : many);
const lastDay = activity => Object.keys(activity || {}).sort().pop() || null;
const genPassword = () => {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  const r = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(r, x => a[x % a.length]).join("").replace(/(.{5})/, "$1-");
};

function dialog(html, onSubmit) {
  const dlg = document.createElement("dialog");
  dlg.className = "p-dlg";
  dlg.innerHTML = '<form class="p-form" novalidate>' + html + '<ul class="p-errs"></ul></form>';
  document.body.appendChild(dlg);
  const form = dlg.querySelector("form");
  dlg.addEventListener("close", () => dlg.remove());
  form.addEventListener("click", e => { if (e.target.closest("[data-close]")) dlg.close(); });
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]'), label = btn.textContent;
    btn.disabled = true; btn.textContent = "Saving…";
    form.querySelector(".p-errs").innerHTML = "";
    try {
      const keepOpen = await onSubmit(form, dlg);
      if (!keepOpen) dlg.close();
    } catch (err) {
      form.querySelector(".p-errs").innerHTML = [err.message, ...((err.data && err.data.errors) || [])].map(x => "<li>" + esc(x) + "</li>").join("");
    } finally { if (dlg.open) { btn.disabled = false; btn.textContent = label; } }
  });
  dlg.showModal();
  const first = form.querySelector("input:not([type=hidden]):not([type=checkbox]),select,textarea");
  if (first) first.focus();
  return { dlg, form };
}
const v = (form, name) => (form.elements.namedItem(name)?.value ?? "").trim();
const levelOptions = cur => LEVELS.map(([c, n]) => '<option value="' + c + '"' + (c === cur ? " selected" : "") + ">" + c + " " + n + "</option>").join("");

function studentForm(student, done) {
  const editing = !!student;
  const pw = editing ? "" : genPassword();
  const { form } = dialog(
    '<div class="p-dh"><h2>' + (editing ? "Edit student" : "Add a student") + "</h2></div><div class=\"p-db\">" +
    '<label class="p-field"><span>Name</span><input name="name" value="' + esc(student ? student.name : "") + '" autocomplete="off"></label>' +
    '<label class="p-field"><span>Login</span><input name="login" value="' + esc(student ? student.login : "") + '" autocomplete="off" autocapitalize="none" spellcheck="false"><small>3–32 characters: Latin letters, digits, dot, dash or underscore.</small></label>' +
    '<label class="p-field"><span>' + (editing ? "New password" : "Password") + '</span><span class="p-pw"><input name="password" value="' + esc(pw) + '" autocomplete="off" spellcheck="false"' + (editing ? ' placeholder="Leave empty to keep the current one"' : "") + '><button type="button" class="p-btn" data-gen>Generate</button></span><small>At least 8 characters. You will see it once, so send it to the student.</small></label>' +
    '<label class="p-field"><span>Level</span><select name="level">' + levelOptions(student ? student.level : "A1") + "</select></label>" +
    '<label class="p-check"><input type="checkbox" name="japanese"' + (student && (student.langs || []).includes("ja") ? " checked" : "") + "> Can open Japanese content</label>" +
    '</div><div class="p-df"><span class="grow"></span><button type="button" class="p-btn" data-close>Cancel</button><button type="submit" class="p-btn primary">' + (editing ? "Save" : "Add student") + "</button></div>",
    async (form, dlg) => {
      const body = { name: v(form, "name"), login: v(form, "login"), level: v(form, "level"), japanese: form.elements.namedItem("japanese").checked };
      const password = v(form, "password");
      if (password || !editing) body.password = password;
      const { data } = await api("POST", "/api/students?action=" + (editing ? "update" : "create"), editing ? { id: student.id, ...body } : body);
      done();
      if (!password) { toast("Saved"); return false; }
      form.innerHTML = '<div class="p-dh"><h2>' + (editing ? "Password changed" : "Student added") + '</h2></div><div class="p-db"><p>Send these details to ' + esc(data.student.name) + ':</p><pre class="creds">Website: ' + esc(location.origin) + "\nLogin: " + esc(data.student.login) + "\nPassword: " + esc(password) + '</pre></div><div class="p-df"><span class="grow"></span><button type="button" class="p-btn" data-copy>Copy</button><button type="button" class="p-btn primary" data-close>Done</button></div>';
      form.querySelector("[data-copy]").addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(form.querySelector(".creds").textContent); toast("Copied"); } catch { toast("Select the text and copy it"); }
      });
      return true;
    });
  form.querySelector("[data-gen]").addEventListener("click", () => { form.elements.namedItem("password").value = genPassword(); });
}

function reminderForm(students, to, done) {
  const one = to !== "all";
  const who = one ? students.find(s => s.id === to) : null;
  dialog('<div class="p-dh"><h2>Send a reminder</h2><p class="note">' + (one ? "To " + esc(who.name) : "To all " + plural(students.length, "student", "students")) + ". It appears in the notification centre of their cabinet.</p></div><div class=\"p-db\">" +
    '<label class="p-field"><span>Type</span><select name="type"><option value="class">Class</option><option value="homework">Homework</option><option value="test">Test</option><option value="message">Message</option></select></label>' +
    '<label class="p-field"><span>Title</span><input name="title" maxlength="120" placeholder="Conversation class, Unit 3 homework, vocabulary test…"></label>' +
    '<div class="p-row"><label class="p-field"><span>Date</span><input type="date" name="date"></label><label class="p-field"><span>Time</span><input type="time" name="time"></label></div>' +
    '<label class="p-field"><span>Note</span><textarea name="body" rows="3" maxlength="600" placeholder="Optional details"></textarea></label>' +
    '</div><div class="p-df"><span class="grow"></span><button type="button" class="p-btn" data-close>Cancel</button><button type="submit" class="p-btn primary">Send</button></div>',
    async form => {
      const date = v(form, "date"), time = v(form, "time");
      const { data } = await api("POST", "/api/students?action=notify", { to: one ? [to] : "all", type: v(form, "type"), title: v(form, "title"), body: v(form, "body"), when: date ? date + (time ? "T" + time : "") : null });
      toast(data.sent === 1 ? "Reminder sent" : "Sent to " + data.sent + " students");
      done();
    });
}

function classForm(student, done) {
  dialog('<div class="p-dh"><h2>Log a class</h2><p class="note">' + esc(student.name) + ' attended a class. It counts as a study day for the streak.</p></div><div class="p-db">' +
    '<label class="p-field"><span>Date</span><input type="date" name="day" value="' + dayOf() + '" max="' + dayOf() + '"></label></div>' +
    '<div class="p-df"><span class="grow"></span><button type="button" class="p-btn" data-close>Cancel</button><button type="submit" class="p-btn primary">Log class</button></div>',
    async form => { await api("POST", "/api/students?action=class", { id: student.id, day: v(form, "day") }); toast("Class logged"); done(); });
}

function deleteForm(student, done) {
  dialog('<div class="p-dh"><h2>Delete ' + esc(student.name) + "?</h2><p class=\"note\">The account is removed and the student can no longer sign in. Their activity data stays in storage.</p></div>" +
    '<div class="p-df"><span class="grow"></span><button type="button" class="p-btn" data-close>Cancel</button><button type="submit" class="p-btn danger">Delete</button></div>',
    async () => { await api("POST", "/api/students?action=delete", { id: student.id }); toast("Student deleted"); done(); });
}

function rowHtml(s) {
  const si = streakInfo(s.activity), last = lastDay(s.activity);
  return '<article class="t-row" data-id="' + s.id + '"><span class="avatar t-av">' + esc(s.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase()) + "</span>" +
    '<div class="t-who"><a href="/students/' + s.id + '" data-nav><b>' + esc(s.name) + '</b></a><span class="note">' + esc(s.login) + (s.langs.includes("ja") ? ", Japanese" : "") + "</span></div>" +
    '<span class="chip">' + esc(s.level) + "</span>" +
    '<dl class="t-stats"><div><dt>Streak</dt><dd>' + plural(si.current, "day", "days") + '</dd></div><div><dt>Days studied</dt><dd>' + si.totalDays + '</dd></div><div><dt>Last study</dt><dd>' + (last ? esc(fmtWhen(last)) : "never") + "</dd></div></dl>" +
    '<div class="t-acts"><button type="button" class="p-btn small" data-act="remind">Remind</button><button type="button" class="p-btn small" data-act="class">Log class</button><button type="button" class="p-btn small" data-act="edit">Edit</button><button type="button" class="link-b danger" data-act="delete">Delete</button></div></article>';
}

export async function teacherHome(main) {
  main.innerHTML = '<p class="loading">Loading students…</p>';
  let data;
  try { data = (await api("GET", "/api/students")).data; }
  catch (e) { main.innerHTML = '<div class="state"><h1>Students</h1><p>' + esc(e.message) + "</p></div>"; return; }
  const students = data.students;
  const reload = () => teacherHome(main);
  main.innerHTML = '<div class="t-home"><div class="page-h"><div><h1>Students</h1><p class="lede">Create accounts, send reminders and see how your students are doing.</p></div>' +
    '<div class="t-top"><a class="p-btn" href="/room-editor" data-nav>Room &amp; shop</a><button type="button" class="p-btn primary" data-add>Add student</button>' + (students.length ? '<button type="button" class="p-btn" data-all>Remind everyone</button>' : "") + "</div></div>" +
    (data.storage.writable ? "" : '<p class="warn">Storage is not connected, so students cannot be added. Connect a Private Blob store to the project in Vercel and redeploy.</p>') +
    (students.length ? '<div class="t-list">' + students.map(rowHtml).join("") + "</div>" : '<div class="card empty-card"><h2>No students yet</h2><p>Add the first student to create their login. They will see their own cabinet after signing in.</p></div>') +
    '<section class="card t-help"><h2>Editing episodes</h2><p>Open an episode from <a href="/vocabulary" data-nav>Vocabulary</a> and switch on <b>Edit</b> in the toolbar above the episode. Select part of a line to mark a word or a grammar point; click an existing mark to change or delete it.</p></section></div>';
  main.querySelector("[data-add]").addEventListener("click", () => studentForm(null, reload));
  const all = main.querySelector("[data-all]");
  if (all) all.addEventListener("click", () => reminderForm(students, "all", reload));
  main.querySelectorAll(".t-row").forEach(row => row.addEventListener("click", e => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const s = students.find(x => x.id === row.dataset.id);
    ({ remind: () => reminderForm(students, s.id, reload), class: () => classForm(s, reload), edit: () => studentForm(s, reload), delete: () => deleteForm(s, reload) })[b.dataset.act]();
  }));
}

function grantForm(s, done) {
  dialog('<div class="p-dh"><h2>Give XP or coins</h2><p class="note">To ' + esc(s.name) + '. Use a minus sign to take away.</p></div><div class="p-db"><div class="p-row">' +
    '<label class="p-field"><span>XP</span><input type="number" name="xp" value="0" step="100"></label><label class="p-field"><span>Coins</span><input type="number" name="coins" value="0"></label></div>' +
    '<label class="p-field"><span>Note</span><input name="note" maxlength="120" placeholder="For example: speaking club"></label></div>' +
    '<div class="p-df"><span class="grow"></span><button type="button" class="p-btn" data-close>Cancel</button><button type="submit" class="p-btn primary">Give</button></div>',
    async form => { await api("POST", "/api/game?action=grant", { student: s.id, xp: +v(form, "xp") || 0, coins: +v(form, "coins") || 0, note: v(form, "note") }); toast("Done"); done(); });
}

function resetForm(s, done) {
  dialog('<div class="p-dh"><h2>Reset ' + esc(s.name) + '’s game?</h2><p class="note">XP, level, coins, bought items and the room go back to the start. Study activity and marks stay.</p></div>' +
    '<div class="p-df"><span class="grow"></span><button type="button" class="p-btn" data-close>Cancel</button><button type="submit" class="p-btn danger">Reset</button></div>',
    async () => { await api("POST", "/api/game?action=reset", { student: s.id }); toast("Game progress reset"); done(); });
}

export async function studentView(main, id) {
  main.innerHTML = '<p class="loading">Loading…</p>';
  let s, game;
  try {
    [s, game] = await Promise.all([
      api("GET", "/api/students?id=" + encodeURIComponent(id)).then(r => r.data.student),
      api("GET", "/api/game?student=" + encodeURIComponent(id)).then(r => r.data),
    ]);
  } catch (e) { main.innerHTML = '<div class="state"><a class="back" href="/" data-nav>← All students</a><h1>Student</h1><p>' + esc(e.message) + "</p></div>"; return; }
  const reload = () => studentView(main, id);
  const words = Object.entries(s.marks).filter(([c]) => c.startsWith("en/")).reduce((a, [, m]) => ({ unknown: a.unknown + Math.max(0, m.words - m.learned), learned: a.learned + m.learned }), { unknown: 0, learned: 0 });
  const marksRows = Object.entries(s.marks).map(([c, m]) => "<tr><td>" + esc(c) + "</td><td>" + m.words + "</td><td>" + m.grammar + "</td><td>" + m.learned + "</td><td>" + (m.savedAt ? esc(fmtWhen(m.savedAt.slice(0, 10))) : "") + "</td></tr>").join("");
  main.innerHTML = '<a class="back" href="/" data-nav>← All students</a><div class="t-bar"><span class="note">Teacher view of ' + esc(s.name) + '’s cabinet</span><span class="grow"></span>' +
    '<button type="button" class="p-btn small" data-act="remind">Send reminder</button><button type="button" class="p-btn small" data-act="class">Log class</button><button type="button" class="p-btn small" data-act="grant">Give XP or coins</button><button type="button" class="p-btn small" data-act="edit">Edit</button><button type="button" class="link-b danger" data-act="reset">Reset game</button></div>' +
    '<div class="cab">' + cabinetHeadHtml(s, game.me.progress, { readOnly: true }) + '<section class="card room-card"><div data-room></div></section>' +
    '<section class="card"><div class="card-h"><h2>Reminders</h2></div><div data-notes>' + notesHtml(s.notifications || [], "all", { teacher: true }) + "</div></section>" +
    '<section class="card"><h2>Marks by episode</h2>' + (marksRows ? '<div class="tbl"><table><thead><tr><th>Content</th><th>Words marked</th><th>Grammar marked</th><th>Learned</th><th>Saved</th></tr></thead><tbody>' + marksRows + "</tbody></table></div>" : '<p class="note">No marks yet.</p>') + "</section></div>";
  mountRoom(main.querySelector("[data-room]"), {
    config: game.config, game: { equipped: game.me.equipped, purchases: game.me.owned.map(item => ({ item, price: 0 })) }, gameSummary: game.me, me: s, words, readOnly: true,
    onShop: () => toast("Students open the shop through this door"),
  });
  main.querySelector(".t-bar").addEventListener("click", e => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    ({ remind: () => reminderForm([s], s.id, reload), class: () => classForm(s, reload), grant: () => grantForm(s, reload), edit: () => studentForm(s, reload), reset: () => resetForm(s, reload) })[b.dataset.act]();
  });
  main.querySelector("[data-notes]").addEventListener("click", async e => {
    const d = e.target.closest("button[data-unnote]"), c = e.target.closest("button[data-complete]");
    if (!d && !c) return;
    try {
      if (d) { await api("POST", "/api/students?action=unnotify", { id: s.id, nid: d.dataset.unnote }); toast("Reminder deleted"); }
      else { const { data } = await api("POST", "/api/students?action=complete", { id: s.id, nid: c.dataset.complete }); toast(data.xp ? "Completed: +" + data.xp + " XP for " + s.name : "Completed"); }
      reload();
    } catch (err) { toast(err.message); }
  });
}
