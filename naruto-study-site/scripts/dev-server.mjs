/* Local preview without the Vercel CLI: serves public/ and runs api/*.js the way Vercel does.
   Usage: npm run dev   (reads .env.local; edits go to LOCAL_STORE_DIR, default .local-store) */
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

async function loadEnv(file) {
  let text;
  try { text = await readFile(file, "utf8"); } catch { return; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}
await loadEnv(".env.local");
await loadEnv(".env");
// No storage configured: keep edits in ./.local-store. An explicitly empty LOCAL_STORE_DIR means
// "no storage at all", which is how the site behaves on Vercel before a Blob store is connected.
if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN && process.env.LOCAL_STORE_DIR === undefined) process.env.LOCAL_STORE_DIR = ".local-store";

const PORT = Number(process.env.PORT || 3000);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const vercel = JSON.parse(await readFile("vercel.json", "utf8"));
const globalHeaders = (vercel.headers || []).find(h => h.source === "/(.*)")?.headers || [];
const PUBLIC = path.join(ROOT, "public");

const notFound = res => { res.statusCode = 404; res.end("Not found"); };

async function handleApi(req, res, url) {
  const name = url.pathname.slice("/api/".length).replace(/\/$/, "");
  if (!/^[a-z]+$/.test(name)) return notFound(res);
  let mod;
  try { mod = await import(pathToFileURL(path.join(ROOT, "api", name + ".js")).href); }
  catch (e) { if (e.code === "ERR_MODULE_NOT_FOUND") return notFound(res); throw e; }
  const handler = mod[req.method];
  if (typeof handler !== "function") { res.statusCode = 405; return res.end("Method not allowed"); }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v != null && !["connection", "keep-alive", "transfer-encoding"].includes(k)) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
  const request = new Request(url, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
  const response = await handler(request);
  res.statusCode = response.status;
  response.headers.forEach((v, k) => { if (k !== "set-cookie") res.setHeader(k, v); });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader("Set-Cookie", cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(PUBLIC, path.normalize(rel));
  if (!file.startsWith(PUBLIC + path.sep)) return notFound(res);
  try {
    const data = await readFile(file);
    res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    res.end(data);
  } catch { notFound(res); }
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    for (const h of globalHeaders) res.setHeader(h.key, h.value);
    if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
    else await serveStatic(res, url.pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.statusCode = 500;
    res.end("Internal error");
  }
}).listen(PORT, () => {
  console.log(`Naruto study site: http://localhost:${PORT}`);
  console.log(process.env.LOCAL_STORE_DIR ? `Edits are stored in ${path.resolve(ROOT, process.env.LOCAL_STORE_DIR)}` : process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN ? "Edits are stored in Vercel Blob" : "No storage: the site is read-only");
});
