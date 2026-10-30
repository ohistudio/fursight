// Measuring hay, food bowl and water in one picture: Muse Spark finds each and says how full it is, SAM 3.1
// measures the hay pile inside where Spark saw it. Used by /api/levels (the pet cam's checks) and by Ask, when
// the owner is looking at his cage through their glasses, Quest or phone.
const { spark } = require("./meta");
const { area } = require("./sam");

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

async function measure(img, name) {
  const { data } = await spark({
    name: "Levels",
    system: `You look at a pet cam picture of ${name}'s space, a house rabbit, and judge his hay, food bowl and water. Only report what you can actually see; if something isn't in the picture, found is false and level 0. Hay: how much of a full rack or pile is there (a freshly filled rack is 100). Bowls: how full. Water bottle: how full the bottle is. Be realistic and consistent. No em dashes.`,
    text: "How much hay is left, and how full are his food bowl and water?",
    images: [img], schema: SCHEMA,
  });
  // the hay pile's real size, measured inside where Spark saw it (scattered strands elsewhere don't count)
  let hayArea = null;
  if (data.hay && data.hay.found) hayArea = await area(img, "hay", zoneOf(data.hay.box)).catch(() => null);
  const pick = (x) => (x && x.found ? { found: true, level: Math.max(0, Math.min(100, Math.round(x.level))), note: x.note, box: x.box } : { found: false });
  const hay = { ...pick(data.hay), ...(hayArea !== null && data.hay.found ? { area: Math.round(hayArea * 1e5) / 1e5 } : {}) }, food = pick(data.food), water = pick(data.water);
  const said = [hay.found ? `Hay ${hay.level}%` : "hay not in view", food.found ? `food bowl ${food.level}%` : "food bowl not in view", water.found ? `water ${water.level}%` : "water not in view"].join(", ");
  return { hay, food, water, said };
}

module.exports = { measure };
