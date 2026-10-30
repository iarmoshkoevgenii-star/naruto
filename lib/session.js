/* Who is calling: wraps the cookie check with the account lookup and the role and language rules. */
import { readSession } from "./auth.js";
import { HttpError, config } from "./http.js";
import { getAccount } from "./accounts.js";
import { backend } from "./store.js";

export async function currentSession(request) {
  const c = config();
  return readSession(request, c, async id => (backend() ? getAccount(id) : null));
}

export async function requireSession(request, role) {
  const session = await currentSession(request);
  if (!session) throw new HttpError(401, "Please sign in.");
  if (role === "teacher" && session.role !== "teacher") throw new HttpError(403, "Only the teacher can do this.");
  return session;
}

export function langsOf(session) {
  if (session.role === "teacher") return ["en", "ja"];
  if (session.id === "demo") return ["en"];
  return (session.account && session.account.langs) || ["en"];
}

export function requireLang(session, lang) {
  if (!langsOf(session).includes(lang)) throw new HttpError(403, lang === "ja" ? "Japanese is not included in your plan yet." : "This language is not included in your plan.", { locked: true });
}
