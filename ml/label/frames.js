// Muse Spark labels whole frames: where the rabbit is (a box), his posture and what he's doing.
//
//   node ml/label/frames.js <frames dir> [limit]      (frames dir from ml/extract_frames.py; resumable)
//
// Uses your three example crops from the labeller (labels/references.json) and the key in server/.env.local.
// Writes <frames dir>/spark.json.
const fs = require("fs");
const path = require("path");
const os = require("os");

const env = path.join(__dirname, "../../server/.env.local");
if (fs.existsSync(env)) for (const l of fs.readFileSync(env, "utf8").split("\n")) { const m = l.match(/^(\w+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); }
const { spark } = require("../../server/lib/meta");

const DIR = process.argv[2];
const LIMIT = Number(process.argv[3]) || Infinity;
const LABELS = path.join(os.homedir(), "Documents/fursight-data/labels");
const items = JSON.parse(fs.readFileSync(path.join(LABELS, "items.json"), "utf8"));
const refs = JSON.parse(fs.readFileSync(path.join(LABELS, "references.json"), "utf8")).examples
  .map((r) => ({ ...r, id: (items.find((i) => r.file.endsWith(i.file)) || {}).id })).filter((r) => r.id);
const img = (f) => "data:image/jpeg;base64," + fs.readFileSync(f).toString("base64");
const frames = JSON.parse(fs.readFileSync(path.join(DIR, "frames.json"), "utf8"));
const OUT = path.join(DIR, "spark.json");
const done = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};

const POSTURES = ["loaf", "sitting", "stretched", "flop", "upright", "hopping", "not visible"];
const ACTIVITIES = ["eating", "drinking", "grooming", "chewing", "yawning"];
const SCHEMA = {
  type: "object",
  properties: {
    box: { type: "array", items: { type: "integer" }, description: "the rabbit as [left, top, right, bottom], each 0 to 1000 across the last photo; [0,0,0,0] if no rabbit" },
    posture: { type: "string", enum: POSTURES },
    activity: { type: "array", items: { type: "string", enum: ACTIVITIES } },
    is_xiaosi: { type: "boolean", description: "true if this looks like the same rabbit as the examples" },
    sure: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["box", "posture", "activity", "is_xiaosi", "sure"], additionalProperties: false,
};
const SYSTEM = `You label rabbit behaviour for training a small model. First find the rabbit and give a tight box around his whole body. Postures (pick one): loaf = tucked up like a bread roll, feet underneath; sitting = upright on all fours, alert; stretched = lying on his belly with legs out (back legs kicked out behind); flop = lying on his side; upright = standing on his back legs; hopping = mid-hop or running; not visible = no rabbit or too hidden to tell. Activities (any, or none): eating, drinking, grooming (licking or washing himself), chewing (something that isn't food), yawning. Only label what you can see. The first ${refs.length} photos are close-up examples of the owner's rabbit, Xiaosi.`;

let usage = { in: 0, out: 0 }, failed = 0, saveTimer;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => fs.writeFileSync(OUT, JSON.stringify(done)), 300); };
async function label(f) {
  const r = await spark({
    system: SYSTEM,
    text: refs.map((x, i) => `Photo ${i + 1}: ${x.posture} (${x.what}).`).join(" ") + ` Now find the rabbit in photo ${refs.length + 1} and label it.`,
    images: [...refs.map((x) => img(path.join(LABELS, "crops", x.id + ".jpg"))), img(path.join(DIR, "frames", f.id + ".jpg"))],
    schema: SCHEMA, name: "Label", maxTokens: 2000,
  });
  usage.in += r.usage?.input_tokens || 0; usage.out += r.usage?.output_tokens || 0;
  done[f.id] = { ...r.data, activity: [...new Set(r.data.activity)] }; save();
}
(async () => {
  const todo = frames.filter((f) => !done[f.id]).slice(0, LIMIT);
  console.log(`${todo.length} frames to label`);
  let n = 0;
  await Promise.all([0, 1, 2, 3].map(async () => {
    while (todo.length) {
      const f = todo.shift();
      try { await label(f); } catch { try { await label(f); } catch (e) { failed++; console.error(f.id, e.message); } }
      if (++n % 100 === 0) console.log(`${n} labelled, ${usage.in} in / ${usage.out} out tokens`);
    }
  }));
  clearTimeout(saveTimer); fs.writeFileSync(OUT, JSON.stringify(done));
  const cost = (usage.in * 1.25 + usage.out * 4.25) / 1e6;
  console.log(`done: ${n - failed} labelled, ${failed} failed, ${usage.in} in / ${usage.out} out tokens (about $${cost.toFixed(2)})`);
})();
