// Applies the species safety list to a model verdict. Never makes an answer less cautious.
const RANK = { safe: 0, caution: 1, toxic: 2 };
const LISTS = { rabbit: require("./species/rabbit") };

function lookup(species, food) {
  const list = LISTS[String(species || "").toLowerCase()];
  if (!list) return null;
  const name = " " + String(food || "").toLowerCase().replace(/[^a-z ]/g, " ") + " ";
  let hit = null;
  for (const rule of list) {
    for (const word of rule.match) {
      // whole-word match so "pineapple" doesn't count as "apple"... unless the longer word is listed too
      if (new RegExp(`\\b${word}s?\\b`).test(name) && (!hit || RANK[rule.verdict] > RANK[hit.verdict])) hit = { ...rule, word };
    }
  }
  return hit;
}

function guard(species, item) {
  const rule = lookup(species, item.food);
  if (!rule) return { ...item, checked: false };
  if (RANK[rule.verdict] > RANK[item.verdict]) {
    return { ...item, verdict: rule.verdict, reason: rule.why, instead: rule.instead, checked: true, overridden: true, model_verdict: item.verdict };
  }
  return { ...item, checked: true };
}

module.exports = { guard, lookup };
