// The pet's calendar, kept in the household diary so every device shares it: an "event" entry holds
// { date: "YYYY-MM-DD", repeat: none|weekly|monthly|6weeks|yearly } in extra, and an "event-cancel" entry
// (extra.of = the event's id) removes it. Used by the web app, the glasses and the Ask agent.
//
//   FSCal.events(entries)                 -> the events still on the calendar
//   FSCal.on(ev, "2026-11-06")            -> does ev fall on that day?
//   FSCal.upcoming(entries, days, from?)  -> [{ date, title, id, repeat, note }] soonest first
(function (root) {
  const pad = (n) => String(n).padStart(2, "0");
  const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const day = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d, 12); };
  const REPEATS = { none: "Once", weekly: "Every week", "6weeks": "Every 6 weeks", monthly: "Every month", yearly: "Every year" };

  function events(entries) {
    const gone = new Set(entries.filter((e) => e.kind === "event-cancel" && e.extra).map((e) => e.extra.of));
    return entries.filter((e) => e.kind === "event" && e.extra && e.extra.date && !gone.has(e.id));
  }

  function on(ev, date) {
    const start = day(ev.extra.date), d = day(date), r = ev.extra.repeat || "none";
    if (d < start) return false;
    const days = Math.round((d - start) / 864e5);
    if (r === "none") return days === 0;
    if (r === "weekly") return days % 7 === 0;
    if (r === "6weeks") return days % 42 === 0;
    if (r === "monthly") return d.getDate() === start.getDate();
    if (r === "yearly") return d.getDate() === start.getDate() && d.getMonth() === start.getMonth();
    return false;
  }

  function upcoming(entries, days = 30, from = new Date()) {
    const evs = events(entries), out = [];
    for (let i = 0; i < days && out.length < 40; i++) {
      const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, 12), k = key(d);
      for (const ev of evs) if (on(ev, k)) out.push({ date: k, title: ev.title, id: ev.id, repeat: ev.extra.repeat || "none", note: ev.note || "" });
    }
    return out;
  }

  const api = { events, on, upcoming, key, day, REPEATS };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FSCal = api;
})(typeof window !== "undefined" ? window : globalThis);
