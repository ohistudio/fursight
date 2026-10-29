// One place that talks to the Meta Model API (Responses API, OpenAI-style). Standard-mode models only:
// the -contributor variants let Meta train on what we send, and we send photos of people's homes.
const BASE = "https://api.meta.ai/v1";
const SPARK = process.env.SPARK_MODEL || "muse-spark-1.3";

// Structured answer from Muse Spark: system prompt, user text, optional images (data: URLs or https),
// constrained to a JSON schema. webSearch adds Meta's web_search tool so answers can cite sources.
async function spark({ system, text, images = [], schema, name, webSearch = false, effort = "low", maxTokens = 4000 }) {
  const content = [{ type: "input_text", text }];
  for (const url of images) content.push({ type: "input_image", image_url: url });
  const body = {
    model: SPARK,
    instructions: system,
    input: [{ role: "user", content }],
    reasoning: { effort },
    max_output_tokens: maxTokens,
    text: { format: { type: "json_schema", name, schema } },
  };
  if (webSearch) body.tools = [{ type: "web_search" }];
  const out = await call("/responses", body);

  let raw = "", citations = [];
  for (const item of out.output || []) {
    if (item.type !== "message") continue;
    for (const block of item.content || []) {
      if (block.type !== "output_text") continue;
      raw += block.text;
      for (const a of block.annotations || []) if (a.type === "url_citation") citations.push({ url: a.url, title: a.title || "" });
    }
  }
  let data;
  try { data = JSON.parse(raw); } catch { throw Object.assign(new Error("model returned no JSON"), { status: 502, raw: raw.slice(0, 300) }); }
  const seen = new Set();
  citations = citations.filter((c) => !seen.has(c.url) && seen.add(c.url));
  return { data, citations, usage: out.usage };
}

async function call(path, body) {
  const key = process.env.MODEL_API_KEY;
  if (!key) throw Object.assign(new Error("server has no MODEL_API_KEY"), { status: 503 });
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) throw Object.assign(new Error("Meta API " + r.status + ": " + txt.slice(0, 400)), { status: r.status === 429 ? 429 : 502 });
  return JSON.parse(txt);
}

// Muse Image, editing from reference photos (data URLs): returns a JPEG data URL. "low" is one pass, faster.
async function imageEdit(prompt, images, { size = "1024x1024", strength = "low" } = {}) {
  const out = await call("/images/edits", {
    model: "muse-image-1.0", prompt, n: 1, size, output_format: "jpeg", reasoning_strength: strength,
    images: images.map((u) => ({ image_url: u })),
  });
  const b64 = out.data && out.data[0] && out.data[0].b64_json;
  if (!b64) throw Object.assign(new Error("no image came back"), { status: 502 });
  return "data:image/jpeg;base64," + b64;
}

// Speech to text with Muse Voice Transcribe: a mono 16-bit WAV (16 or 24 kHz) in, the transcript out.
// keywords bias recognition towards words it might mishear (the pet's name, "hay", "pellets").
async function transcribe(wav, keywords = []) {
  const key = process.env.MODEL_API_KEY;
  if (!key) throw Object.assign(new Error("server has no MODEL_API_KEY"), { status: 503 });
  const form = new FormData();
  const request = { mode: "PUSH_TO_TALK", model: "muse-voice-transcribe-1.0", audioEncoding: "WAV" };
  if (keywords.length) request.keywords = keywords.slice(0, 20);
  form.append("request", new Blob([JSON.stringify(request)], { type: "application/json" }));
  form.append("audio", new Blob([wav], { type: "audio/wav" }), "question.wav");
  const r = await fetch(BASE + "/asr/transcribe?sessionId=fs-" + Date.now().toString(36), { method: "POST", headers: { Authorization: "Bearer " + key }, body: form });
  const txt = await r.text();
  if (!r.ok) throw Object.assign(new Error("Meta ASR " + r.status + ": " + txt.slice(0, 300)), { status: 502 });
  return (JSON.parse(txt).transcript || "").trim();
}

module.exports = { spark, call, transcribe, imageEdit, SPARK };
