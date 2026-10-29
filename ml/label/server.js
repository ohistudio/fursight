// The FurSight labeller: review what Xiaosi is doing in each rabbit crop, with Muse Spark suggesting first.
//
//   node ml/label/server.js [labels dir]     (default ~/Documents/fursight-data/labels)   then open http://localhost:3040
//
// Reads <labels dir>/items.json and crops/ (from ml/prep_crops.py) and references.json (your example postures),
// keeps everything in <labels dir>/labels.json. Muse Spark uses the API key in server/.env.local, never sent anywhere else.
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DIR = process.argv[2] || path.join(os.homedir(), "Documents/fursight-data/labels");
const PORT = Number(process.env.PORT || 3040);
const env = path.join(__dirname, "../../server/.env.local");
if (fs.existsSync(env)) for (const l of fs.readFileSync(env, "utf8").split("\n")) { const m = l.match(/^(\w+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); }
const { spark } = require("../../server/lib/meta");

const POSTURES = ["loaf", "sitting", "stretched", "flop", "upright", "hopping", "not visible"];
const ACTIVITIES = ["eating", "drinking", "grooming", "chewing", "yawning"];
const items = JSON.parse(fs.readFileSync(path.join(DIR, "items.json"), "utf8"));
const refsFile = JSON.parse(fs.readFileSync(path.join(DIR, "references.json"), "utf8"));
// a reference names a source photo; its crop is the one cut from that photo
const refs = refsFile.examples.map((r) => ({ ...r, id: (items.find((i) => r.file.endsWith(i.file)) || {}).id })).filter((r) => r.id);
const LABELS = path.join(DIR, "labels.json");
const labels = fs.existsSync(LABELS) ? JSON.parse(fs.readFileSync(LABELS, "utf8")) : {};
let saveTimer = null;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { fs.writeFileSync(LABELS + ".tmp", JSON.stringify(labels, null, 1)); fs.renameSync(LABELS + ".tmp", LABELS); }, 300); };
const crop = (id) => "data:image/jpeg;base64," + fs.readFileSync(path.join(DIR, "crops", id + ".jpg")).toString("base64");

// ---- Muse Spark suggests: your three examples first, then the crop
const SCHEMA = {
  type: "object",
  properties: {
    posture: { type: "string", enum: POSTURES },
    activity: { type: "array", items: { type: "string", enum: ACTIVITIES } },
    is_xiaosi: { type: "boolean", description: "true if this looks like the same rabbit as the examples (a small grey Netherland Dwarf)" },
    sure: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["posture", "activity", "is_xiaosi", "sure"], additionalProperties: false,
};
const SYSTEM = `You label rabbit behaviour for training a small model. Postures (pick one): loaf = tucked up like a bread roll, feet underneath; sitting = upright on all fours, alert; stretched = lying on his belly with legs out (back legs kicked out behind); flop = lying on his side; upright = standing on his back legs; hopping = mid-hop or running; not visible = no rabbit or too hidden to tell. Activities (any, or none): eating, drinking, grooming (licking or washing himself), chewing (something that isn't food), yawning. Only label what you can see. The owner labelled the first ${refs.length} photos as examples of his rabbit, Xiaosi.`;
let usage = { in: 0, out: 0 };
async function suggest(id) {
  const r = await spark({
    system: SYSTEM,
    text: refs.map((x, i) => `Photo ${i + 1}: ${x.posture} (${x.what}).`).join(" ") + ` Now label photo ${refs.length + 1}.`,
    images: [...refs.map((x) => crop(x.id)), crop(id)], schema: SCHEMA, name: "Label", maxTokens: 2000,
  });
  usage.in += r.usage?.input_tokens || 0; usage.out += r.usage?.output_tokens || 0;
  labels[id] = { ...(labels[id] || {}), spark: { ...r.data, activity: [...new Set(r.data.activity)] } };
  save();
}
const job = { running: false, done: 0, total: 0, failed: 0 };
async function suggestAll(limit = Infinity, only = null) {
  if (job.running) return;
  const todo = items.filter((i) => (!labels[i.id] || !labels[i.id].spark) && (!only || only.includes(i.id))).map((i) => i.id).slice(0, limit);
  Object.assign(job, { running: true, done: 0, total: todo.length, failed: 0 });
  // four at a time
  await Promise.all([0, 1, 2, 3].map(async () => {
    while (todo.length) {
      const id = todo.shift();
      // one retry: now and then the model thinks too long and returns nothing
      try { await suggest(id); } catch (e) { try { await suggest(id); } catch (e2) { job.failed++; console.error(id, e2.message); } }
      job.done++;
    }
  }));
  job.running = false;
  console.log(`Spark done: ${job.done - job.failed} labelled, ${job.failed} failed, ${usage.in} in / ${usage.out} out tokens`);
}

const json = (res, o, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return fs.createReadStream(path.join(__dirname, "index.html")).pipe(res); }
  const m = url.pathname.match(/^\/crops\/([a-z]+-\d+)\.jpg$/);
  if (m) { res.writeHead(200, { "content-type": "image/jpeg", "cache-control": "max-age=3600" }); return fs.createReadStream(path.join(DIR, "crops", m[1] + ".jpg")).pipe(res); }
  if (url.pathname === "/api/state") return json(res, { items, labels, refs, POSTURES, ACTIVITIES, job, usage });
  if (url.pathname === "/api/progress") return json(res, { job, usage });
  if (req.method === "POST") {
    let raw = ""; for await (const c of req) raw += c;
    const b = JSON.parse(raw || "{}");
    if (url.pathname === "/api/suggest") { suggestAll(Number(b.limit) || Infinity, Array.isArray(b.ids) ? b.ids : null); return json(res, { started: true, job }); }
    if (url.pathname === "/api/label" && items.some((i) => i.id === b.id)) {
      if (!POSTURES.includes(b.posture)) return json(res, { error: "posture" }, 400);
      labels[b.id] = { ...(labels[b.id] || {}), posture: b.posture, activity: (b.activity || []).filter((a) => ACTIVITIES.includes(a)), him: !!b.him, reviewed: Date.now() };
      save(); return json(res, { ok: true });
    }
  }
  json(res, { error: "not found" }, 404);
}).listen(PORT, () => console.log(`FurSight labeller on http://localhost:${PORT} (${items.length} crops, ${Object.values(labels).filter((l) => l.reviewed).length} reviewed)`));
