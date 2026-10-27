// FurSight Tray: the litter tray with a scale (and a camera looking down). Each time he hops in, the Tray
// logs a "tray" diary entry with extra { weight_g, secs, output_g }; earlier days are "tray-day" summaries
// with extra { date, visits, output_g, weight_g }. This turns them into today against his usual, and a status.
// Shared by the web app, the glasses and the Ask agent.
//
//   FSTray.summary(entries, now?) -> { today, usual, week, status: normal|watch|vet|none, reasons, simulated }
(function (root) {
  const pad = (n) => String(n).padStart(2, "0");
  const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const isTray = (e) => e.kind === "tray" || e.kind === "tray-day";

  function summary(entries, now = new Date()) {
    // the simulator can replay today: its latest "tray-reset" hides that day's earlier visits, except the
    // replayed ones it wrote (extra.replay = the reset's id)
    const reset = entries.filter((e) => e.kind === "tray-reset" && e.extra).sort((x, y) => y.at - x.at)[0];
    const hidden = (e) => reset && e.at >= reset.extra.from && e.at <= reset.at && e.extra.replay !== reset.id;
    const visits = entries.filter((e) => e.kind === "tray" && e.extra && e.extra.weight_g && !hidden(e));
    const days = new Map();
    for (const e of entries.filter((x) => x.kind === "tray-day" && x.extra)) days.set(e.extra.date, { date: e.extra.date, visits: e.extra.visits, output_g: e.extra.output_g, weight_g: e.extra.weight_g });
    // today's (and any other day's) single visits roll up into that day
    for (const v of visits) {
      const k = key(new Date(v.at));
      const d = days.get(k) && !days.get(k).fromVisits ? null : days.get(k) || { date: k, visits: 0, output_g: 0, weights: [], fromVisits: true };
      if (!d) continue;
      d.visits++; d.output_g += v.extra.output_g || 0; d.weights.push(v.extra.weight_g); d.last = Math.max(d.last || 0, v.at);
      days.set(k, d);
    }
    for (const d of days.values()) if (d.weights) d.weight_g = Math.round(d.weights.reduce((a, b) => a + b, 0) / d.weights.length);
    const todayKey = key(now), today = days.get(todayKey) || { date: todayKey, visits: 0, output_g: 0, weight_g: null };
    const past = [...days.values()].filter((d) => d.date < todayKey).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 7);
    if (!past.length && !today.visits) return { today, usual: null, week: [], status: "none", reasons: [], simulated: false };

    // "usual by now": his daily usual, scaled to how far through the waking day (7:00 to 23:00) it is
    const hour = now.getHours() + now.getMinutes() / 60, frac = Math.max(0.05, Math.min(1, (hour - 7) / 16));
    const avg = (f) => past.length ? past.reduce((a, d) => a + (d[f] || 0), 0) / past.length : null;
    const usual = past.length ? { visits: Math.round(avg("visits") * frac), output_g: Math.round(avg("output_g") * frac), weight_g: Math.round(avg("weight_g")), visits_day: Math.round(avg("visits")), output_day: Math.round(avg("output_g")) } : null;

    const reasons = [];
    let status = "normal";
    const flag = (s, why) => { reasons.push(why); if (s === "vet" || status === "normal") status = s; };
    const lastAt = today.last || visits.reduce((m, v) => Math.max(m, v.at), 0);
    const quiet = lastAt ? (now - lastAt) / 36e5 : null;
    if (quiet !== null && quiet > 12) flag("vet", `No tray visit in ${Math.round(quiet)} hours`);
    else if (quiet !== null && quiet > 7 && hour > 9) flag("watch", `No tray visit in ${Math.round(quiet)} hours`);
    if (usual && hour > 10 && usual.output_g > 20 && today.output_g < usual.output_g * 0.4) flag("watch", `Output is low today: ${today.output_g} g so far, he's usually at about ${usual.output_g} g by now`);
    if (usual && today.weight_g && usual.weight_g) {
      const drop = (usual.weight_g - today.weight_g) / usual.weight_g;
      if (drop > 0.1) flag("vet", `Weight is down ${Math.round(drop * 100)}% on his usual`);
      else if (drop > 0.05) flag("watch", `Weight is down ${Math.round(drop * 100)}% on his usual`);
    }
    const week = [...past].reverse().concat(today.visits ? [today] : []).map((d) => ({ date: d.date, weight_g: d.weight_g, visits: d.visits, output_g: d.output_g }));
    const simulated = entries.some((e) => isTray(e) && e.extra && e.extra.sim);
    return { today: { date: today.date, visits: today.visits, output_g: today.output_g, weight_g: today.weight_g, last_at: lastAt || null }, usual, week, status, reasons, simulated };
  }

  const api = { summary, isTray, key };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FSTray = api;
})(typeof window !== "undefined" ? window : globalThis);
