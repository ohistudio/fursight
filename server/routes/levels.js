// Hay and bowls: how much hay is left, and how full his food bowl and water are, from a pet cam picture. Muse
// Spark finds each one and estimates how full it is; SAM measures the hay pile itself (its share of the picture,
// inside the hay's area), so the day's readings compare like with like against the morning's. Saved to the
// diary as a "levels" entry; levels.js turns the day's readings into "about 40% of the hay gone since 8:10".
// The pet cam runs this every couple of hours while it's on; the app has a "Check hay and bowls" button.
//
//   POST /api/levels  { image } | { cam: true, channel? }   (a household device)
//   -> { hay: { found, level, area, note }, food: { found, level, note }, water: { found, level, note }, said, entry, ms }
//      level 0-100 (how full); area: share of the picture the hay covers (for the hay only)
const { spark } = require("../lib/meta");
const { area } = require("../lib/sam");
const { handler, image, household, bad } = require("../lib/http");
const { context, camFrame, camView, addDiary } = require("../lib/hub");

const THING = (what) => ({
  type: "object",
  properties: {
    found: { type: "boolean", description: `true if you can see ${what} in the picture` },
    level: { type: "integer", description: "how full it is, 0 (empty) to 100 (full); for hay, how much of a full rack or pile is there" },
    box: { type: "array", items: { type: "integer" }, description: "[x_min, y_min, x_max, y_max] around it on a 0-1000 grid" },
    note: { type: "string", description: "a few words, e.g. 'rack half full', 'water bowl nearly empty', 'bottle about a third'" },
  },
  required: ["found", "level", "box", "note"],
});
const SCHEMA = { type: "object", properties: { hay: THING("his hay (a rack, pile or hay feeder)"), food: THING("his food bowl (pellets)"), water: THING("his water (a bowl or a bottle)") }, required: ["hay", "food", "water"] };

const zoneOf = (b, pad = 0.08) => (Array.isArray(b) && b.length === 4 && b[2] > b[0] && b[3] > b[1]
  ? { x0: Math.max(0, b[0] / 1000 - pad), y0: Math.max(0, b[1] / 1000 - pad), x1: Math.min(1, b[2] / 1000 + pad), y1: Math.min(1, b[3] / 1000 + pad) } : null);

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

  const { data } = await spark({
    name: "Levels",
    system: `You look at a pet cam picture of ${name}'s space, a house rabbit, and judge his hay, food bowl and water. Only report what you can actually see; if something isn't in the picture, found is false and level 0. Hay: how much of a full rack or pile is there (a freshly filled rack is 100). Bowls: how full. Water bottle: how full the bottle is. Be realistic and consistent. No em dashes.`,
    text: "How much hay is left, and how full are his food bowl and water?",
    images: [img], schema: SCHEMA,
  });
  // the hay pile's real size, measured inside where Spark saw it (scattered strands elsewhere don't count)
  let hayArea = null;
  if (data.hay && data.hay.found) hayArea = await area(img, "hay", zoneOf(data.hay.box)).catch(() => null);

  const pick = (x) => (x && x.found ? { found: true, level: Math.max(0, Math.min(100, Math.round(x.level))), note: x.note } : { found: false });
  const hay = { ...pick(data.hay), ...(hayArea !== null && data.hay.found ? { area: Math.round(hayArea * 1e5) / 1e5 } : {}) }, food = pick(data.food), water = pick(data.water);
  const said = [hay.found ? `Hay ${hay.level}%` : "hay not in view", food.found ? `food bowl ${food.level}%` : "food bowl not in view", water.found ? `water ${water.level}%` : "water not in view"].join(", ");
  const entry = await addDiary(home.token, { kind: "levels", title: "Hay and bowls", note: said, pet: name, extra: { hay, food, water, cam: camName || undefined, sim: body.sim ? true : undefined } });
  return { hay, food, water, said, entry: entry && entry.id, ms: Date.now() - t0 };
});
