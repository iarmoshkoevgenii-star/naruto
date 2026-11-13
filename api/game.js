/* The room game.
   GET  /api/game                         -> config (rules, sections, items; teachers also get uploads) and the
                                             signed-in student's progress
   GET  /api/game?student=<id>            -> (teacher) that student's progress
   GET  /api/game?asset=<id>              -> an uploaded picture
   POST /api/game?action=award            {kind: episode|training|grammar, ref, answers?}   (student)
   POST /api/game?action=buy              {item}                                             (student)
   POST /api/game?action=equip            {slot, item | null}                                (student)
   POST /api/game?action=grant            {student, xp, coins, note}                         (teacher)
   POST /api/game?action=reset            {student}                                          (teacher)
   POST /api/game?action=config           {overrides: {rules}}                               (teacher)
   POST /api/game?action=upload           {name, dataUrl, w, h}                              (teacher)
   Shop management (teacher), each answering {result, config} with the teacher's config:
   POST /api/game?action=item.create      {name, type, sectionId, price, minLevel, sprite: {asset, rect} | surface, sub?, cover?, spine?, isDefault?}
   POST /api/game?action=item.update      {id, ...fields}  (name, sub, price, minLevel, sectionId, sprite, surface, cover, spine, isDefault)
   POST /api/game?action=item.hide|item.unhide|item.delete|item.restore   {id}
   POST /api/game?action=item.reorder     {sectionId, ids}   (the section's full new order)
   POST /api/game?action=section.create   {label}
   POST /api/game?action=section.rename   {id, label}
   POST /api/game?action=section.reorder  {ids}              (every section, in the new order)
   POST /api/game?action=section.delete   {id}               (only when empty) */
import { HttpError, json, run, guardWrite, readBody, param } from "../lib/http.js";
import { requireSession } from "../lib/session.js";
import { loadConfig, clientConfig, saveOverrides, gameOf, summary, award, buy, equip, grant, resetGame, storeAsset, catalogAction, CATALOG_OPS } from "../lib/game.js";
import { getAsset } from "../lib/assets.js";
import { listUploads } from "../lib/catalog.js";
import { getAccount } from "../lib/accounts.js";

export async function GET(request) {
  return run(async () => {
    const s = await requireSession(request);
    const asset = param(request, "asset");
    if (asset) {
      const pic = await getAsset(asset);
      if (!pic) throw new HttpError(404, "Picture not found.");
      return new Response(pic.bytes, { status: 200, headers: { "Content-Type": pic.mime, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
    }
    const { config, overrides, etag } = await loadConfig({ fresh: s.role === "teacher" });
    const student = param(request, "student");
    if (student) {
      if (s.role !== "teacher") throw new HttpError(403, "Only the teacher can see this.");
      if (!(await getAccount(student, { fresh: true }))) throw new HttpError(404, "Student not found.");
      return json({ config: clientConfig(config, { role: "teacher", assets: [] }), me: summary(await gameOf(student), config) });
    }
    const body = { role: s.role };
    if (s.role === "student") {
      const game = await gameOf(s.id);
      body.config = clientConfig(config, { role: "student", game });
      body.me = summary(game, config);
    } else body.config = clientConfig(config, { role: s.role, assets: s.role === "teacher" ? await listUploads() : [] });
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
        return json({ config: clientConfig(await saveOverrides(body.overrides || {}), { role: "teacher", assets: await listUploads() }) });
      }
      case "upload": {
        if (s.role !== "teacher") throw new HttpError(403, "Only the teacher can do this.");
        return json({ asset: await storeAsset(body.name, body.dataUrl, body.w, body.h, body.kind) });
      }
      default: {
        if (!CATALOG_OPS.includes(action)) throw new HttpError(404, "Unknown action.");
        if (s.role !== "teacher") throw new HttpError(403, "Only the teacher can do this.");
        const result = await catalogAction(action, body);
        const { config } = await loadConfig({ fresh: true });
        return json({ result, config: clientConfig(config, { role: "teacher", assets: await listUploads() }) });
      }
    }
  });
}
