// Droppings check (the poo check), from a close photo of a few of his droppings, wherever he left them (the floor,
// his pen, the litter tray), taken on a phone, the glasses or the Quest. It's about what they look like, not how many.
//
//   POST /api/droppings  { image: "data:image/jpeg;base64,..." }
//   -> { count, boxes: [{ x0, y0, x1, y1 }] (0-1), size_spread, verdict: normal|watch|vet, summary,
//        compare, trend: first|better|same|worse, previous: [{ at, count, verdict }], ms }
//
// SAM counts and outlines them (it needs shape words: "droppings" finds nothing, "small brown object" works),
// then Muse Spark judges what it sees with the count and how even the sizes are, side by side with the last
// check's photo and numbers. Small, misshapen, few or strung-together droppings are an early sign of gut
// trouble in rabbits. It notices; the vet decides.
const { spark } = require("../lib/meta");
const { find } = require("../lib/sam");
const { handler, image, household } = require("../lib/http");
const { context, uploads, diaryImage } = require("../lib/hub");

const SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["normal", "watch", "vet"] },
    summary: { type: "string", description: "one or two plain spoken sentences, at most 35 words, no em dashes" },
    trend: { type: "string", enum: ["first", "better", "same", "worse"], description: "against the last check; first if there is none" },
    compare: { type: "string", description: "one short sentence against the last check (shape, size, colour, texture; never the count), or what to look for next time if this is the first; no em dashes" },
  },
  required: ["verdict", "summary", "trend", "compare"],
};

const ago = (t) => { const h = (Date.now() - t) / 3600e3; return h < 1 ? "under an hour ago" : h < 36 ? `${Math.round(h)} hours ago` : `${Math.round(h / 24)} days ago`; };

module.exports = handler(async (body, req) => {
  const t0 = Date.now();
  const img = image(body.image);
  const home = household(req);
  const [ctx, past] = home ? await Promise.all([context(home.token).catch(() => null), uploads(home.token, ["droppings"], 8).catch(() => [])]) : [null, []];
  const name = (ctx && ctx.pet && ctx.pet.name) || "your rabbit";
  const last = past[0];
  const lastPic = last && last.has_image ? await diaryImage(home.token, last.id).catch(() => null) : null;

  // SAM: every small brown thing; drop specks and big blobs (litter clumps, a rug's pattern) by size
  let boxes = await find(img, "small brown object").catch(() => []);
  const area = (b) => (b.x1 - b.x0) * (b.y1 - b.y0);
  const sorted = boxes.map(area).sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)] || 0;
  boxes = boxes.filter((b) => area(b) > median * 0.25 && area(b) < median * 4);
  const sides = boxes.map((b) => Math.sqrt(area(b))), mean = sides.reduce((a, b) => a + b, 0) / (sides.length || 1);
  const spread = sides.length > 1 ? Math.sqrt(sides.reduce((a, s) => a + (s - mean) ** 2, 0) / sides.length) / mean : 0;

  const history = past.length
    ? `Earlier checks, newest first: ${past.slice(0, 5).map((e) => `${ago(e.at)}: ${(e.extra && e.extra.verdict) || e.verdict || "?"}${e.note ? " (" + e.note.slice(0, 120) + ")" : ""}`).join("; ")}.` +
      (lastPic ? " The second photo is the last check's droppings." : "")
    : "This is the first droppings check.";
  const { data } = await spark({
    system: `You check a rabbit's droppings from a close photo of a few of them, wherever he left them (floor, pen or litter tray), for ${name}'s owner, and compare with the last check. Judge what they look like: shape, size, colour and texture. How many are in the photo means nothing (the owner photographs just a few), so never judge or compare the count. Healthy: round, evenly sized, firm, fibrous pellets, mid to dark brown. Watch: small, dry, hard, misshapen or uneven ones, a few strung together with hair, unusually pale or very dark, or soft sticky clusters (uneaten caecotrophs) now and then. Vet today: mucus, diarrhoea, mostly tiny pellets, or a long string of pellets joined by hair. Judge only what you can see; say what to watch for. No em dashes.`,
    text: `SAM outlined ${boxes.length} dropping-sized objects in the first photo. Their outlines are only a rough guide to size (pellets at different angles, overlapping or partly hidden look different sizes), so judge size, shape, colour and texture by eye; SAM may also pick up bits of litter or miss some. ${history}`,
    images: lastPic ? [img, lastPic] : [img], schema: SCHEMA, name: "Droppings",
  });
  return {
    count: boxes.length, boxes, size_spread: Math.round(spread * 100) / 100, verdict: data.verdict, summary: data.summary,
    trend: past.length ? data.trend : "first", compare: data.compare,
    previous: past.map((e) => ({ at: e.at, count: e.extra && e.extra.count, verdict: (e.extra && e.extra.verdict) || null })),
    ms: Date.now() - t0,
  };
});
