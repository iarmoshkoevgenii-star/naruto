/* fetch wrapper shared by the platform pages and the English episode page. */
export class ApiError extends Error {
  constructor(status, message, data) { super(message); this.status = status; this.data = data || null; }
}

export async function api(method, url, body, { keepalive = false } = {}) {
  const init = { method, credentials: "same-origin", keepalive, headers: { "X-Requested-With": "naruto-study" } };
  if (body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, init); }
  catch { throw new ApiError(0, "No connection to the server. Check your internet connection and try again."); }
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || "Error " + res.status, data);
  return { data, res };
}

export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2400);
}

/* Episode pages send signed-out visitors to the login page and back. */
export function toLogin() {
  location.href = "/?next=" + encodeURIComponent(location.pathname + location.search + location.hash);
}
