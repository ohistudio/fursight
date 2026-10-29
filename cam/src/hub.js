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
//   GET  /hub/diary?limit=&before=&kinds= (token)                     -> { entries }  (no images; kinds = comma list)
//   GET  /hub/diary/:id/image             (token)                     -> image/jpeg (or png)
//   GET  /hub/i/:household/:id?e=&s=                                  -> the same picture, by an expiring signed link (notifications)
//   PUT  /hub/cams/:channel               (token) {name}              -> cam      (a webcam registering itself)
//   PUT  /hub/home                        (token) {lat, lng, radius?} -> home     (where "home" is, for home/away)
//   PUT  /hub/devices/:id                 (token) {name}              -> device   (rename)
//   DELETE /hub/devices/:id               (token)                     -> ok
//   PUT  /hub/push                        (token) {token, sandbox}    -> ok       (an iPhone's notification token)
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
  // a diary picture for a notification: signed for that one picture, valid for a day, no device token in the link
  let im = path.match(/^\/i\/([A-Za-z0-9]{16})\/([A-Za-z0-9]{1,20})$/);
  if (im && req.method === "GET") {
    const e = Number(url.searchParams.get("e")) || 0;
    if (e < Date.now() || (await hmac(env, `img.${im[1]}.${im[2]}.${e}`)) !== url.searchParams.get("s")) return err("link expired", 403);
    const fwd = new Request(`https://h/diary/${im[2]}/image`, { headers: { "x-device": "signed-link", "x-household": im[1] } });
    return env.HOUSEHOLDS.get(env.HOUSEHOLDS.idFromName(im[1])).fetch(fwd);
  }

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
      CREATE INDEX IF NOT EXISTS diary_at ON diary(at);
      CREATE TABLE IF NOT EXISTS push (device TEXT PRIMARY KEY, token TEXT, sandbox INTEGER);`);
  }

  // Something worth a phone notification just landed in the diary: a flop moment, a warning, a tray alert, or a
  // "don't" / "see a vet". The Vercel server holds the Apple push key, so ask it to send to every other iPhone.
  notify(id, e, from, hasImage) {
    const worth = ["moment", "warning", "alert"].includes(e.kind) || ["toxic", "vet"].includes(e.verdict) || (e.kind === "droppings" && e.verdict && e.verdict !== "safe");
    if (!worth || !this.env.NOTIFY_URL) return;
    const targets = this.all("SELECT token, sandbox FROM push WHERE device != ?", from).map((r) => ({ token: r.token, sandbox: !!r.sandbox }));
    if (!targets.length) return;
    const pet = this.one("SELECT data FROM pets ORDER BY updated DESC LIMIT 1");
    const name = pet ? JSON.parse(pet.data).name : "FurSight";
    const body = e.kind === "moment" ? e.title : e.kind === "alert" ? `${e.title}. ${e.note || ""}`.trim() : e.verdict === "vet" ? `${e.title}: see a vet today` : e.verdict === "toxic" ? `${e.title}: don't` : `${e.title}${e.note ? ". " + e.note : ""}`;
    const household = this.one("SELECT v FROM meta WHERE k = 'household'")?.v;
    this.ctx.waitUntil((async () => {
      let image;
      if (hasImage && household) { const ex = Date.now() + 864e5; image = `${this.env.HUB_URL || "https://fursight-cam.wibble-crossplay.workers.dev"}/hub/i/${household}/${id}?e=${ex}&s=${await hmac(this.env, `img.${household}.${id}.${ex}`)}`; }
      await fetch(this.env.NOTIFY_URL, { method: "POST", headers: { "content-type": "application/json", "x-hub-key": this.env.HUB_KEY },
        body: JSON.stringify({ targets, title: name, body: body.slice(0, 180), entry: id, kind: e.kind, image }) });
    })().catch(() => {}));
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
    if (device === "signed-link") {
      const mm2 = p.match(/^\/diary\/([A-Za-z0-9]{1,20})\/image$/), r = mm2 && this.one("SELECT image FROM diary WHERE id = ?", mm2[1]);
      return r && r.image ? new Response(r.image, { headers: { "content-type": imageType(r.image), "cache-control": "private, max-age=86400" } }) : err("no image", 404);
    }
    if (!this.one("SELECT id FROM devices WHERE id = ?", device)) return err("this device was removed", 401);
    this.sql.exec("UPDATE devices SET seen = ? WHERE id = ?", Date.now(), device);

    if (p === "/me" && m === "GET") {
      const pets = this.all("SELECT id, data, photo IS NOT NULL AS has_photo, updated FROM pets ORDER BY updated").map((r) => ({ id: r.id, ...JSON.parse(r.data), has_photo: !!r.has_photo, updated: r.updated }));
      // newest first: the glasses and the Quest watch the first one, so that's the cam most recently started
      const cams = this.all("SELECT channel, name, updated FROM cams ORDER BY updated DESC");
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
      this.notify(id, entry, device, !!image);
      return json({ id, at, ...entry, has_image: !!image });
    }
    // remove an entry (the owner's call, from the web app's diary): gone for every device, picture included
    if ((mm = p.match(/^\/diary\/([A-Za-z0-9]{1,24})$/)) && m === "DELETE") {
      this.sql.exec("DELETE FROM diary WHERE id = ?", mm[1]);
      return json({ ok: true, id: mm[1] });
    }
    if (p === "/diary" && m === "GET") {
      const limit = Math.min(200, Number(url.searchParams.get("limit")) || 50), before = Number(url.searchParams.get("before")) || 9e15;
      // ?kinds=record,photo: only those (uploads can be dated years back, past the latest 200)
      const kinds = (url.searchParams.get("kinds") || "").split(",").filter((k) => /^[a-z-]{1,20}$/.test(k)).slice(0, 8);
      const entries = (kinds.length
        ? this.all(`SELECT id, at, data, image IS NOT NULL AS has_image, hex(substr(image, 1, 1)) = '89' AS png FROM diary WHERE at < ? AND json_extract(data, '$.kind') IN (${kinds.map(() => "?").join(",")}) ORDER BY at DESC LIMIT ?`, before, ...kinds, limit)
        : this.all("SELECT id, at, data, image IS NOT NULL AS has_image, hex(substr(image, 1, 1)) = '89' AS png FROM diary WHERE at < ? ORDER BY at DESC LIMIT ?", before, limit))
        .map((r) => ({ id: r.id, at: r.at, ...JSON.parse(r.data), has_image: !!r.has_image, ...(r.png ? { png: true } : {}) }));   // png: a cut-out sticker
      return json({ entries });
    }
    if ((mm = p.match(/^\/diary\/([A-Za-z0-9]{1,20})\/image$/)) && m === "GET") {
      const r = this.one("SELECT image FROM diary WHERE id = ?", mm[1]);
      return r && r.image ? new Response(r.image, { headers: { "content-type": imageType(r.image), "cache-control": "private, max-age=86400", ...CORS } }) : err("no image", 404);
    }

    if ((mm = p.match(/^\/cams\/([A-Za-z0-9]{16})$/)) && m === "PUT") {
      const b = await req.json().catch(() => ({}));
      // one cam per device: a browser that lost its saved channel starts a new one, which replaces the old.
      // {replaces: channel}: this device takes over an existing cam (its name and its place in the list)
      this.sql.exec("DELETE FROM cams WHERE device = ? AND channel != ?", device, mm[1]);
      if (/^[A-Za-z0-9]{16}$/.test(String(b.replaces || "")) && b.replaces !== mm[1]) this.sql.exec("DELETE FROM cams WHERE channel = ?", b.replaces);
      this.sql.exec("INSERT OR REPLACE INTO cams VALUES (?, ?, ?, ?)", mm[1], String(b.name || "Pet cam").slice(0, 40), device, Date.now());
      return json({ channel: mm[1], name: b.name || "Pet cam" });
    }
    if ((mm = p.match(/^\/cams\/([A-Za-z0-9]{16})$/)) && m === "DELETE") {
      this.sql.exec("DELETE FROM cams WHERE channel = ?", mm[1]);
      return json({ ok: true });
    }
    if (p === "/home" && m === "PUT") {
      const b = await req.json().catch(() => ({}));
      const lat = Number(b.lat), lng = Number(b.lng), radius = Math.min(2000, Math.max(50, Number(b.radius) || 200));
      if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return err("lat/lng needed");
      const home = { lat: +lat.toFixed(5), lng: +lng.toFixed(5), radius };   // ~1 m precision is plenty
      this.sql.exec("INSERT OR REPLACE INTO meta VALUES ('home', ?)", JSON.stringify(home));
      return json(home);
    }
    if (p === "/push" && m === "PUT") {
      const b = await req.json().catch(() => ({}));
      if (!/^[0-9a-f]{32,200}$/i.test(String(b.token || ""))) return err("token must be the device's APNs token in hex");
      this.sql.exec("INSERT OR REPLACE INTO push VALUES (?, ?, ?)", device, b.token, b.sandbox ? 1 : 0);
      return json({ ok: true });
    }
    if ((mm = p.match(/^\/devices\/([A-Za-z0-9]{12})$/)) && m === "PUT") {
      const b = await req.json().catch(() => ({})), name = String(b.name || "").trim().slice(0, 40);
      if (!name) return err("name required");
      if (!this.one("SELECT id FROM devices WHERE id = ?", mm[1])) return err("no such device", 404);
      this.sql.exec("UPDATE devices SET name = ? WHERE id = ?", name, mm[1]);
      return json({ id: mm[1], name });
    }
    if ((mm = p.match(/^\/devices\/([A-Za-z0-9]{12})$/)) && m === "DELETE") {
      this.sql.exec("DELETE FROM devices WHERE id = ?", mm[1]);
      this.sql.exec("DELETE FROM cams WHERE device = ?", mm[1]);
      this.sql.exec("DELETE FROM push WHERE device = ?", mm[1]);
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
// a JPEG, or a PNG (a moment's cut-out sticker keeps its transparency)
function jpeg(s) {
  const b = s.replace(/^data:image\/(jpeg|png);base64,/, "");
  if (b.length > 2_000_000 || /[^A-Za-z0-9+/=]/.test(b)) return false;
  const bytes = Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
  return (bytes[0] === 0xff && bytes[1] === 0xd8) || (bytes[0] === 0x89 && bytes[1] === 0x50) ? bytes : false;
}
const imageType = (bytes) => (new Uint8Array(bytes)[0] === 0x89 ? "image/png" : "image/jpeg");

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
