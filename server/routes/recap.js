// The weekly recap: Muse Spark reads the last 7 days of the household diary and writes a short, warm summary
// (with the care streak). The week card is a fact card made from his real cut-out stickers and the week's numbers
// (public/factcard.js), never an AI-generated picture of him. Saved to the diary, so every device sees it.
//
//   POST /api/recap  { draft: true }  -> the words only (the web app draws the card and saves it)
//   POST /api/recap  { save: true }   -> the words and the fact card's layout, saved to the diary (the Quest draws it)
//   -> { title, summary, highlights: [...], watch, streak, note, layout?, entry?, ms }
const { spark } = require("../lib/meta");
const { handler, household, bad } = require("../lib/http");
const { context, recent, addDiary } = require("../lib/hub");
const FSFactCard = require("../public/factcard.js");

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "a short headline for the week, 3 to 6 words, e.g. 'A calm, hungry week'" },
    summary: { type: "string", description: "two warm, plain sentences on how the week went" },
    highlights: { type: "array", items: { type: "string" }, description: "3 short highlights, each under 10 words" },
    watch: { type: "string", description: "one thing to keep an eye on next week, or empty" },
  },
  required: ["title", "summary", "highlights", "watch"],
};

// days in a row (ending today, or yesterday if today isn't finished) with every daily care item ticked
function streak(entries, items) {
  if (!items.length) return 0;
  const byDay = new Map();
  for (const e of entries) if (e.kind === "care") {
    const d = new Date(e.at).toDateString();
    if (!byDay.has(d)) byDay.set(d, new Set());
    byDay.get(d).add(e.title);
  }
  const done = (d) => items.every((i) => byDay.get(d.toDateString())?.has(i));
  const day = new Date();
  if (!done(day)) day.setDate(day.getDate() - 1);
  let n = 0;
  while (done(day)) { n++; day.setDate(day.getDate() - 1); }
  return n;
}

module.exports = handler(async (body, req) => {
  const t0 = Date.now();
  const home = household(req);
  if (!home) throw bad("needs a linked household");
  const [ctx, entries] = await Promise.all([context(home.token), recent(home.token, 200)]);
  if (!ctx.pet) throw bad("add a pet first");
  const week = entries.filter((e) => e.at > Date.now() - 7 * 864e5 && e.kind !== "recap");
  const items = (ctx.pet.care && ctx.pet.care.daily) || [];
  const s = streak(entries, items);
  const log = week.map((e) => `${new Date(e.at).toDateString().slice(0, 10)} ${e.kind}: ${e.title}${e.verdict ? " (" + e.verdict + ")" : ""}${e.note ? ", " + e.note.slice(0, 100) : ""}`).join("\n") || "(nothing logged this week)";
  const nicks = String(ctx.pet.nicknames || "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
  const { data } = await spark({
    system: `You write FurSight's weekly recap for ${ctx.pet.name}, a ${ctx.pet.species}${ctx.pet.breed ? " (" + ctx.pet.breed + ")" : ""}. Warm, plain and honest: celebrate the good, mention anything worth watching, never invent events that aren't in the log. "food" entries are foods the owner checked, not things the pet ate: a check is good care, never a "scare" or an incident, and never a reason to watch his health. "care" entries are daily care tasks ticked off. No markdown, no em dashes.`,
    text: `${nicks.length ? `His nicknames: ${nicks.join(", ")} (use one in the title or a highlight if it fits).\n` : ""}This week's diary:\n${log}\nCare streak: ${s} day(s) in a row with every daily task done.`,
    schema: SCHEMA, name: "Recap",
  });

  const note = `${data.summary}${data.highlights.length ? " " + data.highlights.map((h) => "• " + h).join(" ") : ""}${data.watch ? " Watch: " + data.watch : ""}${s ? ` Care streak: ${s} day${s > 1 ? "s" : ""}.` : ""}`;
  // {draft: true}: the words only. The web app draws the fact card (his sticker and the week's numbers) and
  // keeps it in the diary itself, so there's no AI illustration to wait for.
  if (body.draft) return { title: data.title, summary: data.summary, highlights: data.highlights, watch: data.watch, streak: s, note, ms: Date.now() - t0 };
  // otherwise (the Quest, { save: true }): the card's layout, saved to the diary for the app to draw. No picture
  // is generated: the card is his own stickers and the week's numbers (FSFactCard).
  const layout = FSFactCard.layout({ pet: ctx.pet, entries, recap: { title: data.title, highlights: data.highlights, streak: s } });
  const entry = await addDiary(home.token, { kind: "recap", title: data.title, note, pet: ctx.pet.name, extra: { highlights: data.highlights, watch: data.watch, streak: s, card: "facts", layout } });
  return { title: data.title, summary: data.summary, highlights: data.highlights, watch: data.watch, streak: s, note, layout, entry: entry && entry.id, ms: Date.now() - t0 };
});
