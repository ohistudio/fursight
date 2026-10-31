// His week, wrapped, as data: the same story slides as the web page (public/wrapped/), for apps that draw their
// own (the Quest shows them as a big card in the room, his stickers popping out in front). Made only from what
// FurSight logged; a slide with nothing behind it is left out.
//
//   POST /api/wrapped  {}  (a household device)
//   -> { name, from, to, slides: [{ colour, kicker, title, big?: { n, fmt: "n"|"hm"|"kg" }, body?, foot?, sticker?,
//        minis?: [ids], images?: [{ id, verdict?, caption }], list?: [{ n, text }], card?: layout, card_id?, summary?: [{ big, label }] }] }
//   ids are diary entries whose picture is at the hub's /hub/diary/<id>/image
const { handler, bad } = require("../lib/http");
const { context, recent } = require("../lib/hub");
const FSActivity = require("../public/activity.js"), FSTray = require("../public/tray.js"), FSCal = require("../public/calendar.js");

const COLOURS = ["#9B6CF0", "#2FA8F5", "#3DBE6B", "#FF4D5E", "#FFB627", "#7A4ED1", "#1E86C9", "#2B2A33"];
const kg = (g) => (g / 1000).toFixed(2);

module.exports = handler(async (body, req) => {
  const auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!auth.startsWith("fs1.")) throw bad("link this device first");
  const [ctx, entries] = await Promise.all([context(auth), recent(auth, 200)]);
  if (!ctx.pet) throw bad("add a pet first");
  const p = ctx.pet, name = p.name;
  const nicks = String(p.nicknames || "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const nick = (i) => (nicks.length ? nicks[i % nicks.length] : name);
  const since = Date.now() - 7 * 864e5, week = entries.filter((e) => e.at >= since);
  const cutouts = week.filter((e) => e.has_image && e.kind !== "recap" && (e.png || (e.extra && e.extra.sticker))).map((e) => e.id);
  const sticker = (i) => (cutouts.length ? cutouts[i % cutouts.length] : null);
  const minis = (from, n = 3) => (cutouts.length ? Array.from({ length: n }, (_, k) => cutouts[(from + k) % cutouts.length]) : []);
  const a = FSActivity.summary(entries), days = FSActivity.days(entries, 7), tray = FSTray.summary(entries);
  const date = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const dayName = (k) => FSCal.day(k).toLocaleDateString("en-GB", { weekday: "long" });
  const from = date(since), to = date(Date.now());
  const S = [];

  S.push({ colour: COLOURS[0], kicker: `${from} to ${to}`, title: `${name}'s week, wrapped`, body: "Here's what FurSight noticed.", sticker: sticker(0), minis: minis(1) });
  if (nicks.length) S.push({ colour: COLOURS[7], kicker: "Also known as", title: `${name}, or`, list: nicks.map((t, i) => ({ n: i + 1, text: t })), sticker: sticker(3) });
  if (a.has && a.week.loaf > 0)
    S.push({ colour: COLOURS[1], kicker: "Professional loafer", title: `${nick(0)} loafed for`, big: { n: Math.round(a.week.loaf), fmt: "hm" },
      body: `That's about ${FSActivity.time(a.week.loaf / 7)} a day, tucked up like a bread roll.`, foot: `Out of the ${FSActivity.time(a.week.seen)} the cams saw him. The rest stays his secret.` });
  if (a.has && a.week.flops > 0) {
    const best = days.reduce((m, d) => (d.flops > m.flops ? d : m), days[0]);
    S.push({ colour: COLOURS[4], kicker: "Flop count", big: { n: a.week.flops, fmt: "n" }, title: "flops this week", sticker: sticker(1), minis: minis(3, 2),
      body: best.flops ? `His floppiest day was ${dayName(best.date)}, with ${best.flops}. A flop means he feels completely safe.` : "A flop means he feels completely safe.",
      foot: a.week.flopsYou ? `${a.week.flopsYou} spotted by you` : undefined });
  }
  const moment = week.find((e) => e.kind === "moment" && e.has_image);
  if (moment) S.push({ colour: COLOURS[5], kicker: "Moment of the week", title: moment.title, images: [{ id: moment.id, caption: "" }] });
  if (a.has && a.week.active > 0) S.push({ colour: COLOURS[2], kicker: "Zoomies", title: `${nick(1)} was on the move for`, big: { n: Math.round(a.week.active), fmt: "hm" }, body: "Exploring, hopping and the odd binky.", sticker: sticker(4), minis: minis(0) });
  const ws = tray.week.filter((d) => d.weight_g);
  if (ws.length > 1) {
    const change = ws[ws.length - 1].weight_g - ws[0].weight_g, visits = tray.week.reduce((s, d) => s + d.visits, 0), steady = Math.abs(change) <= 20;
    S.push({ colour: COLOURS[6], kicker: "Weigh-ins", title: steady ? "Steady as ever at" : change < 0 ? "Down a little, to" : "Up a little, to", big: { n: ws[ws.length - 1].weight_g, fmt: "kg" },
      body: `Weighed on every one of his ${visits} litter tray visits. ${steady ? "Exactly what we like to see." : "Worth keeping an eye on."}`, sticker: sticker(2) });
  }
  const checks = week.filter((e) => e.kind === "food");
  if (checks.length) {
    const foodPics = checks.filter((e) => e.has_image).filter((e, i, l) => l.findIndex((x) => x.title === e.title) === i).slice(0, 6);
    S.push({ colour: COLOURS[3], kicker: "Careful owner award", title: "You checked", big: { n: checks.length, fmt: "n" }, body: "foods before sharing",
      images: foodPics.map((e) => ({ id: e.id, verdict: e.verdict, caption: e.title })) });
  }
  const poos = week.filter((e) => e.kind === "droppings");
  if (poos.length) S.push({ colour: COLOURS[6], kicker: "Poo patrol", title: "Litter tray checks", big: { n: poos.length, fmt: "n" },
    body: poos.every((e) => e.verdict === "safe") ? "Every one looked healthy. A happy gut." : "One or two to keep an eye on; the diary has the details." });
  const groomed = week.filter((e) => e.kind === "routine-done"), cared = week.filter((e) => e.kind === "care").length;
  if (groomed.length || cared) {
    const g = {}; for (const e of groomed) g[e.title] = (g[e.title] || 0) + 1;
    S.push({ colour: COLOURS[2], kicker: "Good care", title: `You looked after ${nick(2)}`,
      list: (cared ? [{ n: cared, text: "daily care jobs ticked" }] : []).concat(Object.entries(g).map(([t, n]) => ({ n, text: t.toLowerCase() }))) });
  }
  const caught = week.filter((e) => e.has_image && e.kind !== "recap" && (e.png || (e.extra && e.extra.sticker))).slice(0, 6);
  if (caught.length >= 2) S.push({ colour: COLOURS[1], kicker: "Caught on cam", title: `${nick(0)}'s best bits`,
    images: caught.map((e) => ({ id: e.id, caption: new Date(e.at).toLocaleDateString("en-GB", { weekday: "short" }), sticker: true })) });
  const card = week.find((e) => e.kind === "recap" && (e.has_image || (e.extra && e.extra.layout)));
  if (card) S.push({ colour: COLOURS[5], kicker: "This week's card", title: card.title, card: (card.extra && card.extra.layout) || null, card_id: card.id });
  const asks = week.filter((e) => e.kind === "ask").length, summary = [];
  if (a.has) summary.push({ big: FSActivity.time(a.week.loaf), label: "loafing" }, { big: String(a.week.flops), label: "flops" }, { big: FSActivity.time(a.week.active), label: "on the move" });
  if (ws.length) summary.push({ big: kg(ws[ws.length - 1].weight_g) + " kg", label: "weight" });
  if (checks.length) summary.push({ big: String(checks.length), label: "foods checked" });
  if (asks) summary.push({ big: String(asks), label: "questions asked" });
  S.push({ colour: COLOURS[0], kicker: `${from} to ${to}`, title: `${name}'s week`, summary: summary.slice(0, 6),
    foot: `FurSight · spoil them, worry less${tray.simulated || a.simulated ? " · includes simulated data" : ""}` });
  return { name, from, to, has_card: !!card, slides: S };
});
