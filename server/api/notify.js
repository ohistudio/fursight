// Phone notifications, sent through Apple. Only the hub calls this (it knows which iPhones belong to the
// household and what just landed in the diary); it proves itself with HUB_KEY.
//
//   POST /api/notify  (x-hub-key)  { targets: [{ token, sandbox }], title, body, entry, kind }  -> { sent, failed }
//
// Needs the Apple push key in the environment: APNS_KEY (the .p8 file's text), APNS_KEY_ID, APNS_TEAM_ID and
// APNS_TOPIC (the app's bundle id). Without them it does nothing, so the rest of FurSight works without push.
const crypto = require("crypto");
const http2 = require("http2");

let jwt = null, jwtAt = 0;
// Apple wants a fresh ES256 token at most hourly and no more often than every 20 minutes
function token() {
  if (jwt && Date.now() - jwtAt < 40 * 60e3) return jwt;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "ES256", kid: process.env.APNS_KEY_ID }), claims = b64({ iss: process.env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) });
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${claims}`), { key: process.env.APNS_KEY.replace(/\\n/g, "\n"), dsaEncoding: "ieee-p1363" }).toString("base64url");
  jwt = `${head}.${claims}.${sig}`; jwtAt = Date.now();
  return jwt;
}

function send(host, deviceToken, payload) {
  return new Promise((resolve) => {
    const client = http2.connect(`https://${host}`);
    client.on("error", (e) => resolve({ ok: false, reason: e.message }));
    const req = client.request({ ":method": "POST", ":path": `/3/device/${deviceToken}`, authorization: `bearer ${token()}`,
      "apns-topic": process.env.APNS_TOPIC, "apns-push-type": "alert", "apns-priority": "10", "content-type": "application/json" });
    let status = 0, data = "";
    req.on("response", (h) => (status = h[":status"]));
    req.on("data", (c) => (data += c));
    req.on("end", () => { client.close(); resolve({ ok: status === 200, status, reason: data }); });
    req.on("error", (e) => { client.close(); resolve({ ok: false, reason: e.message }); });
    req.end(JSON.stringify(payload));
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = req.headers["x-hub-key"];
  if (!process.env.HUB_KEY || !key || key.length !== process.env.HUB_KEY.length || !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(process.env.HUB_KEY))) return res.status(401).json({ error: "hub only" });
  if (!process.env.APNS_KEY || !process.env.APNS_KEY_ID || !process.env.APNS_TEAM_ID || !process.env.APNS_TOPIC) return res.status(200).json({ sent: 0, skipped: "no Apple push key set" });
  const b = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const payload = { aps: { alert: { title: String(b.title || "FurSight").slice(0, 60), body: String(b.body || "").slice(0, 200) }, sound: "default", "thread-id": "fursight" }, entry: b.entry, kind: b.kind };
  const results = await Promise.all((b.targets || []).slice(0, 10).map((t) => send(t.sandbox ? "api.sandbox.push.apple.com" : "api.push.apple.com", String(t.token), payload)));
  res.status(200).json({ sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).map((r) => r.reason || r.status) });
};
