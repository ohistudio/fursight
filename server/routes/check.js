// One Check for whatever you're looking at (the glasses' single button). Muse Spark first works out what it is:
// food you could give him (then the full food check, /api/food, answers), things he could chew or swallow (the
// chew risk and a fix, like the room check), or him (then it asks what you want to know: his coat, eyes, teeth,
// ears, body or his droppings, from what it can see). Pick one and the same photo gets a closer look at that.
//
//   POST /api/check  { image, pet?, tz? }
//   -> { kind: "food", food: <the /api/food answer> }
//    | { kind: "object", things: [{ label, risk: high|medium|low|none, why, fix }] }
//    | { kind: "pet", seen, options: [{ id, label }] }
//    | { kind: "none", says }
//   POST /api/check  { image, focus: "coat" }   (a follow-up about him)
//   -> { kind: "look", focus, label, verdict: normal|watch|vet, says, tip }
const { spark } = require("../lib/meta");
const { handler, image, text, household } = require("../lib/http");
const { context } = require("../lib/hub");
const food = require("./food");

const FOCUS = { coat: "His coat", eyes: "His eyes", teeth: "His teeth", ears: "His ears", body: "His body and weight", feet: "His feet", droppings: "His droppings", mood: "How he's feeling" };

const WHAT = { type: "object", properties: {
  kind: { type: "string", enum: ["food", "object", "pet", "none"], description: "food: something edible held or offered (fruit, veg, plants, treats, human food). pet: the pet himself is the main subject. object: anything else he could chew, swallow, get stuck in or pee on (cables, wood, plants in pots, rugs, small things). none: nothing useful" },
  seen: { type: "string", description: "kind pet: what he's doing, in one short warm sentence" },
  options: { type: "array", items: { type: "string", enum: Object.keys(FOCUS) }, description: "kind pet: 2 to 4 things the owner may be asking about that this photo can actually show, most likely first" },
  things: { type: "array", items: { type: "object", properties: {
    label: { type: "string", description: "1 to 4 words" },
    risk: { type: "string", enum: ["high", "medium", "low", "none"] },
    why: { type: "string", description: "one short sentence on the chew or swallow risk" },
    fix: { type: "string", description: "one short practical fix, or empty if none needed" },
  }, required: ["label", "risk", "why", "fix"] }, description: "kind object: up to 3 things in view, the one looked at first" },
  says: { type: "string", description: "kind none: one short sentence on what to point at instead" },
}, required: ["kind", "seen", "options", "things", "says"] };

const LOOK = { type: "object", properties: {
  verdict: { type: "string", enum: ["normal", "watch", "vet"] },
  says: { type: "string", description: "what you can see about it, two plain sentences at most, no em dashes" },
  tip: { type: "string", description: "one short thing to do or watch for" },
}, required: ["verdict", "says", "tip"] };

// call another route's handler in-process, with this request's caller
const call = (route, body, req) => new Promise((ok, fail) => {
  const res = { statusCode: 200, setHeader() {}, status(c) { this.statusCode = c; return this; }, end() { ok({}); },
    json(d) { if (this.statusCode >= 400) fail(Object.assign(new Error(d.error || "check failed"), { status: this.statusCode, expose: true })); else ok(d); } };
  route({ method: "POST", headers: req.headers, body }, res);
});

module.exports = handler(async (body, req) => {
  const img = image(body.image);
  const home = household(req);
  const ctx = home ? await context(home.token).catch(() => null) : null;
  const p = (ctx && ctx.pet) || body.pet || {};
  const name = text(p.name, 40) || "your rabbit", species = text(p.species, 40) || "rabbit";

  if (body.focus) {
    const focus = FOCUS[body.focus] ? body.focus : "mood";
    const { data } = await spark({
      system: `You look at a photo of ${name}, a pet ${species}, for the owner, who asked about: ${FOCUS[focus].toLowerCase()}. Say only what you can actually see in this photo; if it can't show that well, say so and what photo would. Healthy rabbit signs: glossy even coat with no bald or scabby patches or mites; bright clear eyes with no discharge; front teeth even and not overgrown; clean ears; a rounded body, not bony; clean dry bottom and feet with no sores; droppings round and even. Watch or vet if you see otherwise. It notices; the vet decides. No em dashes.`,
      text: `About ${FOCUS[focus].toLowerCase()}.`, images: [img], schema: LOOK, name: "Look",
    });
    return { kind: "look", focus, label: FOCUS[focus], ...data };
  }

  const { data } = await spark({
    system: `You are FurSight's Check for ${name}, a pet ${species}. Look at the photo and say what the owner is looking at, then answer for that kind. No em dashes.`,
    text: "What is this, and what matters about it?", images: [img], schema: WHAT, name: "Check",
  });
  if (data.kind === "food") return { kind: "food", food: await call(food, { image: body.image, pet: body.pet || p, tz: body.tz }, req) };
  if (data.kind === "pet") {
    const options = [...new Set((data.options || []).filter((o) => FOCUS[o]))].slice(0, 4);
    return { kind: "pet", seen: data.seen, options: (options.length ? options : ["coat", "eyes", "mood"]).map((id) => ({ id, label: FOCUS[id] })) };
  }
  // the riskiest first: that's the one the glasses lead with
  const RANK = { high: 0, medium: 1, low: 2, none: 3 };
  if (data.kind === "object" && (data.things || []).length) return { kind: "object", things: data.things.sort((a, b) => (RANK[a.risk] ?? 3) - (RANK[b.risk] ?? 3)).slice(0, 3) };
  return { kind: "none", says: data.says || "Point at food, something he might chew, or him." };
});
