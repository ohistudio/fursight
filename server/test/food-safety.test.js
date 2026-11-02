// The rabbit safety net, worst case: Muse Spark wrongly calls every food "safe", and the species list has to
// catch it (lib/verdict.js guard + lib/species/rabbit.js). Foods and expected verdicts: test/rabbit-foods.json
// (RWAF and House Rabbit Society guidance). Run: npm test   Report: npm run bench
const test = require("node:test");
const assert = require("node:assert");
const { guard } = require("../lib/verdict");
const B = require("./rabbit-foods.json");
const after = (food, model = "safe") => guard("rabbit", { food, verdict: model }).verdict;

test("no toxic food gets through as anything but toxic, even when the model says safe", () => {
  const missed = B.toxic.filter((f) => after(f) !== "toxic");
  assert.deepStrictEqual(missed, []);
});

test("no treat food gets through as everyday safe", () => {
  const missed = B.caution.filter((f) => after(f) === "safe");
  assert.deepStrictEqual(missed, []);
});

test("no safe food is blocked as toxic", () => {
  const blocked = B.safe.filter((f) => after(f) === "toxic");
  assert.deepStrictEqual(blocked, []);
});

test("the net never softens the model: toxic stays toxic whatever the list says", () => {
  for (const f of [...B.safe, ...B.caution, ...B.toxic]) assert.strictEqual(after(f, "toxic"), "toxic", f);
});

test("whole words only: pineapple is fruit, not apple seeds; carrot tops aren't the root", () => {
  assert.strictEqual(after("pineapple"), "caution");
  assert.strictEqual(after("carrot tops"), "safe");
  assert.strictEqual(after("butternut squash"), "safe");
  assert.strictEqual(after("blueberries"), "caution");
});
