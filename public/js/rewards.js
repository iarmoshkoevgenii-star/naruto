/* XP rewards: report an activity to the server and tell the student what it gave. */
import { api, toast } from "./api.js";

export async function reportActivity(kind, ref, extra = {}) {
  try {
    const { data } = await api("POST", "/api/game?action=award", { kind, ref, ...extra });
    showReward(data);
    return data;
  } catch { return null; } // rewards never block studying
}

export function showReward(r) {
  if (!r || !r.awarded) return;
  const up = r.after.level - r.before.level;
  if (up <= 0) { toast("+" + r.awarded + " XP"); return; }
  const coins = r.after.coins - r.before.coins;
  const dlg = document.createElement("dialog");
  dlg.className = "lu-dlg";
  dlg.innerHTML = '<div class="lu-in"><span class="lu-badge">Lv ' + r.after.level + "</span><h2>Level up!</h2><p>+" + r.awarded + " XP" + (coins > 0 ? " and +" + coins + " coins for the shop" : "") + '.</p><div class="lu-acts"><a class="lu-btn" href="/shop">Visit the shop</a><button type="button" class="lu-btn primary" data-close>Great</button></div></div>';
  document.body.appendChild(dlg);
  dlg.addEventListener("close", () => dlg.remove());
  dlg.addEventListener("click", e => { if (e.target === dlg || e.target.closest("[data-close]")) dlg.close(); });
  dlg.showModal();
}
