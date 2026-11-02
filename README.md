# FurSight

**Spoil them. Worry less.** One pet care assistant on Meta Quest, your phone, smart glasses (Meta Ray-Ban Display) and the web. **Muse Spark** is the agent, **SAM 3.1** is the finder, and **Muse Voice Transcribe** hears you, all through the Meta Model API.

![FurSight on Quest, Ray-Ban Display and iPhone: a room check, the room remembering, a food check on the glasses, a meal check on the phone, his week](docs/demo.gif)

*Room check on Quest, the room remembering it next time, a food check on the glasses, a meal check on the phone, his week on Quest.*

Watch: [the intro](https://fursight-seven.vercel.app/intro/) · [how it uses Meta's models](https://fursight-seven.vercel.app/muse/) · [the kit](https://fursight-seven.vercel.app/kit/)

## What it does, on every device

- **Food check.** Hold food up to your glasses, Quest or phone: safe, a small treat or never, how much, and what instead. It reads labels and judges food as served (that salad dressing counts).
- **Room check.** Look round a room: every hazard he could chew, swallow or cut himself on is pinned on the real thing, the good things too. On Quest each hazard is saved as a **spatial anchor**: next time you open FurSight in that room, it asks if you fixed them.
- **Ask, wherever you are.** At the bowling alley or the traffic lights, ask your glasses how he is, or watch his pet cam. Muse Spark answers from his cams, his tray and his diary.
- **Three pet cams** watch him while you're not on your devices: SAM 3.1 finds him, Muse Spark notes how he rests, flops and eats his hay, and a flop sends you his sticker.
- **Poo check, vet papers, his week.** A photo of a few droppings is compared with the last check; a vet letter is read into his history; his week comes back as a Wrapped story and a card made of his real stickers.
- **Snap to make your own stickers** on Quest, with your real hands over every card through Meta's depth occlusion.

## Build for Your World

- **A problem I know firsthand.** A few months ago my rabbit, Xiaosi, got GI stasis: his gut stopped. Rabbits hide illness until it's serious, and since then every treat has felt like a risk.
- **Free up time and mental space.** Instead of watching him all day and second-guessing every treat, the pet cams and the FurSight Tray notice the small daily changes that come first (less hay, fewer tray visits, a dropping weight) and tell you when something's off. Treats are remembered, so you know if and when he can have the next one.
- **Something possible that wasn't before.** Hold a food up to your Ray-Ban Display and hear if he can have it. Ask your glasses what he's doing right now and get a sticker of him back. See verdict cards pinned to real food in Quest. A room that keeps an eye on his hay and tray for you.

FurSight is pet care: it never diagnoses. It notices changes and says when it's worth calling your vet, and the vet makes the calls.

## How it uses Meta's models

| Model | What it does in FurSight | Where |
|---|---|---|
| **Muse Spark** | Food verdicts as JSON (what, how safe, why, where, wait days); poses from the pet cam; hay and bowl levels; room checks; poo checks compared with the last one; vet papers read into his history; spoken notes sorted into the diary and calendar; weekly cards; and the Ask agent, which picks from 17 tools (find him, look through the cams, check his tray, read his calendar...) | [lib/meta.js](server/lib/meta.js) `spark()`, [lib/agent.js](server/lib/agent.js), [routes/food.js](server/routes/food.js), [routes/pose.js](server/routes/pose.js), [routes/levels.js](server/routes/levels.js), [routes/ask.js](server/routes/ask.js) |
| **SAM 3.1** | Finds him on each pet cam, cuts him out as stickers, measures the hay pile, outlines room hazards, rings his droppings for the poo check | [lib/sam.js](server/lib/sam.js), [routes/sticker.js](server/routes/sticker.js), [routes/room.js](server/routes/room.js) |
| **Muse Voice Transcribe** | Spoken questions and notes on Quest | [lib/meta.js](server/lib/meta.js) `transcribe()`, [routes/note.js](server/routes/note.js) |

## What it is

A rabbit care kit and app: pet cams watch how he rests, flops and eats his hay, a smart litter tray weighs him and what he leaves, and the app turns it into a diary, alerts and a weekly card. Hold up food and ask if he can have it. Ask what he's doing right now. Look round the room and see what he'll chew.

![The FurSight kit: two pet cams, the FurSight Tray and the app](docs/kit.svg)

![Concept render of the FurSight Tray](docs/tray-concept.jpg)

*The FurSight Tray, a concept render (not a photo).*

More on the kit: [fursight-seven.vercel.app/kit](https://fursight-seven.vercel.app/kit/). As a product, with rough costs, the subscription and the AI per household: [docs/product.md](docs/product.md). Try it without the kit or a rabbit: open [fursight-seven.vercel.app](https://fursight-seven.vercel.app) and press **Try it with a demo rabbit**.

Built for the Meta Global AI Developer Hackathon (Indie track, Build for Your World).

Runs on the web, iPhone, Ray-Ban Display (a glasses web app, plus the iPhone app through the Wearables Device Access Toolkit) and Meta Quest.

In this hackathon build the FurSight Tray's scale and sensors are simulated in the app, and labelled as simulated wherever they show. The pet cams are real: any webcam or old phone running the cam page.
