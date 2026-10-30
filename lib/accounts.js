/* Student accounts, kept in one private document: school/accounts.json */
import { randomBytes } from "node:crypto";
import { readDoc, updateDoc } from "./store.js";
import { HttpError } from "./http.js";
import { hashPassword, normLogin } from "./auth.js";

const KEY = "school/accounts.json";
const EMPTY = { v: 1, students: {} };
export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export async function loadAccounts({ fresh = false } = {}) {
  const d = await readDoc(KEY, { fresh });
  return d ? d.data : JSON.parse(JSON.stringify(EMPTY));
}

export async function getAccount(id, opts) {
  const doc = await loadAccounts(opts);
  return Object.prototype.hasOwnProperty.call(doc.students, id) ? doc.students[id] : null;
}

export async function findByLogin(login) {
  const l = normLogin(login);
  const doc = await loadAccounts({ fresh: true });
  return Object.values(doc.students).find(s => s.login === l) || null;
}

/* Fields students and the teacher may see (never the password hash). */
export const publicAccount = a => a && ({ id: a.id, login: a.login, name: a.name, level: a.level || "A1", langs: a.langs || ["en"], createdAt: a.createdAt });

function checkFields({ name, login, password, level }, { creating, reservedLogins }) {
  const errors = [];
  if (name !== undefined && !(typeof name === "string" && name.trim() && name.trim().length <= 80)) errors.push("Name is required (up to 80 characters).");
  if (login !== undefined) {
    const l = normLogin(login);
    if (!/^[a-z0-9._-]{3,32}$/.test(l)) errors.push("Login: 3–32 characters, Latin letters, digits, dot, dash or underscore.");
    if (reservedLogins.includes(l)) errors.push("This login is reserved.");
  }
  if (password !== undefined || creating) {
    if (typeof password !== "string" || password.length < 8 || password.length > 128) errors.push("Password: at least 8 characters.");
  }
  if (level !== undefined && !LEVELS.includes(level)) errors.push("Level must be one of " + LEVELS.join(", ") + ".");
  if (errors.length) throw new HttpError(422, "The student was not saved.", { errors });
}

export async function createStudent(input, reservedLogins) {
  checkFields(input, { creating: true, reservedLogins });
  const { salt, hash } = await hashPassword(input.password);
  const id = "s" + randomBytes(6).toString("hex");
  const now = new Date().toISOString();
  const doc = await updateDoc(KEY, EMPTY, d => {
    const login = normLogin(input.login);
    if (Object.values(d.students).some(s => s.login === login)) throw new HttpError(422, "The student was not saved.", { errors: ["This login is already taken."] });
    d.students[id] = { id, login, name: input.name.trim(), salt, hash, level: input.level || "A1", langs: input.japanese ? ["en", "ja"] : ["en"], createdAt: now, updatedAt: now };
    return d;
  });
  return doc.students[id];
}

export async function updateStudent(id, input, reservedLogins) {
  checkFields(input, { creating: false, reservedLogins });
  const pw = input.password ? await hashPassword(input.password) : null;
  const doc = await updateDoc(KEY, EMPTY, d => {
    const s = d.students[id];
    if (!s) throw new HttpError(404, "Student not found.");
    if (input.login !== undefined) {
      const login = normLogin(input.login);
      if (Object.values(d.students).some(o => o.id !== id && o.login === login)) throw new HttpError(422, "The student was not saved.", { errors: ["This login is already taken."] });
      s.login = login;
    }
    if (input.name !== undefined) s.name = input.name.trim();
    if (input.level !== undefined) s.level = input.level;
    if (input.japanese !== undefined) s.langs = input.japanese ? ["en", "ja"] : ["en"];
    if (pw) { s.salt = pw.salt; s.hash = pw.hash; }
    s.updatedAt = new Date().toISOString();
    return d;
  });
  return doc.students[id];
}

export async function deleteStudent(id) {
  await updateDoc(KEY, EMPTY, d => {
    if (!d.students[id]) throw new HttpError(404, "Student not found.");
    delete d.students[id];
    return d;
  });
}
