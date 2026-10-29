// Ideas for him: treats, toys, enrichment and kit that suit this pet, from what FurSight knows (profile, care plan,
// notes, how he spends his days, anything he's been chewing, the last room check). Muse Spark searches the web for
// current guidance. Not adverts: generic kinds of thing, never brands or shop links; the sources it read are cited.
// Food ideas go through the safety list, so a "don't" is never suggested.
//
//   POST /api/ideas  {}  (a household device)  -> { ideas: [{ kind, name, why, safety, tip }], sources, ms }
// The web app keeps the answer as a weekly "ideas" diary entry, so it isn't asked again every visit.
const { spark } = require("../lib/meta");
const { handler } = require("../lib/http");
const { context, recent } = require("../lib/hub");
const { lookup } = require("../lib/verdict");
const FSActivity = require("../public/activity.js");

const SCHEMA = { type: "object", properties: { ideas: { type: "array", items: { type: "object", properties: {
  kind: { type: "string", enum: ["treat", "toy", "enrichment", "comfort", "habitat", "grooming"] },
  name: { type: "string", description: "a generic kind of thing, never a brand or product name, e.g. 'willow ball', 'dig box', 'dried dandelion'" },
  why: { type: "string", description: "why it suits HIM, from what you know about him, one sentence" },
  safety: { type: "string", description: "one short safety note" },
  tip: { type: "string", description: "how to choose or make one, one short sentence" },
}, required: ["kind", "name", "why", "safety", "tip"] } } }, required: ["ideas"] };

// web search leaves citation markers like 【123†L5-L8】 in the text; the sources are listed separately
const clean = (v) => String(v || "").replace(/\s*【[^】]*】/g, "").replace(/\s*[—–]\s*/g, ", ").trim();

module.exports = handler(async (body, req) => {
  const t0 = Date.now(), auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!auth.startsWith("fs1.")) throw Object.assign(new Error("link this device first"), { status: 401, expose: true });
  const [ctx, all] = await Promise.all([context(auth), recent(auth, 200)]);
  const p = ctx.pet || { name: "your pet", species: "rabbit" }, a = FSActivity.summary(all);
  const chewing = all.filter((e) => e.kind === "warning").slice(0, 5).map((e) => e.title);
  const room = all.find((e) => e.kind === "room");
  const facts = [
    `${p.name}: ${[p.sex, p.age, p.breed, p.species].filter(Boolean).join(" ")}.`,
    p.notes && `Owner notes: ${p.notes}.`,
    p.care && p.care.treats && `Treats in his care plan: ${p.care.treats.join(", ")}.`,
    a.has && `This week: loafing ${FSActivity.time(a.week.loaf)}, stretched out ${FSActivity.time(a.week.stretched)}, ${a.week.flops} flops, on the move ${FSActivity.time(a.week.active)}.`,
    chewing.length && `The pet cam caught him chewing: ${chewing.join("; ")}.`,
    room && room.extra && room.extra.hazards && `Last room check found: ${room.extra.hazards.map((h) => h.label).join(", ")}.`,
  ].filter(Boolean).join("\n");
  const { data, citations } = await spark({
    system: `You suggest a few things a ${p.species}'s owner could get or make to make life better for ${p.name}: treats, toys, enrichment, comfort, habitat and grooming. Base every idea on what you know about him, and check current welfare guidance (RWAF, House Rabbit Society and similar) on the web. Never name brands, products or shops: generic kinds of thing only. Prefer cheap or homemade. If he's been chewing something he shouldn't, suggest a safe thing to chew instead. 4 to 6 ideas, varied kinds. No em dashes.`,
    text: facts, schema: SCHEMA, name: "Ideas", webSearch: true, effort: "low", maxTokens: 5000,
  });
  // the safety list has the last word on anything edible
  const ideas = (data.ideas || []).filter((i) => i.kind !== "treat" || !(lookup(p.species, i.name) && lookup(p.species, i.name).verdict === "toxic"))
    .map((i) => Object.fromEntries(Object.entries(i).map(([k, v]) => [k, clean(v)])));
  return { ideas, sources: (citations || []).slice(0, 5), ms: Date.now() - t0 };
});
