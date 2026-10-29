// Shared request plumbing: POST only, caller check, JSON body, image validation, error mapping.
// A caller is either the Quest build's shared token (x-fursight-app) or a device linked to a household
// (Authorization: Bearer fs1.<household>.<device>.<sig>, signed by the hub with HUB_KEY, checked here offline).
const crypto = require("crypto");

function linked(req) {
  const m = /^Bearer\s+fs1\.([A-Za-z0-9]{16})\.([A-Za-z0-9]{12})\.([\w-]+)$/.exec(req.headers.authorization || "");
  if (!m || !process.env.HUB_KEY) return null;
  const sig = crypto.createHmac("sha256", process.env.HUB_KEY).update(`fs1.${m[1]}.${m[2]}`).digest("base64url");
  return sig.length === m[3].length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(m[3])) ? { household: m[1], device: m[2] } : null;
}
const MAX_IMAGE_CHARS = 6_000_000; // ~4.5 MB of JPEG as base64; the app sends ~1280px frames, far below this

// open: no app token or linked device needed (the demo, before anyone has linked)
function handler(fn, { open = false } = {}) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    // the web app calls from the browser
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, x-fursight-app");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    const token = process.env.FURSIGHT_APP_TOKEN;
    const appOk = token && req.headers["x-fursight-app"] === token;
    if (token && !open && !appOk && !linked(req)) return res.status(401).json({ error: "unknown app" });
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
    if (!body || typeof body !== "object") return res.status(400).json({ error: "JSON body required" });
    try {
      res.status(200).json(await fn(body, req));
    } catch (e) {
      console.error("[fursight]", e.message, e.raw || "");
      res.status(e.status || 500).json({ error: e.expose ? e.message : "something went wrong", detail: e.status === 400 ? e.message : undefined });
    }
  };
}

// the household behind a request, if it came from a linked device (for fetching its pet, diary and camera)
function household(req) {
  const who = linked(req);
  return who ? { ...who, token: (req.headers.authorization || "").replace(/^Bearer\s+/i, "") } : null;
}

function bad(msg) { return Object.assign(new Error(msg), { status: 400, expose: true }); }

function image(v, field = "image") {
  if (typeof v !== "string" || !/^(data:image\/(jpeg|png|webp|heic);base64,|https:\/\/)/.test(v)) throw bad(field + " must be a data:image URL or https URL");
  if (v.length > MAX_IMAGE_CHARS) throw bad(field + " too large");
  return v;
}

function text(v, max = 300) { return String(v ?? "").trim().slice(0, max); }

module.exports = { handler, bad, image, text, household };
