/* GET  /api/auth               -> {role, id, name} for the current session, or 401
   POST /api/auth?action=login  {login, password} -> sets the session cookie
   POST /api/auth?action=logout -> clears it */
import { checkLogin, issueToken, sessionCookie, clearedCookie } from "../lib/auth.js";
import { HttpError, json, run, config, guardWrite, readBody, isSecure, param } from "../lib/http.js";
import { currentSession } from "../lib/session.js";
import { findByLogin, getAccount } from "../lib/accounts.js";
import { backend } from "../lib/store.js";

export async function GET(request) {
  return run(async () => {
    const s = await currentSession(request);
    if (!s) return json({ error: "Please sign in." }, 401);
    return json({ role: s.role, id: s.id, name: s.name });
  });
}

export async function POST(request) {
  return run(async () => {
    guardWrite(request);
    const action = param(request, "action");
    if (action === "logout") return json({ ok: true }, 200, { "Set-Cookie": clearedCookie(isSecure(request)) });
    if (action !== "login") throw new HttpError(404, "Unknown action.");
    const c = config();
    const body = (await readBody(request, 4096)) || {};
    const who = await checkLogin(body.login, body.password, c, async l => (backend() ? findByLogin(l) : null));
    if (!who) {
      await new Promise(r => setTimeout(r, 600 + Math.random() * 600)); // slows down password guessing
      throw new HttpError(401, "Wrong login or password.");
    }
    const account = who.role === "student" && who.id !== "demo" ? await getAccount(who.id, { fresh: true }) : null;
    return json({ role: who.role, id: who.id }, 200, { "Set-Cookie": sessionCookie(issueToken(who.role, who.id, c, account), isSecure(request)) });
  });
}
