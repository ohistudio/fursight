// Run the API on this machine, no Vercel needed:  node dev.js  (port 3030, reads .env.local)
// Same handlers as production: every routes/<name>.js answers POST /api/<name>.
const http = require("http");
const fs = require("fs");
const path = require("path");

const env = path.join(__dirname, ".env.local");
if (fs.existsSync(env)) for (const l of fs.readFileSync(env, "utf8").split("\n")) { const m = l.match(/^(\w+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); }

const PORT = Number(process.env.PORT || 3030);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };

http.createServer(async (req, res) => {
  // the web app: files in public/, like Vercel serves them
  if (!req.url.startsWith("/api/")) {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/\.\.+/g, "");
    const f = path.join(__dirname, "public", rel.endsWith("/") ? rel + "index.html" : rel);
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end("not found"); }
    const type = TYPES[path.extname(f)] || (f.endsWith(".mp4") ? "video/mp4" : "application/octet-stream"), size = fs.statSync(f).size;
    // byte ranges, like Vercel: a video can only jump to a time (the demo cams' shared clock) if the server sends parts
    const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (r) {
      const a = r[1] ? Number(r[1]) : size - Number(r[2]), b = r[1] && r[2] ? Math.min(Number(r[2]), size - 1) : size - 1;
      res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${a}-${b}/${size}`, "Content-Length": b - a + 1, "Accept-Ranges": "bytes" });
      return fs.createReadStream(f, { start: a, end: b }).pipe(res);
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
    return fs.createReadStream(f).pipe(res);
  }
  const m = req.url.match(/^\/api\/([a-z]+)/);
  const file = m && path.join(__dirname, "routes", m[1] + ".js");
  if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end("not found"); }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try { req.body = JSON.parse(raw || "{}"); } catch { req.body = raw; }
  const t0 = Date.now();
  // the bits of Vercel's response object the handlers use
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - t0}ms`); };
  delete require.cache[require.resolve(file)];   // pick up edits without a restart
  require(file)(req, res);
}).listen(PORT, () => console.log(`FurSight API on http://localhost:${PORT}`));
