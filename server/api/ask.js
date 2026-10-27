// Ask anything, with a photo for context: "is he OK?", "is this plant safe?", "how much hay is that?".
//
//   POST /api/ask  { image?: "data:image/jpeg;base64,...", audio?: "<base64 WAV, mono 16-bit 16/24 kHz>",
//                    question?: "typed text instead of audio", pet?: {...}, cam?: true, from?: "glasses"|"quest"|"phone",
//                    followup?: { asked: "what FurSight asked", question?: "the original question", reply?: "the owner's reply" } }
//   (a followup without reply takes the spoken or typed question as the reply)
//   ->  { question, answer, about, box: [x1,y1,x2,y2] | null (0-1000), verdict: safe|caution|toxic|vet|none,
//         looked, steps: [{ tool, label, detail?, kind? }], needs: { ask, want } | null, ms }
//
// An agent, not a single call: Muse Spark picks its own tools, one per turn (look through the pet cam, read the
// diary, read the care plan, check a food against the safety list, ask the owner) until it answers. The checks
// live inside the answer tool, so the model can't skip them: it must cite what it actually looked at, it can't
// send anyone to the vet without seeing something, a food check is never a sign of illness, and it can't call
// something safe that the safety list says isn't. "steps" is how it decided, shown in the app and the diary.
const { transcribe } = require("../lib/meta");
const { run, user } = require("../lib/agent");
const { lookup } = require("../lib/verdict");
const { handler, image, text, bad, household } = require("../lib/http");
const { pet: readPet, describe } = require("../lib/pet");
const { context, camFrame } = require("../lib/hub");

const RANK = { safe: 0, caution: 1, toxic: 2 };
const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const hhmm = (t) => new Date(t).toISOString().slice(11, 16);

