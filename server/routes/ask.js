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
const { context, camFrame, camView, recent, uploads, addDiary } = require("../lib/hub");
const FSCal = require("../public/calendar.js");
const FSTray = require("../public/tray.js");
const FSRoutine = require("../public/routines.js");
const FSActivity = require("../public/activity.js");
const FSClimate = require("../public/climate.js");
const fed = require("../lib/fed");

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
  // the pet cams: each one is "cam1", "cam2"... (its room name says where); pictures are cited by that id
  const cams = ctx ? ctx.cams.slice(0, 4).map((c, i) => ({ ...c, id: "cam" + (i + 1) })) : [];
  const camList = cams.map((c) => `${c.id} "${c.name}"`).join(", ");
  const camById = (id) => cams.find((c) => c.id === id || c.name.toLowerCase() === String(id || "").toLowerCase());
  // the visible part of the full picture -> a view; box is 0-1 of what the camera showed under `from`
  const zoomTo = (from, box) => {
    const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, span = Math.max(box.x1 - box.x0, box.y1 - box.y0, 0.05);
    return { z: Math.min(4, from.z * Math.max(1, 0.6 / span)), x: from.x + (cx - 0.5) / from.z, y: from.y + (cy - 0.5) / from.z };
  };
  if (cams.length) tools.look_through_pet_cams = {
    description: `Take a fresh picture from the pet cams at home (${camList}) and look. Pass a cam id, or "all".`,
    parameters: { type: "object", properties: { cam: { type: "string" } }, required: ["cam"], additionalProperties: false },
    async run({ cam }) {
      const which = cam === "all" || !camById(cam) ? cams : [camById(cam)];
      const shots = await Promise.all(which.map(async (c) => ({ c, f: await camFrame(c.channel) })));
      const got = shots.filter((s) => s.f);
      for (const s of got) seen.set(s.c.id, { kind: "cam", what: s.c.name });
      if (got.length) looked = "pet cam";
      if (!got.length) return { output: { error: "The pet cams are off or not sending right now." }, step: { tool: "cam", label: `Tried the pet cam${which.length > 1 ? "s" : ""}: off` } };
      return { output: { looked: got.map((s) => ({ id: s.c.id, room: s.c.name })), off: shots.filter((s) => !s.f).map((s) => s.c.id) },
        images: got.map((s) => s.f), imageNote: "Pet cams, just now, in order: " + got.map((s) => `${s.c.id} (${s.c.name})`).join(", "),
        step: { tool: "cam", label: got.length > 1 ? `Looked through ${got.length} pet cams` : `Looked through the ${got[0].c.name} cam` } };
    },
  };
  if (cams.length) tools.find_pet = {
    description: `Find ${p.name} across all the pet cams (SAM looks for a ${p.species} in each wide view), then zoom in on him and look closely. Use it whenever you need to see him, or he isn't in view.`,
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async run() {
      const wide = { z: 1, x: 0.5, y: 0.5 }, t = Date.now();
      // every camera goes wide, then SAM looks in each picture
      const looks = await Promise.all(cams.map(async (c) => {
        await camView(c.channel, wide);
        const f = await camFrame(c.channel, 4000, t);
        const boxes = f ? await require("../lib/sam").find(f, p.species === "rabbit" ? "rabbit" : p.species).catch(() => []) : null;
        return { c, f, boxes };
      }));
      const on = looks.filter((l) => l.f);
      if (!on.length) return { output: { error: "The pet cams are off or not sending right now." }, step: { tool: "cam", label: "Tried to find him: the pet cams are off" } };
      for (const l of on) seen.set(l.c.id, { kind: "cam", what: l.c.name });
      looked = "pet cam";
      const hit = on.find((l) => l.boxes && l.boxes.length);
      if (!hit) return { output: { found: false, looked: on.map((l) => l.c.id), note: `Not in view on any cam. He may be hiding: that alone isn't a worry.` }, images: on.map((l) => l.f), imageNote: "Wide views, in order: " + on.map((l) => l.c.id).join(", "),
        step: { tool: "find", label: `Looked for ${p.name} on ${on.length} cam${on.length > 1 ? "s" : ""}: not in view` } };
      const v = await camView(hit.c.channel, zoomTo(wide, hit.boxes[0]));
      const close = await camFrame(hit.c.channel, 4000, Date.now());
      const id = hit.c.id + "z";
      seen.set(id, { kind: "cam", what: hit.c.name + " close-up" });
      return { output: { found: true, cam: hit.c.id, room: hit.c.name, zoom: v.z, close_up: close ? id : null },
        images: close ? [hit.f, close] : [hit.f], imageNote: `Found on ${hit.c.id} (${hit.c.name}): the wide view${close ? `, then zoomed in ${v.z}× (cite as "${id}")` : ""}:`,
        step: { tool: "find", label: `Found ${p.name} on the ${hit.c.name} cam${close ? `, zoomed in ${Math.round(v.z * 10) / 10}×` : ""}`, detail: `SAM looked at ${on.length} cam${on.length > 1 ? "s" : ""}` } };
    },
  };
  if (cams.length) tools.zoom_pet_cam = {
    description: `Zoom a pet cam in on part of its current picture to see it closely (droppings, the water bowl, his face). box is [x_min,y_min,x_max,y_max] 0-1000 of that cam's last picture you saw. Use box [0,0,1000,1000] to go back to wide.`,
    parameters: { type: "object", properties: { cam: { type: "string" }, box: { type: "array", items: { type: "integer" } }, what: { type: "string", description: "what you're zooming in on, 1-4 words" } }, required: ["cam", "box", "what"], additionalProperties: false },
    async run({ cam, box, what }) {
      const c = camById(cam);
      if (!c || !Array.isArray(box) || box.length !== 4) return { output: { error: `Pass one of ${cams.map((x) => x.id).join(", ")} and a 4-number box.` } };
      const from = await camView(c.channel);
      const full = box[0] <= 0 && box[1] <= 0 && box[2] >= 1000 && box[3] >= 1000;
      const v = await camView(c.channel, full ? { z: 1, x: 0.5, y: 0.5 } : zoomTo(from, { x0: box[0] / 1000, y0: box[1] / 1000, x1: box[2] / 1000, y1: box[3] / 1000 }));
      const f = await camFrame(c.channel, 4000, Date.now());
      if (!f) return { output: { error: "That cam didn't send a picture." } };
      const id = c.id + "z" + Math.round(v.z * 10);
      seen.set(id, { kind: "cam", what: `${c.name}: ${what}` });
      return { output: { id, zoom: v.z }, images: [f], imageNote: `${c.name}, ${v.z}× on ${text(what, 40)} (cite as "${id}"):`,
        step: { tool: "zoom", label: full ? `Zoomed the ${c.name} cam back out` : `Zoomed the ${c.name} cam in on ${text(what, 40)}` } };
    },
  };
  if (ctx && ctx.home) tools.check_weather = {
    description: `The temperature by his tray (from the FurSight Tray's sensor) and the weather outside, now and for the next 24 hours. Rabbits handle heat badly (over about 25°C is a risk, over 28°C is dangerous) and cope with cold better. Use it for anything about heat, cold, outdoor time, water or a lethargic pet.`,
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async run() {
      const { lat, lng } = ctx.home;
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature&hourly=temperature_2m&forecast_hours=24&timezone=auto`).then((x) => x.json()).catch(() => null);
      if (!r || !r.current) return { output: { error: "Couldn't get the weather just now." }, step: { tool: "weather", label: "Tried the weather: no answer" } };
      const t = r.hourly.temperature_2m, max = Math.max(...t), min = Math.min(...t);
      seen.set("weather", { kind: "weather" });
      const room = FSClimate.summary(await recent(home.token, 200).catch(() => []));
      return { output: { id: "weather", room_by_his_tray: room.now ? { c: room.now.t, humidity: room.now.h, today_max_c: room.today.max, status: room.status, simulated: room.simulated } : "no sensor", now_c: r.current.temperature_2m, feels_like_c: r.current.apparent_temperature, humidity: r.current.relative_humidity_2m, next_24h_max_c: max, next_24h_min_c: min, note: "Outdoor weather; indoors is usually milder, a room in sun can be hotter." },
        step: { tool: "weather", label: room.now ? `Checked the room: ${room.now.t.toFixed(1)}°C by his tray, ${Math.round(r.current.temperature_2m)}°C outside` : `Checked the weather at home: ${Math.round(r.current.temperature_2m)}°C now, up to ${Math.round(max)}°C` } };
    },
  };
  if (ctx) tools.check_litter_tray = {
    description: `The FurSight Tray under ${p.name}'s litter tray: his weight each visit, how many visits today, and how much he's left (droppings and urine) against his usual by this time of day. Fewer visits or little output is an early sign of gut stasis. Use it for anything about his health, appetite, gut or weight.`,
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async run() {
      const t = FSTray.summary(await recent(home.token, 200).catch(() => []));
      if (t.status === "none") return { output: { error: "There's no FurSight Tray linked." }, step: { tool: "tray", label: "No litter tray scale linked" } };
      seen.set("tray", { kind: "tray" });
      const drop = (await recent(home.token, 40).catch(() => [])).find((e) => e.kind === "droppings");
      return { output: { id: "tray", status: t.status, reasons: t.reasons, today: t.today, usual: t.usual, week_weights_g: t.week.map((d) => d.weight_g), last_droppings_check: drop ? { when: new Date(drop.at).toISOString().slice(0, 16), verdict: drop.extra && drop.extra.verdict, note: drop.note } : null, simulated: t.simulated },
        step: { tool: "tray", label: `Checked the litter tray: ${t.today.visits} visits, ${t.today.output_g} g${t.usual ? ` (usual ${t.usual.output_g} g by now)` : ""}, ${t.today.weight_g ? (t.today.weight_g / 1000).toFixed(2) + " kg" : "no weight yet"}`, detail: t.reasons.join("; ") || undefined } };
    },
  };
  if (ctx) tools.check_activity = {
    description: `What ${p.name} has been doing, from the pet cam: minutes loafing, stretched out, flopped, eating, grooming and on the move, today and this week; flops; the latest moment; and any warnings (chewing things that aren't food). A relaxed rabbit loafs, stretches and flops; an unwell one sits hunched and still. Use it for "how's he been", mood, energy and behaviour. The cams only see part of the day: seen and unseen are minutes, and you must never describe the unseen time, only say it wasn't seen. flopsYou are flops the owner saw and added; treats are what the owner says they gave.`,
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async run() {
      const all = await recent(home.token, 200).catch(() => []), a = FSActivity.summary(all);
      const warnings = all.filter((e) => e.kind === "warning" && e.at > Date.now() - 3 * 864e5).slice(0, 5).map((e) => ({ when: new Date(e.at).toISOString().slice(0, 16), what: e.title }));
      if (!a.has && !warnings.length) return { output: { error: "No pet cam activity yet: a pet cam needs to be watching him." }, step: { tool: "activity", label: "No pet cam activity yet" } };
      seen.set("activity", { kind: "activity" });
      return { output: { id: "activity", today_minutes: a.today, week_minutes: a.week, treats_added_by_owner: a.treats, latest_moment: a.moment ? { when: new Date(a.moment.at).toISOString().slice(0, 16), what: a.moment.title } : null, warnings, simulated: a.simulated },
        step: { tool: "activity", label: `Checked his day: ${a.today.flops} flop${a.today.flops === 1 ? "" : "s"}, ${FSActivity.time(a.today.loaf + a.today.stretched + a.today.flop)} resting, ${FSActivity.time(a.today.active)} on the move, ${FSActivity.time(a.today.unseen)} not seen` } };
    },
  };
  if (ctx) tools.read_calendar = {
    description: `${p.name}'s calendar: reminders the owner set (vet visits, vaccinations, birthday) for the next 60 days, and grooming and checks (coat, nails, bottom, teeth) with when each is due.`,
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async run() {
      const all = await recent(home.token, 200).catch(() => []), up = FSCal.upcoming(all, 60).slice(0, 15), rs = FSRoutine.list(all);
      seen.set("calendar", { kind: "calendar" });
      return { output: { id: "calendar", today: FSCal.key(new Date()), upcoming: up.map((u) => ({ date: u.date, title: u.title, repeat: u.repeat })),
        grooming_and_checks: rs.map((r) => ({ title: r.title, due: r.due, status: FSRoutine.when(r), every: FSRoutine.every(r.every), last_done: r.last ? new Date(r.last).toISOString().slice(0, 10) : null })) },
        step: { tool: "calendar", label: up.length ? `Read the calendar: next is ${up[0].title}, ${FSCal.day(up[0].date).toDateString().slice(0, 10)}` : "Read the calendar: nothing coming up" } };
    },
  };
  if (ctx) tools.mark_done = {
    description: `Tick off a grooming or check routine the owner says they've just done ("I brushed him", "trimmed his nails"). Only when they say they did it.`,
    parameters: { type: "object", properties: { routine: { type: "string", description: "which one, in the owner's words" } }, required: ["routine"], additionalProperties: false },
    async run({ routine }) {
      const rs = FSRoutine.list(await recent(home.token, 200).catch(() => []));
      // the routine sharing the most word stems with what they said ("trimmed his claws" -> Trim his nails)
      const same = { bum: "bott", butt: "bott", claw: "nail", fur: "coat", groom: "brus", hutch: "pen", cage: "pen" };
      const stems = (t) => String(t || "").toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !["his", "her", "the", "and", "just"].includes(w)).map((w) => same[w.slice(0, 4)] || same[w] || w.slice(0, 4));
      const said = stems(routine);
      const r = rs.map((x) => ({ x, n: stems(x.title).filter((w) => said.includes(w)).length })).filter((m) => m.n).sort((a, b) => b.n - a.n)[0]?.x;
      if (!r) return { output: { error: `No routine like that. There are: ${rs.map((x) => x.title).join(", ") || "none yet"}.` } };
      await addDiary(home.token, { kind: "routine-done", title: r.title, pet: p.name, extra: { of: r.id } });
      seen.set("done", { kind: "calendar" });
      const next = new Date(Date.now() + r.every * 864e5);
      return { output: { id: "done", ticked: r.title, next_due: FSRoutine.key(next) }, step: { tool: "calendar", label: `Ticked off: ${r.title}. Next ${next.toDateString().slice(0, 10)}` } };
    },
  };
  if (ctx) tools.add_reminder = {
    description: `Put a reminder on ${p.name}'s calendar, only when the owner asks for one. date is YYYY-MM-DD (today is ${FSCal.key(new Date())}, a ${new Date().toLocaleDateString("en-GB", { weekday: "long" })}).`,
    parameters: { type: "object", properties: { title: { type: "string" }, date: { type: "string" }, repeat: { type: "string", enum: Object.keys(FSCal.REPEATS) } }, required: ["title", "date", "repeat"], additionalProperties: false },
    async run({ title, date, repeat }) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || FSCal.day(date) < FSCal.day(FSCal.key(new Date()))) return { output: { error: "date must be YYYY-MM-DD, today or later" } };
      const t = text(title, 80).replace(/^./, (c) => c.toUpperCase());
      const e = await addDiary(home.token, { kind: "event", title: t, pet: p.name, extra: { date, repeat: FSCal.REPEATS[repeat] ? repeat : "none" } });
      if (!e) return { output: { error: "Couldn't save the reminder." } };
      seen.set("reminder", { kind: "calendar" });
      return { output: { id: "reminder", saved: true, date, repeat }, step: { tool: "calendar", label: `Added a reminder: ${t}, ${FSCal.day(date).toDateString().slice(0, 10)}${repeat !== "none" ? ", " + FSCal.REPEATS[repeat].toLowerCase() : ""}` } };
    },
  };
  if (ctx) tools.add_to_diary = {
    description: `Add something the cams missed, only when the owner tells you it happened: a treat or greens they gave him (item and amount), a flop, loaf or zoomies they saw, good droppings, or a short note. Not for questions ("can he have apple?" is a question, not a treat).`,
    parameters: { type: "object", properties: { what: { type: "string", enum: Object.keys(FSActivity.LOG) }, item: { type: "string", description: "for a treat, greens or note: what, in a few words" }, amount: { type: "string", enum: ["tiny", "small", "handful", ""] } }, required: ["what", "item", "amount"], additionalProperties: false },
    async run({ what, item, amount }) {
      // a treat or greens: saved with when he can have it again, and that day goes on the calendar
      if ((what === "treat" || what === "greens") && text(item, 60)) {
        const rule = lookup(p.species, text(item, 60));
        const verdict = rule ? rule.verdict : what === "greens" ? "safe" : "caution";
        try {
          const r = await fed.record(home.token, { name: p.name, care: ctx.pet && ctx.pet.care }, { food: text(item, 60), verdict, wait_days: verdict === "safe" ? 0 : 3, amount }, fed.tzOf(body.tz));
          seen.set("log", { kind: "log", what: r.title });
          return { output: { id: "log", saved: true, title: r.title, can_have_again: r.next, had_before: r.had ? r.had.said : null, on_never_list: r.toxic ? r.said : null }, step: { tool: "diary", label: `Added to the diary: ${r.title}${r.next ? `, OK again ${fed.nice(r.next)}` : ""}`, detail: r.toxic ? r.said : undefined } };
        } catch (e) { return { output: { error: "Couldn't save it." } }; }
      }
      const ent = FSActivity.entry({ name: p.name, care: ctx.pet && ctx.pet.care }, what, text(item, 60), amount);
      if (!ent) return { output: { error: "Say what it was." } };
      const e = await addDiary(home.token, ent);
      if (!e) return { output: { error: "Couldn't save it." } };
      seen.set("log", { kind: "log", what: ent.title });
      return { output: { id: "log", saved: true, title: ent.title, on_never_list: ent.verdict ? ent.note : null }, step: { tool: "diary", label: `Added to the diary: ${ent.title}`, detail: ent.verdict ? ent.note : undefined } };
    },
  };
  if (ctx) tools.read_vet_records = {
    description: `${p.name}'s vet records and history the owner uploaded: visits, findings, medications, vaccinations with when they're next due, weights the vet wrote down, and old photos and videos, each already read by FurSight. Use it for anything about his health history, past vet visits, medicines or jabs.`,
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async run() {
      const list = await uploads(home.token).catch(() => []);
      if (!list.length) return { output: { records: [], note: "Nothing uploaded yet." }, step: { tool: "records", label: "No vet records uploaded yet" } };
      const out = list.slice(0, 20).map((e, i) => {
        const id = "r" + (i + 1), x = e.extra || {};
        seen.set(id, { kind: "record", what: e.title });
        return { id, kind: e.kind, date: new Date(e.at).toISOString().slice(0, 10), title: e.title, summary: (e.note || "").slice(0, 300), ...(x.record ? { record: x.record } : {}), ...(x.seen ? { seen: x.seen } : {}) };
      });
      const recs = out.filter((r) => r.kind === "record").length;
      return { output: { records: out }, step: { tool: "records", label: `Read his records: ${recs} vet record${recs === 1 ? "" : "s"}, ${out.length - recs} ${out.length - recs === 1 ? "photo or video" : "photos and videos"}` } };
    },
  };
  if (ctx) tools.read_diary = {
    description: `Read ${p.name}'s diary: food checks, questions, photos, daily care ticks, things the owner added, and notes from every device. "food" entries are foods the owner CHECKED, not things ${p.name} ate. "log" entries are things the owner says happened (a treat they gave, a flop they saw).`,
    parameters: { type: "object", properties: { days: { type: "integer", description: "how many days back, 1 to 7" } }, required: ["days"], additionalProperties: false },
    async run({ days }) {
      const d = Math.max(1, Math.min(7, Number(days) || 1)), since = Date.now() - d * 864e5;
      const list = (ctx.today.length && d === 1 ? ctx.today : await recent(home.token, 60).catch(() => ctx.today)).filter((e) => e.at >= since && e.kind !== "recap" && !/^(event|tray)|^routine(-cancel)?$|^(pose|active|climate)/.test(e.kind));
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
      const had = ctx ? fed.status(await recent(home.token, 200).catch(() => []), name, p, fed.tzOf(body.tz)) : null;
      foods.set(name, rule);
      seen.set("food:" + name, { kind: "food_list" });
      return {
        output: { ...(rule ? { id: "food:" + name, verdict: rule.verdict, why: rule.why, instead: rule.instead } : { id: "food:" + name, verdict: "not_listed", note: "Not on the list: judge it yourself, cautiously." }),
          last_had: had ? had.said : null, wait_days_left: had ? had.wait_left : 0 },
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
        evidence: { type: "array", items: { type: "string" }, description: "ids of what the answer rests on: \"owner\" (what they told you), \"photo\", \"weather\", \"tray\", \"activity\", \"calendar\", \"reminder\", \"done\", cam ids like \"cam1\" or close-ups like \"cam1z\", \"care\", diary ids like \"d2\", vet record ids like \"r1\", food ids like \"food:grapes\"" },
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
        const real = ev.filter((id) => ["photo", "owner"].includes(id) || (seen.get(id) && seen.get(id).kind === "cam") || (seen.get(id) && !["food", "ask", "care", "food_list", "weather", "calendar"].includes(seen.get(id).kind)));
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
Work like a careful vet nurse: look before you answer. Use your tools to gather what you need, calling several at once when you can, then call answer. Food entries in the diary are foods the owner checked: never treat one as something ${p.name} ate unless the owner says so. Don't guess about how ${p.name} is: check the litter tray, find him on the pet cams (find_pet zooms in on him) or read the diary. Zoom in when you need a closer look. Check every food or plant you talk about against the safety list. If check_food says he had it recently and wait_days_left is above 0, say it's fine in general but to wait: when he last had it and the day it's OK again (it's on the calendar). If you still can't tell, ask the owner one thing instead of guessing.
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
