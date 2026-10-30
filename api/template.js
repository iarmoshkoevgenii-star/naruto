/* GET /api/template  (developer) the single-file site engine with empty data blocks, used by "export". */
import { text, run } from "../lib/http.js";
import { requireSession } from "../lib/session.js";
import { standaloneTemplate } from "../lib/store.js";

export async function GET(request) {
  return run(async () => {
    await requireSession(request, "teacher");
    return text(await standaloneTemplate(), 200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-cache" });
  });
}
