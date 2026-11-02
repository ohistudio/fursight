// How long each feature takes, end to end against the live server (5 runs each, median and slowest).
//   npm run bench:latency -- --room room.jpg --droppings poo.jpg      (photos of your own; reads server/.env.local)
// Food uses a benchmark photo, Ask and the sticker use the demo rabbit's photo.
const fs = require("fs"), path = require("path");
const env = path.join(__dirname, "../server/.env.local");
if (fs.existsSync(env)) for (const l of fs.readFileSync(env, "utf8").split("\n")) { const m = l.match(/^(\w+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const SERVER = process.env.FURSIGHT_URL || "https://fursight-seven.vercel.app", TOKEN = process.env.FURSIGHT_APP_TOKEN;
if (!TOKEN) { console.error("Set FURSIGHT_APP_TOKEN (the server's app token) first."); process.exit(1); }
const arg = (k) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : null; };
const jpg = (f) => "data:image/jpeg;base64," + fs.readFileSync(f).toString("base64");
const PET = { name: "Xiaosi", species: "rabbit", breed: "Netherland Dwarf" };
const him = path.join(__dirname, "../server/public/demo/xiaosi.jpg"), food = path.join(__dirname, ".photos/20.jpg");

const RUNS = [
  ["Food check (Muse Spark + safety list)", "/api/food", () => ({ image: jpg(fs.existsSync(food) ? food : him), pet: PET })],
  ["Ask, typed (Muse Spark agent)", "/api/ask", () => ({ question: "Give him a new nickname", image: jpg(him), pet: PET, from: "quest" })],
  ["Sticker (SAM 3.1 cut-out)", "/api/sticker", () => ({ image: jpg(him) })],
  ...(arg("room") ? [["Room check (Muse Spark names, SAM 3.1 outlines)", "/api/room", () => ({ image: jpg(arg("room")) })]] : []),
  ...(arg("droppings") ? [["Droppings check (SAM 3.1 + Muse Spark)", "/api/droppings", () => ({ image: jpg(arg("droppings")) })]] : []),
];

(async () => {
  const rows = [];
  for (const [name, route, body] of RUNS) {
    const ms = [];
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      const r = await fetch(SERVER + route, { method: "POST", headers: { "content-type": "application/json", "x-fursight-app": TOKEN }, body: JSON.stringify(body()) });
      await r.text();
      if (r.ok) ms.push(Date.now() - t0);
    }
    ms.sort((a, b) => a - b);
    rows.push(`| ${name} | ${ms.length ? (ms[Math.floor(ms.length / 2)] / 1000).toFixed(1) + " s" : "failed"} | ${ms.length ? (ms[ms.length - 1] / 1000).toFixed(1) + " s" : ""} |`);
    console.log(rows[rows.length - 1]);
  }
  console.log(`\n| Feature | Median | Slowest of 5 |\n|---|---|---|\n${rows.join("\n")}`);
})();
