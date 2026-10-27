// Today at a glance, in one call, for the iPhone app's home screen: the pet, anything worth attention, the
// litter tray, his day from the pet cam, the latest moment, grooming that's due and what's coming up. Built from
// the household diary with the same shared modules the web app and glasses use.
//
//   POST /api/today  {}  (a household device)
//   -> { pet, alerts: [{ title, note, verdict, at }], tray, activity, moment, due, coming, recap, counts }
const { handler } = require("../lib/http");
const { context, recent } = require("../lib/hub");
const FSTray = require("../public/tray.js"), FSActivity = require("../public/activity.js"), FSRoutine = require("../public/routines.js"), FSCal = require("../public/calendar.js");

module.exports = handler(async (body, req) => {
  const auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!auth.startsWith("fs1.")) throw Object.assign(new Error("link this phone first"), { status: 401, expose: true });
  const [ctx, all] = await Promise.all([context(auth), recent(auth, 200)]);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = all.filter((e) => e.at >= start.getTime() && !/^(event|tray|pose|active)|^routine(-cancel)?$/.test(e.kind));
  const pick = (e) => e && { id: e.id, title: e.title, note: e.note, verdict: e.verdict, kind: e.kind, at: e.at, has_image: e.has_image };
  const tray = FSTray.summary(all), activity = FSActivity.summary(all);
  return {
    pet: ctx.pet && { id: ctx.pet.id, name: ctx.pet.name, species: ctx.pet.species, breed: ctx.pet.breed, sex: ctx.pet.sex, nicknames: ctx.pet.nicknames, has_photo: ctx.pet.has_photo },
    // a food check is the owner asking, not something that happened, so it never counts as an alert
    alerts: today.filter((e) => e.kind !== "food" && (["toxic", "vet"].includes(e.verdict) || e.kind === "warning" || e.kind === "alert")).slice(0, 4).map(pick),
    tray: tray.status === "none" ? null : { status: tray.status, reasons: tray.reasons, today: tray.today, usual: tray.usual, weights: tray.week.map((d) => d.weight_g), simulated: tray.simulated },
    activity: activity.has ? { today: activity.today, week: activity.week, simulated: activity.simulated } : null,
    moment: pick(activity.moment),
    due: FSRoutine.list(all).filter((r) => r.days <= 1).map((r) => ({ id: r.id, title: r.title, when: FSRoutine.when(r), days: r.days })),
    coming: FSCal.upcoming(all, 30).slice(0, 3),
    recap: pick(all.find((e) => e.kind === "recap" && Date.now() - e.at < 8 * 864e5)),
    counts: { checks: today.filter((e) => e.kind === "food").length, questions: today.filter((e) => e.kind === "ask").length },
  };
});
