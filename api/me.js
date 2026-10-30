/* The signed-in user's own data.
   GET  /api/me                                -> profile, photo, activity, notifications
   GET  /api/me?part=marks[&content=en/x]      -> saved marks
   POST /api/me?action=marks     {content, marks, activity?: {day, kind, n}}
   POST /api/me?action=activity  {day, kind, n}
   POST /api/me?action=photo     {dataUrl}
   POST /api/me?action=read      {ids: [...]} or {all: true} */
import { HttpError, json, run, guardWrite, readBody, param } from "../lib/http.js";
import { requireSession, langsOf, requireLang } from "../lib/session.js";
import { readUser, updateUser, addActivity, checkDay } from "../lib/users.js";
import { publicAccount } from "../lib/accounts.js";
import { storageInfo } from "../lib/store.js";

const CONTENT = /^(en|ja)\/[a-z0-9-]{1,60}$/;

export async function GET(request) {
  return run(async () => {
    const s = await requireSession(request);
    if (param(request, "part") === "marks") {
      const marks = await readUser(s.id, "marks", { fresh: true });
      const c = param(request, "content");
      if (c) { if (!CONTENT.test(c)) throw new HttpError(400, "Unknown content."); return json({ content: c, marks: marks[c] || null }); }
      return json({ marks });
    }
    const [state, photo] = await Promise.all([readUser(s.id, "state", { fresh: true }), readUser(s.id, "photo", { fresh: true })]);
    const account = s.account ? publicAccount(s.account) : { id: s.id, login: null, name: s.name, level: s.role === "teacher" ? null : "A1", createdAt: null };
    return json({ role: s.role, ...account, langs: langsOf(s), photo: photo.dataUrl, activity: state.activity, notifications: state.notifications, storage: storageInfo() });
  });
}

export async function POST(request) {
  return run(async () => {
    const s = await requireSession(request);
    guardWrite(request);
    const action = param(request, "action");
    const body = (await readBody(request, 400_000)) || {};
    const isStudent = s.role === "student";
    if (action === "marks") {
      if (!CONTENT.test(body.content || "")) throw new HttpError(400, "Unknown content.");
      requireLang(s, body.content.slice(0, 2));
      if (!body.marks || typeof body.marks !== "object") throw new HttpError(400, "Marks are required.");
      if (JSON.stringify(body.marks).length > 300_000) throw new HttpError(413, "Too many marks.");
      await updateUser(s.id, "marks", m => { m[body.content] = { ...(m[body.content] || {}), ...body.marks, savedAt: new Date().toISOString() }; return m; }); // fields not sent are kept
      if (isStudent && body.activity) await updateUser(s.id, "state", st => addActivity(st, checkDay(body.activity.day), body.activity.kind, body.activity.n));
      return json({ ok: true });
    }
    if (action === "activity") {
      if (!isStudent) return json({ ok: true, ignored: true });
      const st = await updateUser(s.id, "state", st => addActivity(st, checkDay(body.day), body.kind, body.n));
      return json({ ok: true, activity: st.activity });
    }
    if (action === "photo") {
      const d = body.dataUrl;
      if (d !== null && !(typeof d === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(d) && d.length < 300_000))
        throw new HttpError(422, "The photo must be a JPEG, PNG or WebP image under 200 KB.");
      await updateUser(s.id, "photo", p => { p.dataUrl = d; p.updatedAt = new Date().toISOString(); return p; });
      return json({ ok: true });
    }
    if (action === "read") {
      const ids = new Set(Array.isArray(body.ids) ? body.ids : []);
      const st = await updateUser(s.id, "state", st => {
        let changed = false;
        for (const n of st.notifications) if (!n.read && (body.all || ids.has(n.id))) { n.read = true; changed = true; }
        return changed ? st : null;
      });
      return json({ ok: true, notifications: st.notifications });
    }
    throw new HttpError(404, "Unknown action.");
  });
}