module.exports = handler(async (body, req) => {
  const t0 = Date.now();
  const home = household(req);
  const ctx = home ? await context(home.token).catch(() => null) : null;
  const p = ctx && ctx.pet ? { name: ctx.pet.name, species: ctx.pet.species || "rabbit", breed: ctx.pet.breed || "", notes: [ctx.pet.sex, ctx.pet.notes].filter(Boolean).join(". ") } : readPet(body);
  const from = ["glasses", "quest", "phone"].includes(body.from) ? body.from : "phone";
  const photo = body.image ? image(body.image) : null;

  let question = text(body.question, 300);
  if (!question && body.audio) {
    if (typeof body.audio !== "string" || body.audio.length > 4_000_000) throw bad("audio must be base64 WAV under ~3 MB");
    question = await transcribe(Buffer.from(body.audio, "base64"), [p.name, p.species, "hay", "pellets", "droppings"].filter(Boolean));
  }
  if (!question) return { question: "", answer: "I didn't catch that. Try again a little closer to the mic.", about: "", box: null, verdict: "none", steps: [], needs: null, ms: Date.now() - t0 };
  const tAsr = Date.now();
  // a reply to something FurSight asked back: the reply can come spoken (audio) like a question
  let fu = body.followup && body.followup.asked ? { asked: text(body.followup.asked, 200), reply: text(body.followup.reply, 300) } : null;
  if (fu && !fu.reply) { fu.reply = question; question = text(body.followup.question, 300) || question; }

  // what the agent has looked at this run: only these can be cited
  const seen = new Map();          // id -> { kind, what }
  const foods = new Map();         // food -> safety list rule (or null)
  const steps = [];
  let looked = null, refusals = 0;
  seen.set("owner", { kind: "owner" });   // what the owner said in the question
  if (photo) { seen.set("photo", { kind: "photo" }); looked = "photo"; steps.push({ tool: "photo", label: from === "quest" ? "Looked at what you're looking at" : "Looked at your photo" }); }

  const tools = {};
  if (ctx && ctx.cams.length) tools.look_through_pet_cam = {
    description: `Take a fresh picture from the pet cam at home (${ctx.cams[0].name || "pet cam"}) and look at it. Use it for anything about how ${p.name} is right now.`,
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async run() {
      const f = await camFrame(ctx.cams[0].channel);
      if (!f) return { output: { error: "The pet cam is off or not sending right now." }, step: { tool: "cam", label: "Tried the pet cam: it's off" } };
      seen.set("cam", { kind: "cam" }); looked = "pet cam";
      return { output: { ok: true, id: "cam", note: "The frame follows." }, images: [f], imageNote: "Pet cam, just now (cite as \"cam\"):", step: { tool: "cam", label: "Looked through the pet cam" } };
    },
  };
  if (ctx) tools.read_diary = {
    description: `Read ${p.name}'s diary: food checks, questions, photos, daily care ticks and notes from every device. "food" entries are foods the owner CHECKED, not things ${p.name} ate.`,
    parameters: { type: "object", properties: { days: { type: "integer", description: "how many days back, 1 to 7" } }, required: ["days"], additionalProperties: false },
    async run({ days }) {
      const d = Math.max(1, Math.min(7, Number(days) || 1)), since = Date.now() - d * 864e5;
      const list = (ctx.today.length && d === 1 ? ctx.today : await require("../lib/hub").recent(home.token, 60).catch(() => ctx.today)).filter((e) => e.at >= since && e.kind !== "recap");
      const out = list.slice(0, 25).map((e, i) => {
        const id = "d" + (seen.size + i + 1);
        seen.set(id, { kind: e.kind, what: e.title });
        return { id, when: (d > 1 ? new Date(e.at).toISOString().slice(5, 10) + " " : "") + hhmm(e.at), kind: e.kind, title: e.title, verdict: e.verdict, note: (e.note || "").slice(0, 140) };
      });
      return { output: { entries: out }, step: { tool: "diary", label: `Read the diary: ${out.length} ${out.length === 1 ? "entry" : "entries"}${d > 1 ? ` from ${d} days` : " from today"}` } };
    },
  };
  if (ctx && ctx.pet && ctx.pet.care) tools.read_care_plan = {
    description: `Read ${p.name}'s care plan: everyday diet, treats, foods never to give, what healthy looks like, warning signs.`,
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async run() {
      seen.set("care", { kind: "care" });
      const c = ctx.pet.care;
      return { output: { id: "care", diet: c.diet, treats: c.treats, never: c.never, healthy: c.healthy, warning_signs: c.warning_signs }, step: { tool: "care", label: `Read ${p.name}'s care plan` } };
    },
  };
  tools.check_food = {
    description: `Check one food or plant against the ${p.species} safety list (RWAF and House Rabbit Society guidance). Call it for every food or plant your answer is about.`,
    parameters: { type: "object", properties: { food: { type: "string" } }, required: ["food"], additionalProperties: false },
    async run({ food }) {
      const name = text(food, 60).toLowerCase(), rule = lookup(p.species, name);
      foods.set(name, rule);
      seen.set("food:" + name, { kind: "food_list" });
      return {
        output: rule ? { id: "food:" + name, verdict: rule.verdict, why: rule.why, instead: rule.instead } : { id: "food:" + name, verdict: "not_listed", note: "Not on the list: judge it yourself, cautiously." },
        step: { tool: "food", label: rule ? `Checked the safety list: ${name}, ${rule.verdict === "toxic" ? "don't" : rule.verdict === "caution" ? "small treat only" : "safe"}` : `Checked the safety list: ${name}, not listed` },
      };
    },
  };
  tools.ask_owner = {
    description: `When you can't tell from what you can see, ask the owner for one thing instead of guessing. ${from === "glasses" ? "They're on Ray-Ban Display glasses, which have no camera: ask them to describe it, or look through the pet cam yourself." : "They can take a photo."} This ends your turn; you'll get their reply.`,
    parameters: { type: "object", properties: { ask: { type: "string", description: "one short spoken question" }, want: { type: "string", enum: from === "glasses" ? ["answer"] : ["photo", "answer"] } }, required: ["ask", "want"], additionalProperties: false },
    async run({ ask, want }) {
      const a = text(ask, 200).replace(/\s*[—–]\s*/g, ", ");
      return { output: { ask: a, want }, done: "needs_input", step: { tool: "ask", label: "Asked you instead of guessing", detail: a } };
    },
  };
  tools.answer = {
    description: "Give the final answer. It is checked before it reaches the owner; if it is refused, fix what the error says and call answer again.",
    parameters: {
      type: "object",
      properties: {
        answer: { type: "string", description: "spoken style, at most 45 words, no lists, no markdown" },
        verdict: { type: "string", enum: ["safe", "caution", "toxic", "vet", "none"], description: "only for safety or health questions; vet = see a vet today" },
        evidence: { type: "array", items: { type: "string" }, description: "ids of what the answer rests on: \"owner\" (what they told you), \"photo\", \"cam\", \"care\", diary ids like \"d2\", food ids like \"food:grapes\"" },
        about: { type: "string", description: "short name of the thing in the photo the answer is about, or empty" },
        box: { type: "array", items: { type: "integer" }, description: "[x_min,y_min,x_max,y_max] 0-1000 of that thing in the photo, or []" },
      },
      required: ["answer", "verdict", "evidence", "about", "box"],
      additionalProperties: false,
    },
    async run(a) {
      const ev = (Array.isArray(a.evidence) ? a.evidence : []).map(String);
      const problems = [];
      const unknown = ev.filter((id) => !seen.has(id));
      if (!ev.length) problems.push("Cite what the answer rests on in evidence.");
      if (unknown.length) problems.push(`You haven't looked at ${unknown.join(", ")}. Cite only: ${[...seen.keys()].join(", ") || "nothing yet, so look first"}.`);
      // a food check or an earlier question in the diary says what the owner asked about, not what happened
      const q = question.toLowerCase();
      for (const id of ev) {
        const e = seen.get(id);
        if (e && (e.kind === "food" || e.kind === "ask") && !String(e.what || "").toLowerCase().split(/\W+/).some((w) => w.length > 3 && q.includes(w)))
          problems.push(`${id} is a ${e.kind === "food" ? "food check" : "past question"}: the owner asked about it, it doesn't mean anything happened. Don't use it here.`);
      }
      // "see a vet", by verdict or in the words, needs something real behind it
      if (a.verdict === "vet" || /\b(vet|veterinar)/i.test(a.answer || "")) {
        const real = ev.filter((id) => ["cam", "photo", "owner"].includes(id) || (seen.get(id) && !["food", "ask", "care", "food_list"].includes(seen.get(id).kind)));
        if (!real.length || (real.length === 1 && real[0] === "owner" && !/\b(ate|eaten|eating|had|gave|swallow|chew|sick|not|won.?t|hasn.?t|isn.?t|stopp|hunch|grind|bloat|letharg|diarr|blood)/i.test(question)))
          problems.push("Sending someone to the vet needs something real: what you saw (photo or cam), a diary entry about his health, or the owner telling you something happened. A food check or a question is not a sign of illness.");
      }
      for (const [food, rule] of foods) if (rule && RANK[a.verdict] !== undefined && RANK[rule.verdict] > RANK[a.verdict])
        problems.push(`The safety list says ${food} is ${rule.verdict}: ${rule.why} Your verdict can't be milder.`);
      const about = text(a.about, 60).toLowerCase(), aboutRule = about && lookup(p.species, about);
      if (aboutRule && !foods.has(about) && !problems.length) problems.push(`Call check_food for "${about}" first.`);
      if (words(a.answer) > 60) problems.push("Too long: at most 45 words.");
      if (problems.length && ++refusals < 3) {
        return { output: { error: problems.join(" ") }, step: { tool: "check", kind: "check", label: "A check stopped an answer", detail: problems[0] } };
      }
      // after three refusals: the safety list still wins, and the step says the checks didn't all pass
      let verdict = a.verdict;
      for (const [, rule] of foods) if (rule && RANK[verdict] !== undefined && RANK[rule.verdict] > RANK[verdict]) verdict = rule.verdict;
      const out = { answer: String(a.answer).replace(/\s*[—–]\s*/g, ", "), verdict, about: text(a.about, 60), box: a.box, evidence: ev.filter((id) => seen.has(id)) };
      return { output: out, done: "answered", step: { tool: "answer", label: problems.length ? "Answered, but not every check passed" : "Answered, checks passed", kind: problems.length ? "warn" : "ok" } };
    },
  };

  const intro = `You are FurSight, a calm, practical pet-care helper. The pet: ${describe(p)}. The owner is asking from their ${from}.
Work like a careful vet nurse: look before you answer. Use your tools to gather what you need, calling several at once when you can, then call answer. Food entries in the diary are foods the owner checked: never treat one as something ${p.name} ate unless the owner says so. Don't guess about how ${p.name} is: look through the pet cam or read the diary. Check every food or plant you talk about against the safety list. If you still can't tell, ask the owner one thing instead of guessing.
Answers: short and spoken, at most 45 words, no lists, no markdown, no em dashes. If you SEE or the diary SAYS something urgent for this species (for rabbits: not eating, no droppings, hunched, teeth grinding, bloating), say so plainly and set verdict "vet". Never reassure about health from a picture alone; say what to watch for. For food or plant safety, err on the side of caution.`;
  const first = [{ type: "input_text", text: question }];
  if (photo) first.push({ type: "input_text", text: from === "quest" ? "What the owner is looking at (cite as \"photo\"):" : "The owner's photo (cite as \"photo\"):" }, { type: "input_image", image_url: photo });
  const input = [];
  if (fu) input.push(user(`I asked this and FurSight asked me back: "${fu.asked}" My reply: ${fu.reply || "(see the photo)"}`));
  input.push({ role: "user", content: first });

  const r = await run({ instructions: intro, input, tools, turns: 6 });
  const ordered = [...steps, ...r.steps].slice(0, 14);
  const ms = Date.now() - t0, asr_ms = tAsr - t0;
  if (r.done === "needs_input") return { question, answer: r.result.ask, about: "", box: null, verdict: "none", looked, steps: ordered, needs: r.result, turns: r.turns, ms, asr_ms };
  if (!r.result) return { question, answer: `I couldn't work that out just now. If you're worried about ${p.name}, call your vet.`, about: "", box: null, verdict: "none", looked, steps: ordered, needs: null, turns: r.turns, ms, asr_ms };
  const box = looked === "photo" && Array.isArray(r.result.box) && r.result.box.length === 4 ? r.result.box : null;
  return { question, answer: r.result.answer, about: r.result.about || "", box, verdict: r.result.verdict || "none", evidence: r.result.evidence, looked, steps: ordered, needs: null, turns: r.turns, ms, asr_ms };
});
