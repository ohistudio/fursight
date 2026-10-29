// What he did with his day, from the pet cam. The cam page notices movement for free and asks the AI once each
// time he settles; it logs "pose" entries (extra { pose, mins, from, to }) when he gets up again, "active"
// entries (extra { mins }) for time on the move, and "moment" entries (a photo of a flop or a big stretch).
// Earlier days can also come as one "pose-day" entry (extra { date, loaf, stretched, ..., active, flops }).
// The cams only see so much: "seen" is the time they actually watched him, and "unseen" is the rest of the day
// (out of view, another room, the cam off, the night). Nothing is guessed for the unseen time.
// The pet cam also logs how long it ran ("camtime", extra { mins }, every half hour; a "pose-day" can carry cam),
// so "not seen" splits into out of view (a cam was on, he wasn't in it) and no cam on. Without camtime it stays
// one "not seen" figure.
// The owner can add what the cams missed as "log" entries (extra { what: treat|greens|flop|loaf|zoomies|droppings|note,
// item?, amount? }): their flops count, marked as theirs, and their treats are listed.
// Shared by the web app, the glasses and the Ask agent.
//
//   FSActivity.summary(entries, now?) -> { today: { loaf: mins, ..., active, flops, flopsYou, seen, unseen }, week: {...},
//                                          treats: { today: [{ item, amount, at }], week }, logs: { today, week }, moment, simulated, has }
//   FSActivity.days(entries, n?)     -> per day, oldest first (for charts)
//   FSActivity.time(mins)             -> "30 min", "3 h 10"
(function (root) {
  const POSES = ["loaf", "stretched", "flop", "sitting", "eating", "grooming"];
  const WORD = { loaf: "Loafing", stretched: "Stretched out", flop: "Flopped", sitting: "Sitting", eating: "Eating", grooming: "Grooming", chewing: "Chewing", active: "On the move" };
  const empty = () => Object.fromEntries([...POSES, "active", "flops"].map((k) => [k, 0]));
  const seenOf = (d) => [...POSES, "active"].reduce((t, k) => t + (Number(d[k]) || 0), 0);
  const TREATS = ["treat", "greens"];

  function summary(entries, now = new Date()) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), weekStart = start - 6 * 864e5;
    const today = empty(), week = empty();
    let has = false, simulated = false, camToday = 0, camWeek = 0, camKnown = false;
    for (const e of entries) {
      if (e.kind === "camtime" && e.extra && e.at >= weekStart) {
        const m = Number(e.extra.mins) || 0; camKnown = true; camWeek += m; if (e.at >= start) camToday += m;
        continue;
      }
      if (e.kind === "pose-day" && e.extra && e.at >= weekStart) {
        has = true; if (e.extra.sim) simulated = true;
        if (Number.isFinite(Number(e.extra.cam))) { camKnown = true; camWeek += Number(e.extra.cam); }
        for (const k of Object.keys(week)) week[k] += Number(e.extra[k]) || 0;
        continue;
      }
      if ((e.kind !== "pose" && e.kind !== "active") || !e.extra || e.at < weekStart) continue;
      has = true; if (e.extra.sim) simulated = true;
      const k = e.kind === "active" ? "active" : e.extra.pose, m = Number(e.extra.mins) || 0;
      if (!(k in week)) continue;
      for (const t of e.at >= start ? [today, week] : [week]) { t[k] += m; if (k === "flop") t.flops++; }
    }
    // what the cams saw, against the day so far (today) or whole days (the week, including days with nothing seen)
    const elapsed = Math.max(0, (now - start) / 6e4);
    today.seen = seenOf(today); today.unseen = Math.max(0, elapsed - today.seen);
    week.seen = seenOf(week); week.unseen = Math.max(0, 6 * 1440 + elapsed - week.seen);
    // with the cam's own running time: out of view (cam on, him not in it) and no cam on
    if (camKnown) for (const [t, cam, total] of [[today, camToday, elapsed], [week, camWeek, 6 * 1440 + elapsed]]) {
      const on = Math.max(cam, t.seen);
      t.camOn = on; t.outOfView = Math.max(0, on - t.seen); t.noCam = Math.max(0, total - on);
    }
    // what the owner added
    today.flopsYou = 0; week.flopsYou = 0;
    const treats = { today: [], week: 0 }, logs = { today: 0, week: 0 };
    for (const e of entries) {
      if (e.kind !== "log" || !e.extra || e.at < weekStart) continue;
      const t = e.at >= start;
      logs.week++; if (t) logs.today++;
      if (e.extra.what === "flop") { week.flops++; week.flopsYou++; if (t) { today.flops++; today.flopsYou++; } }
      if (TREATS.includes(e.extra.what)) { treats.week++; if (t) treats.today.push({ item: e.extra.item || e.title, amount: e.extra.amount || "", at: e.at }); }
    }
    const moment = entries.find((e) => e.kind === "moment" && e.at >= weekStart) || null;
    return { today, week, treats, logs, moment, simulated, has: has || logs.week > 0 };
  }

  // the last n days, oldest first: [{ date, loaf, stretched, flop, flops, active, eating, grooming, sitting }]
  function days(entries, n = 7, now = new Date()) {
    const pad = (x) => String(x).padStart(2, "0"), key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const out = new Map();
    for (let i = n - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i); out.set(key(d), { date: key(d), ...empty() }); }
    for (const e of entries) {
      if (!e.extra) continue;
      if (e.kind === "pose-day") { const d = out.get(e.extra.date); if (d) for (const k of Object.keys(empty())) d[k] += Number(e.extra[k]) || 0; continue; }
      if (e.kind !== "pose" && e.kind !== "active") continue;
      const d = out.get(key(new Date(e.at))), k = e.kind === "active" ? "active" : e.extra.pose;
      if (!d || !(k in d)) continue;
      d[k] += Number(e.extra.mins) || 0; if (k === "flop") d.flops++;
    }
    const today = key(now), elapsed = (now - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 6e4;
    for (const d of out.values()) { d.seen = seenOf(d); d.unseen = Math.max(0, (d.date === today ? elapsed : 1440) - d.seen); }
    return [...out.values()];
  }

  const time = (m) => { m = Math.round(m); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? " " + String(m % 60).padStart(2, "0") : ""}`; };

  // what the owner can add by hand, and how it reads
  const LOG = { treat: "Gave a treat", greens: "Gave greens", flop: "Saw a flop", loaf: "Saw a loaf", zoomies: "Saw zoomies", droppings: "Droppings look normal", note: "Note" };

  const AMOUNT = { tiny: "a tiny bit", small: "a small piece", handful: "a handful" };
  // is a treat on his never list? "onion" matches "Onion, garlic, chives and leeks"
  function never(item, list) {
    const words = (x) => String(x).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2).map((w) => w.replace(/e?s$/, ""));
    const got = words(item);
    return (list || []).find((n) => n.split(/,| and /).some((part) => { const w = words(part); return w.length && w.every((x) => got.includes(x)); })) || null;
  }
  // the diary entry for something the owner adds
  function entry(pet, what, item = "", amount = "") {
    if (!LOG[what]) return null;
    const food = what === "treat" || what === "greens", it = String(item).trim().slice(0, 60);
    if ((food || what === "note") && !it) return null;
    const bad = food ? never(it, pet.care && pet.care.never) : null;
    const title = food ? `${it[0].toUpperCase() + it.slice(1)}${AMOUNT[amount] ? ` (${AMOUNT[amount]})` : ""}` : what === "note" ? it : LOG[what];
    return { kind: "log", title, pet: pet.name, ...(bad ? { verdict: "toxic", note: `On ${pet.name}'s never list: ${bad}. If he ate some, ask FurSight or call a vet.` } : {}), extra: { what, ...(food ? { item: it, amount } : {}), manual: true } };
  }

  const api = { summary, days, time, never, entry, POSES, WORD, LOG, AMOUNT };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FSActivity = api;
})(typeof window !== "undefined" ? window : globalThis);
