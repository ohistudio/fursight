# FurSight plan

Meta Global AI Developer Hackathon, Indie track, Build for Your World.
**Submissions close Tue 4 Nov, 9 PM ET (Wed 5 Nov, 2 AM London).**

One idea: rabbits hide illness, FurSight notices. It notices, your vet decides.

## Pieces

| Piece | Where | Role |
|---|---|---|
| Server | `server/` (Vercel) | Holds the Meta key. Spark + SAM endpoints, the day log |
| Pet cam | `cam/` (Cloudflare) | Webcam page at home, live view on Ray-Ban Display, YOLO + diary |
| Quest | `quest/` (Unity) | Built on Quest 3, designed for Meta's VR Glasses: labels on real things |
| iOS + Ray-Ban Display | `ios/` (SwiftUI + DAT) | Food check, health glance, today card, alerts |
| Training | `training/` | SAM labels the pet's footage, YOLOX-Tiny learns from it |

## Done
- [x] API key works, every model reachable (Spark 4.4 s, SAM 3.7 s per image)
- [x] SAM tracks Xiaosi through a whole clip (175/175 frames, one id)
- [x] Room check: Spark lists hazards, SAM outlines each (6 hazards, ~13 s, ~2.5p)
- [x] Droppings check: SAM counts and sizes against a coin, Spark judges (shape words, not "droppings")
- [x] Pet cam relay + MRBD glasses page with manifest and icon (live, JPEG frames)
- [x] SAM labeller for training data (`training/label_with_sam.mjs`)

## To do

### Quest (now)
- [ ] Unity project: 6000.3.17f1, Meta XR SDK 207, MRUK 207, URP, passthrough
- [ ] Capture a passthrough camera frame + the headset pose at that moment
- [ ] Server `/api/room`: Spark hazards then SAM outlines (the chain already proven)
- [ ] Lift each mask into the room: mask pixels, lens intrinsics, depth raycast, world point
- [ ] Anchored hazard labels: risk colour, name, why, fix; appear one by one while "checking the room"
- [ ] Health glance on the rabbit: SAM "rabbit", verdict label floats on him
- [ ] Food check: hold food up, verdict on the food
- [ ] Record the Quest demo shots

### Server
- [ ] `/api/profile` photo to species, breed, care plan
- [ ] `/api/food` verdict with sources (web search) + hard toxic list that overrides the model
- [ ] `/api/health` healthy / watch / vet
- [ ] `/api/room` hazards + masks
- [ ] `/api/droppings` count, sizes, compared with his usual
- [ ] `/api/day` store episodes, write the diary
- [ ] Deploy to Vercel, key in env only

### Pet cam and diary
- [ ] Film real footage from the webcam spot: hay, water bowl, food ball, rest, tray (few 1-2 min clips)
- [ ] SAM labels body + head, train YOLOX-Tiny, export ONNX
- [ ] YOLO in the webcam page (onnxruntime-web)
- [ ] Zone map by SAM: water bowl, food ball, hay, tray, bed (refresh hourly; hay zone moves with the hay)
- [ ] Episodes: drinking, grazing, foraging, toilet, resting, zoomies
- [ ] Spark checks ambiguous clips, writes the day's diary vs his usual
- [ ] Hay area over the day, pellet count before/after
- [ ] WebRTC for smooth video (JPEG stays as fallback)
- [ ] Glasses: today card, alert, peek with his outline

### iOS + Ray-Ban Display
- [ ] SwiftUI app, DAT 1.0.1 (not 0.8.0), display session
- [ ] Pet profile setup
- [ ] Food check from the glasses camera, verdict card on the lens
- [ ] Health glance
- [ ] Today card + alerts from the diary

### Proof and submission
- [ ] Food benchmark: ~100 foods keyed to a published rabbit list (RWAF / House Rabbit Society), target zero toxic foods called safe; publish the numbers
- [ ] README: what it does, models used, limits, "not a vet"
- [ ] Note on prior work: fresh codebase, the earlier Gemini FurSight is not used
- [ ] Demo video
- [ ] Check the Official Rules for deliverables
- [ ] Rotate the Meta API key after the event

## Schedule

| Day | Focus |
|---|---|
| Tue 27 Oct | Tests, pet cam, plan, Quest project |
| Wed 28 | Quest room check end to end; server endpoints deployed |
| Thu 29 | Quest health glance + food check; film footage, train YOLO |
| Fri 30 | YOLO in the webcam page, zones, episodes, WebRTC |
| Sat 31 | Diary, droppings check, day log |
| Sun 1 Nov | iOS + Ray-Ban Display: food check, today card, alerts |
| Mon 2 | Benchmark, README, polish |
| Tue 3 | Demo video, write-up, submit early |
| Wed 4 | Buffer (deadline 2 AM London, 5 Nov) |
