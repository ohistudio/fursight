// Every route lives in routes/<name>.js; this one function answers them all, because the Hobby plan caps a
// deployment at 12 functions. POST /api/<name> works exactly as before.
const routes = {
  ask: require("../routes/ask"),
  demo: require("../routes/demo"),
  droppings: require("../routes/droppings"),
  fed: require("../routes/fed"),
  food: require("../routes/food"),
  ideas: require("../routes/ideas"),
  levels: require("../routes/levels"),
  log: require("../routes/log"),
  note: require("../routes/note"),
  notify: require("../routes/notify"),
  photo: require("../routes/photo"),
  pose: require("../routes/pose"),
  profile: require("../routes/profile"),
  recap: require("../routes/recap"),
  room: require("../routes/room"),
  stats: require("../routes/stats"),
  sticker: require("../routes/sticker"),
  today: require("../routes/today"),
  understand: require("../routes/understand"),
};

module.exports = (req, res) => {
  const route = routes[req.query.route];
  if (!route) return res.status(404).json({ error: "not found" });
  return route(req, res);
};
