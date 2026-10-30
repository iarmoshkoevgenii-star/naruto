/* The top bar on every page: brand, five tabs, notifications and the account. */
import { api, esc } from "./api.js";

const I = {
  grammar: '<path d="M5 4.5h9.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h9.5M9 8.5h5M9 11h3.5"/>',
  vocabulary: '<rect x="3.5" y="5" width="17" height="12" rx="2"/><path d="m10 9 4.5 2.5L10 14z"/><path d="M8 20h8"/>',
  homework: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6v2.5H9zM8.5 12l2 2 4-4.5"/>',
  training: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  cabinet: '<circle cx="12" cy="8.5" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
};
const icon = name => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + I[name] + "</svg>";

export const TABS = [
  { id: "grammar", label: "Grammar", short: "Grammar", href: "/grammar" },
  { id: "vocabulary", label: "Vocabulary", short: "Vocabulary", href: "/vocabulary" },
  { id: "homework", label: "Homework", short: "Homework", href: "/homework" },
  { id: "training", label: "Training", short: "Training", href: "/training" },
  { id: "cabinet", label: "Personal cabinet", short: "Cabinet", href: "/" },
];

export const initials = name => String(name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
export const avatarHtml = (me, cls = "") => me && me.photo
  ? '<img class="avatar ' + cls + '" src="' + esc(me.photo) + '" alt="">'
  : '<span class="avatar ' + cls + '" aria-hidden="true">' + esc(initials(me && me.name)) + "</span>";

export function shellHtml(me, active) {
  const teacher = me.role === "teacher";
  const unread = (me.notifications || []).filter(n => !n.read).length;
  const tabs = TABS.map(t => {
    const label = t.id === "cabinet" && teacher ? "Teacher cabinet" : t.label;
    return '<a class="sh-tab" href="' + t.href + '" data-nav' + (t.id === active ? ' aria-current="page"' : "") + ">" + icon(t.id) +
      '<span class="sh-long">' + esc(label) + '</span><span class="sh-short">' + esc(t.id === "cabinet" && teacher ? "Teacher" : t.short) + "</span></a>";
  }).join("");
  return '<header class="sh"><div class="sh-top"><a class="sh-brand" href="/" data-nav>Natalia’s Language School</a>' +
    (teacher ? '<span class="sh-mode">Teacher mode</span>' : "") + '<span class="sh-grow"></span>' +
    (teacher ? "" : '<a class="sh-bell" href="/#notifications" data-nav aria-label="Notifications' + (unread ? ", " + unread + " unread" : "") + '">' + icon("bell") + (unread ? '<span class="sh-count">' + unread + "</span>" : "") + "</a>") +
    '<span class="sh-user">' + avatarHtml(me, "sh-av") + '<span class="sh-name">' + esc(me.name) + '</span><button type="button" class="sh-out" data-signout>Sign out</button></span></div>' +
    '<nav class="sh-tabs" aria-label="Sections">' + tabs + "</nav></header>";
}

export function mountShell(el, me, active) {
  el.innerHTML = shellHtml(me, active);
  el.querySelector("[data-signout]").addEventListener("click", async () => {
    try { await api("POST", "/api/auth?action=logout", {}); } catch { /* ignore */ }
    location.href = "/";
  });
}
