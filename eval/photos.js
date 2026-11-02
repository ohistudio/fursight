// The real-photo benchmark: 41 openly licensed food photos (Wikimedia Commons, credited in photos.json) through the
// live food check, end to end: Muse Spark names and judges what it sees, then the rabbit safety list has the last
// word. Writes docs/benchmark-photos.md.
//   FURSIGHT_APP_TOKEN=... npm run bench:photos      (reads server/.env.local if it's there)
// Photos are cached in eval/.photos (git ignores it).
const fs = require("fs"), path = require("path");

const env = path.join(__dirname, "../server/.env.local");
if (fs.existsSync(env)) for (const l of fs.readFileSync(env, "utf8").split("\n")) { const m = l.match(/^(\w+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const SERVER = process.env.FURSIGHT_URL || "https://fursight-seven.vercel.app", TOKEN = process.env.FURSIGHT_APP_TOKEN;
if (!TOKEN) { console.error("Set FURSIGHT_APP_TOKEN (the server's app token) first."); process.exit(1); }

const PHOTOS = require("./photos.json"), CACHE = path.join(__dirname, ".photos");
const UA = { "User-Agent": "FurSightBenchmark/0.1 (https://github.com/ohistudio/fursight)" };
const PET = { name: "Xiaosi", species: "rabbit", breed: "Netherland Dwarf" };

async function photo(p, i) {
  fs.mkdirSync(CACHE, { recursive: true });
  const f = path.join(CACHE, `${String(i).padStart(2, "0")}.jpg`);
  if (!fs.existsSync(f)) fs.writeFileSync(f, Buffer.from(await (await fetch(p.url, { headers: UA })).arrayBuffer()));
  return "data:image/jpeg;base64," + fs.readFileSync(f).toString("base64");
}

async function check(p, i) {
  const image = await photo(p, i), t0 = Date.now();
  for (let tries = 0; ; tries++) {
    const r = await fetch(SERVER + "/api/food", { method: "POST", headers: { "content-type": "application/json", "x-fursight-app": TOKEN }, body: JSON.stringify({ image, pet: PET }) });
    if (r.ok) {
      const j = await r.json(), items = j.items || [];
      const held = items[Number.isInteger(j.held) ? j.held : 0] || items[0] || { food: "(nothing)", verdict: "none" };
      return { ...p, saw: held.food, verdict: held.verdict, all: items.map((x) => `${x.food}: ${x.verdict}`), ms: Date.now() - t0 };
    }
    if (tries >= 2) return { ...p, saw: `error ${r.status}`, verdict: "error", all: [], ms: Date.now() - t0 };
    await new Promise((res) => setTimeout(res, 2000));
  }
}

// a pass: toxic called toxic; a treat kept off "safe"; a safe food not called toxic
const pass = (r) => (r.expected === "toxic" ? r.verdict === "toxic" : r.expected === "caution" ? ["caution", "toxic"].includes(r.verdict) : ["safe", "caution"].includes(r.verdict));
const WORD = { safe: "safe", caution: "small treat", toxic: "don't", none: "nothing seen", error: "error" };

(async () => {
  const out = [];
  for (let i = 0; i < PHOTOS.length; i += 4) {   // four at a time
    out.push(...(await Promise.all(PHOTOS.slice(i, i + 4).map((p, k) => check(p, i + k)))));
    process.stdout.write(`${out.length}/${PHOTOS.length}\r`);
  }
  const of = (e) => out.filter((r) => r.expected === e), ok = (rs) => rs.filter(pass).length;
  const toxicSafe = of("toxic").filter((r) => r.verdict === "safe").length;
  const ms = out.map((r) => r.ms).sort((a, b) => a - b), med = ms[Math.floor(ms.length / 2)], p90 = ms[Math.floor(ms.length * 0.9)];
  const md = `# Real-photo benchmark

The [list benchmark](benchmark.md) proves the safety net. This one tests the whole food check on real photos: ${out.length} openly licensed photos from Wikimedia Commons, each sent to the live food check exactly as the apps send a camera frame. **Muse Spark** names the food and judges it for a rabbit, then the rabbit safety list (RWAF and House Rabbit Society guidance) has the last word.

Run ${new Date().toISOString().slice(0, 10)} against ${SERVER}.

| | Result |
|---|---|
| Toxic foods and plants (${of("toxic").length}) | **${ok(of("toxic"))} of ${of("toxic").length} called "don't"** |
| Treat-only foods (${of("caution").length}) | **${ok(of("caution"))} of ${of("caution").length} kept off "safe"** |
| Safe foods (${of("safe").length}) | **${ok(of("safe"))} of ${of("safe").length} not blocked** |
| Toxic foods called safe | **${toxicSafe}** |
| Time per check | ${(med / 1000).toFixed(1)} s median, ${(p90 / 1000).toFixed(1)} s at the 90th percentile (from China through a VPN, so a little slower than most) |

Expected verdicts come from [rabbit-foods.json](../eval/rabbit-foods.json), the same guidance the safety list uses. Run it: \`npm run bench:photos\` (needs the server's app token). The photos and their credits are in [eval/photos.json](../eval/photos.json).

## What it got wrong

${out.filter((r) => !pass(r)).map((r) => `- **${r.food}** (expected ${WORD[r.expected]}): it saw ${r.all.join("; ") || "nothing"}.`).join("\n") || "Nothing."}

A miss that says "don't" to a safe food is the cautious kind: an unknown leaf, or a drink in the same photo, gets the stricter answer.

## Every photo

| Photo | Expected | FurSight saw | Verdict | Pass | Time |
|---|---|---|---|---|---|
${out.map((r) => `| [${r.food}](${r.page}) | ${WORD[r.expected]} | ${String(r.saw).replace(/\|/g, "/")} | ${WORD[r.verdict] || r.verdict} | ${pass(r) ? "✓" : "✗"} | ${(r.ms / 1000).toFixed(1)} s |`).join("\n")}

## Photo credits

${out.map((r) => `- ${r.food}: [${r.page.split("File:")[1] ? decodeURIComponent(r.page.split("File:")[1]).replace(/_/g, " ") : r.page}](${r.page}), ${r.author || "unknown"}, ${r.license}`).join("\n")}
`;
  fs.writeFileSync(path.join(__dirname, "../docs/benchmark-photos.md"), md);
  console.log(`toxic ${ok(of("toxic"))}/${of("toxic").length}, treats ${ok(of("caution"))}/${of("caution").length}, safe ${ok(of("safe"))}/${of("safe").length}, toxic called safe ${toxicSafe}, median ${med} ms`);
  for (const r of out.filter((r) => !pass(r))) console.log("  ✗", r.food, "expected", r.expected, "saw", r.saw, r.verdict, "|", r.all.join("; "));
})();
