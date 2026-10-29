// The week in numbers, for the iPhone app's Stats tab (the web app works these out itself from the diary).
//
//   POST /api/stats  {}  (a household device)
//   -> { weight: [{ date, g }], tray: [{ date, visits, output_g }], days: [{ date, loaf, stretched, flop, flops, active }],
//        today: { loaf, flops, active }, week: { loaf, flops, active }, simulated: { tray, activity } }
const { handler } = require("../lib/http");
const { recent } = require("../lib/hub");
const FSTray = require("../public/tray.js"), FSActivity = require("../public/activity.js");

module.exports = handler(async (body, req) => {
  const auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!auth.startsWith("fs1.")) throw Object.assign(new Error("link this phone first"), { status: 401, expose: true });
  const all = await recent(auth, 200);
  const tray = FSTray.summary(all), a = FSActivity.summary(all);
  return {
    weight: tray.week.filter((d) => d.weight_g).map((d) => ({ date: d.date, g: d.weight_g })),
    tray: tray.week.map((d) => ({ date: d.date, visits: d.visits, output_g: d.output_g })),
    days: a.has ? FSActivity.days(all, 7).map((d) => ({ date: d.date, loaf: d.loaf, stretched: d.stretched, flop: d.flop, flops: d.flops, active: d.active })) : [],
    today: { loaf: a.today.loaf, flops: a.today.flops, active: a.today.active },
    week: { loaf: a.week.loaf, flops: a.week.flops, active: a.week.active },
    simulated: { tray: tray.simulated, activity: a.simulated },
  };
});
