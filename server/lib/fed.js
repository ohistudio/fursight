// Feeding: "we fed him this". A treat is saved to the diary (kind "log", what treat|greens) with how long to wait
// before the next one, and a "can have it again" day goes on the calendar. The next food check of the same food
// says when he last had it and whether to wait. Used by /api/fed, /api/note, /api/food and the Ask agent.
//
// Dates are the owner's own days: tz is minutes east of UTC from their device (London in winter 0, China 480).
const FSCal = require("../public/calendar.js");
const FSActivity = require("../public/activity.js");
const { recent, addDiary } = require("./hub");

const DAY = 864e5;
// "Strawberries", "a slice of strawberry", "strawberry halves" -> "strawberry"
const key = (f) => String(f || "").toLowerCase().replace(/\b(half|halves|slice|slices|piece|pieces|bit|bits|some|of|a|an|the|fresh|small|little)\b/g, "")
  .replace(/[^a-z]/g, "").replace(/ies$/, "y").replace(/(o|x|ch|sh)es$/, "$1").replace(/s$/, "");
const dayKey = (t, tz = 0) => new Date(t + tz * 60e3).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const nice = (k) => new Date(k + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const cap = (s) => String(s).replace(/^./, (c) => c.toUpperCase());
const tzOf = (v) => (Number.isFinite(Number(v)) && Math.abs(Number(v)) <= 14 * 60 ? Math.round(Number(v)) : 0);

// the last time he had this food (owner-logged treats and greens), newest first
function last(entries, food) {
  const k = key(food);
  return k ? entries.find((e) => e.kind === "log" && e.extra && ["treat", "greens"].includes(e.extra.what) && key(e.extra.item) === k) || null : null;
}

// { at, days_ago, next, wait_left, said } or null if he hasn't had it
function status(entries, food, pet, tz = 0, now = Date.now()) {
  const e = last(entries, food);
  if (!e) return null;
  const today = dayKey(now, tz), ago = daysBetween(dayKey(e.at, tz), today);
  const next = e.extra.next || null, left = next ? Math.max(0, daysBetween(today, next)) : 0;
  const when = ago === 0 ? "today" : ago === 1 ? "yesterday" : `${ago} days ago`;
  const name = (pet && pet.name) || "He";
  const said = left > 0
    ? `${name} had ${e.extra.item} ${when}. Wait until ${nice(next)} before the next one: it's on the calendar.`
    : `${name} last had ${e.extra.item} ${when}.`;
  return { at: e.at, days_ago: ago, next, wait_left: left, said };
}

// save it: the diary entry, the calendar day it's OK again (replacing an older one for the same food)
async function record(token, pet, { food, verdict = "caution", wait_days, amount = "small" }, tz = 0) {
  const entries = await recent(token, 200).catch(() => []);
  const had = status(entries, food, pet, tz);
  const wait = Math.max(0, Math.min(30, Math.round(Number(wait_days) || 0)));
  const ent = FSActivity.entry(pet, wait || verdict !== "safe" ? "treat" : "greens", String(food).slice(0, 60), amount);
  if (!ent) throw Object.assign(new Error("say what he had"), { status: 400, expose: true });
  const toxic = verdict === "toxic" || ent.verdict === "toxic";
  const next = wait && !toxic ? dayKey(Date.now() + wait * DAY, tz) : null;
  ent.extra = { ...ent.extra, wait_days: wait, ...(next ? { next } : {}), checked: verdict };
  if (toxic && !ent.verdict) Object.assign(ent, { verdict: "toxic", note: `${cap(food)} isn't safe for ${pet.name}. If he ate some, ask FurSight or call a vet.` });

  const today = dayKey(Date.now(), tz), k = key(food);
  const old = FSCal.events(entries).filter((e) => e.extra.fed && key(e.extra.fed) === k && e.extra.date >= today);
  await Promise.all(old.map((e) => addDiary(token, { kind: "event-cancel", title: e.title, pet: pet.name, extra: { of: e.id } })));
  if (!(await addDiary(token, ent))) throw Object.assign(new Error("couldn't save it, try again"), { status: 502, expose: true });
  if (next) await addDiary(token, { kind: "event", title: `${cap(ent.extra.item)} is OK again`, note: `${pet.name} had ${ent.extra.item} on ${nice(today)}.`, pet: pet.name, extra: { date: next, repeat: "none", fed: ent.extra.item } });

  const said = toxic ? ent.note
    : next ? `Marked. ${pet.name} can have ${ent.extra.item} again from ${nice(next)}: it's on the calendar.`
    : `Marked: ${pet.name} had ${ent.extra.item}.`;
  return { title: ent.title, item: ent.extra.item, next, wait_days: wait, toxic, had, said };
}

module.exports = { key, last, status, record, dayKey, tzOf, nice };
