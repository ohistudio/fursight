// Ask anything, with a photo for context: "is he OK?", "is this plant safe?", "how much hay is that?".
//
//   POST /api/ask  { image: "data:image/jpeg;base64,...", audio?: "<base64 WAV, mono 16-bit 16/24 kHz>",
//                    question?: "typed text instead of audio", pet: {...} }
//   ->  { question, answer, about, box: [x1,y1,x2,y2] | null (0-1000), verdict: safe|caution|toxic|vet|none, ms }
//
// The voice goes through Muse Voice Transcribe, then Muse Spark answers from the photo and the pet's profile.
// "about"/"box" say what in the picture the answer is about, so the headset can pin the answer to it.
const { spark, transcribe } = require("../lib/meta");
const { handler, image, text, bad } = require("../lib/http");
const { pet: readPet, describe } = require("../lib/pet");

const SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string", description: "the reply, spoken style, at most 45 words" },
    about: { type: "string", description: "short name of the thing in the photo the answer is about, or empty" },
    box: { type: "array", items: { type: "integer" }, description: "[x_min,y_min,x_max,y_max] 0-1000 of that thing, or [] if none" },
    verdict: { type: "string", enum: ["safe", "caution", "toxic", "vet", "none"], description: "only when the question is about safety or health; vet = see a vet today" },
  },
  required: ["answer", "about", "box", "verdict"],
};

module.exports = handler(async (body) => {
  const t0 = Date.now();
  const img = image(body.image);
  const p = readPet(body);
  let question = text(body.question, 300);
  if (!question && body.audio) {
    if (typeof body.audio !== "string" || body.audio.length > 4_000_000) throw bad("audio must be base64 WAV under ~3 MB");
    question = await transcribe(Buffer.from(body.audio, "base64"), [p.name, p.species, "hay", "pellets", "droppings"].filter(Boolean));
  }
  if (!question) return { question: "", answer: "I didn't catch that. Try again a little closer to the mic.", about: "", box: null, verdict: "none", ms: Date.now() - t0 };
  const tAsr = Date.now();

  const system = `You are FurSight, a calm, practical pet-care helper looking through the owner's glasses. The pet: ${describe(p)}.
Answer the owner's question using the photo (what they are looking at) and what you know about this species. Be specific to this animal.
Keep it short and spoken: at most 45 words, no lists, no markdown, no em dashes (use commas or full stops). If something could be urgent for this species (for rabbits: not eating, no droppings, hunched, teeth grinding, bloating), say so plainly and set verdict "vet". Never reassure about health from a photo alone; say what to watch for. For food or plant safety, err on the side of caution.
If the answer is about something visible in the photo, give its short name in "about" and its box; otherwise leave both empty.`;
  const { data } = await spark({ system, text: question, images: [img], schema: SCHEMA, name: "Ask" });
  const box = Array.isArray(data.box) && data.box.length === 4 ? data.box : null;
  return { question, answer: data.answer, about: data.about || "", box, verdict: data.verdict || "none", ms: Date.now() - t0, asr_ms: tAsr - t0 };
});
