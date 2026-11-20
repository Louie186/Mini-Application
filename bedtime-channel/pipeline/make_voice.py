"""Step 1: read the story aloud with a free offline voice (Kokoro) and record the timing.

Usage:
  python make_voice.py --models <folder with kokoro-v1.0.onnx and voices-v1.0.bin> --out <work folder>
"""
import argparse
import json
import os

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

from story_pilot01 import SEGMENTS

ap = argparse.ArgumentParser()
ap.add_argument("--models", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--voice", default="am_michael")  # calm US male. Try bm_george for a deeper British voice.
ap.add_argument("--speed", type=float, default=0.85)  # below 1 = slower, calmer
ap.add_argument("--lead", type=float, default=3.5)  # seconds of quiet before the voice starts
args = ap.parse_args()
os.makedirs(args.out, exist_ok=True)

tts = Kokoro(os.path.join(args.models, "kokoro-v1.0.onnx"), os.path.join(args.models, "voices-v1.0.bin"))
SR = 24000


def trim(x, keep=0.08):
    """Cut the very quiet start and end of a clip, keep a short breath."""
    idx = np.where(np.abs(x) > 0.004)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(keep * SR))
    b = min(len(x), idx[-1] + int(keep * SR))
    return x[a:b]


pieces = [np.zeros(int(args.lead * SR), dtype=np.float32)]
t = args.lead
timeline = []
for scene, text, pause in SEGMENTS:
    audio, rate = tts.create(text, voice=args.voice, speed=args.speed, lang="en-us")
    assert rate == SR, rate
    audio = trim(np.asarray(audio, dtype=np.float32))
    fade = int(0.015 * SR)
    audio[:fade] *= np.linspace(0, 1, fade)
    audio[-fade:] *= np.linspace(1, 0, fade)
    dur = len(audio) / SR
    timeline.append({"scene": scene, "text": text, "start": round(t, 3), "end": round(t + dur, 3)})
    pieces.append(audio)
    pieces.append(np.zeros(int(pause * SR), dtype=np.float32))
    t += dur + pause
    print(f"scene {scene}  {dur:5.1f}s  {text[:50]}")

voice = np.concatenate(pieces)
voice = voice / max(1e-6, np.max(np.abs(voice))) * 0.9
sf.write(os.path.join(args.out, "narration.wav"), voice, SR)
with open(os.path.join(args.out, "timeline.json"), "w") as f:
    json.dump({"voice": args.voice, "speed": args.speed, "total_voice_seconds": round(len(voice) / SR, 2), "segments": timeline}, f, indent=1)
print("narration length:", round(len(voice) / SR, 1), "seconds")
