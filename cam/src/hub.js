// FurSight hub: one household per Durable Object (pets, linked devices, cameras, diary with photos), plus a
// small Links object for pairing codes. Every device (phone web app, Quest, glasses, a webcam) holds its own
// signed token "fs1.<household>.<device>.<sig>" (HMAC-SHA256 with HUB_KEY, which the Vercel server shares, so it
// can check tokens without calling here). Removing a device from the household revokes it.
//
//   POST /hub/households                 {}                          -> { household, token }   (a new household)
//   GET  /hub/me                          (token)                     -> { household, pets, cams, devices }
//   PUT  /hub/pets/:id                    (token) {name, species, breed, sex, notes, care, photo?}  -> pet
//   GET  /hub/pets/:id/photo              (token)                     -> image/jpeg
//   POST /hub/diary                       (token) {kind, title, note, verdict?, image?, at?}        -> entry
//   GET  /hub/diary?limit=&before=        (token)                     -> { entries }  (no images)
//   GET  /hub/diary/:id/image             (token)                     -> image/jpeg
//   PUT  /hub/cams/:channel               (token) {name}              -> cam      (a webcam registering itself)
//   PUT  /hub/home                        (token) {lat, lng, radius?} -> home     (where "home" is, for home/away)
//   DELETE /hub/devices/:id               (token)                     -> ok
//   POST /hub/link/start                  {kind, name}                -> { code, nonce }  (a device wants in)
//   GET  /hub/link/poll?code=&nonce=                                  -> { status: waiting|linked|expired, token? }
//   POST /hub/link/claim                  (token) {code}              -> { device }       (the phone says yes)
// Token: header "Authorization: Bearer <token>", or ?t=<token> for <img> URLs.

