/* GET /api/template  (developer) the single-file site engine with empty data blocks, used by "export". */
import { text, run, requireSession } from "../lib/http.js";
import { standaloneTemplate } from "../lib/store.js";

export async function GET(request) {
  return run(async () => {
    requireSession(request, "dev");
    return text(await standaloneTemplate(), 200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-cache" });
  });
}
