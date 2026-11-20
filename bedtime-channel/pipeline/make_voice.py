"""Step 1: read the story aloud with a free offline voice (Kokoro) and record the timing.

Usage:
  python make_voice.py --models <folder with kokoro-v1.0.onnx and voices-v1.0.bin> --out <work folder>
"""
import argparse
import importlib
import json
import os
import subprocess

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ap = argparse.ArgumentParser()
ap.add_argument("--models", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--voice", default="am_michael")  # calm US male. Blends work too, e.g. am_onyx:0.6+am_puck:0.4
ap.add_argument("--speed", type=float, default=0.85)  # below 1 = slower, calmer
ap.add_argument("--lead", type=float, default=3.5)  # seconds of quiet before the voice starts
ap.add_argument("--story", default="story_pilot01")  # which story file to read
ap.add_argument("--pitch", type=float, default=0.0)  # semitones; negative = deeper voice, same speed
ap.add_argument("--bright", action="store_true")  # small treble lift: sounds smilier and clearer
args = ap.parse_args()
SEGMENTS = importlib.import_module(args.story).SEGMENTS
os.makedirs(args.out, exist_ok=True)

tts = Kokoro(os.path.join(args.models, "kokoro-v1.0.onnx"), os.path.join(args.models, "voices-v1.0.bin"))
SR = 24000


def voice_style(spec):
    """'am_onyx' or a blend like 'am_onyx:0.6+am_puck:0.4' (mixes two voices)."""
    if "+" not in spec and ":" not in spec:
        return spec
    total = None
    for part in spec.split("+"):
        name, w = (part.split(":") + ["1"])[:2]
        v = tts.get_voice_style(name) * float(w)
        total = v if total is None else total + v
    return total


VOICE = voice_style(args.voice)


def shift_pitch(x, semitones):
    """Raise or lower one phrase by some semitones, keeping the voice's natural tone (for sing-song melody)."""
    tmp_in = os.path.join(args.out, "_phrase_in.wav")
    tmp_out = os.path.join(args.out, "_phrase_out.wav")
    sf.write(tmp_in, x, SR)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp_in, "-af",
                    f"rubberband=pitch={2 ** (semitones / 12):.5f}:formant=preserved:pitchq=quality", tmp_out], check=True)
    y, _ = sf.read(tmp_out, dtype="float32")
    os.remove(tmp_in)
    os.remove(tmp_out)
    return y


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
for seg in SEGMENTS:
    scene, text, pause = seg[:3]
    mult = seg[3] if len(seg) > 3 else 1.0  # optional per-line speed change for expression
    audio, rate = tts.create(text, voice=VOICE, speed=args.speed * mult, lang="en-us")
    assert rate == SR, rate
    audio = trim(np.asarray(audio, dtype=np.float32))
    if len(seg) > 4 and seg[4]:  # optional per-line melody: semitones up (+) or down (-)
        audio = shift_pitch(audio, seg[4])
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
out_wav = os.path.join(args.out, "narration.wav")
sf.write(out_wav, voice, SR)
filters = []
if args.pitch:
    r = 2 ** (args.pitch / 12)
    filters += [f"asetrate={SR * r:.0f}", f"aresample={SR}", f"atempo={1 / r:.5f}"]
if args.bright:
    filters += ["equalizer=f=3200:t=q:w=1.2:g=3.5", "equalizer=f=170:t=q:w=1:g=-2.5"]
if filters:
    tmp = os.path.join(args.out, "narration_raw.wav")
    os.replace(out_wav, tmp)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-af",
                    ",".join(filters + ["alimiter=limit=0.9"]), out_wav], check=True)
with open(os.path.join(args.out, "timeline.json"), "w") as f:
    json.dump({"voice": args.voice, "speed": args.speed, "pitch": args.pitch, "total_voice_seconds": round(len(voice) / SR, 2), "segments": timeline}, f, indent=1)
print("narration length:", round(len(voice) / SR, 1), "seconds")
