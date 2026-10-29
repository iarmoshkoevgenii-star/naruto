/* GET  /api/auth               -> {role} for the current session, or 401
   POST /api/auth?action=login  {login, password} -> sets the session cookie
   POST /api/auth?action=logout -> clears it */
import { checkCredentials, issueToken, readSession, sessionCookie, clearedCookie } from "../lib/auth.js";
import { HttpError, json, run, config, guardWrite, readBody, isSecure, param } from "../lib/http.js";

export async function GET(request) {
  return run(async () => {
    const session = readSession(request, config());
    if (!session) return json({ error: "Нужно войти." }, 401);
    return json({ role: session.role });
  });
}

export async function POST(request) {
  return run(async () => {
    guardWrite(request);
    const action = param(request, "action");
    if (action === "logout") return json({ ok: true }, 200, { "Set-Cookie": clearedCookie(isSecure(request)) });
    if (action !== "login") throw new HttpError(404, "Неизвестное действие.");
    const c = config();
    const body = (await readBody(request, 4096)) || {};
    const role = checkCredentials(body.login, body.password, c);
    if (!role) {
      await new Promise(r => setTimeout(r, 600 + Math.random() * 600)); // slows down password guessing
      throw new HttpError(401, "Неверный логин или пароль.");
    }
    return json({ role }, 200, { "Set-Cookie": sessionCookie(issueToken(role, c), isSecure(request)) });
  });
}
