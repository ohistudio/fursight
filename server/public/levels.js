// Hay and bowls over the day, from the pet cam's "levels" checks (extra { hay: { level, area }, food, water }).
// The day starts from its first reading, or from a top-up (the hay jumps back up): how much hay is gone since
// then is measured by the pile's size (area) when SAM measured it, else by Spark's estimate. Less hay eaten than
// usual is one of the first signs of gut stasis, so a rack still nearly full by mid-afternoon is worth a look.
// Shared by the web app, the glasses and the Ask agent.
//
//   FSLevels.summary(entries, now?) -> { has, from, at, hay: { left, gone } | null, food, water, readings, status, reasons, simulated }
//     left/gone are percent of the morning's hay; food/water the latest level (0-100) or null if not in view
(function (root) {
  function summary(entries, now = new Date()) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const today = (entries || []).filter((e) => e.kind === "levels" && e.extra && e.at >= start).sort((a, b) => a.at - b.at);
    if (!today.length) return { has: false, status: "none", reasons: [] };
    // hay as one number per reading: the measured area, else the estimate (they're not mixed within a day)
    const useArea = today.filter((e) => e.extra.hay && e.extra.hay.found).every((e) => Number(e.extra.hay.area) > 0);
    const hayOf = (e) => (e.extra.hay && e.extra.hay.found ? (useArea ? Number(e.extra.hay.area) : Number(e.extra.hay.level)) : null);
    // the day's starting point: the first reading, or the latest top-up (the hay jumping back up by a quarter)
    let base = null;
    for (const e of today) {
      const v = hayOf(e);
      if (v === null) continue;
      if (!base || v > base.v * 1.25) base = { v, at: e.at };
    }
    const last = today[today.length - 1], lastHay = [...today].reverse().find((e) => hayOf(e) !== null);
    let hay = null;
    if (base && lastHay) {
      const left = Math.max(0, Math.min(100, Math.round((hayOf(lastHay) / base.v) * 100)));
      hay = { left, gone: 100 - left, since: base.at, at: lastHay.at };
    }
    const latest = (k) => { const e = [...today].reverse().find((x) => x.extra[k] && x.extra[k].found); return e ? { level: e.extra[k].level, at: e.at, note: e.extra[k].note } : null; };
    const food = latest("food"), water = latest("water");
    const reasons = [];
    let status = "normal";
    const hour = now.getHours();
    if (hay && hour >= 15 && hay.since < now - 6 * 36e5 && hay.gone < 15) { status = "watch"; reasons.push(`Hardly any hay gone since ${new Date(hay.since).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Make sure he's eating: less hay is an early sign of gut trouble.`); }
    if (water && water.level < 20) { status = "watch"; reasons.push("His water is nearly gone: top it up."); }
    if (hay && hay.left < 15) reasons.push("The hay is nearly gone: time for more.");
    return { has: true, from: today[0].at, at: last.at, hay, food, water, readings: today.length, status, reasons, simulated: today.some((e) => e.extra.sim) };
  }

  const api = { summary };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FSLevels = api;
})(typeof window !== "undefined" ? window : globalThis);
