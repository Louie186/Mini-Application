"""Step 4: join the pictures and the sound into the finished video, and write captions.

Usage:
  python make_video.py --work <work folder> --out <final mp4 path>
Needs: ffmpeg on the PATH. Run make_voice, make_scenes and make_sound first.
"""
import argparse
import json
import os
import re
import subprocess

import soundfile as sf

ap = argparse.ArgumentParser()
ap.add_argument("--work", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--fps", type=int, default=25)
ap.add_argument("--xf", type=float, default=1.6)  # length of each picture-to-picture fade
ap.add_argument("--title-seconds", type=float, default=9.0)  # 0 = no title card
ap.add_argument("--end-fade", type=float, default=4.0)  # fade to black at the end
args = ap.parse_args()

tl = json.load(open(os.path.join(args.work, "timeline.json")))
mix, sr = sf.read(os.path.join(args.work, "audio_mix.wav"))
total = len(mix) / sr

# when each scene starts
starts = {}
for seg in tl["segments"]:
    starts.setdefault(seg["scene"], seg["start"])
scenes = sorted(starts)
use_title = args.title_seconds > 0 and os.path.exists(os.path.join(args.work, "title.png"))
clips = [("title.png", 0.0, args.title_seconds)] if use_title else []
for i, sc in enumerate(scenes):
    a = clips[-1][2] if clips else 0.0
    b = starts[scenes[i + 1]] - 0.3 if i + 1 < len(scenes) else total
    clips.append((f"scene{sc}.png", a, b))

# 1) one slow-moving clip per picture
xf = args.xf
parts = []
for i, (img, a, b) in enumerate(clips):
    length = (b - a) + (xf / 2 if i == 0 else xf / 2 if i == len(clips) - 1 else xf)
    frames = int(length * args.fps) + 1
    z0 = 1.0 if i % 2 == 0 else 1.06
    dz = 0.06 if i % 2 == 0 else -0.06
    vf = (f"scale=2880:-2,zoompan=z='{z0}+{dz}*on/{frames}':"
          f"x='(iw-iw/zoom)*(0.38+0.24*on/{frames})':y='(ih-ih/zoom)*0.5':d={frames}:s=1280x720:fps={args.fps}")
    path = os.path.join(args.work, f"clip{i}.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", os.path.join(args.work, img), "-vf", vf,
                    "-frames:v", str(frames), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", path], check=True)
    parts.append(path)
    print("clip", i, img, round(length, 1), "s")

# 2) dissolve them together, add the sound, fade to black at the very end
inputs = []
for p in parts:
    inputs += ["-i", p]
inputs += ["-i", os.path.join(args.work, "audio_mix.wav")]
chain, last = [], "[0:v]"
for i in range(1, len(parts)):
    offset = clips[i - 1][2] - xf / 2
    out = f"[x{i}]"
    chain.append(f"{last}[{i}:v]xfade=transition=fade:duration={xf}:offset={offset:.3f}{out}")
    last = out
chain.append(f"{last}fade=t=out:st={total - args.end_fade:.2f}:d={args.end_fade}[v]")
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", ";".join(chain),
                "-map", "[v]", "-map", f"{len(parts)}:a", "-c:v", "libx264", "-preset", "medium", "-crf", "21",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", args.out], check=True)
print("video:", args.out)


# 3) captions (an .srt file you can upload to YouTube)
def stamp(x):
    h, m, s = int(x // 3600), int(x % 3600 // 60), x % 60
    return f"{h:02d}:{m:02d}:{int(s):02d},{int((s % 1) * 1000):03d}"


cues = []
for seg in tl["segments"]:
    sentences = re.findall(r'[^.!?]+[.!?]+["”]?|[^.!?]+$', seg["text"])
    weights = [max(1, len(s)) for s in sentences]
    t, span = seg["start"], seg["end"] - seg["start"]
    for s, w in zip(sentences, weights):
        d = span * w / sum(weights)
        cues.append((t, t + d, s.strip()))
        t += d
srt = os.path.splitext(args.out)[0] + ".srt"
with open(srt, "w") as f:
    for i, (a, b, s) in enumerate(cues, 1):
        f.write(f"{i}\n{stamp(a)} --> {stamp(b)}\n{s}\n\n")
print("captions:", srt)
