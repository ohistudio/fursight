// A new pet from a photo: what it is and how to look after it. The web app's "Add a pet" calls this, the owner
// checks and edits the answer, and it's saved to the household on the hub.
//
//   POST /api/profile  { image, name?, notes? }
//   -> { species, breed, colour, age_guess, sex_guess, care: { diet, treats, never, healthy, warning_signs, daily }, ms }
const { spark } = require("../lib/meta");
const { handler, image, text } = require("../lib/http");

const list = { type: "array", items: { type: "string" } };
const SCHEMA = {
  type: "object",
  properties: {
    species: { type: "string", description: "common name, lowercase, e.g. 'rabbit', 'dog', 'cat', 'guinea pig'" },
    breed: { type: "string", description: "best guess, or 'mixed' / 'unknown'" },
    colour: { type: "string", description: "the main coat colour in 1 to 3 plain words, e.g. 'white', 'grey and white', 'tan'; ignore lighting and shadows" },
    age_guess: { type: "string", description: "e.g. 'young adult', or 'unknown'" },
    sex_guess: { type: "string", enum: ["male", "female", "unknown"] },
    care: {
      type: "object",
      properties: {
        diet: { type: "string", description: "one or two sentences: what this animal's everyday diet should be" },
        treats: { ...list, description: "safe occasional treats" },
        never: { ...list, description: "foods and plants that are dangerous for this species" },
        healthy: { ...list, description: "what healthy looks like day to day (eating, droppings, behaviour)" },
        warning_signs: { ...list, description: "signs that need a vet, most urgent first" },
        daily: { ...list, description: "a short daily care checklist" },
      },
      required: ["diet", "treats", "never", "healthy", "warning_signs", "daily"],
    },
  },
  required: ["species", "breed", "colour", "age_guess", "sex_guess", "care"],
};

module.exports = handler(async (body) => {
  const t0 = Date.now();
  const name = text(body.name, 40), notes = text(body.notes, 300);
  const { data } = await spark({
    system: `You set up a FurSight pet profile from a photo. Identify the animal, then write a care plan for that species (and breed, where it matters), written for its owner: plain, specific, practical, no markdown, no em dashes. Lists of 4 to 8 short items. Be accurate and conservative: if unsure of the breed, say "mixed" or "unknown".`,
    text: `Set up a profile for ${name || "this pet"}.${notes ? " Owner notes: " + notes : ""}`,
    images: [image(body.image)],
    schema: SCHEMA,
    name: "Profile",
    maxTokens: 6000,
  });
  return { ...data, ms: Date.now() - t0 };
});
