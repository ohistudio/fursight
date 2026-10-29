// Room check: what in this room could a free-roaming rabbit chew, swallow, get stuck in, or pee on? From a pet
// cam picture (or any photo), Muse Spark lists what it can actually see, then SAM outlines each one so the app
// (and the Quest, later) can ring it. On demand only: about one Spark call and a SAM call per item.
//
//   POST /api/room  { image }  or  { cam: true } (the household's first pet cam, wide)
//   -> { hazards: [{ label, kind: chew|toxic|cable|swallow|stuck|stain, risk: high|medium|low, why, fix, boxes: [{x0,y0,x1,y1}] }], image, ms }
const { spark } = require("../lib/meta");
const { find } = require("../lib/sam");
const { handler, image, household, bad } = require("../lib/http");
const { context, camFrame, camView } = require("../lib/hub");

const SCHEMA = { type: "object", properties: { hazards: { type: "array", items: { type: "object", properties: {
  sam_prompt: { type: "string", description: "a short concrete noun phrase (1-3 words) naming the object so a segmentation model can find it, e.g. 'lamp cable', 'rug', 'potted plant'" },
  label: { type: "string", description: "what it is, 1-4 words" },
  kind: { type: "string", enum: ["chew", "toxic", "cable", "swallow", "stuck", "stain"], description: "stain = soft furnishings he may pee on or mark (rugs, sofa, bed, cushions)" },
  risk: { type: "string", enum: ["high", "medium", "low"] },
  why: { type: "string", description: "one short sentence" },
  fix: { type: "string", description: "one short practical fix" },
}, required: ["sam_prompt", "label", "kind", "risk", "why", "fix"] } } }, required: ["hazards"] };

module.exports = handler(async (body, req) => {
  const t0 = Date.now();
  const home = household(req);
  const ctx = home ? await context(home.token).catch(() => null) : null;
  let img = body.image ? image(body.image) : null;
  if (!img && body.cam && ctx && ctx.cams.length) {
    const c = ctx.cams.find((x) => x.channel === body.channel) || ctx.cams[0];
    await camView(c.channel, { z: 1, x: 0.5, y: 0.5 });
    img = await camFrame(c.channel, 4000, Date.now());
  }
  if (!img) throw bad("send a photo, or turn the pet cam on");
  const name = (ctx && ctx.pet && ctx.pet.name) || "the rabbit";
  const { data } = await spark({
    system: `You check a room for ${name}, a free-roaming house rabbit. List the things you can actually SEE that matter: things he'll chew (cables first, wooden furniture legs, skirting, door frames, books), toxic plants, small things he could swallow, gaps he could get stuck in, and soft furnishings he may pee on or mark (rugs, sofa, bed, cushions). Most important first, at most 8. No em dashes.`,
    text: `Check this room for ${name}.`, images: [img], schema: SCHEMA, name: "Room", maxTokens: 4000,
  });
  const hazards = await Promise.all((data.hazards || []).slice(0, 8).map(async (h) => ({
    label: h.label, kind: h.kind, risk: h.risk, why: h.why, fix: h.fix,
    boxes: (await find(img, h.sam_prompt).catch(() => [])).slice(0, 4),
  })));
  return { hazards, image: body.image ? undefined : img, ms: Date.now() - t0 };
});
