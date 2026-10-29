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
  const today = diary.entries.filter((e) => e.at >= start.getTime() - 6 * 3600e3 && !/^(event|tray)/.test(e.kind)).slice(0, 15);   // today, plus late last night
  return { pet: me.pets[0] || null, cams: me.cams || [], today, home: me.home || null };
}

// The relay only sends while someone watches: asking for a frame wakes the camera, so keep asking for a
// couple of seconds until one is fresh. Returns a JPEG data URL, or null if the camera is off.
// notBefore: only accept a frame taken after this time (say, after changing the zoom).
async function camFrame(channel, waitMs = 3500, notBefore = 0) {
  const viewer = "server" + Math.random().toString(36).slice(2, 8), until = Date.now() + waitMs;
  while (Date.now() < until) {
    const r = await fetch(`${HUB}/c/${channel}/frame.jpg?v=${viewer}&t=${Date.now()}`).catch(() => null);
    const age = r ? Number(r.headers.get("x-frame-age")) : Infinity;
    if (r && r.status === 200 && age < 4000 && Date.now() - age > notBefore) return "data:image/jpeg;base64," + Buffer.from(await r.arrayBuffer()).toString("base64");
    await new Promise((ok) => setTimeout(ok, 350));
  }
  return null;
}

// a pet cam's digital zoom: { z: 1-4, x, y } with the centre as 0-1 of the full picture
async function camView(channel, view) {
  const r = await fetch(`${HUB}/c/${channel}/view`, view ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(view) } : {}).catch(() => null);
  return r && r.ok ? r.json() : { z: 1, x: 0.5, y: 0.5 };
}

// the pet's photo as a data URL (for Muse Image), or null
async function petPhoto(token, petId) {
  const r = await fetch(`${HUB}/hub/pets/${petId}/photo`, { headers: { authorization: "Bearer " + token } });
  return r.ok ? "data:image/jpeg;base64," + Buffer.from(await r.arrayBuffer()).toString("base64") : null;
}

const recent = (token, limit = 200) => get(`/diary?limit=${limit}`, token).then((d) => d.entries);

async function addDiary(token, entry) {
  const r = await fetch(HUB + "/hub/diary", { method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(entry) });
  return r.ok ? r.json() : null;
}

module.exports = { context, camFrame, camView, petPhoto, recent, addDiary };
