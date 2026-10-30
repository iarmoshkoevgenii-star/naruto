/* The room game.
   GET  /api/game                         -> config (rules, items, assets) and the signed-in student's progress
   GET  /api/game?student=<id>            -> (teacher) that student's progress
   GET  /api/game?asset=<id>              -> an uploaded picture
   POST /api/game?action=award            {kind: episode|training|grammar, ref, answers?}   (student)
   POST /api/game?action=buy              {item}                                             (student)
   POST /api/game?action=equip            {slot, item | null}                                (student)
   POST /api/game?action=grant            {student, xp, coins, note}                         (teacher)
   POST /api/game?action=reset            {student}                                          (teacher)
   POST /api/game?action=config           {overrides}                                        (teacher)
   POST /api/game?action=upload           {name, dataUrl, w, h}                              (teacher) */
import { HttpError, json, run, guardWrite, readBody, param } from "../lib/http.js";
import { requireSession } from "../lib/session.js";
import { loadConfig, saveOverrides, gameOf, summary, award, buy, equip, grant, resetGame, storeAsset, readAsset } from "../lib/game.js";
import { getAccount } from "../lib/accounts.js";
import { SLOTS, ROOM } from "../public/js/game-model.js";

const publicConfig = c => ({ rules: c.rules, items: c.items, assets: c.assets, slots: SLOTS, room: ROOM });

export async function GET(request) {
  return run(async () => {
    const s = await requireSession(request);
    const asset = param(request, "asset");
    if (asset) {
      const dataUrl = await readAsset(asset);
      if (!dataUrl) throw new HttpError(404, "Picture not found.");
      const [, type, b64] = /^data:(image\/[a-z]+);base64,(.*)$/.exec(dataUrl);
      return new Response(Buffer.from(b64, "base64"), { status: 200, headers: { "Content-Type": type, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
    }
    const { config, overrides, etag } = await loadConfig({ fresh: s.role === "teacher" });
    const student = param(request, "student");
    if (student) {
      if (s.role !== "teacher") throw new HttpError(403, "Only the teacher can see this.");
      if (!(await getAccount(student, { fresh: true }))) throw new HttpError(404, "Student not found.");
      return json({ config: publicConfig(config), me: summary(await gameOf(student), config) });
    }
    const body = { config: publicConfig(config), role: s.role };
    if (s.role === "student") body.me = summary(await gameOf(s.id), config);
    if (s.role === "teacher") { body.overrides = overrides; body.etag = etag; }
    return json(body);
  });
}

export async function POST(request) {
  return run(async () => {
    const s = await requireSession(request);
    guardWrite(request);
    const action = param(request, "action");
    const body = (await readBody(request, 2_200_000)) || {};
    const student = () => { if (s.role !== "student") throw new HttpError(403, "This is for students."); return s.id; };
    const teacher = async () => {
      if (s.role !== "teacher") throw new HttpError(403, "Only the teacher can do this.");
      const id = String(body.student || "");
      if (!(await getAccount(id, { fresh: true }))) throw new HttpError(404, "Student not found.");
      return id;
    };
    switch (action) {
      case "award": return json(await award(student(), String(body.kind || ""), body.ref, { answers: body.answers }));
      case "buy": return json(await buy(student(), String(body.item || "")));
      case "equip": return json(await equip(student(), String(body.slot || ""), body.item ? String(body.item) : null));
      case "grant": return json(await grant(await teacher(), body));
      case "reset": return json(await resetGame(await teacher()));
      case "config": {
        if (s.role !== "teacher") throw new HttpError(403, "Only the teacher can do this.");
        return json({ config: publicConfig(await saveOverrides(body.overrides || {})) });
      }
      case "upload": {
        if (s.role !== "teacher") throw new HttpError(403, "Only the teacher can do this.");
        return json({ asset: await storeAsset(body.name, body.dataUrl, body.w, body.h) });
      }
      default: throw new HttpError(404, "Unknown action.");
    }
  });
}
