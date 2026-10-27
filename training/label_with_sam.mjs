// SAM 3.1 as the teacher: track the pet through each clip and write a COCO detection dataset.
//
//   node label_with_sam.mjs --prompt rabbit --out data/xiaosi clip1.mov clip2.mov ...
//
// Each clip is cut to FPS frames per second at SIDE px on the long edge (SAM bills per frame, so this
// is the cost dial), sent to sam-3.1 as one video request, and every tracked box becomes a COCO
// annotation on the matching JPEG. Clips alternate into val so the split never shares a clip
// with train. Needs MODEL_API_KEY (reads ../server/.env.local if present) and ffmpeg.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import OpenAI from "openai";
import { parseVideoStream, recordsOfKind } from "@meta-sam/parser";

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf("--" + name); return i < 0 ? def : args.splice(i, 2)[1]; };
const PROMPT = opt("prompt", "rabbit");
const OUT = path.resolve(opt("out", "data/pet"));
const FPS = Number(opt("fps", "5"));
const SIDE = Number(opt("side", "640"));
const VAL_EVERY = Number(opt("val-every", "5")); // every 5th clip goes to val; a lone clip splits by time instead
const clips = args;
if (!clips.length) { console.error("usage: node label_with_sam.mjs [--prompt rabbit] [--out dir] [--fps 5] clips..."); process.exit(1); }

if (!process.env.MODEL_API_KEY) {
  const env = new URL("../server/.env.local", import.meta.url);
  if (fs.existsSync(env)) for (const l of fs.readFileSync(env, "utf8").split("\n")) { const m = l.match(/^MODEL_API_KEY=(.+)$/); if (m) process.env.MODEL_API_KEY = m[1].trim(); }
}
const client = new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: process.env.MODEL_API_KEY });

const coco = () => ({ images: [], annotations: [], categories: [{ id: 1, name: PROMPT }] });
const sets = { train: coco(), val: coco() };
let imageId = 0, annId = 0, framesBilled = 0;
fs.mkdirSync(path.join(OUT, "images"), { recursive: true });

for (const [ci, clip] of clips.entries()) {
  const name = path.basename(clip).replace(/\.[^.]+$/, "").replace(/[^\w-]/g, "_");
  const work = path.join(OUT, "work", name);
  fs.mkdirSync(work, { recursive: true });
  const scale = `scale='if(gt(iw,ih),${SIDE},-2)':'if(gt(iw,ih),-2,${SIDE})'`;
  // the same filter feeds SAM and the JPEGs, so frame N of the request is frame N on disk
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", clip, "-vf", `fps=${FPS},${scale}`, "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", path.join(work, "sam.mp4")]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(work, "sam.mp4"), "-q:v", "3", path.join(work, "%05d.jpg")]);
  const frames = fs.readdirSync(work).filter((f) => f.endsWith(".jpg")).sort();

  const t0 = Date.now();
  const stream = await client.responses.create({
    model: "sam-3.1", stream: true,
    input: [{ role: "user", content: [
      { type: "input_text", text: PROMPT },
      { type: "input_video", video_url: "data:video/mp4;base64," + fs.readFileSync(path.join(work, "sam.mp4")).toString("base64") },
    ] }],
  });
  async function* tap(s) { for await (const e of s) { if (e.type === "response.completed") framesBilled += e.response.usage?.video_frames_processed || 0; yield e; } }
  const result = await parseVideoStream(tap(stream)).finalResult;
  const boxes = recordsOfKind(result.records, "box");
  console.log(`${name}: ${frames.length} frames, ${boxes.length} boxes, ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  const byFrame = new Map();
  for (const b of boxes) { const f = b.frame?.frameIndex ?? 0; if (!byFrame.has(f)) byFrame.set(f, []); byFrame.get(f).push(b); }
  const [w, h] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", path.join(work, "sam.mp4")]).toString().trim().split(",").map(Number);

  for (const [fi, file] of frames.entries()) {
    const split = clips.length === 1 ? (fi >= frames.length * 0.8 ? "val" : "train") : (ci % VAL_EVERY === VAL_EVERY - 1 ? "val" : "train");
    const fileName = `${name}_${file}`;
    fs.copyFileSync(path.join(work, file), path.join(OUT, "images", fileName));
    const id = ++imageId;
    sets[split].images.push({ id, file_name: fileName, width: w, height: h });
    for (const b of byFrame.get(fi) || []) {
      const bw = b.right - b.left + 1, bh = b.bottom - b.top + 1; // SAM's right/bottom are inclusive
      sets[split].annotations.push({ id: ++annId, image_id: id, category_id: 1, bbox: [b.left, b.top, bw, bh], area: bw * bh, iscrowd: 0 });
    }
  }
}

// YOLOX's COCODataset expects <data_dir>/annotations/<ann> and <data_dir>/<name>/<file_name>
fs.mkdirSync(path.join(OUT, "annotations"), { recursive: true });
for (const s of ["train", "val"]) {
  fs.writeFileSync(path.join(OUT, "annotations", `instances_${s}.json`), JSON.stringify(sets[s]));
  const link = path.join(OUT, s);
  if (!fs.existsSync(link)) fs.symlinkSync("images", link);
}
const empty = (s) => sets[s].images.length - new Set(sets[s].annotations.map((a) => a.image_id)).size;
console.log(`train ${sets.train.images.length} imgs (${empty("train")} empty) | val ${sets.val.images.length} imgs (${empty("val")} empty) | SAM frames billed ${framesBilled} ≈ $${(framesBilled * 0.0002).toFixed(3)}`);
