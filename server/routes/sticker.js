// A sticker of him, for a moment: SAM finds the pet in the photo and sends back its outline; the page cuts him out
// and gives him a white sticker border (the browser does the drawing, so the server needs no image library).
//
//   POST /api/sticker  { image }  -> { mask: { image: {w,h}, x, y, w, h, bits } | null, ms }
const { mask } = require("../lib/sam");
const { handler, image, household } = require("../lib/http");
const { context } = require("../lib/hub");

module.exports = handler(async (body, req) => {
  const t0 = Date.now(), home = household(req);
  const ctx = home ? await context(home.token).catch(() => null) : null;
  const species = (ctx && ctx.pet && ctx.pet.species) || "rabbit";
  return { mask: await mask(image(body.image), species), ms: Date.now() - t0 };
});
