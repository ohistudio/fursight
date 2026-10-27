// Rabbit food rules the model can't overrule. Spark names the food; if it matches here, the stricter of the
// two verdicts wins (a match can make an answer more cautious, never less). Based on the published guidance of
// the Rabbit Welfare Association & Fund (RWAF) and the House Rabbit Society; it's a safety net, not the whole list.
// Each entry: words that identify the food, the floor verdict, and the reason/alternative shown to the owner.
module.exports = [
  // toxic: never
  { match: ["chocolate", "cocoa"], verdict: "toxic", why: "Theobromine is poisonous to rabbits.", instead: "A sprig of fresh herbs like parsley or coriander." },
  { match: ["avocado", "guacamole"], verdict: "toxic", why: "Avocado contains persin, which can be fatal to rabbits.", instead: "A leaf of romaine lettuce." },
  { match: ["onion", "garlic", "leek", "chive", "shallot", "spring onion", "scallion"], verdict: "toxic", why: "Alliums damage red blood cells.", instead: "Fresh coriander or basil." },
  { match: ["rhubarb"], verdict: "toxic", why: "High in oxalic acid, poisonous to rabbits.", instead: "A few dandelion leaves." },
  { match: ["potato", "chips", "crisps", "fries"], verdict: "toxic", why: "Starchy and the plant parts contain solanine; upsets the gut.", instead: "A small piece of bell pepper." },
  { match: ["tomato leaf", "tomato plant", "tomato stem"], verdict: "toxic", why: "Tomato plant leaves and stems contain solanine.", instead: "A ripe tomato fruit only, as a tiny treat." },
  { match: ["lily", "lilies", "daffodil", "tulip", "foxglove", "ivy", "rhododendron", "azalea", "yew", "oleander", "poinsettia"], verdict: "toxic", why: "A poisonous plant for rabbits.", instead: "Rabbit-safe herbs like mint or basil." },
  { match: ["mushroom", "fungus"], verdict: "toxic", why: "Some mushrooms are deadly and rabbits can't be risked on them.", instead: "Leafy greens." },
  { match: ["coffee", "tea", "caffeine", "energy drink", "cola", "alcohol", "beer", "wine"], verdict: "toxic", why: "Caffeine and alcohol are poisonous to rabbits.", instead: "Fresh water." },
  { match: ["apple seed", "apple core", "cherry stone", "cherry pit", "peach stone", "plum stone", "apricot stone"], verdict: "toxic", why: "Seeds and stones contain cyanide compounds.", instead: "A small slice of apple flesh, no seeds." },
  { match: ["raw bean", "kidney bean", "broad bean"], verdict: "toxic", why: "Raw beans contain lectins that are harmful.", instead: "Leafy greens." },
  // unsafe for a herbivore's gut
  { match: ["bread", "toast", "cracker", "biscuit", "cookie", "cake", "pasta", "rice", "cereal", "crisp", "pretzel", "popcorn", "muesli"], verdict: "toxic", why: "Starchy, sugary human food upsets a rabbit's gut and can trigger GI stasis.", instead: "A handful of hay or a leafy green." },
  { match: ["meat", "chicken", "ham", "bacon", "fish", "egg", "cheese", "milk", "yoghurt", "yogurt", "butter", "ice cream"], verdict: "toxic", why: "Rabbits are strict herbivores and can't digest meat or dairy.", instead: "Fresh herbs or greens." },
  { match: ["nut", "peanut", "almond", "walnut", "cashew", "seed", "sunflower seed"], verdict: "toxic", why: "Too fatty, and a choking and blockage risk.", instead: "A small piece of carrot top." },
  { match: ["sweets", "candy", "sugar", "jam", "honey", "yoghurt drop", "yogurt drop"], verdict: "toxic", why: "Sugar upsets the gut bacteria rabbits rely on.", instead: "A tiny piece of fruit as a rare treat." },
  // caution: fine in small amounts, or easy to overdo
  { match: ["iceberg"], verdict: "caution", why: "Mostly water with little nutrition and can cause loose droppings.", instead: "Romaine or other dark leaf lettuce." },
  { match: ["apple", "banana", "strawberry", "grape", "blueberry", "raspberry", "pear", "melon", "mango", "pineapple", "kiwi", "orange", "peach", "plum", "cherry", "papaya", "fruit"], verdict: "caution", why: "Sugary: a treat, not a meal. No more than a teaspoon-sized piece a day.", instead: "Leafy herbs for everyday." },
  { match: ["carrot"], verdict: "caution", why: "Carrot root is sugary, so treat-sized pieces only; the leafy tops are fine.", instead: "Carrot tops." },
  { match: ["cabbage", "broccoli", "cauliflower", "kale", "brussels sprout"], verdict: "caution", why: "Can cause gas; introduce slowly and in small amounts.", instead: "Romaine, coriander or parsley." },
  { match: ["spinach", "parsley", "beet greens", "chard"], verdict: "caution", why: "Fine, but high in oxalates; rotate with other greens.", instead: "Mix with coriander, basil or romaine." },
  { match: ["pellet", "nugget"], verdict: "caution", why: "Rabbit pellets are fine in measured amounts (about an egg cup a day for a small rabbit). Hay should be most of the diet.", instead: "Unlimited hay." },
];
