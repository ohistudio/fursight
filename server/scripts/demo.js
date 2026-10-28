// A demo household full of mock data: two weeks of Xiaosi's tray, room, activity, care and checks, so every
// screen (web, glasses, iPhone, Stats, Wrapped) has something to show before the hardware arrives.
// It makes a NEW household on the hub, so the real one is never touched. Everything is marked simulated.
//
//   node scripts/demo.js [photo-from-token]
//
// Pass a device token from the real household to copy Xiaosi's photo across (for his cards and the moment).
// Prints a link that opens the web app signed in to the demo household.
const FSActivity = require("../public/activity.js");
const HUB = "https://fursight-cam.wibble-crossplay.workers.dev/hub";
const WEB = process.env.WEB || "http://localhost:3030";

let token = null;
async function hub(path, body, method = body ? "POST" : "GET", t = token) {
  const r = await fetch(HUB + path, { method, headers: { "content-type": "application/json", ...(t ? { authorization: "Bearer " + t } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

// the same numbers every run, so the demo looks the same each time
let seed = 7;
const rnd = (a, b) => { seed = (seed * 16807) % 2147483647; return a + ((seed - 1) / 2147483646) * (b - a); };
const int = (a, b) => Math.round(rnd(a, b));
const pad = (n) => String(n).padStart(2, "0");
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date(), H = 36e5, D = 24 * H;
const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
const at = (daysAgo, hour) => midnight - daysAgo * D + hour * H;
const DAYS = 13;
const NAME = "Xiaosi";

const CARE = {
  daily: ["Provide unlimited timothy hay and fresh water", "Offer a small handful of leafy greens", "Give 2 to 4 hours of supervised exercise time", "Spot clean litter box and bedding area", "Check droppings, appetite and behaviour", "Rabbit proof cords and small objects on floor"],
  diet: "Unlimited timothy hay every day plus a small portion of plain timothy based pellets and a daily mix of rabbit safe leafy greens, with fresh water always available.",
  healthy: ["Eats hay daily and drinks water regularly", "Produces plenty of round dry pellets", "Active, curious and responsive", "Clear eyes and nose with clean ears", "Smooth coat with no bald patches", "Hops comfortably with no limping"],
  never: ["Onion, garlic, chives and leeks", "Chocolate, candy, bread and crackers", "Nuts, seeds and corn", "Avocado and potato", "Rhubarb and buttercup", "Lilies and most houseplants"],
  treats: ["Tiny piece of apple without seeds", "Thin slice of carrot", "Small slice of banana", "Fresh cilantro, parsley or dill", "Small piece of romaine or bok choy", "Dried timothy hay cubes"],
  warning_signs: ["Not eating or not pooping for 12 hours", "Sitting hunched, grinding teeth or bloated belly", "Labored breathing or mouth breathing", "Watery diarrhea or very few small droppings", "Head tilt, loss of balance or seizures", "Runny eyes, sneezing or nasal discharge", "Not drinking, lethargy or sudden behavior change"],
};

async function photo(from) {
  if (!from) return null;
  try {
    const me = await hub("/me", null, "GET", from);
    const p = me.pets.find((x) => x.has_photo);
    if (!p) return null;
    const r = await fetch(`${HUB}/pets/${p.id}/photo`, { headers: { authorization: "Bearer " + from } });
    return r.ok ? "data:image/jpeg;base64," + Buffer.from(await r.arrayBuffer()).toString("base64") : null;
  } catch (e) { console.warn("No photo copied:", e.message); return null; }
}

(async () => {
  const pic = await photo(process.argv[2]);
  ({ token } = await hub("/households", { name: "Demo" }, "POST", null));
  await hub("/pets/xiaosi", { name: NAME, species: "rabbit", breed: "Netherland Dwarf", sex: "male", colour: "white", age: "3", nicknames: "Little Loaf, Mr Si, Bun Bun",
    notes: "Had GI stasis in the spring. Loves coriander. (Demo household: mock data.)", care: CARE, ...(pic ? { photo: pic } : {}) }, "PUT");
  const post = (e) => hub("/diary", { pet: NAME, ...e, extra: { ...(e.extra || {}), sim: true } });
  let n = 0;
  const go = async (e) => { n++; return post(e); };

  // ---- calendar and routines (first, so they're the oldest)
  const bday = new Date(now.getTime() + D);
  for (const [title, date, repeat] of [[`${NAME}'s birthday`, `2023-${pad(bday.getMonth() + 1)}-${pad(bday.getDate())}`, "yearly"], ["Vet check-up", key(new Date(now.getTime() + 9 * D)), "yearly"],
    ["Vaccinations (RHDV2, myxo)", key(new Date(now.getTime() + 23 * D)), "yearly"], ["Nail trim", key(new Date(now.getTime() + 4 * D)), "6weeks"], ["Weigh-in", key(new Date(now.getTime() - 2 * D)), "weekly"]])
    await go({ kind: "event", title, at: at(DAYS, 9), extra: { date, repeat } });
  const routines = {};
  for (const [title, every, tip] of [["Brush his coat", 7, "A soft brush, a few minutes. More in a moult."], ["Trim his nails", 42, "Just the tips, away from the pink quick."], ["Check his bum is clean", 7, "A damp cloth if needed, never a bath."], ["Deep clean the pen", 7, "Fresh litter, wash the bowls and tray."], ["Check his teeth", 30, "Front teeth even and not too long."]])
    routines[title] = (await go({ kind: "routine", title, at: at(45, 10), extra: { every, tip } })).id;

  // ---- earlier days, as daily summaries: tray, room, activity
  const weights = [];
  for (let d = DAYS; d >= 1; d--) {
    const day = new Date(midnight - d * D), date = key(day);
    const slow = d === 6;   // one slow day mid-week, to show what an early warning looks like
    const w = Math.round(1085 + (DAYS - d) * 0.9 + rnd(-10, 10) - (slow ? 22 : 0));
    weights.push(w);
    if (d > 2) await go({ kind: "tray-day", title: "Tray day", at: at(d, 12), extra: { date, visits: slow ? 5 : int(8, 11), output_g: slow ? 74 : int(170, 225), weight_g: w } });
    else for (let h = 0.5; h < 23.5; h += rnd(2.2, 3)) await go({ kind: "tray", title: "Tray visit", at: at(d, h), extra: { weight_g: Math.round(w + rnd(-8, 8)), secs: int(90, 380), output_g: int(14, 32) } });
    const warm = d === 4 || d === 3;   // a warm spell
    const lo = rnd(17.5, 19.5), hi = warm ? rnd(25.6, 26.8) : rnd(21.5, 23.8);
    await go({ kind: "climate-day", title: "", at: at(d, 12), extra: { date, min: +lo.toFixed(1), max: +hi.toFixed(1) } });
    const flops = warm ? int(4, 6) : int(1, 4);
    await go({ kind: "pose-day", title: "", at: at(d, 12), extra: { date, loaf: int(80, 170), stretched: int(40, 110) + (warm ? 40 : 0), flop: flops * int(6, 14), flops, sitting: int(60, 120), eating: slow ? 38 : int(70, 110), grooming: int(20, 45), active: slow ? 70 : int(120, 220) } });
  }

  // ---- today, in detail
  const hr = now.getHours() + now.getMinutes() / 60;
  for (let h = 0.5; h < hr - 0.3; h += rnd(1.2, 2.4))
    await go({ kind: "tray", title: "Tray visit", at: at(0, h), extra: { weight_g: Math.round(1098 + rnd(-8, 8)), secs: int(90, 380), output_g: int(14, 32) } });
  for (let h = 0; h < hr - 0.5; h += 1)
    await go({ kind: "climate", title: "", at: at(0, h), extra: { t: +(19 + 3.2 * Math.sin(((h - 9) / 24) * Math.PI * 2) + rnd(-0.3, 0.3)).toFixed(1), h: int(44, 55) } });
  const day = [["loaf", 7, 45], ["active", 8, 25], ["eating", 9, 30], ["loaf", 10, 70], ["stretched", 12, 40], ["flop", 13, 14], ["grooming", 14, 20], ["active", 15, 35], ["loaf", 16, 50], ["flop", 17.5, 11]];
  const WORD = { loaf: "Loafing", stretched: "Stretched out", flop: "Flopped", eating: "Eating", grooming: "Grooming", sitting: "Sitting" };
  for (const [pose, h, mins] of day) {
    if (h + mins / 60 > hr) continue;
    const to = at(0, h) + mins * 60e3;
    await go(pose === "active" ? { kind: "active", title: "On the move", at: to, extra: { mins } } : { kind: "pose", title: WORD[pose], at: to, extra: { pose, mins, from: at(0, h), to } });
  }

  // ---- moments, checks and care across the fortnight
  const momentDays = [[5, 15, "Little Loaf is having a big flop"], [3, 14, "Mr Si is stretched out like a croissant"], hr > 9 ? [0, Math.min(hr - 0.2, 13.3), "Bun Bun is having a big flop"] : [1, 16, "Bun Bun is having a big flop"]];
  for (const [d, h, title] of momentDays) await go({ kind: "moment", title, at: at(d, h), ...(pic ? { image: pic } : {}), extra: { pose: "flop", sticker: false } });
  await go({ kind: "warning", title: "Chewing a cable", note: `The pet cam saw ${NAME} chewing the lamp cable behind the sofa.`, verdict: "caution", at: at(2, 19) });
  await go({ kind: "alert", title: "Litter tray", note: "Only 5 visits and 74 g yesterday, much less than usual. Watch he's eating hay. No droppings for 12 hours is a vet call.", verdict: "caution", at: at(5, 8) });
  await go({ kind: "alert", title: "The room is warm", note: "It's 26.4°C by his tray: warm for a rabbit.", verdict: "caution", at: at(3, 15.5), extra: { climate: true } });
  await go({ kind: "droppings", title: "Droppings check", note: "38 found. Round, even, a good size. A healthy tray.", verdict: "safe", at: at(1, 9), extra: { count: 38, verdict: "normal" } });
  await go({ kind: "room", title: "Room check: 4 things to sort", note: "Lamp cable, Peace lily, Rug fringe, Wooden chair leg", at: at(2, 20), extra: { hazards: [
    { label: "Lamp cable", kind: "cable", risk: "high", fix: "Run it through a cable protector or behind the sofa, out of reach." },
    { label: "Peace lily", kind: "toxic", risk: "high", fix: "Toxic to rabbits. Move it to a shelf or another room." },
    { label: "Rug fringe", kind: "swallow", risk: "medium", fix: "Loose threads can block his gut. Trim them or roll the rug up." },
    { label: "Wooden chair leg", kind: "chew", risk: "low", fix: "Give him a willow stick nearby so he chews that instead." }] } });
  const foods = [["Coriander", "safe", "A favourite, and good for him. How much: a small handful a day."], ["Strawberry", "caution", "High sugar can upset a sensitive gut. How much: half a small berry, now and then."], ["Chocolate", "toxic", "Theobromine is poisonous to rabbits. Call a vet if he ate any."], ["Romaine lettuce", "safe", "Fine as part of his greens. How much: a leaf or two."], ["Banana", "caution", "Very sugary. How much: a thin slice, once or twice a week."], ["Iceberg lettuce", "caution", "Mostly water and can cause loose droppings. Pick darker greens."]];
  for (let i = 0; i < foods.length; i++) await go({ kind: "food", title: foods[i][0], verdict: foods[i][1], note: foods[i][2], at: at(DAYS - 1 - i * 2, 18) });
  await go({ kind: "ask", title: `Is ${NAME} OK today?`, verdict: "safe", note: "He looks well. Eight tray visits so far and his weight is steady at about 1.1 kg. He flopped twice this afternoon, which is a happy, relaxed rabbit.", at: at(1, 20), extra: { steps: [
    { tool: "tray", label: "Checked the litter tray: 8 visits, 1098 g" }, { tool: "activity", label: "Checked his day: 2 flops, 3 h loafing" }, { tool: "cams", label: "Looked through the pet cams: resting in his bed" }, { tool: "answer", label: "Answered, checks passed", kind: "ok" }] } });
  await go({ kind: "ask", title: "Is it too hot for him?", verdict: "caution", note: "It's 26.4°C by his tray, warm for a rabbit. Close the curtains and give him a frozen water bottle wrapped in a towel to lean on.", at: at(3, 15.6), extra: { steps: [
    { tool: "weather", label: "Checked the weather: 29°C outside, sunny" }, { tool: "room", label: "Room by his tray: 26.4°C" }, { tool: "care", label: `Read ${NAME}'s care plan` }, { tool: "answer", label: "Answered, checks passed", kind: "ok" }] } });
  for (const [title, d] of [["Trim his nails", 34], ["Brush his coat", 6], ["Check his bum is clean", 5], ["Deep clean the pen", 8], ["Check his teeth", 9]]) await go({ kind: "routine-done", title, at: at(d, 11), extra: { of: routines[title] } });
  for (let d = 3; d >= 1; d--) for (let i = 0; i < CARE.daily.length; i++) await go({ kind: "care", title: CARE.daily[i], at: at(d, 8 + i * 1.5) });
  for (let i = 0; i < 2 && hr > 0.6; i++) await go({ kind: "care", title: CARE.daily[i], at: at(0, Math.min(hr - 0.5, 8 + i)) });
  await go({ kind: "ideas", title: `Ideas for ${NAME}`, note: "Willow ball, Dig box, Timothy hay cubes", at: at(4, 21), extra: { ideas: [
    { kind: "toy", name: "Willow ball", why: "Safe to chew and fun to toss.", safety: "Untreated willow only.", tip: "Stuff it with hay." },
    { kind: "toy", name: "Dig box", why: "Netherland Dwarfs love to dig.", safety: "Use shredded paper, no ink.", tip: "Hide a coriander leaf inside." },
    { kind: "treat", name: "Timothy hay cubes", why: "Good for his teeth and gut.", safety: "Plain, no added sugar.", tip: "One or two a day." }] } });

  // what the owner added: the cams don't see everything
  for (const [d, h, what, item, amount] of [[6, 18, "treat", "slice of apple", "small"], [4, 19, "greens", "coriander", "handful"], [3, 20, "flop", "", ""], [2, 18, "treat", "dried hay cube", "tiny"], [1, 21, "zoomies", "", ""], [1, 19, "treat", "slice of banana", "tiny"]]) {
    const ent = FSActivity.entry({ name: NAME, care: CARE }, what, item, amount);
    await go({ ...ent, at: at(d, h) });
  }
  if (hr > 1) await go({ ...FSActivity.entry({ name: NAME, care: CARE }, "greens", "coriander", "small"), at: at(0, hr - 0.5) });

  console.log(`Demo household ready: ${n} mock entries${pic ? ", with his photo" : ""}.`);
  console.log(`Open it:  ${WEB}/#t=${token}`);
  console.log(`Wrapped:  ${WEB}/wrapped/#t=${token}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
