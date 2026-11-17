/* Uploaded pictures (docs/room-shop/PLAN.md, step 2).
   The bytes live as real files in the store (Vercel Blob, or .local-store locally) at
   school/game/files/<id>.<ext>; the metadata lives in the `assets` table.
   Ids are content hashes with the same scheme as the old uploads (first 32 hex of sha256 of the
   data URL "data:<mime>;base64,<bytes>"), so a picture keeps its id when step 3 migrates the old
   base64 docs (school/game/assets/<id>.json). Until then getAsset falls back to those docs. */
import { createHash } from "node:crypto";
import { query, dbConfigured } from "./db.js";
import { readDoc, readFileBytes, writeFileBytes } from "./store.js";
import { HttpError } from "./http.js";

export const MAX_ASSET_BYTES = 1_572_864; // 1.5 MB
export const ASSET_KINDS = ["sheet", "sprite", "spine", "dvd-blank", "shelf-empty"];
const EXT = { "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/jpeg": "jpg" };
const ID = /^[a-f0-9]{32}$/;
const fileKey = (id, mime) => `school/game/files/${id}.${EXT[mime]}`;
const legacyKey = id => `school/game/assets/${id}.json`;
const bad = () => new HttpError(422, "Upload a PNG, WebP, GIF or JPEG image under 1.5 MB.");

/* The real type from the first bytes; the declared type is never trusted. */
export function sniffMime(bytes) {
  const b = Buffer.from(bytes || []);
  const at = (i, s) => b.length >= i + s.length && b.subarray(i, i + s.length).equals(Buffer.from(s, "latin1"));
  if (at(0, "\x89PNG\r\n\x1a\n")) return "image/png";
  if (at(0, "\xff\xd8\xff")) return "image/jpeg";
  if (at(0, "GIF87a") || at(0, "GIF89a")) return "image/gif";
  if (at(0, "RIFF") && at(8, "WEBP")) return "image/webp";
  return null;
}

export function assetIdOf(bytes, mime) {
  return createHash("sha256").update(`data:${mime};base64,${Buffer.from(bytes).toString("base64")}`).digest("hex").slice(0, 32);
}

/* Decodes the upload API's data-URL body. Returns {bytes, mime} (mime as declared). */
export function decodeDataUrl(dataUrl) {
  const m = typeof dataUrl === "string" && /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw bad();
  return { mime: m[1], bytes: Buffer.from(m[2], "base64") };
}

const rowOut = r => ({ id: r.id, kind: r.kind, mime: r.mime, name: r.name, w: r.w, h: r.h, at: new Date(r.created_at).toISOString() });

/* Validates and stores a picture. Uploading the same bytes again returns the existing asset. */
export async function putAsset({ bytes, mime, name = "", kind = "sprite", w = 0, h = 0 }) {
  const buf = Buffer.from(bytes || []);
  const real = sniffMime(buf);
  if (!real || buf.length > MAX_ASSET_BYTES || (mime && mime !== real)) throw bad();
  if (!ASSET_KINDS.includes(kind)) throw new HttpError(422, "Unknown picture kind.");
  const id = assetIdOf(buf, real);
  const [existing] = await query("SELECT * FROM assets WHERE id = $1", [id]);
  if (existing) return rowOut(existing);
  const key = fileKey(id, real);
  await writeFileBytes(key, buf, real); // file first: a row never points at a missing file
  const size = n => Math.max(0, Math.min(100_000, Math.round(Number(n)) || 0));
  await query(
    "INSERT INTO assets (id, kind, blob_key, mime, w, h, name) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING",
    [id, kind, key, real, size(w), size(h), String(name || "").slice(0, 80)]);
  const [row] = await query("SELECT * FROM assets WHERE id = $1", [id]);
  return rowOut(row);
}

/* {bytes, mime} or null. */
export async function getAsset(id) {
  if (typeof id !== "string" || !ID.test(id)) return null;
  if (dbConfigured()) {
    const [row] = await query("SELECT blob_key, mime FROM assets WHERE id = $1", [id]);
    if (row) {
      const bytes = await readFileBytes(row.blob_key);
      if (bytes) return { bytes, mime: row.mime };
    }
  }
  const d = await readDoc(legacyKey(id));
  if (!d || !d.data || !d.data.dataUrl) return null;
  const m = /^data:(image\/[a-z]+);base64,(.*)$/.exec(d.data.dataUrl);
  return m ? { bytes: Buffer.from(m[2], "base64"), mime: m[1] } : null;
}
