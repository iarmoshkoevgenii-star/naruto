/* Per-user documents in the private store:
   school/users/<id>/state.json  activity by day, notifications
   school/users/<id>/marks.json  marks per content: {"en/desperate-housewives": {...}, "ja/naruto": {...}}
   school/users/<id>/photo.json  {dataUrl}
   <id> is a student id, "demo" or "teacher". */
import { readDoc, updateDoc } from "./store.js";
import { HttpError } from "./http.js";

const key = (uid, name) => `school/users/${uid}/${name}.json`;
const DEFAULTS = { state: { v: 1, activity: {}, notifications: [] }, marks: { v: 1 }, photo: { v: 1, dataUrl: null } };
export const ACTIVITY_KINDS = ["practice", "study", "class"];
export const NOTE_TYPES = ["class", "homework", "test", "message"];

export async function readUser(uid, name, { fresh = false } = {}) {
  const d = await readDoc(key(uid, name), { fresh });
  return d ? d.data : JSON.parse(JSON.stringify(DEFAULTS[name]));
}

export const updateUser = (uid, name, mutate) => updateDoc(key(uid, name), DEFAULTS[name], mutate);

/* A day is the user's local calendar day (YYYY-MM-DD), accepted within a day and a half of the server's clock. */
export function checkDay(day, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "")) throw new HttpError(400, "Invalid date.");
  const t = Date.parse(day + "T12:00:00Z");
  if (!(Math.abs(t - now) < 36 * 3600 * 1000)) throw new HttpError(400, "The date is too far from today.");
  return day;
}

export function addActivity(state, day, kind, n) {
  if (!ACTIVITY_KINDS.includes(kind)) throw new HttpError(400, "Unknown activity.");
  const count = Math.max(1, Math.min(500, Math.round(Number(n) || 1)));
  const a = state.activity[day] || (state.activity[day] = {});
  a[kind] = Math.min(5000, (a[kind] || 0) + count);
  return state;
}
