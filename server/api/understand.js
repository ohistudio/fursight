// Understand something the owner uploads: an old photo, a few frames from a video, or the pages of a vet
// record (a letter, invoice, vaccination card, lab result). Muse Spark reads it and pulls out what matters,
// so the diary, the calendar and the Ask agent can use it. Nothing is invented: blanks stay blank.
//
//   POST /api/understand  { kind: photo|video|record, images: [dataURL, ...] (1 to 4), pet, note? }  (a household device)
//   -> { title, summary, date, verdict: normal|watch|vet, record: {...}, seen: {...}, ms }
const { spark } = require("../lib/meta");
const { handler, image, bad } = require("../lib/http");
const { pet: readPet, describe } = require("../lib/pet");

const str = (description) => ({ type: "string", description });
const SCHEMA = {
  type: "object",
  properties: {
    title: str("3-7 words, like a diary heading, e.g. 'Annual check-up at Riverside Vets' or 'Zoomies in the hallway'"),
    summary: str("two or three plain sentences for the owner: what it is and what matters"),
    date: str("the date it shows or is about, YYYY-MM-DD, or empty if it doesn't say"),
    verdict: { type: "string", enum: ["normal", "watch", "vet"], description: "vet only if it shows or says something needing a vet now; watch for anything to keep an eye on" },
    record: {
      type: "object", description: "for a vet record; empty strings and lists for a photo or video",
      properties: {
        clinic: str("the practice or vet's name, or empty"),
        reason: str("why he was seen, or empty"),
        weight_g: { type: "number", description: "his weight in grams if written down, else 0" },
        findings: { type: "array", items: { type: "string" }, description: "diagnoses or findings, short" },
        medications: { type: "array", items: { type: "object", properties: { name: str(""), dose: str("how much and how often"), until: str("YYYY-MM-DD or empty") }, required: ["name", "dose", "until"], additionalProperties: false } },
        vaccinations: { type: "array", items: { type: "object", properties: { name: str(""), given: str("YYYY-MM-DD or empty"), next_due: str("YYYY-MM-DD or empty") }, required: ["name", "given", "next_due"], additionalProperties: false } },
        follow_up: { type: "object", properties: { date: str("YYYY-MM-DD or empty"), what: str("") }, required: ["date", "what"], additionalProperties: false },
      },
      required: ["clinic", "reason", "weight_g", "findings", "medications", "vaccinations", "follow_up"], additionalProperties: false,
    },
    seen: {
      type: "object", description: "for a photo or video; empty for a record",
      properties: {
        doing: str("what he's doing, or empty"),
        pose: { type: "string", enum: ["loaf", "stretched", "flop", "sitting", "eating", "grooming", "active", "chewing", "other", ""] },
        health_notes: { type: "array", items: { type: "string" }, description: "anything visible a careful owner would want to know: coat, eyes, posture, droppings, hazards. Empty if nothing" },
      },
      required: ["doing", "pose", "health_notes"], additionalProperties: false,
    },
  },
  required: ["title", "summary", "date", "verdict", "record", "seen"], additionalProperties: false,
};

const WHAT = { photo: "an old photo", video: "frames from a video, in order", record: "the pages of a vet record or document" };

module.exports = handler(async (body) => {
  const t0 = Date.now();
  const kind = WHAT[body.kind] ? body.kind : null;
  if (!kind) throw bad("kind must be photo, video or record");
  const images = (Array.isArray(body.images) ? body.images : []).slice(0, 4).map((u, i) => image(u, `images[${i}]`));
  if (!images.length) throw bad("images required");
  const p = readPet(body);
  const { data } = await spark({
    system: `You help the owner of ${describe(p)} keep a record of their pet. The owner uploaded ${WHAT[kind]}. Read it carefully and only report what it actually shows or says: never guess a date, dose or weight that isn't written or visible. A vet record may be handwritten, a printout or a photo of paper; read it like a careful nurse would. Plain words, no markdown, no emoji, no em dashes.`,
    text: `What is this, and what should go in ${p.name || "the pet"}'s record?${body.note ? ` The owner says: ${String(body.note).slice(0, 300)}` : ""}`,
    images, schema: SCHEMA, name: "Upload", effort: kind === "record" ? "medium" : "low",
  });
  return { ...data, ms: Date.now() - t0 };
});
