// Today at a glance, in one call, for the iPhone app's home screen: the pet, anything worth attention, the
// litter tray, his day from the pet cam, the latest moment, grooming that's due and what's coming up. Built from
// the household diary with the same shared modules the web app and glasses use.
//
//   POST /api/today  {}  (a household device)
//   POST /api/today  { tz? }  (tz: the device's minutes ahead of UTC, so "today" is the owner's day)
//   -> { pet, alerts: [{ title, note, verdict, at }], tray, activity, moment, due, coming, recap, counts,
//        todos: [{ id, title, note, verdict, action? }] }   (todos: the day's jobs, for a pop-up when an app opens)
const { handler } = require("../lib/http");
const { context, recent } = require("../lib/hub");
const FSClimate = require("../public/climate.js");
const FSLevels = require("../public/levels.js");
const FSTray = require("../public/tray.js"), FSActivity = require("../public/activity.js"), FSRoutine = require("../public/routines.js"), FSCal = require("../public/calendar.js");

module.exports = handler(async (body, req) => {
  const auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!auth.startsWith("fs1.")) throw Object.assign(new Error("link this phone first"), { status: 401, expose: true });
  const [ctx, all] = await Promise.all([context(auth), recent(auth, 200)]);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = all.filter((e) => e.at >= start.getTime() && !/^(event|tray|pose|active|climate|camtime|levels)|^routine(-cancel)?$/.test(e.kind));
  const pick = (e) => e && { id: e.id, title: e.title, note: e.note, verdict: e.verdict, kind: e.kind, at: e.at, has_image: e.has_image, sticker: !!(e.extra && e.extra.sticker) };
  const tray = FSTray.summary(all), activity = FSActivity.summary(all);
  const due = FSRoutine.list(all).filter((r) => r.days <= 1).map((r) => ({ id: r.id, title: r.title, when: FSRoutine.when(r), days: r.days }));
  const todos = todoList(all, ctx, due, Number(body.tz));
  return {
    pet: ctx.pet && { id: ctx.pet.id, name: ctx.pet.name, species: ctx.pet.species, breed: ctx.pet.breed, sex: ctx.pet.sex, nicknames: ctx.pet.nicknames, has_photo: ctx.pet.has_photo },
    // a food check is the owner asking, not something that happened, so it never counts as an alert
    alerts: today.filter((e) => e.kind !== "food" && (["toxic", "vet"].includes(e.verdict) || e.kind === "warning" || e.kind === "alert")).slice(0, 4).map(pick),
    tray: tray.status === "none" ? null : { status: tray.status, reasons: tray.reasons, today: tray.today, usual: tray.usual, weights: tray.week.map((d) => d.weight_g), simulated: tray.simulated },
    climate: (() => { const c = FSClimate.summary(all); return c.now ? { t: c.now.t, h: c.now.h, status: c.status, reasons: c.reasons, min: c.today.min, max: c.today.max, simulated: c.simulated } : null; })(),
    activity: activity.has ? { today: activity.today, week: activity.week, treats: activity.treats, simulated: activity.simulated } : null,
    moment: pick(activity.moment),
    due,
    todos,
    coming: FSCal.upcoming(all, 30).slice(0, 3),
    // only fact cards (his real stickers and numbers); an older AI-drawn card is never shown
    recap: pick(all.find((e) => e.kind === "recap" && e.extra && e.extra.layout && Date.now() - e.at < 8 * 864e5)),
    counts: { checks: today.filter((e) => e.kind === "food").length, questions: today.filter((e) => e.kind === "ask").length },
  };
});

// the day's jobs: the poo check until it's done, grooming that's due, hay or water running low, and treats that
// are OK again from today. action: what the app can start from the to-do ("poo" = the poo check).
function todoList(all, ctx, due, tz) {
  const name = (ctx.pet && ctx.pet.name) || "him";
  const off = Number.isFinite(tz) ? tz * 60e3 : 0, local = new Date(Date.now() + off);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - off;
  const todayKey = new Date(start + off).toISOString().slice(0, 10);
  const out = [];
  const poo = all.find((e) => e.kind === "droppings");
  if (!poo || poo.at < start) out.push({ id: "poo", title: "Poo check", note: `A close photo of a few of ${name}'s droppings` + (poo ? `; the last one was ${Math.max(1, Math.round((Date.now() - poo.at) / 864e5))} day${Date.now() - poo.at > 1.5 * 864e5 ? "s" : ""} ago.` : "; there's no check yet."), verdict: "caution", action: "poo" });
  for (const r of due) out.push({ id: "routine-" + r.id, title: r.title, note: r.when, verdict: r.days < 0 ? "caution" : "none" });
  const lv = FSLevels.summary(all);
  if (lv && lv.has && lv.at >= start) {
    if (lv.hay && lv.hay.left < 15) out.push({ id: "hay", title: "Top up the hay", note: `About ${lv.hay.left}% left.`, verdict: "caution" });
    if (lv.water !== null && lv.water !== undefined && lv.water < 20) out.push({ id: "water", title: "Fill the water", note: `About ${lv.water}% left.`, verdict: "caution" });
  }
  for (const ev of FSCal.events(all).filter((ev) => ev.extra.fed && ev.extra.date === todayKey))
    out.push({ id: "ok-" + ev.id, title: `${ev.extra.fed[0].toUpperCase() + ev.extra.fed.slice(1)} is OK again`, note: `${name} can have it again from today.`, verdict: "safe" });
  return out.slice(0, 6);
}
