"""Step 1 (emotional version): read the story with Chatterbox, a free open-source voice
that has an emotion control, copying the tone of a short reference voice clip.

Usage:
  python make_voice_emotion.py --story story_ella_v6 --ref <reference voice wav> --out <work folder>
Only use a reference voice you are allowed to use (your own, a synthetic voice, or with written permission).
"""
import argparse
import importlib
import json
import os

import numpy as np
import soundfile as sf
import torch
from chatterbox.tts import ChatterboxTTS

ap = argparse.ArgumentParser()
ap.add_argument("--story", required=True)
ap.add_argument("--ref", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--lead", type=float, default=1.0)
ap.add_argument("--seed", type=int, default=7)
args = ap.parse_args()
os.makedirs(args.out, exist_ok=True)
SEGMENTS = importlib.import_module(args.story).SEGMENTS

torch.manual_seed(args.seed)
model = ChatterboxTTS.from_pretrained(device="cpu")
SR = model.sr


def trim(x, keep=0.1):
    idx = np.where(np.abs(x) > 0.01)[0]
    if len(idx) == 0:
        return x
    return x[max(0, idx[0] - int(keep * SR)): min(len(x), idx[-1] + int(keep * SR))]


pieces = [np.zeros(int(args.lead * SR), dtype=np.float32)]
t = args.lead
timeline = []
for scene, text, pause, emotion, steady in SEGMENTS:
    wav = model.generate(text, audio_prompt_path=args.ref, exaggeration=emotion, cfg_weight=steady)
    a = trim(wav.squeeze(0).cpu().numpy().astype(np.float32))
    fade = int(0.015 * SR)
    a[:fade] *= np.linspace(0, 1, fade)
    a[-fade:] *= np.linspace(1, 0, fade)
    dur = len(a) / SR
    timeline.append({"scene": scene, "text": text, "start": round(t, 3), "end": round(t + dur, 3)})
    pieces += [a, np.zeros(int(pause * SR), dtype=np.float32)]
    t += dur + pause
    print(f"scene {scene}  {dur:4.1f}s  emotion {emotion}  {text[:45]}", flush=True)

voice = np.concatenate(pieces)
voice = voice / max(1e-6, np.max(np.abs(voice))) * 0.9
sf.write(os.path.join(args.out, "narration.wav"), voice, SR)
with open(os.path.join(args.out, "timeline.json"), "w") as f:
    json.dump({"voice": "chatterbox", "ref": os.path.basename(args.ref), "total_voice_seconds": round(len(voice) / SR, 2), "segments": timeline}, f, indent=1)
print("narration length:", round(len(voice) / SR, 1), "seconds")
