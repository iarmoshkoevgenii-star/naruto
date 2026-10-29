import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ROLES = ["user", "dev"];
const COOKIE = "ns_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const REQUIRED = ["USER_LOGIN", "USER_PASSWORD", "DEV_LOGIN", "DEV_PASSWORD", "SESSION_SECRET"];

/* Reads the credentials from environment variables. Returns {config} or {error}. */
export function authConfig(env = process.env) {
  const missing = REQUIRED.filter(k => !env[k]);
  if (missing.length) return { error: "Сайт не настроен: задайте переменные окружения " + missing.join(", ") + " в настройках проекта Vercel и сделайте Redeploy." };
  if (env.SESSION_SECRET.length < 32) return { error: "SESSION_SECRET должен быть не короче 32 символов." };
  const config = {
    secret: env.SESSION_SECRET,
    user: { login: env.USER_LOGIN.trim().toLowerCase(), password: env.USER_PASSWORD },
    dev: { login: env.DEV_LOGIN.trim().toLowerCase(), password: env.DEV_PASSWORD },
  };
  if (config.user.login === config.dev.login && config.user.password === config.dev.password)
    return { error: "Данные для входа ученика и разработчика совпадают: задайте разные." };
  return { config };
}

const digest = s => createHash("sha256").update(String(s ?? ""), "utf8").digest();
const same = (a, b) => timingSafeEqual(digest(a), digest(b));

/* Returns "dev", "user" or null. Both pairs are always compared, so timing does not reveal which one matched. */
export function checkCredentials(login, password, config) {
  const l = String(login ?? "").trim().toLowerCase();
  const devOk = same(l, config.dev.login) & same(password, config.dev.password);
  const userOk = same(l, config.user.login) & same(password, config.user.password);
  return devOk ? "dev" : userOk ? "user" : null;
}

/* The signing key depends on the role's current credentials: changing a password signs everyone out of that role. */
function keyFor(role, config) {
  const c = config[role];
  return createHmac("sha256", config.secret).update("naruto-session:v1\n" + role + "\n" + c.login + "\n" + c.password).digest();
}

export function issueToken(role, config, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ r: role, exp: Math.floor(now / 1000) + MAX_AGE })).toString("base64url");
  const sig = createHmac("sha256", keyFor(role, config)).update(payload).digest("base64url");
  return payload + "." + sig;
}

export function verifyToken(token, config, now = Date.now()) {
  if (typeof token !== "string" || token.length > 600) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  let data;
  try { data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return null; }
  if (!data || !ROLES.includes(data.r) || !(data.exp > now / 1000)) return null;
  const expected = createHmac("sha256", keyFor(data.r, config)).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return { role: data.r, exp: data.exp };
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function readSession(request, config) {
  return verifyToken(parseCookies(request.headers.get("cookie"))[COOKIE], config);
}

export const sessionCookie = (token, secure) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure ? "; Secure" : ""}`;

export const clearedCookie = secure =>
  `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
