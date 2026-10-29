// "We fed him this", from a food check card: saves it with how long to wait before the next one, and puts the
// day it's OK again on the calendar.
//
//   POST /api/fed  { food, verdict?: safe|caution|toxic, wait_days?, amount?: tiny|small|handful, tz? }  (a household device)
//   -> { title, item, next: "YYYY-MM-DD" | null, wait_days, toxic, had: <the time before> | null, said }
const { handler, text, household } = require("../lib/http");
const { context } = require("../lib/hub");
const { lookup } = require("../lib/verdict");
const fed = require("../lib/fed");

const RANK = { safe: 0, caution: 1, toxic: 2 };

module.exports = handler(async (body, req) => {
  const home = household(req);
  if (!home) throw Object.assign(new Error("link this phone first"), { status: 401, expose: true });
  const ctx = await context(home.token);
  if (!ctx.pet) throw Object.assign(new Error("add your pet first"), { status: 400, expose: true });
  const food = text(body.food, 60);
  if (!food) throw Object.assign(new Error("say what he had"), { status: 400, expose: true });
  // the safety list can make it stricter, never softer; without a wait from the food check, treats wait 3 days
  let verdict = RANK[body.verdict] !== undefined ? body.verdict : "caution";
  const rule = lookup(ctx.pet.species || "rabbit", food);
  if (rule && RANK[rule.verdict] > RANK[verdict]) verdict = rule.verdict;
  const wait = body.wait_days !== undefined ? body.wait_days : verdict === "safe" ? 0 : 3;
  const amount = ["tiny", "small", "handful"].includes(body.amount) ? body.amount : "small";
  return fed.record(home.token, ctx.pet, { food, verdict, wait_days: wait, amount }, fed.tzOf(body.tz));
});
