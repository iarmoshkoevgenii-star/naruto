import { authConfig } from "./auth.js";

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

const BASE_HEADERS = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin" };

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...BASE_HEADERS, ...headers },
  });
}

export function text(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { ...BASE_HEADERS, ...headers } });
}

/* Wraps a handler: known errors become JSON responses, unknown ones are logged and hidden. */
export async function run(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status);
    console.error(e);
    return json({ error: "Server error. Details are in the function logs on Vercel." }, 500);
  }
}

export function config() {
  const c = authConfig();
  if (c.error) throw new HttpError(500, c.error, { setup: true });
  return c.config;
}

/* Writes must come from the site's own pages: a custom header (forces a CORS preflight for
   cross-site requests, which this API never approves) plus an Origin check when present. */
export function guardWrite(request) {
  if (request.headers.get("x-requested-with") !== "naruto-study") throw new HttpError(403, "Request rejected.");
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
    let originHost = "";
    try { originHost = new URL(origin).host; } catch { /* malformed */ }
    if (originHost !== host) throw new HttpError(403, "Requests from other sites are rejected.");
  }
}

export async function readBody(request, limitBytes) {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > limitBytes) throw new HttpError(413, "The request is too large.");
  try { return JSON.parse(raw || "null"); } catch { throw new HttpError(400, "The request is not valid JSON."); }
}

export const isSecure = request =>
  new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";

export function param(request, name) {
  return new URL(request.url).searchParams.get(name);
}

export function episodeNum(request) {
  const n = Number(param(request, "num"));
  if (!Number.isInteger(n) || n < 1 || n > 9999) throw new HttpError(400, "An episode number is required: ?num=…");
  return n;
}

/* ETags may come back weakened (W/"…") after compression; compare and forward the strong form. */
export const strongEtag = e => String(e || "").replace(/^W\//, "").trim();
