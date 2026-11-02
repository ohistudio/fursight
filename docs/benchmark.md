# Food safety benchmark

FurSight's food check is Muse Spark's answer passed through a rabbit safety list (`server/lib/species/rabbit.js`, from RWAF and House Rabbit Society guidance). The list can make an answer stricter, never softer.

This benchmark tests the worst case: **Muse Spark wrongly calls every food "safe"**, and the list has to catch it. 135 foods, expected verdicts in [`eval/rabbit-foods.json`](../eval/rabbit-foods.json).

| | Foods | Result |
|---|---|---|
| Toxic (never) | 82 | **82 of 82 caught as toxic** |
| Treat only (caution) | 27 | **27 of 27 kept off "safe"** |
| Safe | 26 | **0 blocked as toxic**; 1 marked "small treat" (stricter than needed: parsley) |

**Zero toxic foods called safe**, even when the model is wrong. Run it: `npm test` (CI runs it on every push) or `npm run bench` to rebuild this page.

The first run found 14 toxic foods the list missed (garden plants like buttercup, privet, Madagascar periwinkle, hemlock and bracken, tomato leaves, sports drinks) and plural forms it didn't match (blueberries); they're fixed and now tested. It notices; your vet decides.
