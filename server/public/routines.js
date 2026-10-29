// Routines: grooming and health checks that come round a set time after you last did them (brush his coat
// weekly, nails every 6 weeks). Kept in the household diary so every device shares them: a "routine" entry
// defines one (extra { every: days, tip }), "routine-cancel" (extra.of) removes it, and "routine-done"
// (extra.of) ticks it off. Used by the web app, the glasses and the Ask agent.
//
//   FSRoutine.list(entries, now?) -> [{ id, title, every, tip, last, due: "YYYY-MM-DD", days }]  days < 0 = overdue
//   FSRoutine.SUGGEST                -> starter routines for a rabbit
(function (root) {
  const pad = (n) => String(n).padStart(2, "0");
  const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const midday = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime(); };
  const SUGGEST = [
    { title: "Brush his coat", every: 7, tip: "Daily while he's moulting: swallowed fur can block his gut." },
    { title: "Trim his nails", every: 42, tip: "Just the tips, clear of the pink quick." },
    { title: "Check and clean his bottom", every: 7, tip: "Daily in warm weather: a dirty bottom invites flystrike." },
    { title: "Check his teeth", every: 30, tip: "Front teeth even and not too long; drooling or dropping food means a vet visit." },
    { title: "Deep clean the pen", every: 7, tip: "Fresh litter, wash the bowls and tray." },
  ];

  function list(entries, now = new Date()) {
    const gone = new Set(entries.filter((e) => e.kind === "routine-cancel" && e.extra).map((e) => e.extra.of));
    const defs = entries.filter((e) => e.kind === "routine" && e.extra && e.extra.every && !gone.has(e.id));
    const today = midday(now);
    return defs.map((r) => {
      const done = entries.filter((e) => e.kind === "routine-done" && e.extra && e.extra.of === r.id).map((e) => e.at);
      const last = done.length ? Math.max(...done) : null;
      // never done: due the day it was added
      const due = last ? midday(last) + r.extra.every * 864e5 : midday(r.at);
      return { id: r.id, title: r.title, every: r.extra.every, tip: r.extra.tip || "", last, due: key(new Date(due)), days: Math.round((due - today) / 864e5) };
    }).sort((a, b) => a.days - b.days);
  }

  // "due today", "3 days overdue", "in 4 days"
  const when = (r) => r.days < 0 ? `${-r.days} day${r.days === -1 ? "" : "s"} overdue` : r.days === 0 ? "due today" : r.days === 1 ? "due tomorrow" : `in ${r.days} days`;
  const every = (n) => n === 1 ? "every day" : n === 7 ? "every week" : n % 7 === 0 ? `every ${n / 7} weeks` : n === 30 ? "every month" : `every ${n} days`;

  const api = { list, when, every, SUGGEST, key };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FSRoutine = api;
})(typeof window !== "undefined" ? window : globalThis);
