// What he did with his day, from the pet cam. The cam page notices movement for free and asks the AI once each
// time he settles; it logs "pose" entries (extra { pose, mins, from, to }) when he gets up again, "active"
// entries (extra { mins }) for time on the move, and "moment" entries (a photo of a flop or a big stretch).
// Earlier days can also come as one "pose-day" entry (extra { date, loaf, stretched, ..., active, flops }).
// Shared by the web app, the glasses and the Ask agent.
//
//   FSActivity.summary(entries, now?) -> { today: { loaf: mins, ..., active, flops }, week: {...}, moment, simulated, has }
//   FSActivity.time(mins)             -> "30 min", "3 h 10"
(function (root) {
  const POSES = ["loaf", "stretched", "flop", "sitting", "eating", "grooming"];
  const WORD = { loaf: "Loafing", stretched: "Stretched out", flop: "Flopped", sitting: "Sitting", eating: "Eating", grooming: "Grooming", chewing: "Chewing", active: "On the move" };
  const empty = () => Object.fromEntries([...POSES, "active", "flops"].map((k) => [k, 0]));

  function summary(entries, now = new Date()) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), weekStart = start - 6 * 864e5;
    const today = empty(), week = empty();
    let has = false, simulated = false;
    for (const e of entries) {
      if (e.kind === "pose-day" && e.extra && e.at >= weekStart) {
        has = true; if (e.extra.sim) simulated = true;
        for (const k of Object.keys(week)) week[k] += Number(e.extra[k]) || 0;
        continue;
      }
      if ((e.kind !== "pose" && e.kind !== "active") || !e.extra || e.at < weekStart) continue;
      has = true; if (e.extra.sim) simulated = true;
      const k = e.kind === "active" ? "active" : e.extra.pose, m = Number(e.extra.mins) || 0;
      if (!(k in week)) continue;
      for (const t of e.at >= start ? [today, week] : [week]) { t[k] += m; if (k === "flop") t.flops++; }
    }
    const moment = entries.find((e) => e.kind === "moment" && e.at >= weekStart) || null;
    return { today, week, moment, simulated, has };
  }

  const time = (m) => { m = Math.round(m); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? " " + String(m % 60).padStart(2, "0") : ""}`; };

  const api = { summary, time, POSES, WORD };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FSActivity = api;
})(typeof window !== "undefined" ? window : globalThis);
