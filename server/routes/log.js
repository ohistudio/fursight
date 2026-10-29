// Add something the cams missed: a treat or greens the owner gave, a flop or loaf they saw, good droppings, a note.
// A treat is checked against his never list first and saved with a warning if it's on it.
// The web app, the iPhone and (through Ask) the glasses all add things this way.
//
//   POST /api/log  { what: treat|greens|flop|loaf|zoomies|droppings|note, item?, amount?: tiny|small|handful }  (a household device)
//   -> { saved, title, never: "<the never-list line>" | null, next?, said? }
// Treats and greens go through lib/fed, so the day he can have them again goes on the calendar too.
const { handler } = require("../lib/http");
const { context, addDiary } = require("../lib/hub");
const FSActivity = require("../public/activity.js");
const { lookup } = require("../lib/verdict");
const fed = require("../lib/fed");

module.exports = handler(async (body, req) => {
  const auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!auth.startsWith("fs1.")) throw Object.assign(new Error("link this phone first"), { status: 401, expose: true });
  const ctx = await context(auth);
  if (!ctx.pet) throw Object.assign(new Error("add your pet first"), { status: 400, expose: true });
  const what = String(body.what || ""), item = String(body.item || "").trim();
  if ((what === "treat" || what === "greens") && item) {
    const rule = lookup(ctx.pet.species || "rabbit", item), verdict = rule ? rule.verdict : what === "greens" ? "safe" : "caution";
    const r = await fed.record(auth, ctx.pet, { food: item.slice(0, 60), verdict, wait_days: verdict === "safe" ? 0 : 3, amount: String(body.amount || "small") }, fed.tzOf(body.tz));
    return { saved: true, title: r.title, never: r.toxic ? r.said : null, next: r.next, said: r.said };
  }
  const ent = FSActivity.entry(ctx.pet, what, item, String(body.amount || ""));
  if (!ent) throw Object.assign(new Error("say what it was"), { status: 400, expose: true });
  if (!(await addDiary(auth, ent))) throw Object.assign(new Error("couldn't save it, try again"), { status: 502, expose: true });
  return { saved: true, title: ent.title, never: ent.verdict ? FSActivity.never(ent.extra.item, ctx.pet.care && ctx.pet.care.never) : null };
});
