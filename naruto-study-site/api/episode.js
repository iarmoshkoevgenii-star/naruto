/* GET /api/episode?num=9[&src=seed]  -> the episode JSON with an ETag
   PUT /api/episode?num=9  {episode, baseEtag, force}  (developer) save after validation */
import { HttpError, json, text, run, requireSession, guardWrite, readBody, param, episodeNum } from "../lib/http.js";
import { catalog, readEpisode, writeEpisode, Conflict } from "../lib/store.js";
import { episodeErrors, clean } from "../public/js/model.js";

export async function GET(request) {
  return run(async () => {
    const session = requireSession(request);
    const num = episodeNum(request);
    const r = await readEpisode(num, {
      fresh: session.role === "dev",
      src: param(request, "src") || "auto",
      ifNoneMatch: request.headers.get("if-none-match"),
    });
    if (!r) throw new HttpError(404, `Эпизод ${num} не найден.`);
    const headers = { ETag: r.etag, "Cache-Control": "private, no-cache" };
    if (r.notModified) return new Response(null, { status: 304, headers });
    return text(r.text, 200, { "Content-Type": "application/json; charset=utf-8", ...headers });
  });
}

export async function PUT(request) {
  return run(async () => {
    requireSession(request, "dev");
    guardWrite(request);
    const num = episodeNum(request);
    const body = (await readBody(request, 4_000_000)) || {};
    const episode = body.episode;
    if (!episode || episode.num !== num) throw new HttpError(400, "Номер эпизода в запросе не совпадает с адресом.");
    const cat = await catalog({ fresh: true });
    const errors = episodeErrors(episode, cat.topics, cat.speakers);
    if (errors.length) throw new HttpError(422, "Эпизод не сохранён: в данных есть ошибки.", { errors: errors.slice(0, 50) });
    try {
      const { etag } = await writeEpisode(num, clean(episode), { baseEtag: body.baseEtag, force: body.force === true, stored: cat.stored });
      return json({ ok: true, etag });
    } catch (e) {
      if (e instanceof Conflict) throw new HttpError(409, "Этот эпизод уже изменили в другой вкладке или окне. Загружаю свежую версию: повторите правку.");
      throw e;
    }
  });
}
