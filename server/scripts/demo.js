// Make a demo household from the command line (the web app's "Try it with a demo rabbit" does the same).
//
//   node scripts/demo.js [photo-from-token]
//
// Pass a device token from the real household to copy the pet's photo across; otherwise the demo photo is used.
const fs = require("fs");
const path = require("path");
const { makeDemo, photo } = require("../lib/demo");
const WEB = process.env.WEB || "http://localhost:3030";

(async () => {
  const pic = (await photo(process.argv[2])) || "data:image/jpeg;base64," + fs.readFileSync(path.join(__dirname, "../public/demo/xiaosi.jpg")).toString("base64");
  const { token, entries } = await makeDemo({ pic, tz: -new Date().getTimezoneOffset() });
  console.log(`Demo household ready: ${entries} mock entries.`);
  console.log(`Open it:  ${WEB}/#t=${token}`);
  console.log(`Wrapped:  ${WEB}/wrapped/#t=${token}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
