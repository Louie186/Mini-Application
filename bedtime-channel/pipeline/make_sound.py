"""Step 3: make a soft night background (warm pad, faint crickets, quiet breeze) and mix it
under the narration. Everything is generated with maths, so there is no music licence to worry about.

Usage:
  python make_sound.py --work <work folder>
Needs: ffmpeg on the PATH.
"""
import argparse
import os
import subprocess

import numpy as np
import soundfile as sf

ap = argparse.ArgumentParser()
ap.add_argument("--work", required=True)
ap.add_argument("--tail", type=float, default=7.0)  # seconds of quiet background after the last word
ap.add_argument("--bed", type=float, default=0.085)  # background loudness (smaller = quieter)
args = ap.parse_args()

voice, vsr = sf.read(os.path.join(args.work, "narration.wav"))
dur = len(voice) / vsr + args.tail
SR = 44100
n = int(dur * SR)
t = np.arange(n) / SR
rng = np.random.default_rng(21)

# 1) warm pad: four slow, soft chords that melt into each other
chords = [
    [130.81, 196.00, 293.66, 329.63],  # C add9
    [174.61, 220.00, 261.63, 329.63],  # F maj7
    [110.00, 164.81, 196.00, 261.63],  # A min7
    [98.00, 146.83, 246.94, 293.66],   # G
]
LEN, OV = 16.0, 6.0
pad = np.zeros((2, n))
start, k = 0.0, 0
while start < dur:
    i0 = int(start * SR)
    i1 = min(n, int((start + LEN + OV) * SR))
    tt = t[i0:i1] - start
    env = np.clip(np.minimum(tt / OV, (LEN + OV - tt) / OV), 0, 1)
    env = 0.5 - 0.5 * np.cos(np.pi * env)
    for f in chords[k % len(chords)]:
        for det, pan in ((0.9988, 0.35), (1.0012, 0.65)):
            ph = rng.random() * 2 * np.pi
            wave = np.sin(2 * np.pi * f * det * tt + ph) + 0.22 * np.sin(2 * np.pi * 2 * f * det * tt + ph * 1.3)
            wave *= (0.82 + 0.18 * np.sin(2 * np.pi * 0.06 * tt + ph)) * env
            pad[0, i0:i1] += wave * (1 - pan)
            pad[1, i0:i1] += wave * pan
    start += LEN
    k += 1
pad /= np.max(np.abs(pad))

# 2) very faint crickets: short soft pulses, slowly coming and going
def cricket(freq, rate, phase):
    gate = np.clip(np.sin(2 * np.pi * rate * t) * 3, 0, 1)
    gate = np.convolve(gate, np.ones(300) / 300, mode="same")
    swell = np.clip(np.sin(2 * np.pi * 0.07 * t + phase) * 2, 0, 1)
    return np.sin(2 * np.pi * freq * t) * gate * swell

crick = np.stack([cricket(4300, 6.7, 0.5) * 0.7 + cricket(5050, 8.1, 2.4) * 0.3, cricket(4700, 7.3, 1.2) * 0.6 + cricket(4100, 5.9, 3.3) * 0.4])
crick /= max(1e-6, np.max(np.abs(crick)))

# 3) quiet breeze: slow, low, soft noise
SR2 = 11025
m = int(dur * SR2)
white = rng.normal(size=m)
spec = np.fft.rfft(white)
freqs = np.fft.rfftfreq(m, 1 / SR2)
spec *= 1 / np.maximum(freqs, 20) ** 0.9 * (freqs < 450)
brown = np.fft.irfft(spec, m)
brown /= np.max(np.abs(brown))
breeze = np.interp(t, np.arange(m) / SR2, brown)
breeze *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.045 * t + 1.0)
bed = np.stack([pad[0] * 0.55 + crick[0] * 0.035 + breeze * 0.22, pad[1] * 0.55 + crick[1] * 0.035 + breeze * 0.22])
fade_in, fade_out = int(5 * SR), int(9 * SR)
bed[:, :fade_in] *= np.linspace(0, 1, fade_in)
bed[:, -fade_out:] *= np.linspace(1, 0, fade_out)
bed /= np.max(np.abs(bed))
sf.write(os.path.join(args.work, "bed.wav"), bed.T.astype(np.float32), SR)

# 4) mix: voice in the centre, bed underneath, then even out the loudness
mix = os.path.join(args.work, "audio_mix.wav")
cmd = [
    "ffmpeg", "-y", "-loglevel", "error",
    "-i", os.path.join(args.work, "narration.wav"),
    "-i", os.path.join(args.work, "bed.wav"),
    "-filter_complex",
    f"[0:a]aresample={SR},pan=stereo|c0=c0|c1=c0,apad=pad_dur={args.tail}[v];"
    f"[1:a]volume={args.bed}[b];"
    "[v][b]amix=inputs=2:normalize=0:duration=longest[m];"
    "[m]loudnorm=I=-18:TP=-2:LRA=7[out]",
    "-map", "[out]", "-ar", str(SR), mix,
]
subprocess.run(cmd, check=True)
print("audio length:", round(dur, 1), "seconds ->", mix)
