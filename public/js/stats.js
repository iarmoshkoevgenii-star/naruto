/* Study statistics, shared by the browser and the server. Days are local calendar days, "YYYY-MM-DD". */
export const SKIP_EVERY = 7; // a free skip is available again 7 days after it was used

const pad = n => String(n).padStart(2, "0");
export const dayOf = (d = new Date()) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
export function addDays(day, n) {
  const t = new Date(day + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
export const weekday = day => (new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7; // Monday = 0

/* How much happened on a day: practice answers and marks count once each, a class counts as ten. */
export const dayScore = a => a ? (a.practice || 0) + (a.study || 0) + (a.class || 0) * 10 : 0;
export const level = score => score <= 0 ? 0 : score < 10 ? 1 : score < 25 ? 2 : score < 50 ? 3 : 4;

/* Walks from the first study day to today. A missed day is covered by the free skip when the
   streak is running and the skip is ready; today never breaks the streak while it is still going. */
export function streakInfo(activity, today = dayOf()) {
  const active = new Set(Object.keys(activity || {}).filter(d => dayScore(activity[d]) > 0 && d <= today));
  const sorted = [...active].sort();
  const skipped = new Set();
  let current = 0, best = 0, skipReady = null;
  if (sorted.length) {
    for (let d = sorted[0]; d <= today; d = addDays(d, 1)) {
      if (active.has(d)) current++;
      else if (d === today) { /* the day is not over yet */ }
      else if (current > 0 && (skipReady === null || d >= skipReady)) { skipped.add(d); skipReady = addDays(d, SKIP_EVERY); }
      else current = 0;
      best = Math.max(best, current);
    }
  }
  const skipAvailable = skipReady === null || today >= skipReady;
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    week.push({ day: d, state: active.has(d) ? "studied" : skipped.has(d) ? "skipped" : d === today ? "today" : "missed" });
  }
  return {
    current, best, totalDays: active.size, first: sorted[0] || null,
    studiedToday: active.has(today), skipAvailable, skipReadyOn: skipAvailable ? null : skipReady, skipped, week,
  };
}

/* 53 columns of weeks (Monday first) ending with the current week. */
export function heatmapWeeks(activity, today = dayOf()) {
  const end = addDays(today, 6 - weekday(today));
  const start = addDays(end, -53 * 7 + 1);
  const weeks = [];
  for (let w = 0; w < 53; w++) {
    const col = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(start, w * 7 + i);
      const a = (activity || {})[day];
      col.push({ day, future: day > today, score: dayScore(a), level: day > today ? -1 : level(dayScore(a)), a: a || null });
    }
    weeks.push(col);
  }
  return weeks;
}

export const MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365];
export const nextMilestone = n => MILESTONES.find(m => m > n) || null;
