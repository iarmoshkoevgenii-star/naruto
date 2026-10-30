/* Teacher mode: students and their reminders.
   GET  /api/students                      -> all students with their activity
   GET  /api/students?id=<id>              -> one student: profile, photo, activity, notifications, marks summary
   POST /api/students?action=create        {name, login, password, level, japanese}
   POST /api/students?action=update        {id, name?, login?, password?, level?, japanese?}
   POST /api/students?action=delete        {id}
   POST /api/students?action=notify        {to: [ids] | "all", type, title, body?, when?}
   POST /api/students?action=unnotify      {id, nid}
   POST /api/students?action=class         {id, day} */
import { randomBytes } from "node:crypto";
import { HttpError, json, run, guardWrite, readBody, param, config } from "../lib/http.js";
import { requireSession } from "../lib/session.js";
import { loadAccounts, createStudent, updateStudent, deleteStudent, publicAccount } from "../lib/accounts.js";
import { readUser, updateUser, addActivity, NOTE_TYPES } from "../lib/users.js";
import { storageInfo } from "../lib/store.js";

const reserved = () => { const c = config(); return [c.teacher.login, c.demo && c.demo.login, "teacher", "demo", "admin"].filter(Boolean); };

function summariseMarks(marks) {
  const out = {};
  for (const [content, m] of Object.entries(marks || {})) {
    if (!m || typeof m !== "object" || content === "v") continue;
    const words = Array.isArray(m.words) ? m.words.length : Array.isArray(m.cards) ? m.cards.length : 0;
    const grammar = Array.isArray(m.notes) ? m.notes.length : Array.isArray(m.selected) ? m.selected.length : 0;
    const learned = m.learned && typeof m.learned === "object" ? Object.keys(m.learned).length : 0;
    out[content] = { words, grammar, learned, savedAt: m.savedAt || null };
  }
  return out;
}

export async function GET(request) {
  return run(async () => {
    await requireSession(request, "teacher");
    const accounts = await loadAccounts({ fresh: true });
    const id = param(request, "id");
    if (id) {
      const a = accounts.students[id];
      if (!a) throw new HttpError(404, "Student not found.");
      const [state, photo, marks] = await Promise.all([readUser(id, "state", { fresh: true }), readUser(id, "photo", { fresh: true }), readUser(id, "marks", { fresh: true })]);
      return json({ student: { ...publicAccount(a), photo: photo.dataUrl, activity: state.activity, notifications: state.notifications, marks: summariseMarks(marks) } });
    }
    const list = await Promise.all(Object.values(accounts.students).map(async a => {
      const state = await readUser(a.id, "state", { fresh: true });
      return { ...publicAccount(a), activity: state.activity, unread: state.notifications.filter(n => !n.read).length, reminders: state.notifications.length };
    }));
    list.sort((x, y) => x.name.localeCompare(y.name));
    return json({ students: list, storage: storageInfo() });
  });
}

function cleanNote(body) {
  const type = NOTE_TYPES.includes(body.type) ? body.type : null;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";
  const when = typeof body.when === "string" && body.when ? body.when : null;
  const errors = [];
  if (!type) errors.push("Choose a type: class, homework, test or message.");
  if (!title || title.length > 120) errors.push("A title is required (up to 120 characters).");
  if (text.length > 600) errors.push("The note is too long (up to 600 characters).");
  if (when && (isNaN(Date.parse(when)) || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(when))) errors.push("The date is not valid.");
  if (errors.length) throw new HttpError(422, "The reminder was not sent.", { errors });
  return { type, title, body: text, when };
}

export async function POST(request) {
  return run(async () => {
    await requireSession(request, "teacher");
    guardWrite(request);
    const action = param(request, "action");
    const body = (await readBody(request, 20_000)) || {};
    if (action === "create") return json({ student: publicAccount(await createStudent(body, reserved())) });
    if (action === "update") return json({ student: publicAccount(await updateStudent(String(body.id || ""), body, reserved())) });
    if (action === "delete") { await deleteStudent(String(body.id || "")); return json({ ok: true }); }
    if (action === "notify") {
      const note = cleanNote(body);
      const accounts = await loadAccounts({ fresh: true });
      const ids = body.to === "all" ? Object.keys(accounts.students) : (Array.isArray(body.to) ? body.to : []).filter(id => accounts.students[id]);
      if (!ids.length) throw new HttpError(422, "The reminder was not sent.", { errors: ["Choose at least one student."] });
      const createdAt = new Date().toISOString();
      for (const id of ids) {
        await updateUser(id, "state", st => {
          st.notifications.unshift({ id: "n" + randomBytes(5).toString("hex"), ...note, createdAt, read: false });
          st.notifications = st.notifications.slice(0, 200);
          return st;
        });
      }
      return json({ ok: true, sent: ids.length });
    }
    if (action === "unnotify") {
      await updateUser(String(body.id || ""), "state", st => { st.notifications = st.notifications.filter(n => n.id !== body.nid); return st; });
      return json({ ok: true });
    }
    if (action === "class") {
      const accounts = await loadAccounts({ fresh: true });
      if (!accounts.students[body.id]) throw new HttpError(404, "Student not found.");
      const day = body.day;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "") || Date.parse(day + "T12:00:00Z") > Date.now() + 36 * 3600 * 1000) throw new HttpError(400, "Choose a date that is not in the future.");
      const st = await updateUser(body.id, "state", st => addActivity(st, day, "class", 1));
      return json({ ok: true, activity: st.activity });
    }
    throw new HttpError(404, "Unknown action.");
  });
}
