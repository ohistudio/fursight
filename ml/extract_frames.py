"""Pull still frames of your pet from your own photos and videos, ready for labelling.

  python ml/extract_frames.py <folder of photos and videos> <out dir>

Photos: one frame each. Videos: one frame every 3 s (at least 3, at most 8). Live Photo videos are skipped
when their still is there too. Writes <out>/frames/*.jpg (max 1024 px) and <out>/frames.json.
"""
import json, os, re, subprocess, sys, hashlib
from PIL import Image, ImageOps
import pillow_heif
pillow_heif.register_heif_opener()

src, out = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(out, "frames"), exist_ok=True)
PHOTO, VIDEO = (".heic", ".jpg", ".jpeg", ".png"), (".mov", ".mp4")
files = sorted(os.path.join(d, f) for d, _, fs in os.walk(src) if "/check" not in d for f in fs if not f.startswith("."))
stills = {os.path.splitext(f)[0].lower() for f in files if f.lower().endswith(PHOTO)}
frames, n = [], 0

def save(im, source, t):
    global n
    im = im.convert("RGB"); im.thumbnail((1024, 1024))
    fid = f"xs-{n}"; n += 1
    im.save(os.path.join(out, "frames", fid + ".jpg"), quality=88)
    # the same source file always lands in the same split, so frames of one clip never sit on both sides
    h = int(hashlib.md5(source.encode()).hexdigest(), 16) % 10
    frames.append({"id": fid, "source": source, "t": t, "size": list(im.size), "split": "test" if h == 0 else "valid" if h < 3 else "train"})

for f in files:
    ext = os.path.splitext(f)[1].lower()
    try:
        if ext in PHOTO:
            save(ImageOps.exif_transpose(Image.open(f)), f, None)
        elif ext in VIDEO:
            if os.path.splitext(f)[0].lower() in stills: continue   # Live Photo: the still is enough
            d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], capture_output=True, text=True).stdout.strip() or 0)
            k = max(3, min(8, int(d // 3)))
            for i in range(k):
                t = d * (i + 0.5) / k
                r = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", f, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "-"], capture_output=True)
                if r.stdout:
                    import io; save(Image.open(io.BytesIO(r.stdout)), f, round(t, 2))
    except Exception as e:
        print("skip", f, e, flush=True)
    if len(frames) % 100 < 2: print(len(frames), "frames", flush=True)
json.dump(frames, open(os.path.join(out, "frames.json"), "w"), indent=0)
print("done:", len(frames), "frames from", len({x["source"] for x in frames}), "files")
