"""Optional step after any voice step: make the narration slower (or faster) without changing pitch,
and update the timing file so the pictures still match.

Usage:
  python stretch_voice.py --work <work folder> --tempo 0.9     (0.9 = 10% slower)
Needs: ffmpeg with the rubberband filter.
"""
import argparse
import json
import os
import subprocess

ap = argparse.ArgumentParser()
ap.add_argument("--work", required=True)
ap.add_argument("--tempo", type=float, required=True)
args = ap.parse_args()

src = os.path.join(args.work, "narration.wav")
tmp = os.path.join(args.work, "narration_before_stretch.wav")
os.replace(src, tmp)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-af",
                f"rubberband=tempo={args.tempo}:pitchq=quality", src], check=True)

path = os.path.join(args.work, "timeline.json")
tl = json.load(open(path))
k = 1 / args.tempo
for seg in tl["segments"]:
    seg["start"] = round(seg["start"] * k, 3)
    seg["end"] = round(seg["end"] * k, 3)
tl["total_voice_seconds"] = round(tl["total_voice_seconds"] * k, 2)
tl["tempo"] = args.tempo
json.dump(tl, open(path, "w"), indent=1)
print("narration now", tl["total_voice_seconds"], "seconds")
