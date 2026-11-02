// A full week for filming: what His week (/api/wrapped { film: true }) shows when the real week is thin. The
// numbers are made up (marked simulated, so Wrapped's last slide says "includes simulated data"); the pictures
// are his own, from anywhere in the diary (cut-out stickers, moments, food checks), re-dated into this week.
// With no cut-outs of him at all, the demo clip's four cut-outs of Xiaosi stand in ("demo:<file>", which the
// Quest loads from the server's /demo/). Nothing is written to the diary; it's only in this answer.
//
//   filmWeek({ pet, entries, pictures }) -> entries (the real ones plus the made-up week, newest first)
const DEMO_STICKERS = ["xiaosi-sticker.png", "xiaosi-sticker-2.png", "xiaosi-sticker-3.png", "xiaosi-sticker-4.png"].map((f) => "demo:" + f);
const pad = (n) => String(n).padStart(2, "0");
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function filmWeek({ pet, entries, pictures = [] }) {
  let seed = 11;
  const rnd = (a, b) => { seed = (seed * 16807) % 2147483647; return a + ((seed - 1) / 2147483646) * (b - a); };
  const int = (a, b) => Math.round(rnd(a, b));
  const now = new Date(), midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const at = (d, h) => Math.min(Date.now() - 6e4, midnight - d * 864e5 + h * 36e5);
  const sim = (e) => ({ ...e, id: e.id || `film-${e.kind}-${e.at}`, extra: { ...(e.extra || {}), sim: true } });
  const out = [];
  const nicks = String(pet.nicknames || "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const nk = (i) => (nicks.length ? nicks[i % nicks.length] : pet.name);

  // his pictures from the whole diary
  const all = pictures.concat(entries).filter((e, i, l) => e.has_image && e.kind !== "recap" && l.findIndex((x) => x.id === e.id) === i);
  let cutouts = all.filter((e) => e.png || (e.extra && e.extra.sticker));
  const foods = all.filter((e) => e.kind === "food").filter((e, i, l) => l.findIndex((x) => x.title === e.title) === i);

  // the week's numbers: six whole days (activity, tray), today is left as it is
  for (let d = 6; d >= 1; d--) {
    const date = key(new Date(midnight - d * 864e5)), flops = int(2, 5);
    out.push({ kind: "pose-day", title: "", at: at(d, 12), extra: { date, cam: int(640, 820), loaf: int(110, 170), stretched: int(50, 100), flop: flops * int(8, 14), flops, sitting: int(60, 110), eating: int(80, 110), grooming: int(25, 45), active: int(140, 210) } });
    out.push({ kind: "tray-day", title: "Tray day", at: at(d, 12), extra: { date, visits: int(8, 11), output_g: int(175, 220), weight_g: 1094 + int(-6, 6) } });
  }
  // the week's moments: his cut-outs, re-dated one a day (or the demo's, if there are none of him)
  const titles = [`${nk(0)} is having a big flop`, `${nk(1)} is stretched out like a croissant`, `${nk(2)} is loafing like a pro`, `${nk(0)} flopped right by the hay`, `${nk(1)} is having a big stretch`];
  if (!cutouts.length) cutouts = DEMO_STICKERS.map((id, i) => ({ id, kind: "moment", has_image: true, png: true, extra: { sticker: true }, title: titles[i] }));
  cutouts.slice(0, 6).forEach((e, i) => out.push({ ...e, kind: e.kind === "moment" ? "moment" : e.kind, title: e.kind === "moment" ? e.title : titles[i % titles.length], at: at(i, 9 + i), extra: { ...(e.extra || {}), sticker: true } }));
  // food checks: his real ones, topped up to nine with words only
  const extraFoods = [["Strawberry", "caution"], ["Romaine lettuce", "safe"], ["Coriander", "safe"], ["Carrot top", "safe"], ["Chocolate biscuit", "toxic"], ["Apple slice", "caution"], ["Basil", "safe"], ["Banana", "caution"], ["Bok choy", "safe"]];
  foods.slice(0, 6).forEach((e, i) => out.push({ ...e, at: at(i % 6 + 1, 18) }));
  for (let i = foods.slice(0, 6).length; i < 9; i++) out.push({ kind: "food", title: extraFoods[i][0], verdict: extraFoods[i][1], at: at(i % 6 + 1, 17), has_image: false });
  // poo checks, every day, all healthy
  for (let d = 6; d >= 0; d--) out.push({ kind: "droppings", title: "Droppings check", verdict: "safe", at: at(d, 9.5), extra: { verdict: "normal", trend: d === 6 ? "first" : "same" } });
  // care: every daily job ticked, plus his routines
  const daily = (pet.care && pet.care.daily) || ["Fresh hay and water", "Leafy greens", "Exercise time", "Spot clean the litter tray"];
  for (let d = 6; d >= 1; d--) daily.forEach((t, i) => out.push({ kind: "care", title: t, at: at(d, 8 + i * 0.2) }));
  [["Brush his coat", 5], ["Check his teeth", 3], ["Brush his coat", 1], ["Deep clean the pen", 2]].forEach(([t, d]) => out.push({ kind: "routine-done", title: t, at: at(d, 19) }));
  for (let i = 0; i < 6; i++) out.push({ kind: "ask", title: "Ask", at: at(i, 20) });

  const real = entries.filter((e) => !out.some((o) => o.id && o.id === e.id));
  return real.concat(out.map(sim)).sort((a, b) => b.at - a.at);
}

// this week's card for the film: the fact card's layout from the made-up week (no Muse Spark call, nothing saved)
const FILM_RECAP = (pet) => {
  const nicks = String(pet.nicknames || "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  return { title: `A flop-filled, happy week`, highlights: [`${nicks[0] || pet.name} flopped every single day`, "Steady weight, a happy gut", "Every food checked before sharing"], streak: 6 };
};

module.exports = { filmWeek, FILM_RECAP };
