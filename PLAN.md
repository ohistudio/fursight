# FurSight plan

Meta Global AI Developer Hackathon, Indie track, Build for Your World.
**Submissions close Tue 4 Nov, 9 PM ET (Wed 5 Nov, 2 AM London).**

One idea: rabbits hide illness, FurSight notices. It notices, your vet decides.

## Pieces

| Piece | Where | Role |
|---|---|---|
| Server | `server/` (Vercel) | Holds the Meta key. Spark + SAM endpoints, the day log |
| Pet cam | `cam/` (Cloudflare) | Webcam page at home, live view on Ray-Ban Display, SAM finds him, Spark reads his pose, the diary |
| Quest | `quest/` (Unity) | Built on Quest 3, designed for Meta's VR Glasses: labels on real things |
| iOS + Ray-Ban Display | `ios/` (SwiftUI + DAT) | Food check, health glance, today card, alerts |
| Training (later) | `training/` | SAM labels the pet's footage, YOLOX-Tiny learns from it |

## Done
- [x] API key works, every model reachable (Spark 4.4 s, SAM 3.7 s per image)
- [x] SAM tracks Xiaosi through a whole clip (175/175 frames, one id)
- [x] Room check: Spark lists hazards, SAM outlines each (6 hazards, ~13 s, ~2.5p)
- [x] Droppings check: SAM counts and sizes against a coin, Spark judges (shape words, not "droppings")
- [x] Pet cam relay + MRBD glasses page with manifest and icon (live, JPEG frames)
- [x] SAM labeller for training data (`training/label_with_sam.mjs`)

## Built since
- [x] Server routes: food, pose, levels, sticker, room, droppings, ask (agent, 17 tools), note, recap, today, profile
- [x] Quest app, Ray-Ban Display web app, iOS app (DAT), pet cam with SAM + Spark instead of YOLO
- [x] Intro video page (`/intro/`, ~1:40), Muse breakdown (`/muse/`), kit page with the Tray render
- [x] README tied to the theme, with where each Meta model is used

## Final stretch

| Day | Focus |
|---|---|
| Fri 30 Oct | Test on the glasses, Quest and iPhone; Quest relink + Unity compile check; shot list |
| Sat 31 | Film the real footage (~80 s): pet cam, Ray-Ban food check, Quest cards, phone sticker alert, one Ask |
| Sun 1 Nov | Demo cam loops from the footage; fix anything filming turned up |
| Mon 2 | Splice the video: intro 0:00-0:50, footage, intro devices to end card (~3:00) |
| Tue 3 | Write-up, check the Official Rules for deliverables, submit early |
| Wed 4 | Buffer (deadline 9 PM ET, 2 AM London 5 Nov) |

- [ ] Device test: glasses, Quest, iPhone
- [ ] Quest relink (U) and Unity compile check
- [ ] Shot list
- [ ] Film
- [ ] Demo cam loops (`server/public/demo`, `#democam=`)
- [ ] Splice and export the video
- [ ] Submission text, repo link, team ID
- [ ] Rotate the Meta API key after the event

Nice to have: Stage Two rubric check, official Meta VR Glasses photo, Muse page order (food check not first), hot-day weather beat, food benchmark (~100 foods vs RWAF / HRS list).

## Later
- [ ] YOLOX-Tiny on the pet cam: train on SAM labels, export ONNX, run in the page (onnxruntime-web) so detection is free and works offline
- [ ] Treat budget
