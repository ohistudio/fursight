# How to use FurSight

One pet, one household, every device. Start on the web (it makes the household), then link the other devices to it with a 4-letter code from the web app's **Devices** tab. To build and run each part yourself, see the [Quickstart](../README.md#quickstart).

## Web app (start here)

[fursight-seven.vercel.app](https://fursight-seven.vercel.app), on a computer or phone browser. No key, no login.

1. Press **Try it with a demo rabbit** for two weeks of a demo rabbit's life, a simulated pet cam and a simulated litter tray scale. Or press **Add your pet** and take a photo of yours: FurSight works out the species and breed and writes a care plan you can edit.
2. The tabs along the bottom:
   - **Today**: alerts, what he's been doing, his week wrapped, the diary. Add a note, photos, videos or vet papers.
   - **Care**: tick off daily care (hay, water, greens, a health check); the streak counts days with everything done.
   - **Calendar**: vet visits, vaccinations, birthdays, grooming that's due.
   - **Stats**: his week in charts (weight, tray visits, activity, hay).
   - **Pet cam**: watch his cams, or choose **Use this device as a pet cam** to turn a webcam or old phone into one.
   - **Devices**: link Quest, the glasses or the iPhone by typing the code they show; remove a device to unlink it.

## Meta Quest 3

The app runs in passthrough mixed reality and uses hand tracking (controllers work too).

1. Open FurSight. The first time, it shows a 4-letter code: type it into the web app's **Devices** tab.
2. **Turn your left palm towards your face** to open the menu. Press a button by poking it with a finger, or point and pinch. With controllers: X or Y opens the menu, the trigger presses.
3. The buttons:
   - **Check food**: hold food up and press. A card pins to each food: safe, small treat only, or don't, with how much and what to give instead.
   - **Check room**: look around the room and press. Hazards he might chew or eat (cables, plants, medicines, sharp things) get a label on the real object, and the room remembers them: next time it asks if you fixed them.
   - **Poo check**: look at his droppings and press for a health read.
   - **Ask**: press, ask out loud ("How is he?", "Can he have this?", "Give him a nickname"), and the answer appears where you're looking.
   - **Note**: say what happened ("he had some coriander") and it goes in his diary.
   - **Photo**: pinch with both hands and pull out a frame, then let go to take it. Photos of him become stickers.
   - **Pet cam**: a live window on his cams, wherever you are.
   - **To-dos**: today's care list.
   - **His week**: his week wrapped, with his stickers.
4. Close any card with its **×**, or **Close all** on the menu.

## iPhone app

Built from source with Xcode for now (see the Quickstart); it isn't on the App Store.

1. Open it. It shows a 4-letter code: type it into the web app's **Devices** tab.
2. The tabs:
   - **Today**: alerts, his week wrapped, his week in charts, add a note, add photos, videos or vet papers.
   - **Ask**: type or speak a question; it shows the steps it took (cams, diary, safety list).
   - **Check**: point the camera at a plate, a bag of food or a plant. Each food gets a verdict; labels are read. There's a poo check here too.
   - **Glasses**: the Ray-Ban Display app (below).
   - **More**: the full web app, already signed in.
3. Notifications: alerts like a missed meal, a toxic food check or a flop caught on the cam arrive as notifications.

## Ray-Ban Display: the glasses app (Device Access Toolkit)

For food checks with the glasses camera, shown on the display. Needs the iPhone app.

1. In the Meta AI app, turn on **Developer Mode** for your glasses.
2. In FurSight on the iPhone, open the **Glasses** tab and press **Connect to Meta AI**, then allow access.
3. Press **Start glasses**. The display shows **Check**: look at food (or something he might chew) and press it, or press **Check** on the phone. The verdict appears on the display.
4. Keep FurSight open on the phone while you use the glasses: iOS pauses apps in the background.

## Ray-Ban Display: the web app

For checking on him from anywhere: his day, his cam, his care list, and questions. No phone app needed.

1. Open [fursight-seven.vercel.app/glasses/](https://fursight-seven.vercel.app/glasses/) on the glasses (Meta AI app, Developer Mode). It shows a 4-letter code: type it into the web app's **Devices** tab.
2. Swipe **left and right** for the pages; **up and down** move within a page; press to choose.
   - **Today**: an alert if something needs you, or "All good today", with today's counts.
   - **Pet cam**: his cam, live. Press on Today to turn on the head-tilt peek: tilt your head and hold for a quick look at his cam from any page.
   - **Care**: today's care list; press to tick.
   - **Note**: say or write what happened.
   - **Ask**: ask a question by voice or handwriting; the answer is shown and spoken.
   - **Diary**: the latest entries.

## The demo week

The demo rabbit, and Xiaosi's week in the film, are simulated so you can see a full week: meals, tray visits, his weight and his moments. Food checks, Ask, room checks, poo checks and stickers are live calls to the Meta models.
