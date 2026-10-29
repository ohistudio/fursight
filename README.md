# FurSight

Spoil him. Worry less. Rabbits hide illness, and FurSight notices the small changes so you don't have to keep watching.

A rabbit care kit and app: pet cams watch how he rests, flops and eats his hay, a smart litter tray weighs him and what he leaves, and the app turns it into a diary, alerts and a weekly card. Hold up food and ask if he can have it. Ask what he's doing right now. Look round the room and see what he'll chew.

![The FurSight kit: two pet cams, the FurSight Tray and the app](docs/kit.svg)

![Concept render of the FurSight Tray](docs/tray-concept.jpg)

*The FurSight Tray, a concept render (not a photo).*

More on the kit: [fursight-seven.vercel.app/kit](https://fursight-seven.vercel.app/kit/). As a product, with rough costs, the subscription and the AI per household: [docs/product.md](docs/product.md). Try it without the kit or a rabbit: open [fursight-seven.vercel.app](https://fursight-seven.vercel.app) and press **Try it with a demo rabbit**.

Built for the Meta Global AI Developer Hackathon (Indie track, Build for Your World) on the Meta Model API:

- **Muse Spark**: food verdicts, poses from the pet cam, hay and bowl levels, the Ask agent, care plans, weekly cards, all as structured JSON
- **SAM 3.1**: finds him on the pet cams, cuts him out as stickers, measures the hay pile, outlines room hazards
- **Muse Voice Transcribe**: spoken questions and notes on Quest

Runs on the web, iPhone, Ray-Ban Display (a glasses web app, plus the iPhone app through the Wearables Device Access Toolkit) and Meta Quest.

In this hackathon build the FurSight Tray's scale and sensors are simulated in the app, and labelled as simulated wherever they show. The pet cams are real: any webcam or old phone running the cam page.
