/* Data lives in two layers:
   1. data/ in the repository: the episodes, topics, speakers and known words the site was deployed with.
   2. A private Vercel Blob store: every episode the developer edits or imports, plus a small meta.json
      with added topics, speakers, known words and the list of stored episodes. Layer 2 wins.
   For local development, LOCAL_STORE_DIR replaces Vercel Blob with a plain folder. */
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { get, put, BlobPreconditionFailedError } from "@vercel/blob";
import { HttpError, strongEtag } from "./http.js";
import { canonical } from "../public/js/model.js";
import SEED from "./seed-data.js";

const ROOT = process.cwd();
const META_KEY = "naruto/meta.json";
const episodeKey = n => `naruto/episodes/ep${n}.json`;

export class Conflict extends Error {}
const hash = s => createHash("sha256").update(s).digest("hex").slice(0, 24);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- backends ---------------- */
function blobBackend() {
  return {
    kind: "blob",
    async read(key, { fresh = false, ifNoneMatch } = {}) {
      const r = await get(key, { access: "private", useCache: !fresh, ifNoneMatch: ifNoneMatch ? strongEtag(ifNoneMatch) : undefined });
      if (!r) return null;
      if (r.statusCode === 304) return { notModified: true, etag: r.blob.etag };
      return { text: await new Response(r.stream).text(), etag: r.blob.etag };
    },
    async write(key, body, { ifMatch, create } = {}) {
      const options = { access: "private", contentType: "application/json", addRandomSuffix: false };
      if (create) options.allowOverwrite = false;
      else { options.allowOverwrite = true; if (ifMatch) options.ifMatch = strongEtag(ifMatch); }
      try {
        return { etag: (await put(key, body, options)).etag };
      } catch (e) {
        if (e instanceof BlobPreconditionFailedError) throw new Conflict("changed");
        if (create && (await this.read(key, { fresh: true }).catch(() => null))) throw new Conflict("exists");
        throw e;
      }
    },
  };
}

function localBackend(dir) {
  const file = key => path.join(dir, key);
  const etagOf = body => `"${hash(body)}"`;
  return {
    kind: "local",
    async read(key, { ifNoneMatch } = {}) {
      let body;
      try { body = await readFile(file(key), "utf8"); } catch (e) { if (e.code === "ENOENT") return null; throw e; }
      const etag = etagOf(body);
      if (ifNoneMatch && strongEtag(ifNoneMatch) === etag) return { notModified: true, etag };
      return { text: body, etag };
    },
    async write(key, body, { ifMatch, create } = {}) {
      const f = file(key);
      await mkdir(path.dirname(f), { recursive: true });
      let current = null;
      try { current = await readFile(f, "utf8"); } catch (e) { if (e.code !== "ENOENT") throw e; }
      if (create && current !== null) throw new Conflict("exists");
      if (ifMatch && (current === null || etagOf(current) !== strongEtag(ifMatch))) throw new Conflict("changed");
      const tmp = `${f}.${randomBytes(4).toString("hex")}.tmp`;
      await writeFile(tmp, body, "utf8");
      await rename(tmp, f);
      return { etag: etagOf(body) };
    },
  };
}

export function backend() {
  if (process.env.LOCAL_STORE_DIR) return localBackend(path.resolve(ROOT, process.env.LOCAL_STORE_DIR));
  if (process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN) return blobBackend();
  return null;
}

export function storageInfo() {
  const b = backend();
  return { writable: !!b, kind: b ? b.kind : null };
}

export function requireBackend() {
  const b = backend();
  if (!b) throw new HttpError(503, "Storage is not connected, so changes cannot be saved. In Vercel, create a Blob store with Private access, connect it to the project and redeploy.", { storage: false });
  return b;
}

/* Storage errors other than conflicts become a readable 502. */
export async function storage(fn) {
  try { return await fn(); }
  catch (e) {
    if (e instanceof Conflict || e instanceof HttpError) throw e;
    console.error(e);
    throw new HttpError(502, "Vercel Blob storage returned an error: " + (e && e.message ? e.message : e) + ". Check that the store has Private access and is connected to this project.");
  }
}

/* ---------------- layer 1: data/ in the repository ---------------- */
/* data/ is bundled into lib/seed-data.js at build time (scripts/build-seed.mjs), so the
   functions never depend on reading files from disk. */
const seedEpisodes = new Map(); // num -> {text, etag}

