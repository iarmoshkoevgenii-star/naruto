/* GET /api/content?id=en/desperate-housewives          the series page (after login)
   GET /api/content?id=en/desperate-housewives&part=js  its script
   GET /api/content?list=1                              ids of series that have a page
   Series without a page get the home page, which shows "пока пусто" for them.
   Pages come from content/<lang>/<slug>.html, bundled at build time. */
import { HttpError, json, text, run, config, param } from "../lib/http.js";
import { readSession } from "../lib/auth.js";
import CONTENT from "../lib/content-data.js";

const PRIVATE = { "Cache-Control": "private, no-cache" };

export async function GET(request) {
  return run(async () => {
    const session = readSession(request, config());
    if (param(request, "list")) {
      if (!session) throw new HttpError(401, "Нужно войти.");
      return json({ pages: Object.values(CONTENT.pages).map(p => ({ id: p.lang + "/" + p.slug, lang: p.lang, slug: p.slug, title: p.title })) });
    }
    const id = param(request, "id") || "";
    if (!/^[a-z]{2}\/[a-z0-9-]+$/.test(id)) throw new HttpError(404, "Страница не найдена.");
    const page = Object.prototype.hasOwnProperty.call(CONTENT.pages, id) ? CONTENT.pages[id] : null;
    const part = param(request, "part");
    if (!session) {
      if (part) throw new HttpError(401, "Нужно войти.");
      return new Response(null, { status: 302, headers: { Location: "/?next=" + encodeURIComponent("/" + id), "Cache-Control": "no-store" } });
    }
    if (!page) {
      if (part) throw new HttpError(404, "Страница не найдена.");
      return text(CONTENT.landing, 200, { "Content-Type": "text/html; charset=utf-8", ...PRIVATE });
    }
    if (part === "js") {
      const code = page.scripts[Number(param(request, "n") || 0)];
      if (code == null) throw new HttpError(404, "Скрипт не найден.");
      return text(code, 200, { "Content-Type": "text/javascript; charset=utf-8", ...PRIVATE });
    }
    return text(page.html, 200, { "Content-Type": "text/html; charset=utf-8", ...PRIVATE });
  });
}
