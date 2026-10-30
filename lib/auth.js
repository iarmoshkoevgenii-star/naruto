import { createHash, createHmac, timingSafeEqual, randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
export const ROLES = ["student", "teacher"];
const COOKIE = "ns_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const normLogin = s => String(s ?? "").trim().toLowerCase();

/* Teacher credentials come from environment variables (TEACHER_* or the older DEV_* names).
   USER_LOGIN / USER_PASSWORD, if set, add one built-in demo student. Returns {config} or {error}. */
export function authConfig(env = process.env) {
  const teacherLogin = env.TEACHER_LOGIN || env.DEV_LOGIN;
  const teacherPassword = env.TEACHER_PASSWORD || env.DEV_PASSWORD;
  const missing = [];
  if (!env.SESSION_SECRET) missing.push("SESSION_SECRET");
  if (!teacherLogin) missing.push("TEACHER_LOGIN");
  if (!teacherPassword) missing.push("TEACHER_PASSWORD");
  if (missing.length) return { error: "The site is not set up yet: add " + missing.join(", ") + " in the Vercel project settings and redeploy." };
  if (env.SESSION_SECRET.length < 32) return { error: "SESSION_SECRET must be at least 32 characters long." };
  const config = { secret: env.SESSION_SECRET, teacher: { login: normLogin(teacherLogin), password: teacherPassword }, demo: null };
  if (env.USER_LOGIN && env.USER_PASSWORD) config.demo = { login: normLogin(env.USER_LOGIN), password: env.USER_PASSWORD };
  if (config.demo && config.demo.login === config.teacher.login) return { error: "USER_LOGIN and the teacher login must be different." };
  return { config };
}

/* ---------- passwords ---------- */
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const hash = (await scrypt(String(password), salt, 32)).toString("base64url");
  return { salt, hash };
}

export async function verifyPassword(password, salt, hash) {
  const got = await scrypt(String(password ?? ""), String(salt), 32);
  const expected = Buffer.from(String(hash), "base64url");
  return expected.length === got.length && timingSafeEqual(got, expected);
}

const digest = s => createHash("sha256").update(String(s ?? ""), "utf8").digest();
const same = (a, b) => timingSafeEqual(digest(a), digest(b));

/* Returns {role, id} or null. findStudent(login) -> account or null. */
export async function checkLogin(login, password, config, findStudent) {
  const l = normLogin(login);
  const teacher = same(l, config.teacher.login) & same(password, config.teacher.password);
  const demo = config.demo ? (same(l, config.demo.login) & same(password, config.demo.password)) : 0;
  if (teacher) return { role: "teacher", id: "teacher" };
  if (demo) return { role: "student", id: "demo" };
  const account = l ? await findStudent(l) : null;
  if (account && await verifyPassword(password, account.salt, account.hash)) return { role: "student", id: account.id };
  if (!account) await verifyPassword(password, "timing-equaliser", "AAAA"); // similar time for unknown logins
  return null;
}

/* ---------- sessions ---------- */
/* The signing key includes the account's current credentials, so changing or resetting a
   password, or deleting the student, signs that account out everywhere. */
function fingerprint(role, id, config, account) {
  if (role === "teacher") return config.teacher.login + "\n" + config.teacher.password;
  if (id === "demo") return config.demo ? config.demo.login + "\n" + config.demo.password : null;
  return account ? account.login + "\n" + account.hash : null;
}
const keyFor = (role, id, fp, config) => createHmac("sha256", config.secret).update("nls-session:v2\n" + role + "\n" + id + "\n" + fp).digest();

export function issueToken(role, id, config, account, now = Date.now()) {
  const fp = fingerprint(role, id, config, account);
  const payload = Buffer.from(JSON.stringify({ r: role, id, exp: Math.floor(now / 1000) + MAX_AGE })).toString("base64url");
  return payload + "." + createHmac("sha256", keyFor(role, id, fp, config)).update(payload).digest("base64url");
}

function decode(token, now) {
  if (typeof token !== "string" || token.length > 800) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  let data;
  try { data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); } catch { return null; }
  if (!data || !ROLES.includes(data.r) || typeof data.id !== "string" || !(data.exp > now / 1000)) return null;
  return { payload: parts[0], sig: parts[1], role: data.r, id: data.id, exp: data.exp };
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/* lookup(id) -> student account or null. Returns {role, id, name, account} or null. */
export async function readSession(request, config, lookup, now = Date.now()) {
  const d = decode(parseCookies(request.headers.get("cookie"))[COOKIE], now);
  if (!d) return null;
  if (d.role === "teacher" && d.id !== "teacher") return null;
  if (d.role === "student" && d.id === "teacher") return null;
  const account = d.role === "student" && d.id !== "demo" ? await lookup(d.id) : null;
  const fp = fingerprint(d.role, d.id, config, account);
  if (!fp) return null;
  const expected = createHmac("sha256", keyFor(d.role, d.id, fp, config)).update(d.payload).digest();
  const given = Buffer.from(d.sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const name = d.role === "teacher" ? "Teacher" : d.id === "demo" ? "Demo student" : account.name;
  return { role: d.role, id: d.id, name, account, exp: d.exp };
}

export const sessionCookie = (token, secure) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure ? "; Secure" : ""}`;

export const clearedCookie = secure =>
  `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