function seed() {
  const episodes = SEED.episodes || {};
  if (!Object.keys(episodes).length && !Object.keys(SEED.topics || {}).length)
    throw new HttpError(500, "The build contains no data from the data/ folder. Check that data/ sits next to vercel.json in the repository and redeploy.");
  return { topics: SEED.topics || {}, speakers: SEED.speakers || {}, known: SEED.known || [], episodes: new Map(Object.keys(episodes).map(n => [Number(n), episodes[n]])) };
}

async function seedEpisode(num) {
  if (seedEpisodes.has(num)) return seedEpisodes.get(num);
  const ep = seed().episodes.get(num);
  if (!ep) return null;
  const text = JSON.stringify(ep);
  const entry = { text, etag: `"seed-${hash(text)}"` };
  seedEpisodes.set(num, entry);
  return entry;
}

/* ---------------- layer 2: meta.json ---------------- */
async function readMeta(b, fresh) {
  if (!b) return null;
  const r = await storage(() => b.read(META_KEY, { fresh }));
  if (!r || r.notModified) return null;
  return { meta: JSON.parse(r.text), etag: r.etag };
}

async function updateMeta(b, mutate) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await readMeta(b, true);
    const base = current ? current.meta : { v: 1, topics: {}, speakers: {}, known: [], stored: [] };
    const next = mutate(JSON.parse(JSON.stringify(base)));
    if (next === null) return;
    next.v = 1;
    next.updatedAt = new Date().toISOString();
    try {
      await storage(() => b.write(META_KEY, JSON.stringify(next), current ? { ifMatch: current.etag } : { create: true }));
      return;
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
      await sleep(80 * (attempt + 1));
    }
  }
  throw new HttpError(409, "This data is being changed in another tab. Try again in a few seconds.");
}

/* ---------------- public API ---------------- */
/* Topics, speakers, known words and the episode list, with layer 2 applied on top of layer 1. */
export async function catalog({ fresh = false } = {}) {
  const b = backend();
  const s = seed();
  const m = await readMeta(b, fresh);
  const meta = (m && m.meta) || {};
  const stored = [...new Set(meta.stored || [])].sort((x, y) => x - y);
  return {
    topics: { ...s.topics, ...(meta.topics || {}) },
    speakers: { ...s.speakers, ...(meta.speakers || {}) },
    known: [...new Set([...s.known, ...(meta.known || [])])].sort(),
    episodes: [...new Set([...s.episodes.keys(), ...stored])].sort((x, y) => x - y),
    stored,
    updatedAt: meta.updatedAt || null,
  };
}

/* src: "seed" skips the store (the client knows the episode was never edited), anything else tries the store first. */
export async function readEpisode(num, { fresh = false, src = "auto", ifNoneMatch } = {}) {
  const b = backend();
  if (b && src !== "seed") {
    const r = await storage(() => b.read(episodeKey(num), { fresh, ifNoneMatch }));
    if (r) return r;
  }
  const s = await seedEpisode(num);
  if (!s) return null;
  if (ifNoneMatch && strongEtag(ifNoneMatch) === s.etag) return { notModified: true, etag: s.etag };
  return s;
}

/* Saves an episode. Without force, baseEtag must match the version the editor started from. */
export async function writeEpisode(num, episode, { baseEtag, force = false, stored } = {}) {
  const b = requireBackend();
  const body = JSON.stringify(episode);
  const isStored = (stored || (await catalog({ fresh: true })).stored).includes(num);
  const base = strongEtag(baseEtag);
  if (isStored) {
    if (!force && (!base || base.startsWith('"seed-'))) throw new Conflict("stale");
    const { etag } = await storage(() => b.write(episodeKey(num), body, force ? {} : { ifMatch: base }));
    return { etag };
  }
  if (!force) {
    const s = await seedEpisode(num);
    if (!s) throw new HttpError(404, `Эпизода ${num} нет.`);
    if (base !== s.etag) throw new Conflict("stale");
  }
  const { etag } = await storage(() => b.write(episodeKey(num), body, {}));
  await updateMeta(b, meta => {
    const list = new Set(meta.stored || []);
    if (list.has(num)) return null;
    list.add(num);
    meta.stored = [...list].sort((x, y) => x - y);
    return meta;
  });
  return { etag };
}

