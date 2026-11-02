# Real-photo benchmark

The [list benchmark](benchmark.md) proves the safety net. This one tests the whole food check on real photos: 41 openly licensed photos from Wikimedia Commons, each sent to the live food check exactly as the apps send a camera frame. **Muse Spark** names the food and judges it for a rabbit, then the rabbit safety list (RWAF and House Rabbit Society guidance) has the last word.

Run 2026-11-02 against https://fursight-seven.vercel.app.

| | Result |
|---|---|
| Toxic foods and plants (19) | **19 of 19 called "don't"** |
| Treat-only foods (12) | **12 of 12 kept off "safe"** |
| Safe foods (10) | **8 of 10 not blocked** |
| Toxic foods called safe | **0** |
| Time per check | 5.9 s median, 9.0 s at the 90th percentile (from China through a VPN, so a little slower than most) |

Expected verdicts come from [rabbit-foods.json](../eval/rabbit-foods.json), the same guidance the safety list uses. Run it: `npm run bench:photos` (needs the server's app token). The photos and their credits are in [eval/photos.json](../eval/photos.json).

## What it got wrong

- **basil** (expected safe): it saw unidentified green leaf: toxic.
- **celery** (expected safe): it saw celery: caution; celery juice: toxic.

A miss that says "don't" to a safe food is the cautious kind: an unknown leaf, or a drink in the same photo, gets the stricter answer.

## Every photo

| Photo | Expected | FurSight saw | Verdict | Pass | Time |
|---|---|---|---|---|---|
| [chocolate](https://commons.wikimedia.org/wiki/File:2023_Baton_kokosowy_Knoppers_(2).jpg) | don't | chocolate caramel wafer bar | don't | ✓ | 4.3 s |
| [avocado](https://commons.wikimedia.org/wiki/File:Persea_americana_fruit_2.JPG) | don't | avocado | don't | ✓ | 4.5 s |
| [onion](https://commons.wikimedia.org/wiki/File:Spanish_Onions_-_The_Fruit_Bowl,_Brighton_2024-03-21.jpg) | don't | onion | don't | ✓ | 8.2 s |
| [garlic](https://commons.wikimedia.org/wiki/File:Garlic_bulbs_and_cloves.jpg) | don't | garlic | don't | ✓ | 4.3 s |
| [leek](https://commons.wikimedia.org/wiki/File:Leeks_-_Harbourside_Market,_Wellington,_New_Zealand_-_DSC09771.jpg) | don't | leek | don't | ✓ | 9.0 s |
| [rhubarb](https://commons.wikimedia.org/wiki/File:Rheum_rhabarbarum.2006-04-27.uellue.jpg) | don't | rhubarb | don't | ✓ | 6.6 s |
| [french fries](https://commons.wikimedia.org/wiki/File:Truffle_oil_french_fries_(33024792848).jpg) | don't | salted fried french fries with herbs | don't | ✓ | 8.7 s |
| [lily](https://commons.wikimedia.org/wiki/File:Formosa_lily,_Nagai_Park,_Osaka.jpg) | don't | white lily flower | don't | ✓ | 4.4 s |
| [daffodil](https://commons.wikimedia.org/wiki/File:Narcissus_flowers.jpg) | don't | daffodil | don't | ✓ | 4.3 s |
| [tulip](https://commons.wikimedia.org/wiki/File:Tulipa_suaveolens_floriade_to_Canberra.jpg) | don't | tulip | don't | ✓ | 5.0 s |
| [foxglove](https://commons.wikimedia.org/wiki/File:Fingerhut_-_Fischbacher_Alpen.JPG) | don't | foxglove | don't | ✓ | 3.7 s |
| [ivy](https://commons.wikimedia.org/wiki/File:Hedera_helix_Leaves_3008px.jpg) | don't | english ivy | don't | ✓ | 5.9 s |
| [yew](https://commons.wikimedia.org/wiki/File:Taxus_baccata_Lviv.JPG) | don't | yew | don't | ✓ | 6.0 s |
| [poinsettia](https://commons.wikimedia.org/wiki/File:Euphorbia_pulcherrima_(Barlovento)_04.jpg) | don't | poinsettia | don't | ✓ | 4.5 s |
| [buttercup](https://commons.wikimedia.org/wiki/File:Scherpe_boterbloem_(Ranunculus_acris)_01.JPG) | don't | buttercup | don't | ✓ | 5.4 s |
| [mushrooms](https://commons.wikimedia.org/wiki/File:Twee_tere_paddenstoelen._06-11-2024._(d.j.b).jpg) | don't | wild mushroom | don't | ✓ | 4.7 s |
| [coffee beans](https://commons.wikimedia.org/wiki/File:Roasted_coffee_beans.jpg) | don't | coffee beans | don't | ✓ | 5.0 s |
| [bread](https://commons.wikimedia.org/wiki/File:Home_made_sour_dough_bread.jpg) | don't | bread roll | don't | ✓ | 9.4 s |
| [cookies](https://commons.wikimedia.org/wiki/File:Koekjestrommel_open.jpg) | don't | assorted biscuits | don't | ✓ | 6.9 s |
| [apple](https://commons.wikimedia.org/wiki/File:Honeycrisp.jpg) | small treat | apple | small treat | ✓ | 4.5 s |
| [banana](https://commons.wikimedia.org/wiki/File:Cavendish_banana_from_Maracaibo.jpg) | small treat | banana | small treat | ✓ | 5.4 s |
| [strawberry](https://commons.wikimedia.org/wiki/File:Strawberries.JPG) | small treat | strawberry | small treat | ✓ | 12.2 s |
| [grapes](https://commons.wikimedia.org/wiki/File:Edle_Weinrebe,_%27Vitis_vinifera%27_subsp._%27vinifera.jpg) | small treat | grape | small treat | ✓ | 4.8 s |
| [blueberries](https://commons.wikimedia.org/wiki/File:Blueberries-In-Pack.jpg) | small treat | blueberry | small treat | ✓ | 5.1 s |
| [raspberries](https://commons.wikimedia.org/wiki/File:Framboise_Margy_3.jpg) | small treat | raspberry | small treat | ✓ | 6.5 s |
| [mango](https://commons.wikimedia.org/wiki/File:Mangos_-_single_and_halved.jpg) | small treat | mango | small treat | ✓ | 5.8 s |
| [pineapple](https://commons.wikimedia.org/wiki/File:AnanasComosusOnPlant.jpg) | small treat | pineapple | small treat | ✓ | 5.7 s |
| [carrot](https://commons.wikimedia.org/wiki/File:Carrots_of_many_colors.jpg) | small treat | carrot | small treat | ✓ | 10.0 s |
| [kiwi](https://commons.wikimedia.org/wiki/File:Kiwi_(Actinidia_chinensis)_1_Luc_Viatour.jpg) | small treat | kiwi | small treat | ✓ | 7.2 s |
| [orange](https://commons.wikimedia.org/wiki/File:Oranges_-_whole-halved-segment.jpg) | small treat | orange | small treat | ✓ | 6.2 s |
| [cherries](https://commons.wikimedia.org/wiki/File:Cherry_Stella444.jpg) | small treat | cherry | small treat | ✓ | 6.2 s |
| [romaine lettuce](https://commons.wikimedia.org/wiki/File:Romaine_lettuce.jpg) | safe | romaine lettuce | safe | ✓ | 7.1 s |
| [basil](https://commons.wikimedia.org/wiki/File:Ocimum_Basilicum_leaf_lighted_by_the_left.jpg) | safe | unidentified green leaf | don't | ✗ | 6.4 s |
| [mint](https://commons.wikimedia.org/wiki/File:Menthe_aromatique.JPG) | safe | mint | safe | ✓ | 5.5 s |
| [dandelion](https://commons.wikimedia.org/wiki/File:Taraxacum_officinale_plant6_(16375803122).jpg) | safe | dandelion leaves | safe | ✓ | 6.1 s |
| [hay](https://commons.wikimedia.org/wiki/File:Foin_meule_Roumanie.jpg) | safe | hay | safe | ✓ | 5.6 s |
| [bell pepper](https://commons.wikimedia.org/wiki/File:Capsicum_annuum_fruits_IMGP0049.jpg) | safe | bell pepper | safe | ✓ | 6.9 s |
| [celery](https://commons.wikimedia.org/wiki/File:Jus-celeri.jpg) | safe | celery juice | don't | ✗ | 9.2 s |
| [fennel](https://commons.wikimedia.org/wiki/File:Fennel_bulb.jpg) | safe | fennel | safe | ✓ | 6.5 s |
| [watercress](https://commons.wikimedia.org/wiki/File:Watercress_(2).JPG) | safe | watercress | small treat | ✓ | 6.2 s |
| [bok choy](https://commons.wikimedia.org/wiki/File:Brassica_rapa_var._chinensis_(leaf).jpg) | safe | bok choy | safe | ✓ | 4.7 s |

## Photo credits

- chocolate: [2023 Baton kokosowy Knoppers (2).jpg](https://commons.wikimedia.org/wiki/File:2023_Baton_kokosowy_Knoppers_(2).jpg), Jacek Halicki, CC BY-SA 4.0
- avocado: [Persea americana fruit 2.JPG](https://commons.wikimedia.org/wiki/File:Persea_americana_fruit_2.JPG), B.navez, CC BY-SA 3.0
- onion: [Spanish Onions - The Fruit Bowl, Brighton 2024-03-21.jpg](https://commons.wikimedia.org/wiki/File:Spanish_Onions_-_The_Fruit_Bowl,_Brighton_2024-03-21.jpg), Andy Li, CC0
- garlic: [Garlic bulbs and cloves.jpg](https://commons.wikimedia.org/wiki/File:Garlic_bulbs_and_cloves.jpg), Ivar Leidus, CC BY-SA 4.0
- leek: [Leeks - Harbourside Market, Wellington, New Zealand - DSC09771.jpg](https://commons.wikimedia.org/wiki/File:Leeks_-_Harbourside_Market,_Wellington,_New_Zealand_-_DSC09771.jpg), Daderot, CC0
- rhubarb: [Rheum rhabarbarum.2006-04-27.uellue.jpg](https://commons.wikimedia.org/wiki/File:Rheum_rhabarbarum.2006-04-27.uellue.jpg), Dieter Weber (User:Uellue), CC BY-SA 3.0
- french fries: [Truffle oil french fries (33024792848).jpg](https://commons.wikimedia.org/wiki/File:Truffle_oil_french_fries_(33024792848).jpg), Tony Webster from Minneapolis, Minnesota, United States, CC BY-SA 2.0
- lily: [Formosa lily, Nagai Park, Osaka.jpg](https://commons.wikimedia.org/wiki/File:Formosa_lily,_Nagai_Park,_Osaka.jpg), Laitche, CC BY-SA 4.0
- daffodil: [Narcissus flowers.jpg](https://commons.wikimedia.org/wiki/File:Narcissus_flowers.jpg), Uberprutser, CC BY-SA 3.0
- tulip: [Tulipa suaveolens floriade to Canberra.jpg](https://commons.wikimedia.org/wiki/File:Tulipa_suaveolens_floriade_to_Canberra.jpg), John O'Neill, CC BY-SA 3.0
- foxglove: [Fingerhut - Fischbacher Alpen.JPG](https://commons.wikimedia.org/wiki/File:Fingerhut_-_Fischbacher_Alpen.JPG), C.Stadler/Bwag, CC BY-SA 4.0
- ivy: [Hedera helix Leaves 3008px.jpg](https://commons.wikimedia.org/wiki/File:Hedera_helix_Leaves_3008px.jpg), Photo by and (c)2006 Derek Ramsey (Ram-Man).  Location credit to the Chanticleer, CC BY-SA 3.0
- yew: [Taxus baccata Lviv.JPG](https://commons.wikimedia.org/wiki/File:Taxus_baccata_Lviv.JPG), Mykola Swarnyk, CC BY-SA 3.0
- poinsettia: [Euphorbia pulcherrima (Barlovento) 04.jpg](https://commons.wikimedia.org/wiki/File:Euphorbia_pulcherrima_(Barlovento)_04.jpg), Frank Vincentz, CC BY-SA 3.0
- buttercup: [Scherpe boterbloem (Ranunculus acris) 01.JPG](https://commons.wikimedia.org/wiki/File:Scherpe_boterbloem_(Ranunculus_acris)_01.JPG), Dominicus Johannes Bergsma, CC BY-SA 3.0
- mushrooms: [Twee tere paddenstoelen. 06-11-2024. (d.j.b).jpg](https://commons.wikimedia.org/wiki/File:Twee_tere_paddenstoelen._06-11-2024._(d.j.b).jpg), Dominicus Johannes Bergsma, CC BY-SA 4.0
- coffee beans: [Roasted coffee beans.jpg](https://commons.wikimedia.org/wiki/File:Roasted_coffee_beans.jpg), MarkSweep, Public domain
- bread: [Home made sour dough bread.jpg](https://commons.wikimedia.org/wiki/File:Home_made_sour_dough_bread.jpg), Tomascastelazo, CC BY-SA 4.0
- cookies: [Koekjestrommel open.jpg](https://commons.wikimedia.org/wiki/File:Koekjestrommel_open.jpg), Pudding4brains, Public domain
- apple: [Honeycrisp.jpg](https://commons.wikimedia.org/wiki/File:Honeycrisp.jpg), Jonathunder, CC BY-SA 3.0
- banana: [Cavendish banana from Maracaibo.jpg](https://commons.wikimedia.org/wiki/File:Cavendish_banana_from_Maracaibo.jpg), Wilfredor, CC BY-SA 3.0
- strawberry: [Strawberries.JPG](https://commons.wikimedia.org/wiki/File:Strawberries.JPG), unknown, CC BY-SA 2.0
- grapes: [Edle Weinrebe, 'Vitis vinifera' subsp. 'vinifera.jpg](https://commons.wikimedia.org/wiki/File:Edle_Weinrebe,_%27Vitis_vinifera%27_subsp._%27vinifera.jpg), eflon (Alex from Ithaca, NY), CC BY 2.0
- blueberries: [Blueberries-In-Pack.jpg](https://commons.wikimedia.org/wiki/File:Blueberries-In-Pack.jpg), Evan-Amos, CC0
- raspberries: [Framboise Margy 3.jpg](https://commons.wikimedia.org/wiki/File:Framboise_Margy_3.jpg), Vassil, Public domain
- mango: [Mangos - single and halved.jpg](https://commons.wikimedia.org/wiki/File:Mangos_-_single_and_halved.jpg), Ivar Leidus, CC BY-SA 4.0
- pineapple: [AnanasComosusOnPlant.jpg](https://commons.wikimedia.org/wiki/File:AnanasComosusOnPlant.jpg), Markus Leupold-Löwenthal, CC BY-SA 3.0
- carrot: [Carrots of many colors.jpg](https://commons.wikimedia.org/wiki/File:Carrots_of_many_colors.jpg), Stephen Ausmus, Public domain
- kiwi: [Kiwi (Actinidia chinensis) 1 Luc Viatour.jpg](https://commons.wikimedia.org/wiki/File:Kiwi_(Actinidia_chinensis)_1_Luc_Viatour.jpg), Luc Viatour, CC BY-SA 2.5
- orange: [Oranges - whole-halved-segment.jpg](https://commons.wikimedia.org/wiki/File:Oranges_-_whole-halved-segment.jpg), Ivar Leidus, CC BY-SA 4.0
- cherries: [Cherry Stella444.jpg](https://commons.wikimedia.org/wiki/File:Cherry_Stella444.jpg), Benjamint444, edited by Fir0002, CC BY-SA 3.0
- romaine lettuce: [Romaine lettuce.jpg](https://commons.wikimedia.org/wiki/File:Romaine_lettuce.jpg), Rainer Zenz, CC BY-SA 3.0
- basil: [Ocimum Basilicum leaf lighted by the left.jpg](https://commons.wikimedia.org/wiki/File:Ocimum_Basilicum_leaf_lighted_by_the_left.jpg), BernaBotto, CC BY-SA 4.0
- mint: [Menthe aromatique.JPG](https://commons.wikimedia.org/wiki/File:Menthe_aromatique.JPG), moi-même, Public domain
- dandelion: [Taraxacum officinale plant6 (16375803122).jpg](https://commons.wikimedia.org/wiki/File:Taraxacum_officinale_plant6_(16375803122).jpg), Harry Rose from South West Rocks, Australia, CC BY 2.0
- hay: [Foin meule Roumanie.jpg](https://commons.wikimedia.org/wiki/File:Foin_meule_Roumanie.jpg), Myrabella, CC BY-SA 3.0
- bell pepper: [Capsicum annuum fruits IMGP0049.jpg](https://commons.wikimedia.org/wiki/File:Capsicum_annuum_fruits_IMGP0049.jpg), Nikodem Nijaki, CC BY-SA 3.0
- celery: [Jus-celeri.jpg](https://commons.wikimedia.org/wiki/File:Jus-celeri.jpg), Photodune, CC BY-SA 4.0
- fennel: [Fennel bulb.jpg](https://commons.wikimedia.org/wiki/File:Fennel_bulb.jpg), Tiia Monto, CC BY-SA 4.0
- watercress: [Watercress (2).JPG](https://commons.wikimedia.org/wiki/File:Watercress_(2).JPG), Masparasol, CC BY 3.0
- bok choy: [Brassica rapa var. chinensis (leaf).jpg](https://commons.wikimedia.org/wiki/File:Brassica_rapa_var._chinensis_(leaf).jpg), おむこさん志望, CC BY 2.5
