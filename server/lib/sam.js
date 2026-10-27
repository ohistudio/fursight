// SAM 3.1 on one picture: "where is the rabbit?" -> boxes. Used live by the Ask agent to find the pet across
// the pet cams (later the same labels train a small detector that runs free on the cam itself).
//
//   find(dataUrl, "rabbit") -> [{ x0, y0, x1, y1 }]   each 0-1 of the picture, biggest first
let client = null, parser = null;

async function find(dataUrl, prompt) {
  if (!process.env.MODEL_API_KEY) throw Object.assign(new Error("server has no MODEL_API_KEY"), { status: 503 });
  if (!client) { const { default: OpenAI } = await import("openai"); client = new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: process.env.MODEL_API_KEY, maxRetries: 2, timeout: 30000 }); }
  if (!parser) parser = await import("@meta-sam/parser");
  const { w, h } = size(dataUrl);
  const stream = await client.responses.create({ model: "sam-3.1", stream: true,
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: dataUrl }] }] });
  const res = await parser.parseImageStream(stream).finalResult;
  return parser.recordsOfKind(res.records, "mask")
    .map((m) => ({ x0: m.bounds.left / w, y0: m.bounds.top / h, x1: m.bounds.right / w, y1: m.bounds.bottom / h }))
    .sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0));
}

// a JPEG's width and height, from its start-of-frame marker
function size(dataUrl) {
  const b = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return { w: 480, h: 480 };
}

module.exports = { find };
