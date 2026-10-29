// Reading a household from the hub with the caller's own device key: the pet (profile + care plan), recent
// diary entries, and a fresh picture from its pet cam.
const HUB = process.env.HUB_URL || "https://fursight-cam.wibble-crossplay.workers.dev";

async function get(path, token) {
  const r = await fetch(HUB + "/hub" + path, { headers: { authorization: "Bearer " + token } });
  if (!r.ok) throw Object.assign(new Error("hub " + r.status), { status: r.status === 401 ? 401 : 502 });
  return r.json();
}

// pet, today's diary (newest first, at most 15), cameras
async function context(token) {
  const [me, diary] = await Promise.all([get("/me", token), get("/diary?limit=30", token)]);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = diary.entries.filter((e) => e.at >= start.getTime() - 6 * 3600e3).slice(0, 15);   // today, plus late last night
  return { pet: me.pets[0] || null, cams: me.cams || [], today };
}

// The relay only sends while someone watches: asking for a frame wakes the camera, so keep asking for a
// couple of seconds until one is fresh. Returns a JPEG data URL, or null if the camera is off.
async function camFrame(channel, waitMs = 3500) {
  const viewer = "server" + Math.random().toString(36).slice(2, 8), until = Date.now() + waitMs;
  while (Date.now() < until) {
    const r = await fetch(`${HUB}/c/${channel}/frame.jpg?v=${viewer}&t=${Date.now()}`).catch(() => null);
    if (r && r.status === 200 && Number(r.headers.get("x-frame-age")) < 4000) return "data:image/jpeg;base64," + Buffer.from(await r.arrayBuffer()).toString("base64");
    await new Promise((ok) => setTimeout(ok, 350));
  }
  return null;
}

module.exports = { context, camFrame };
