/* GET  /api/data               -> role, storage status, topics, speakers, known words, episode list
   POST /api/data?action=topic  {id, topic}                (developer) add or update a grammar topic
   POST /api/data?action=merge  {topics, speakers, known}  (developer) used by the import */
import { HttpError, json, run, requireSession, guardWrite, readBody, param } from "../lib/http.js";
import { catalog, storageInfo, upsertTopic, mergeCatalog } from "../lib/store.js";
import { topicErrors, speakerErrors } from "../public/js/model.js";

const TOPIC_FIELDS = ["t", "lv", "ref", "why", "study", "task"];
function tidyTopic(t) {
  const out = {};
  for (const f of TOPIC_FIELDS) if (typeof t[f] === "string" && (t[f].trim() || f !== "ref")) out[f] = t[f].trim();
  if (t.rec === true) out.rec = true;
  return out;
}

async function respond(session) {
  return json({ role: session.role, storage: storageInfo(), ...(await catalog({ fresh: session.role === "dev" })) });
}

export async function GET(request) {
  return run(async () => respond(requireSession(request)));
}

export async function POST(request) {
  return run(async () => {
    const session = requireSession(request, "dev");
    guardWrite(request);
    const action = param(request, "action");
    const body = (await readBody(request, 3_000_000)) || {};
    if (action === "topic") {
      const errors = topicErrors(body.id, body.topic);
      if (errors.length) throw new HttpError(422, "Тема не сохранена.", { errors });
      await upsertTopic(body.id, tidyTopic(body.topic));
    } else if (action === "merge") {
      const topics = body.topics || {}, speakers = body.speakers || {}, known = body.known || [];
      const errors = [
        ...Object.entries(topics).flatMap(([k, t]) => topicErrors(k, t).map(e => `тема ${k}: ${e}`)),
        ...Object.entries(speakers).flatMap(([k, s]) => speakerErrors(k, s)),
      ];
      if (!Array.isArray(known) || known.some(w => typeof w !== "string")) errors.push("known должен быть списком слов");
      if (errors.length) throw new HttpError(422, "Данные не сохранены.", { errors: errors.slice(0, 50) });
      await mergeCatalog({ topics, speakers, known });
    } else {
      throw new HttpError(404, "Неизвестное действие.");
    }
    return respond(session);
  });
}
