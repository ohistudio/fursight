// The pet a request is about. Until profiles exist on the server, the app sends name/species/breed/notes.
const { text } = require("./http");

function pet(body) {
  return {
    name: text(body?.pet?.name, 40),
    species: text(body?.pet?.species, 40) || "rabbit",
    breed: text(body?.pet?.breed, 60),
    notes: text(body?.pet?.notes, 300),
  };
}

const describe = (p) => `${p.name || "their pet"}, a ${p.species}${p.breed ? " (" + p.breed + ")" : ""}${p.notes ? ". Notes: " + p.notes : ""}`;

module.exports = { pet, describe };