export async function upsertTopic(id, topic) {
  const b = requireBackend();
  await updateMeta(b, meta => { meta.topics = { ...(meta.topics || {}), [id]: topic }; return meta; });
}

/* Import: topics and speakers from the file replace ones with the same key, known words are added. */
export async function mergeCatalog({ topics = {}, speakers = {}, known = [] }) {
  const b = requireBackend();
  const s = seed();
  await updateMeta(b, meta => {
    let changed = false;
    const effTopics = { ...s.topics, ...(meta.topics || {}) };
    for (const [k, v] of Object.entries(topics)) {
      if (canonical(effTopics[k]) !== canonical(v)) { meta.topics = { ...(meta.topics || {}), [k]: v }; changed = true; }
    }
    const effSpeakers = { ...s.speakers, ...(meta.speakers || {}) };
    for (const [k, v] of Object.entries(speakers)) {
      if (canonical(effSpeakers[k]) !== canonical(v)) { meta.speakers = { ...(meta.speakers || {}), [k]: v }; changed = true; }
    }
    const effKnown = new Set([...s.known, ...(meta.known || [])]);
    const add = [...new Set(known.filter(w => typeof w === "string" && w && !effKnown.has(w)))];
    if (add.length) { meta.known = [...(meta.known || []), ...add]; changed = true; }
    return changed ? meta : null;
  });
}

export function standaloneTemplate() {
  return SEED.template;
}

/* ---------------- generic JSON documents (accounts, per-user state) ---------------- */
export async function readDoc(key, { fresh = false } = {}) {
  const b = backend();
  if (!b) return null;
  const r = await storage(() => b.read(key, { fresh }));
  if (!r || r.notModified) return null;
  return { data: JSON.parse(r.text), etag: r.etag };
}

/* Read-modify-write with optimistic concurrency. mutate(copy) returns the new document,
   or null to leave it unchanged; it may throw an HttpError to reject the change. */
export async function updateDoc(key, fallback, mutate) {
  const b = requireBackend();
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await readDoc(key, { fresh: true });
    const base = current ? current.data : JSON.parse(JSON.stringify(fallback));
    const next = await mutate(JSON.parse(JSON.stringify(base)));
    if (next === null) return base;
    try {
      await storage(() => b.write(key, JSON.stringify(next), current ? { ifMatch: current.etag } : { create: true }));
      return next;
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
      await sleep(60 * (attempt + 1));
    }
  }
  throw new HttpError(409, "This data is being changed in another tab. Try again in a few seconds.");
}

/* ---------------- English episodes: content/en/*.html bundled as seed, edits in the store ---------------- */
const englishKey = id => `english/${id}.json`;
const englishSeeds = new Map();

function englishSeed(id) {
  if (englishSeeds.has(id)) return englishSeeds.get(id);
  const doc = (SEED.english || {})[id];
  if (!doc) return null;
  const text = JSON.stringify(doc);
  const entry = { text, etag: `"seed-${hash(text)}"` };
  englishSeeds.set(id, entry);
  return entry;
}

export function englishList() {
  return Object.entries(SEED.english || {}).map(([id, doc]) => ({ id, ...(doc.info || {}), words: Object.keys(doc.vocab || {}).length, lines: (doc.lines || []).length }));
}

export async function readEnglish(id, { fresh = false, ifNoneMatch } = {}) {
  const b = backend();
  if (b) {
    const r = await storage(() => b.read(englishKey(id), { fresh, ifNoneMatch }));
    if (r) return r;
  }
  const s = englishSeed(id);
  if (!s) return null;
  if (ifNoneMatch && strongEtag(ifNoneMatch) === s.etag) return { notModified: true, etag: s.etag };
  return s;
}

export async function writeEnglish(id, doc, { baseEtag, force = false } = {}) {
  const b = requireBackend();
  const body = JSON.stringify(doc);
  const base = strongEtag(baseEtag);
  const current = await storage(() => b.read(englishKey(id), { fresh: true }));
  if (current) {
    if (!force && base !== strongEtag(current.etag)) throw new Conflict("stale");
    return { etag: (await storage(() => b.write(englishKey(id), body, { ifMatch: current.etag }))).etag };
  }
  const s = englishSeed(id);
  if (!s && !force) throw new HttpError(404, "This episode does not exist.");
  if (s && !force && base !== s.etag) throw new Conflict("stale");
  return { etag: (await storage(() => b.write(englishKey(id), body, { create: true }))).etag };
}
