// Droppings check, from the FurSight Tray's camera (or any photo of the litter).
//
//   POST /api/droppings  { image: "data:image/jpeg;base64,..." }
//   -> { count, boxes: [{ x0, y0, x1, y1 }] (0-1), size_spread, verdict: normal|watch|vet, summary, ms }
//
// SAM counts and outlines them (it needs shape words: "droppings" finds nothing, "small brown object" works),
// then Muse Spark judges what it sees with the count and how even the sizes are. Small, misshapen, few or
// strung-together droppings are an early sign of gut trouble in rabbits. It notices; the vet decides.
const { spark } = require("../lib/meta");
const { find } = require("../lib/sam");
const { handler, image, household } = require("../lib/http");
const { context } = require("../lib/hub");

const SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["normal", "watch", "vet"] },
    summary: { type: "string", description: "one or two plain spoken sentences, at most 35 words, no em dashes" },
  },
  required: ["verdict", "summary"],
};

module.exports = handler(async (body, req) => {
  const t0 = Date.now();
  const img = image(body.image);
  const home = household(req);
  const ctx = home ? await context(home.token).catch(() => null) : null;
  const name = (ctx && ctx.pet && ctx.pet.name) || "your rabbit";

  // SAM: every small brown thing; drop specks and big blobs (litter clumps, the tray edge) by size
  let boxes = await find(img, "small brown object").catch(() => []);
  const area = (b) => (b.x1 - b.x0) * (b.y1 - b.y0);
  const sorted = boxes.map(area).sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)] || 0;
  boxes = boxes.filter((b) => area(b) > median * 0.25 && area(b) < median * 4);
  const sides = boxes.map((b) => Math.sqrt(area(b))), mean = sides.reduce((a, b) => a + b, 0) / (sides.length || 1);
  const spread = sides.length > 1 ? Math.sqrt(sides.reduce((a, s) => a + (s - mean) ** 2, 0) / sides.length) / mean : 0;

  const { data } = await spark({
    system: `You check a rabbit's droppings from a photo of the litter tray, for ${name}'s owner. Healthy: plenty of round, evenly sized, firm, fibrous pellets. Watch: fewer than usual, small, dry, misshapen or uneven, a few strung together with hair, or soft sticky clusters (uneaten caecotrophs) now and then. Vet today: none at all, mostly tiny pellets, mucus, diarrhoea, or a long string of pellets joined by hair. Judge only what you can see; say what to watch for. No em dashes.`,
    text: `SAM found ${boxes.length} dropping-sized objects; their sizes vary by ${Math.round(spread * 100)}% (under about 25% is even). Check the photo yourself too: SAM may count bits of litter or miss some.`,
    images: [img], schema: SCHEMA, name: "Droppings",
  });
  return { count: boxes.length, boxes, size_spread: Math.round(spread * 100) / 100, verdict: data.verdict, summary: data.summary, ms: Date.now() - t0 };
});
