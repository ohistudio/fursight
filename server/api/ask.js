// Ask anything, with a photo for context: "is he OK?", "is this plant safe?", "how much hay is that?".
//
//   POST /api/ask  { image?: "data:image/jpeg;base64,...", audio?: "<base64 WAV, mono 16-bit 16/24 kHz>",
//                    question?: "typed text instead of audio", pet?: {...}, cam?: true }
// From a linked device (household key), the pet, its care plan and today's diary come from the household, and
// cam: true (or no image at all) looks through the household's pet cam: that's how the glasses, which have no
// camera of their own, can ask "is he OK right now?".
//   ->  { question, answer, about, box: [x1,y1,x2,y2] | null (0-1000), verdict: safe|caution|toxic|vet|none, ms }
//
// The voice goes through Muse Voice Transcribe, then Muse Spark answers from the photo and the pet's profile.
// "about"/"box" say what in the picture the answer is about, so the headset can pin the answer to it.
const { spark, transcribe } = require("../lib/meta");
const { handler, image, text, bad, household } = require("../lib/http");
const { pet: readPet, describe } = require("../lib/pet");
const { context, camFrame } = require("../lib/hub");

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

module.exports = handler(async (body, req) => {
  const t0 = Date.now();
  const home = household(req);
  const ctx = home ? await context(home.token).catch(() => null) : null;
  // the pet: from the household when linked, else what the app sent
  const p = ctx && ctx.pet ? { name: ctx.pet.name, species: ctx.pet.species || "rabbit", breed: ctx.pet.breed || "", notes: [ctx.pet.sex && `${ctx.pet.sex}`, ctx.pet.notes].filter(Boolean).join(". ") } : readPet(body);
  // the picture: the one sent, or a fresh frame from the pet cam
  let img = body.image ? image(body.image) : null, from = img ? "photo" : null;
  if ((!img || body.cam) && ctx && ctx.cams.length) { const f = await camFrame(ctx.cams[0].channel); if (f) { img = f; from = "pet cam"; } }
  let question = text(body.question, 300);
  if (!question && body.audio) {
    if (typeof body.audio !== "string" || body.audio.length > 4_000_000) throw bad("audio must be base64 WAV under ~3 MB");
    question = await transcribe(Buffer.from(body.audio, "base64"), [p.name, p.species, "hay", "pellets", "droppings"].filter(Boolean));
  }
  if (!question) return { question: "", answer: "I didn't catch that. Try again a little closer to the mic.", about: "", box: null, verdict: "none", ms: Date.now() - t0 };
  const tAsr = Date.now();

  const care = ctx && ctx.pet && ctx.pet.care ? `\nCare plan: never ${(ctx.pet.care.never || []).join("; ")}. See a vet if: ${(ctx.pet.care.warning_signs || []).join("; ")}.` : "";
  const diary = ctx && ctx.today.length ? `\nToday's diary (newest first; "food" entries are foods the owner CHECKED, not proof the pet ate them: never assume something was eaten unless an entry says so): ${ctx.today.map((e) => `${new Date(e.at).toISOString().slice(11, 16)} ${e.kind}: ${e.title}${e.verdict ? " (" + e.verdict + ")" : ""}${e.note ? ", " + e.note.slice(0, 120) : ""}`).join(" | ")}` : "";
  const seeing = from === "pet cam" ? "The photo is the latest picture from the pet cam at home." : from ? "The photo is what the owner is looking at." : "There is no photo: answer from the profile, care plan and diary, and say if you'd need to see him.";
  const system = `You are FurSight, a calm, practical pet-care helper. The pet: ${describe(p)}.${care}${diary}
${seeing}
Answer the owner's question using what you can see and what you know about this species. Be specific to this animal.
Keep it short and spoken: at most 45 words, no lists, no markdown, no em dashes (use commas or full stops). If you can SEE or the diary SAYS something urgent for this species (for rabbits: not eating, no droppings, hunched, teeth grinding, bloating), say so plainly and set verdict "vet". A food check in the diary is not a sign of anything: the owner asked about a food, which is what careful owners do. Don't mention past food checks unless the question is about them, and never send someone to the vet because of a check. Never reassure about health from a photo alone; say what to watch for. For food or plant safety, err on the side of caution.
If the answer is about something visible in the photo, give its short name in "about" and its box; otherwise leave both empty.`;
  const { data } = await spark({ system, text: question, images: img ? [img] : [], schema: SCHEMA, name: "Ask" });
  const box = from === "photo" && Array.isArray(data.box) && data.box.length === 4 ? data.box : null;
  return { question, answer: data.answer, about: data.about || "", box, verdict: data.verdict || "none", looked: from, ms: Date.now() - t0, asr_ms: tAsr - t0 };
});
