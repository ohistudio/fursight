// Add a note in your own words: "fed him a strawberry", "brushed his coat", "vet on Friday at 3", "big flop
// after breakfast". Muse Spark reads it and does each thing it says: a food is checked against the safety list
// and saved with when he can have it again (on the calendar), a daily care task is ticked, a grooming routine is
// marked done, a date goes on the calendar, and anything else is kept as a note.
//
//   POST /api/note  { text, tz? }  (a household device)
//   -> { done: [{ type, title, said, verdict? }], said }
const { spark } = require("../lib/meta");
const { handler, text, household } = require("../lib/http");
const { context, recent, addDiary } = require("../lib/hub");
const { guard } = require("../lib/verdict");
const FSActivity = require("../public/activity.js");
const FSRoutine = require("../public/routines.js");
const fed = require("../lib/fed");

const SCHEMA = {
  type: "object",
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["fed", "care", "routine", "reminder", "seen", "note"] },
          food: { type: "string", description: "fed: the food in plain words, e.g. 'strawberry'" },
          amount: { type: "string", enum: ["tiny", "small", "handful", ""] },
          verdict: { type: "string", enum: ["safe", "caution", "toxic", ""], description: "fed: is this food OK for this pet" },
          reason: { type: "string", description: "fed: one short sentence why" },
          wait_days: { type: "integer", description: "fed: days to wait before giving it again; 0 if fine every day (hay, everyday greens), fruit and sugary treats usually 2 to 4" },
          item: { type: "string", description: "care: the exact checklist item; routine: the exact routine id; seen: flop|loaf|zoomies|droppings" },
          title: { type: "string", description: "reminder: short title; note: the note, tidied" },
          date: { type: "string", description: "reminder: YYYY-MM-DD" },
        },
        required: ["type", "food", "amount", "verdict", "reason", "wait_days", "item", "title", "date"],
        additionalProperties: false,
      },
    },
  },
  required: ["actions"],
  additionalProperties: false,
};

module.exports = handler(async (body, req) => {
  const home = household(req);
  if (!home) throw Object.assign(new Error("link this phone first"), { status: 401, expose: true });
  const said = text(body.text, 400);
  if (!said) throw Object.assign(new Error("write what happened"), { status: 400, expose: true });
  const [ctx, entries] = await Promise.all([context(home.token), recent(home.token, 200).catch(() => [])]);
  const p = ctx.pet;
  if (!p) throw Object.assign(new Error("add your pet first"), { status: 400, expose: true });
  const tz = fed.tzOf(body.tz), today = fed.dayKey(Date.now(), tz);
  const daily = (p.care && p.care.daily) || [], routines = FSRoutine.list(entries);

  const { data } = await spark({
    name: "Note",
    system: `You turn an owner's note about their pet into actions. Pet: ${p.name}, a ${p.species || "rabbit"}${p.breed ? " (" + p.breed + ")" : ""}.
Today is ${today}, a ${new Date(today + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })}.
Actions, one per thing the note says HAPPENED or asks to remember:
- fed: the owner gave ${p.name} a food or treat (one action per food). Judge it for this animal: safe, caution (treat or limited) or toxic. When unsure, be more cautious.
- care: they did one of today's checklist items. item must be copied exactly from: ${JSON.stringify(daily)}
- routine: they did a grooming or check routine. item must be one of these ids: ${JSON.stringify(routines.map((r) => ({ id: r.id, title: r.title })))}
- reminder: something on a future date (vet visit, nail trim booked). date YYYY-MM-DD.
- seen: they saw a flop, loaf, zoomies, or normal droppings.
- note: anything else worth keeping, in a short tidy sentence.
A question ("can he have apple?") is not a fed action. Prefer care or routine over note when one fits. Unused fields are "" or 0. No em dashes.`,
    text: said,
    schema: SCHEMA,
  });

  const done = [];
  for (const a of (data.actions || []).slice(0, 8)) {
    try {
      if (a.type === "fed" && a.food) {
        const g = guard(p.species || "rabbit", { food: a.food, verdict: a.verdict || "caution", reason: a.reason });
        const r = await fed.record(home.token, p, { food: a.food, verdict: g.verdict, wait_days: g.verdict === "safe" ? a.wait_days : Math.max(2, a.wait_days || 0), amount: a.amount || "small" }, tz);
        const before = r.had && r.had.days_ago > 0 && r.had.wait_left > 0 ? ` He'd also had it ${r.had.days_ago === 1 ? "yesterday" : r.had.days_ago + " days ago"}, so give it a rest.` : "";
        done.push({ type: "fed", title: r.title, verdict: g.verdict, said: (g.verdict === "toxic" ? r.said : `${g.reason ? g.reason + " " : ""}${r.said}`) + before });
      } else if (a.type === "care" && daily.includes(a.item)) {
        const already = entries.some((e) => e.kind === "care" && e.title === a.item && fed.dayKey(e.at, tz) === today);
        if (!already) await addDiary(home.token, { kind: "care", title: a.item, pet: p.name });
        done.push({ type: "care", title: a.item, said: already ? `Already ticked today: ${a.item}.` : `Ticked off today: ${a.item}.` });
      } else if (a.type === "routine" && routines.some((r) => r.id === a.item)) {
        const r = routines.find((x) => x.id === a.item);
        await addDiary(home.token, { kind: "routine-done", title: r.title, pet: p.name, extra: { of: r.id } });
        done.push({ type: "routine", title: r.title, said: `${r.title}: done. Next due ${fed.nice(fed.dayKey(Date.now() + r.every * 864e5, tz))}.` });
      } else if (a.type === "reminder" && /^\d{4}-\d{2}-\d{2}$/.test(a.date) && a.date >= today && a.title) {
        await addDiary(home.token, { kind: "event", title: text(a.title, 80).replace(/^./, (c) => c.toUpperCase()), pet: p.name, extra: { date: a.date, repeat: "none" } });
        done.push({ type: "reminder", title: a.title, said: `On the calendar: ${a.title.replace(/^./, (c) => c.toUpperCase())}, ${fed.nice(a.date)}.` });
      } else if (a.type === "seen" && ["flop", "loaf", "zoomies", "droppings"].includes(a.item)) {
        const ent = FSActivity.entry(p, a.item);
        await addDiary(home.token, ent);
        done.push({ type: "seen", title: ent.title, said: `Added: ${ent.title.toLowerCase()}.` });
      } else if (a.type === "note" || a.type === "care" || a.type === "routine") {
        const ent = FSActivity.entry(p, "note", text(a.title, 60) || said.slice(0, 60));
        await addDiary(home.token, ent);
        done.push({ type: "note", title: ent.title, said: `Kept as a note.` });
      }
    } catch (e) { done.push({ type: a.type, title: a.food || a.title || a.item, said: `Couldn't save this one: ${e.message}` }); }
  }
  if (!done.length) {
    const ent = FSActivity.entry(p, "note", said.slice(0, 60));
    await addDiary(home.token, ent);
    done.push({ type: "note", title: ent.title, said: "Kept as a note." });
  }
  return { done, said: done.map((d) => d.said).join(" ") };
});
