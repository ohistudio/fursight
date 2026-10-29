// What is he doing? One look from the pet cam when he's settled (the cam page spots movement for free and only
// asks when the picture has gone still), so a day costs a few dozen small calls, not one a minute.
//
//   POST /api/pose  { image }   (a household device)
//   -> { visible, pose: loaf|stretched|flop|sitting|eating|grooming|chewing|other, chewing_what, caption, ms }
//
// A flop or a long stretch is a "moment" worth a photo; chewing something that isn't food is a warning.
const { spark } = require("../lib/meta");
const { handler, image, household } = require("../lib/http");
const { context } = require("../lib/hub");

const POSES = ["loaf", "stretched", "flop", "sitting", "eating", "grooming", "chewing", "other"];
const SCHEMA = {
  type: "object",
  properties: {
    visible: { type: "boolean", description: "is the pet clearly in the picture" },
    pose: { type: "string", enum: POSES, description: "loaf = tucked up, feet under; stretched = lying down with legs out; flop = rolled onto his side; chewing = chewing something that isn't food" },
    chewing_what: { type: "string", description: "only for chewing: what (cable, sofa leg, carpet...), else empty" },
    caption: { type: "string", description: "a warm, short line for the owner, at most 10 words, using his name or one of his nicknames, no em dashes" },
  },
  required: ["visible", "pose", "chewing_what", "caption"],
};

module.exports = handler(async (body, req) => {
  const t0 = Date.now();
  const home = household(req);
  if (!home) throw Object.assign(new Error("link this camera to a household first"), { status: 401, expose: true });
  const ctx = await context(home.token);
  const p = ctx.pet || { name: "your pet", species: "rabbit" };
  const nicks = String(p.nicknames || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const { data } = await spark({
    system: `You watch a pet cam for ${p.name}, a ${p.species}${nicks.length ? ` (nicknames: ${nicks.join(", ")}; use one now and then)` : ""}. Say what he's doing in this one picture. Be exact about lying down: a loaf is tucked up with feet underneath; stretched is lying down with legs out; a flop is rolled right over onto his side, a sign he's very relaxed. If he isn't clearly visible, say so.`,
    text: "What is he doing right now?",
    images: [image(body.image)], schema: SCHEMA, name: "Pose", maxTokens: 900,
  });
  return { visible: !!data.visible, pose: POSES.includes(data.pose) ? data.pose : "other", chewing_what: data.chewing_what || "", caption: String(data.caption || "").replace(/\s*[—–]\s*/g, ", "), ms: Date.now() - t0 };
});
