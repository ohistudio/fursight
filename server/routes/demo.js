// "Try it with a demo rabbit": a new household with two weeks of Xiaosi's mock data, so anyone (judges included)
// can use every screen without the hardware or a rabbit. It never touches a real household; everything in it is
// marked simulated. The simulated pet cam and Tray are added from the Devices tab.
//
//   POST /api/demo  { tz? }   (the web app's own token, no household needed)
//   -> { token, entries }
const fs = require("fs");
const path = require("path");
const { handler } = require("../lib/http");
const { makeDemo } = require("../lib/demo");
const { tzOf } = require("../lib/fed");

const PIC = "data:image/jpeg;base64," + fs.readFileSync(path.join(__dirname, "../public/demo/xiaosi.jpg")).toString("base64");

// open to anyone (that's the point), so a light limit per visitor: a few demos an hour from one address
const seen = new Map();
module.exports = handler(async (body, req) => {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?", now = Date.now();
  const recent = (seen.get(ip) || []).filter((t) => now - t < 3600e3);
  if (recent.length >= 5) throw Object.assign(new Error("That's a lot of demos. Try again in a while."), { status: 429, expose: true });
  seen.set(ip, [...recent, now]);
  return makeDemo({ pic: PIC, tz: tzOf(body.tz) });
}, { open: true });
