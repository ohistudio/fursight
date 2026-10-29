// Add something the cams missed: a treat or greens the owner gave, a flop or loaf they saw, good droppings, a note.
// A treat is checked against his never list first and saved with a warning if it's on it.
// The web app, the iPhone and (through Ask) the glasses all add things this way.
//
//   POST /api/log  { what: treat|greens|flop|loaf|zoomies|droppings|note, item?, amount?: tiny|small|handful }  (a household device)
//   -> { saved, title, never: "<the never-list line>" | null }
const { handler } = require("../lib/http");
const { context, addDiary } = require("../lib/hub");
const FSActivity = require("../public/activity.js");

module.exports = handler(async (body, req) => {
  const auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!auth.startsWith("fs1.")) throw Object.assign(new Error("link this phone first"), { status: 401, expose: true });
  const ctx = await context(auth);
  if (!ctx.pet) throw Object.assign(new Error("add your pet first"), { status: 400, expose: true });
  const ent = FSActivity.entry(ctx.pet, String(body.what || ""), String(body.item || ""), String(body.amount || ""));
  if (!ent) throw Object.assign(new Error("say what it was"), { status: 400, expose: true });
  if (!(await addDiary(auth, ent))) throw Object.assign(new Error("couldn't save it, try again"), { status: 502, expose: true });
  return { saved: true, title: ent.title, never: ent.verdict ? FSActivity.never(ent.extra.item, ctx.pet.care && ctx.pet.care.never) : null };
});
