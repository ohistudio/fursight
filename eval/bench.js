// The food safety benchmark, as a table: how the safety net does when Muse Spark gets it wrong (says "safe" for
// everything). Writes docs/benchmark.md.   npm run bench (from the repo root)
const fs = require("fs"), path = require("path");
const { guard } = require("../server/lib/verdict");
const B = require("./rabbit-foods.json");
const after = (food) => guard("rabbit", { food, verdict: "safe" }).verdict;
const toxicCaught = B.toxic.filter((f) => after(f) === "toxic").length;
const cautionCaught = B.caution.filter((f) => after(f) !== "safe").length;
const safeBlocked = B.safe.filter((f) => after(f) === "toxic").length;
const safeStricter = B.safe.filter((f) => after(f) === "caution");
const total = B.toxic.length + B.caution.length + B.safe.length;
const md = `# Food safety benchmark

FurSight's food check is Muse Spark's answer passed through a rabbit safety list (\`server/lib/species/rabbit.js\`, from RWAF and House Rabbit Society guidance). The list can make an answer stricter, never softer.

This benchmark tests the worst case: **Muse Spark wrongly calls every food "safe"**, and the list has to catch it. ${total} foods, expected verdicts in [\`eval/rabbit-foods.json\`](../eval/rabbit-foods.json).

| | Foods | Result |
|---|---|---|
| Toxic (never) | ${B.toxic.length} | **${toxicCaught} of ${B.toxic.length} caught as toxic** |
| Treat only (caution) | ${B.caution.length} | **${cautionCaught} of ${B.caution.length} kept off "safe"** |
| Safe | ${B.safe.length} | **${safeBlocked} blocked as toxic**; ${safeStricter.length} marked "small treat" (stricter than needed: ${safeStricter.join(", ") || "none"}) |

**Zero toxic foods called safe**, even when the model is wrong. Run it: \`npm test\` (CI runs it on every push) or \`npm run bench\` to rebuild this page.

The first run found 14 toxic foods the list missed (garden plants like buttercup, privet, Madagascar periwinkle, hemlock and bracken, tomato leaves, sports drinks) and plural forms it didn't match (blueberries); they're fixed and now tested. It notices; your vet decides.
`;
fs.writeFileSync(path.join(__dirname, "../docs/benchmark.md"), md);
console.log(md);
