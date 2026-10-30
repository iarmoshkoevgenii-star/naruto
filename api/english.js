/* GET /api/english               -> list of English episodes
   GET /api/english?id=<slug>     -> one episode (ETag)
   PUT /api/english?id=<slug>     {data, baseEtag}  (teacher) save after validation */
import { HttpError, json, text, run, guardWrite, readBody, param } from "../lib/http.js";
import { requireSession, requireLang } from "../lib/session.js";
import { englishList, readEnglish, writeEnglish, Conflict } from "../lib/store.js";
import { englishErrors } from "../public/js/english-model.js";
import { contentAccess } from "../lib/game.js";

const slug = request => {
  const id = param(request, "id") || "";
  if (!/^[a-z0-9-]{1,60}$/.test(id)) throw new HttpError(400, "An episode id is required.");
  return id;
};

export async function GET(request) {
  return run(async () => {
    const s = await requireSession(request);
    requireLang(s, "en");
    if (!param(request, "id")) {
      const list = englishList();
      if (s.role === "student") for (const e of list) { const a = await contentAccess(s.id, "en/" + e.id); e.locked = !a.ok; if (!a.ok) e.unlock = a.item; }
      return json({ episodes: list });
    }
    if (s.role === "student") {
      const a = await contentAccess(s.id, "en/" + slug(request));
      if (!a.ok) throw new HttpError(403, "Unlock this episode in the shop first.", { locked: true, item: a.item });
    }
    const r = await readEnglish(slug(request), { fresh: s.role === "teacher", ifNoneMatch: request.headers.get("if-none-match") });
    if (!r) throw new HttpError(404, "This episode is not available yet.");
    const headers = { ETag: r.etag, "Cache-Control": "private, no-cache" };
    if (r.notModified) return new Response(null, { status: 304, headers });
    return text(r.text, 200, { "Content-Type": "application/json; charset=utf-8", ...headers });
  });
}

export async function PUT(request) {
  return run(async () => {
    await requireSession(request, "teacher");
    guardWrite(request);
    const id = slug(request);
    const body = (await readBody(request, 4_000_000)) || {};
    const errors = englishErrors(body.data);
    if (errors.length) throw new HttpError(422, "The episode was not saved: the data has errors.", { errors });
    try {
      return json({ ok: true, etag: (await writeEnglish(id, body.data, { baseEtag: body.baseEtag, force: body.force === true })).etag });
    } catch (e) {
      if (e instanceof Conflict) throw new HttpError(409, "This episode was changed in another tab or window. Loading the latest version: please repeat your change.");
      throw e;
    }
  });
}
