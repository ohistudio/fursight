// The room by his tray: temperature and humidity from the FurSight Tray's sensor. The Tray logs a "climate"
// entry (extra { t, h }) when the temperature moves or once an hour, and earlier days can come as "climate-day"
// (extra { date, min, max, avg }). Rabbits handle heat badly: 25°C and up is worth watching, 28°C and up is
// dangerous; they cope with cold better, but under 5°C is worth watching too.
// Shared by the web app, the glasses, the iPhone (through the server) and the Ask agent.
//
//   FSClimate.summary(entries, now?) -> { now: { t, h, at } | null, today: { min, max }, days: [{ date, min, max }], status, reasons, simulated }
(function (root) {
  const pad = (n) => String(n).padStart(2, "0");
  const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  function summary(entries, now = new Date()) {
    const readings = entries.filter((e) => e.kind === "climate" && e.extra && Number.isFinite(e.extra.t)).sort((a, b) => b.at - a.at);
    const days = new Map();
    for (let i = 6; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i); days.set(key(d), { date: key(d), min: null, max: null }); }
    const widen = (d, lo, hi) => { if (!d) return; d.min = d.min === null ? lo : Math.min(d.min, lo); d.max = d.max === null ? hi : Math.max(d.max, hi); };
    for (const e of entries) if (e.kind === "climate-day" && e.extra) widen(days.get(e.extra.date), e.extra.min, e.extra.max);
    for (const r of readings) widen(days.get(key(new Date(r.at))), r.extra.t, r.extra.t);
    const latest = readings[0], fresh = latest && now - latest.at < 3 * 36e5;
    const today = days.get(key(now));
    let status = latest ? "normal" : "none";
    const reasons = [];
    if (fresh) {
      const t = latest.extra.t;
      if (t >= 28) { status = "vet"; reasons.push(`It's ${t.toFixed(1)}°C by his tray: dangerous heat for a rabbit. Cool him down now.`); }
      else if (t >= 25) { status = "watch"; reasons.push(`It's ${t.toFixed(1)}°C by his tray: warm for a rabbit.`); }
      else if (t < 5) { status = "watch"; reasons.push(`It's ${t.toFixed(1)}°C by his tray: cold. Make sure he has a snug, dry bed.`); }
    }
    return {
      now: latest ? { t: latest.extra.t, h: latest.extra.h, at: latest.at } : null,
      today: { min: today.min, max: today.max }, days: [...days.values()], status, reasons,
      simulated: entries.some((e) => (e.kind === "climate" || e.kind === "climate-day") && e.extra && e.extra.sim),
    };
  }

  // what to do in the heat, plain and practical
  const HEAT_TIPS = ["A frozen water bottle wrapped in a towel to lean on", "Ceramic or stone tiles to lie on", "Move him out of the sun, curtains closed", "Fresh cool water, and wet greens", "A fan near him, not on him"];

  const api = { summary, HEAT_TIPS };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FSClimate = api;
})(typeof window !== "undefined" ? window : globalThis);
