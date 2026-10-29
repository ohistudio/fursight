// Take a photo for the diary: a short note about what's in it, written for the pet's owner.
//
//   POST /api/photo  { image, pet }  ->  { title, note, pet_visible, tags: [...], ms }
const { spark } = require("../lib/meta");
const { handler, image } = require("../lib/http");
const { pet: readPet, describe } = require("../lib/pet");

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "3-6 words, like a diary entry heading" },
    note: { type: "string", description: "one or two plain sentences on what's happening; mention anything a careful owner would want to remember (eating, droppings, posture, mess, hazards)" },
    pet_visible: { type: "boolean" },
    tags: { type: "array", items: { type: "string", enum: ["eating", "drinking", "resting", "playing", "droppings", "grooming", "hazard", "food", "enclosure", "other"] } },
  },
  required: ["title", "note", "pet_visible", "tags"],
};

module.exports = handler(async (body) => {
  const t0 = Date.now();
  const p = readPet(body);
  const { data } = await spark({
    system: `You write FurSight diary notes for the owner of ${describe(p)}. Describe only what is visible. Warm and plain, no markdown, no emoji, no em dashes.`,
    text: "Write a diary note for this photo.",
    images: [image(body.image)],
    schema: SCHEMA,
    name: "Photo",
  });
  return { ...data, ms: Date.now() - t0 };
});
