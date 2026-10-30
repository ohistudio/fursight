// Hay and bowls: how much hay is left, and how full his food bowl and water are, from a pet cam picture. Muse
// Spark finds each one and estimates how full it is; SAM measures the hay pile itself (its share of the picture,
// inside the hay's area), so the day's readings compare like with like against the morning's. Saved to the
// diary as a "levels" entry; levels.js turns the day's readings into "about 40% of the hay gone since 8:10".
// The pet cam runs this every couple of hours while it's on; the app has a "Check hay and bowls" button.
//
//   POST /api/levels  { image } | { cam: true, channel? }   (a household device)
//   -> { hay: { found, level, area, note }, food: { found, level, note }, water: { found, level, note }, said, entry, ms }
//      level 0-100 (how full); area: share of the picture the hay covers (for the hay only)
const { measure } = require("../lib/levels");
const { handler, image, household, bad } = require("../lib/http");
const { context, camFrame, camView, addDiary } = require("../lib/hub");

module.exports = handler(async (body, req) => {
  const t0 = Date.now(), home = household(req);
  if (!home) throw Object.assign(new Error("link this device first"), { status: 401, expose: true });
  const ctx = await context(home.token);
  let img = body.image ? image(body.image) : null, camName = "";
  if (!img && body.cam && ctx.cams.length) {
    const c = ctx.cams.find((x) => x.channel === body.channel) || ctx.cams[0];
    camName = c.name;
    await camView(c.channel, { z: 1, x: 0.5, y: 0.5 });   // wide, so everything is in
    img = await camFrame(c.channel, 4000, Date.now());
  }
  if (!img) throw bad("send a photo, or turn the pet cam on");
  const name = (ctx.pet && ctx.pet.name) || "the rabbit";
  const { hay, food, water, said } = await measure(img, name);
  // the boxes are for drawing, not for the diary
  for (const x of [hay, food, water]) delete x.box;
  const entry = await addDiary(home.token, { kind: "levels", title: "Hay and bowls", note: said, pet: name, extra: { hay, food, water, cam: camName || undefined, sim: body.sim ? true : undefined } });
  return { hay, food, water, said, entry: entry && entry.id, ms: Date.now() - t0 };
});