const enc = new TextEncoder();
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS", "access-control-allow-headers": "authorization, content-type" };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS } });
const err = (msg, status = 400) => json({ error: msg }, status);
const ALNUM = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const CODE = "ACDEFHJKLMNPRTUVWXY34679";   // link codes: no look-alikes, easy to say and type
const rand = (n, set = ALNUM) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => set[b % set.length]).join("");
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(env, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(env.HUB_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}
export async function sign(env, household, device) { return `fs1.${household}.${device}.${await hmac(env, `fs1.${household}.${device}`)}`; }
export async function verify(env, token) {
  const m = /^fs1\.([A-Za-z0-9]{16})\.([A-Za-z0-9]{12})\.([\w-]+)$/.exec(token || "");
  if (!m || !env.HUB_KEY) return null;
  return (await hmac(env, `fs1.${m[1]}.${m[2]}`)) === m[3] ? { household: m[1], device: m[2] } : null;
}

export async function handleHub(req, env, url) {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const path = url.pathname.replace(/^\/hub/, "");
  if (path === "/households" && req.method === "POST") {
    const household = rand(16), device = rand(12);
    const token = await sign(env, household, device);
    const body = await req.json().catch(() => ({}));
    await env.HOUSEHOLDS.get(env.HOUSEHOLDS.idFromName(household)).fetch("https://h/init", { method: "POST", body: JSON.stringify({ household, device, kind: "phone", name: String(body.name || "Phone").slice(0, 40) }) });
    return json({ household, token });
  }
  if (path.startsWith("/link/start") || path.startsWith("/link/poll")) return env.LINKS.get(env.LINKS.idFromName("links")).fetch(req);

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || url.searchParams.get("t");
  const who = await verify(env, token);
  if (!who) return err("not linked", 401);
  const fwd = new Request("https://h" + path + url.search, req);
  fwd.headers.set("x-device", who.device);
  fwd.headers.set("x-household", who.household);
  return env.HOUSEHOLDS.get(env.HOUSEHOLDS.idFromName(who.household)).fetch(fwd);
}

// ---------------------------------------------------------------- a household

export class Household {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, kind TEXT, name TEXT, created INTEGER, seen INTEGER);
      CREATE TABLE IF NOT EXISTS pets (id TEXT PRIMARY KEY, data TEXT, photo BLOB, updated INTEGER);
      CREATE TABLE IF NOT EXISTS cams (channel TEXT PRIMARY KEY, name TEXT, device TEXT, updated INTEGER);
      CREATE TABLE IF NOT EXISTS diary (id TEXT PRIMARY KEY, at INTEGER, data TEXT, image BLOB);
      CREATE INDEX IF NOT EXISTS diary_at ON diary(at);`);
  }

  one(q, ...a) { const r = this.sql.exec(q, ...a).toArray(); return r[0]; }
  all(q, ...a) { return this.sql.exec(q, ...a).toArray(); }

  async fetch(req) {
    const url = new URL(req.url), p = url.pathname, m = req.method;
    if (p === "/init") {
      const b = await req.json();
      this.sql.exec("INSERT OR REPLACE INTO meta VALUES ('household', ?)", b.household);
      this.sql.exec("INSERT OR REPLACE INTO devices VALUES (?, ?, ?, ?, ?)", b.device, b.kind, b.name, Date.now(), Date.now());
      return json({ ok: true });
    }
    if (p === "/add-device") {   // from Links, after a phone claims a code
      const b = await req.json();
      this.sql.exec("INSERT OR REPLACE INTO devices VALUES (?, ?, ?, ?, ?)", b.device, b.kind, b.name, Date.now(), Date.now());
      return json({ ok: true });
    }

    // a removed device's token still verifies, so check it's still a member
    const device = req.headers.get("x-device"), household = req.headers.get("x-household");
    if (!this.one("SELECT id FROM devices WHERE id = ?", device)) return err("this device was removed", 401);
    this.sql.exec("UPDATE devices SET seen = ? WHERE id = ?", Date.now(), device);

    if (p === "/me" && m === "GET") {
      const pets = this.all("SELECT id, data, photo IS NOT NULL AS has_photo, updated FROM pets ORDER BY updated").map((r) => ({ id: r.id, ...JSON.parse(r.data), has_photo: !!r.has_photo, updated: r.updated }));
      const cams = this.all("SELECT channel, name, updated FROM cams ORDER BY updated");
      const devices = this.all("SELECT id, kind, name, created, seen FROM devices ORDER BY created");
      const home = this.one("SELECT v FROM meta WHERE k = 'home'");
      return json({ household, device, pets, cams, devices, home: home ? JSON.parse(home.v) : null });
    }

    let mm;
    if ((mm = p.match(/^\/pets\/([A-Za-z0-9-]{1,40})$/)) && m === "PUT") {
      const b = await req.json().catch(() => ({}));
      const pet = {};
      for (const k of ["name", "species", "breed", "sex", "notes", "colour", "age", "nicknames"]) if (b[k] != null) pet[k] = String(b[k]).slice(0, k === "notes" ? 600 : 80);
      if (b.care && typeof b.care === "object") pet.care = JSON.parse(JSON.stringify(b.care).slice(0, 12000));
      const old = this.one("SELECT data FROM pets WHERE id = ?", mm[1]);
      const merged = { ...(old ? JSON.parse(old.data) : {}), ...pet };
      const photo = typeof b.photo === "string" ? jpeg(b.photo) : null;
      if (photo === false) return err("photo must be a JPEG data URL under 1.5 MB");
      this.sql.exec("INSERT INTO pets (id, data, photo, updated) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, photo = COALESCE(excluded.photo, pets.photo), updated = excluded.updated",
        mm[1], JSON.stringify(merged), photo, Date.now());
      return json({ id: mm[1], ...merged });
    }
    if ((mm = p.match(/^\/pets\/([A-Za-z0-9-]{1,40})\/photo$/)) && m === "GET") {
      const r = this.one("SELECT photo FROM pets WHERE id = ?", mm[1]);
      return r && r.photo ? new Response(r.photo, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=60", ...CORS } }) : err("no photo", 404);
    }

    if (p === "/diary" && m === "POST") {
      const b = await req.json().catch(() => ({}));
      const entry = { kind: String(b.kind || "note").slice(0, 20), title: String(b.title || "").slice(0, 120), note: String(b.note || "").slice(0, 1200), verdict: b.verdict ? String(b.verdict).slice(0, 20) : undefined, pet: b.pet ? String(b.pet).slice(0, 40) : undefined, source: this.one("SELECT kind FROM devices WHERE id = ?", device)?.kind, extra: b.extra && typeof b.extra === "object" ? JSON.parse(JSON.stringify(b.extra).slice(0, 4000)) : undefined };
      const image = typeof b.image === "string" ? jpeg(b.image) : null;
      if (image === false) return err("image must be a JPEG data URL under 1.5 MB");
      const id = Date.now().toString(36) + rand(4), at = Number(b.at) || Date.now();
      this.sql.exec("INSERT INTO diary VALUES (?, ?, ?, ?)", id, at, JSON.stringify(entry), image);
      return json({ id, at, ...entry, has_image: !!image });
    }
    if (p === "/diary" && m === "GET") {
      const limit = Math.min(200, Number(url.searchParams.get("limit")) || 50), before = Number(url.searchParams.get("before")) || 9e15;
      const entries = this.all("SELECT id, at, data, image IS NOT NULL AS has_image FROM diary WHERE at < ? ORDER BY at DESC LIMIT ?", before, limit)
        .map((r) => ({ id: r.id, at: r.at, ...JSON.parse(r.data), has_image: !!r.has_image }));
      return json({ entries });
    }
    if ((mm = p.match(/^\/diary\/([A-Za-z0-9]{1,20})\/image$/)) && m === "GET") {
      const r = this.one("SELECT image FROM diary WHERE id = ?", mm[1]);
      return r && r.image ? new Response(r.image, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400", ...CORS } }) : err("no image", 404);
    }

    if ((mm = p.match(/^\/cams\/([A-Za-z0-9]{16})$/)) && m === "PUT") {
      const b = await req.json().catch(() => ({}));
      this.sql.exec("INSERT OR REPLACE INTO cams VALUES (?, ?, ?, ?)", mm[1], String(b.name || "Pet cam").slice(0, 40), device, Date.now());
      return json({ channel: mm[1], name: b.name || "Pet cam" });
    }
    if (p === "/home" && m === "PUT") {
      const b = await req.json().catch(() => ({}));
      const lat = Number(b.lat), lng = Number(b.lng), radius = Math.min(2000, Math.max(50, Number(b.radius) || 200));
      if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return err("lat/lng needed");
      const home = { lat: +lat.toFixed(5), lng: +lng.toFixed(5), radius };   // ~1 m precision is plenty
      this.sql.exec("INSERT OR REPLACE INTO meta VALUES ('home', ?)", JSON.stringify(home));
      return json(home);
    }
    if ((mm = p.match(/^\/devices\/([A-Za-z0-9]{12})$/)) && m === "DELETE") {
      this.sql.exec("DELETE FROM devices WHERE id = ?", mm[1]);
      this.sql.exec("DELETE FROM cams WHERE device = ?", mm[1]);
      return json({ ok: true });
    }
    if (p === "/link/claim" && m === "POST") {
      const b = await req.json().catch(() => ({}));
      const res = await this.env.LINKS.get(this.env.LINKS.idFromName("links")).fetch("https://l/claim", { method: "POST", body: JSON.stringify({ code: String(b.code || "").toUpperCase().trim(), household }) });
      return new Response(res.body, { status: res.status, headers: { "content-type": "application/json", ...CORS } });
    }
    return err("not found", 404);
  }
}

// a JPEG data URL (or bare base64) to bytes; false if it isn't one or is too big
function jpeg(s) {
  const b = s.replace(/^data:image\/jpeg;base64,/, "");
  if (b.length > 2_000_000 || /[^A-Za-z0-9+/=]/.test(b)) return false;
  const bytes = Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
  return bytes[0] === 0xff && bytes[1] === 0xd8 ? bytes : false;
}

// ---------------------------------------------------------------- pairing codes

export class Links {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS codes (code TEXT PRIMARY KEY, nonce TEXT, kind TEXT, name TEXT, created INTEGER, token TEXT)");
  }

  async fetch(req) {
    const url = new URL(req.url);
    const ttl = 10 * 60 * 1000;
    this.sql.exec("DELETE FROM codes WHERE created < ?", Date.now() - ttl);
    if (url.pathname.endsWith("/link/start")) {
      const b = await req.json().catch(() => ({}));
      const kind = ["quest", "glasses", "camera", "phone", "web", "tray"].includes(b.kind) ? b.kind : "device";
      let code; do code = rand(4, CODE); while (this.sql.exec("SELECT code FROM codes WHERE code = ?", code).toArray().length);
      const nonce = rand(24);
      this.sql.exec("INSERT INTO codes VALUES (?, ?, ?, ?, ?, NULL)", code, nonce, kind, String(b.name || kind).slice(0, 40), Date.now());
      return json({ code, nonce, expires_in: ttl / 1000 });
    }
    if (url.pathname.endsWith("/link/poll")) {
      const r = this.sql.exec("SELECT * FROM codes WHERE code = ? AND nonce = ?", (url.searchParams.get("code") || "").toUpperCase(), url.searchParams.get("nonce") || "").toArray()[0];
      if (!r) return json({ status: "expired" });
      if (!r.token) return json({ status: "waiting" });
      this.sql.exec("DELETE FROM codes WHERE code = ?", r.code);   // handed over once
      return json({ status: "linked", token: r.token });
    }
    if (url.pathname === "/claim") {
      const b = await req.json();
      const r = this.sql.exec("SELECT * FROM codes WHERE code = ?", b.code).toArray()[0];
      if (!r) return err("That code isn't valid any more. Make a new one on the device.", 404);
      if (r.token) return err("That code has already been used.", 409);
      const device = rand(12);
      const token = await sign(this.env, b.household, device);
      await this.env.HOUSEHOLDS.get(this.env.HOUSEHOLDS.idFromName(b.household)).fetch("https://h/add-device", { method: "POST", body: JSON.stringify({ device, kind: r.kind, name: r.name }) });
      this.sql.exec("UPDATE codes SET token = ? WHERE code = ?", token, r.code);
      return json({ device: { id: device, kind: r.kind, name: r.name } });
    }
    return err("not found", 404);
  }
}
