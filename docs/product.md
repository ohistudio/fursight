# FurSight as a product: rough numbers

FurSight would be sold as a kit (the FurSight Tray and two FurSight Cams) with the app, and an optional
subscription for the AI. These are back-of-envelope numbers to show the idea holds up, not a business plan:
hardware prices are typical component costs at a first batch of about 1,000 units, and the AI costs are what
this project measured while it was built.

## The kit

| | What it is | Cost to make | Sells for |
|---|---|---|---|
| **FurSight Tray** | Scale under the litter tray (4 load cells), camera hood looking down, temperature and humidity sensor, Wi-Fi | about $42 | $149 |
| **FurSight Cam: his pen** | Fixed wide-angle cam on a clamp and gooseneck, clips to the pen | about $24 | $59 |
| **FurSight Cam: pan and tilt** | Follows him round the room (a white-label pan-tilt Wi-Fi cam, our firmware) | about $24 | $69 |
| **The kit** | Tray + both cams + 3 months of FurSight Plus | about $90 ($100 landed) | **$249** |

Where the Tray's $42 goes: load cells $2.50, ADC $1, ESP32-S3 with camera $9, temperature and humidity
sensor $1.50, circuit board and parts $4, moulded base, plate and camera arm $12, a stock litter tray $2.50,
USB-C power $2.50, assembly and testing $4, box and guide $3.

Sold direct, after shipping and card fees, the kit makes about 50% gross margin. One-off costs before the first
unit ships: injection-mould tooling ($40k to $60k), safety and radio certification for the UK, EU and US ($15k to
$25k), and a small production run of the electronics.

## The AI, per household

Measured while building FurSight: Muse Spark looking at one picture costs about $0.0046 (labelling his
footage), SAM 3.1 about $0.0002 a picture (the tracking test), and a room check about 3¢.

| A typical day | How often | Cost |
|---|---|---|
| Pose looks when he settles (the pet cam) | about 20 today; about 4 with the on-cam model | $0.09; $0.02 |
| Hay and bowl checks | 8 | $0.04 |
| Ask (a few looks each) | 4 | $0.12 |
| Food checks | 2 | $0.01 |
| Stickers, notes, the weekly card, a room check now and then | | about $0.01 |
| **A day** | | **about $0.27 now; about $0.20 with the on-cam model** |
| **A month** | | **about $8 now; about $6, or $4 for a lighter Ask user** |

Hosting (the hub, the pet cam relay, the diary and its pictures) is well under $0.50 a household a month: the
video goes straight between devices, and the relay only carries pictures while someone watches.

The on-cam model (the behaviour model trained from his own footage, `ml/`) is what brings the cost down: it
watches every frame for free on the pet cam, and the AI is only asked when it's unsure or something looks wrong.

## The subscription

- **Free:** live view, his weight and tray visits, the diary, the calendar, notes. No AI, so it costs almost
  nothing to run.
- **FurSight Plus, $7.99 a month or $69 a year:** the AI. His day from the pet cam, hay and bowl checks, early
  warnings, food checks from the glasses, phone or Quest, Ask, stickers, Wrapped and the weekly card. Three
  months come with the kit.

With the on-cam model and a typical Ask user (about $4 of AI a month), monthly Plus keeps about half of what it
charges and the yearly plan about a third. Without the on-cam model ($8 a month) it would lose money, which is
why that model matters: it's the difference between a product and a demo. The price sits with the pet camera
subscriptions people already pay for (about $6 to $10 a month), and a fair-use limit on Ask keeps the heaviest
users from costing more than they pay.
