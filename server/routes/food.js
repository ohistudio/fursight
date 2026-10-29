// Food check: "can my pet eat this?" from one camera frame.
//
//   POST /api/food  { image: "data:image/jpeg;base64,...", pet: { name, species, breed, notes }, question?, tz? }
//   ->  { items: [{ food, verdict: safe|caution|toxic, reason, portion, instead, wait_days, box: [x1,y1,x2,y2] (0-1000),
//                   checked, overridden?, fed?: { days_ago, next, wait_left, said } }], held: index|null, ms }
//
// From a linked device, each food also says when the pet last had it ("fed", from "We fed him this" or a note),
// and whether to wait before the next one.
//
// One Muse Spark call names each food in view, judges it for this pet and says where it is in the frame
// (0-1000 grid, so the headset can lift it into the room with depth). The species list then gets the last
// word: it can make a verdict stricter, never softer. "held" is the item being held up / closest to centre.
const { spark } = require("../lib/meta");
const { handler, image, text, bad, household } = require("../lib/http");
const { guard } = require("../lib/verdict");
const { recent } = require("../lib/hub");
const fed = require("../lib/fed");

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          food: { type: "string", description: "plain name of the food, e.g. 'strawberry', 'romaine lettuce', 'chocolate bar'" },
          verdict: { type: "string", enum: ["safe", "caution", "toxic"] },
          reason: { type: "string", description: "one short sentence, specific to this pet" },
          portion: { type: "string", description: "how much is OK, or 'none'" },
          instead: { type: "string", description: "a better choice for this pet, short" },
          wait_days: { type: "integer", description: "days to wait after giving this before giving it again: 0 if fine every day (hay, everyday greens), fruit and sugary treats usually 2 to 4, toxic 0" },
          box: { type: "array", items: { type: "integer" }, description: "[x_min, y_min, x_max, y_max] on a 0-1000 grid, origin top-left" },
          held: { type: "boolean", description: "true if this is the item being held up or presented to the camera" },
          label: { type: "string", description: "if this is packaged: what the packaging text says that matters (product name, key ingredients like sugar, xylitol, chocolate, onion), else ''" },
        },
        required: ["food", "verdict", "reason", "portion", "instead", "wait_days", "box", "held", "label"],
      },
    },
    unsure: { type: "boolean", description: "true if the food can't be identified with confidence" },
  },
  required: ["items", "unsure"],
};

const system = (pet) => `You are FurSight's food check. The owner is holding food up to the camera and asking whether their pet can eat it.
Pet: ${pet.name || "their pet"}, a ${pet.species}${pet.breed ? " (" + pet.breed + ")" : ""}.${pet.notes ? " Notes: " + pet.notes + "." : ""}
List each distinct food ONCE: several pieces, slices or halves of the same food are one item whose box covers the main piece (the one being held, or the biggest). Different varieties that share a verdict and reason (e.g. milk and dark chocolate) are also one item.
Read any text on packaging, labels and tins (product name, ingredients, flavour): name the product from it and judge it by its ingredients, not just the front of the pack. Pet treats from shops often contain sugar, honey, yoghurt drops, seeds or cereal that rabbits shouldn't have. Put what the text says that matters in label.
For each food you can see (ignore non-food objects, hands and plates), give a verdict for THIS animal:
- safe: fine as part of its normal diet in sensible amounts
- caution: OK only as a small treat or in limited amounts, or with preparation (no seeds, no stones, leaves only)
- toxic: must not be eaten
When you are not sure what the food is or whether it is safe, choose the more cautious verdict and set unsure. Never call something safe because it is probably fine.
Portions in plain household terms. Keep reason under 20 words. No em dashes. Boxes must tightly cover the food on a 0-1000 grid.`;

module.exports = handler(async (body, req) => {
  const img = image(body.image);
  const home = household(req);
  const diary = home ? recent(home.token, 200).catch(() => []) : Promise.resolve([]);   // fetched while Spark looks
  const pet = {
    name: text(body.pet?.name, 40),
    species: text(body.pet?.species, 40) || "rabbit",
    breed: text(body.pet?.breed, 60),
    notes: text(body.pet?.notes, 300),
  };
  const q = text(body.question, 200) || `Can ${pet.name || "my " + pet.species} eat this?`;
  const t0 = Date.now();
  const { data } = await spark({ system: system(pet), text: q, images: [img], schema: SCHEMA, name: "FoodCheck" });
  if (!Array.isArray(data.items)) throw bad("no items");
  const items = data.items.map((it) => {
    const g = guard(pet.species, it);
    if (data.unsure && g.verdict === "safe") return { ...g, verdict: "caution", reason: "Not sure what this is, so treat it as unsafe until checked.", overridden: true, model_verdict: "safe" };
    return g;
  });
  // one card per food: if the model still lists the same food twice, keep the held piece, else the biggest
  const area = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const key = (f) => String(f || "").toLowerCase().replace(/\b(half|halves|slice|slices|piece|pieces|of|a|an|the)\b/g, "").replace(/[^a-z]/g, "").replace(/ies$/, "y").replace(/(o|x|ch|sh)es$/, "$1").replace(/s$/, "");
  const byFood = new Map();
  for (const it of items) {
    const k = key(it.food), prev = byFood.get(k);
    if (!prev || (it.held && !prev.held) || (it.held === prev.held && area(it.box) > area(prev.box))) byFood.set(k, it);
  }
  items.splice(0, items.length, ...byFood.values());
  let held = items.findIndex((it) => it.held);
  if (held < 0 && items.length) {
    // nothing flagged as held: take the item nearest the middle of the frame
    const d = (b) => Math.hypot((b[0] + b[2]) / 2 - 500, (b[1] + b[3]) / 2 - 500);
    held = items.reduce((best, it, i) => (d(it.box) < d(items[best].box) ? i : best), 0);
  }
  const entries = await diary, tz = fed.tzOf(body.tz);
  for (const it of items) {
    const st = fed.status(entries, it.food, pet, tz);
    if (st) it.fed = { days_ago: st.days_ago, next: st.next, wait_left: st.wait_left, said: st.said };
    it.wait_days = it.verdict === "toxic" ? 0 : Math.max(0, Math.min(30, Math.round(Number(it.wait_days) || 0)));
  }
  return { items, held: held < 0 ? null : held, unsure: !!data.unsure, ms: Date.now() - t0 };
});
