"""Step 3: make a soft background and mix it under the narration.
Everything is generated with maths, so there is no music licence to worry about.

Styles:
  night  warm slow pad, faint crickets, quiet breeze (bedtime stories)
  day    bright gentle chords, a soft marimba tune and a few birds (happy short stories)

Usage:
  python make_sound.py --work <work folder> [--style day] [--tail 4]
Needs: ffmpeg on the PATH.
"""
import argparse
import os
import subprocess

import numpy as np
import soundfile as sf

ap = argparse.ArgumentParser()
ap.add_argument("--work", required=True)
ap.add_argument("--style", choices=["night", "day"], default="night")
ap.add_argument("--tail", type=float, default=7.0)  # seconds of background after the last word
ap.add_argument("--bed", type=float, default=None)  # background loudness (smaller = quieter)
args = ap.parse_args()
bed_level = args.bed if args.bed is not None else (0.085 if args.style == "night" else 0.11)

voice, vsr = sf.read(os.path.join(args.work, "narration.wav"))
dur = len(voice) / vsr + args.tail
SR = 44100
n = int(dur * SR)
t = np.arange(n) / SR
rng = np.random.default_rng(21)

if args.style == "night":
    chords = [[130.81, 196.00, 293.66, 329.63], [174.61, 220.00, 261.63, 329.63],
              [110.00, 164.81, 196.00, 261.63], [98.00, 146.83, 246.94, 293.66]]
    LEN, OV = 16.0, 6.0
else:
    chords = [[261.63, 329.63, 392.00, 523.25], [196.00, 293.66, 392.00, 493.88],
              [220.00, 261.63, 329.63, 440.00], [174.61, 261.63, 349.23, 440.00]]
    LEN, OV = 5.0, 1.5


def pad_layer():
    pad = np.zeros((2, n))
    start, k = 0.0, 0
    while start < dur:
        i0, i1 = int(start * SR), min(n, int((start + LEN + OV) * SR))
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
    return pad / np.max(np.abs(pad))


def marimba_layer():
    """A soft, bouncy tune that walks up and down the current chord."""
    out = np.zeros((2, n))
    step = 0.42
    pattern = [0, 1, 2, 3, 2, 1, 2, 3]
    i = 0
    while i * step < dur - 0.5:
        start = i * step
        chord = chords[int(start // LEN) % len(chords)]
        f = chord[pattern[i % len(pattern)]] * 2
        i0, i1 = int(start * SR), min(n, int((start + 1.2) * SR))
        tt = t[i0:i1] - start
        note = (np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(2 * np.pi * 4 * f * tt) * np.exp(-tt * 30)) * np.exp(-tt * 5.5)
        note *= np.minimum(1, tt / 0.004)
        pan = 0.4 + 0.2 * (i % 2)
        out[0, i0:i1] += note * (1 - pan)
        out[1, i0:i1] += note * pan
        i += 1
    return out / np.max(np.abs(out))


def birds_layer():
    out = np.zeros((2, n))
    tpos = 1.5
    while tpos < dur - 1:
        f0 = rng.uniform(2600, 3400)
        pan = rng.uniform(0.2, 0.8)
        for rep in range(rng.integers(2, 4)):
            s0 = tpos + rep * 0.13
            i0, i1 = int(s0 * SR), min(n, int((s0 + 0.09) * SR))
            tt = t[i0:i1] - s0
            freq = f0 + 1400 * tt / 0.09
            chirp = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.sin(np.pi * tt / 0.09)
            out[0, i0:i1] += chirp * (1 - pan)
            out[1, i0:i1] += chirp * pan
        tpos += rng.uniform(2.5, 4.5)
    return out / max(1e-6, np.max(np.abs(out)))


def crickets_layer():
    def cricket(freq, rate, phase):
        gate = np.clip(np.sin(2 * np.pi * rate * t) * 3, 0, 1)
        gate = np.convolve(gate, np.ones(300) / 300, mode="same")
        swell = np.clip(np.sin(2 * np.pi * 0.07 * t + phase) * 2, 0, 1)
        return np.sin(2 * np.pi * freq * t) * gate * swell
    c = np.stack([cricket(4300, 6.7, 0.5) * 0.7 + cricket(5050, 8.1, 2.4) * 0.3,
                  cricket(4700, 7.3, 1.2) * 0.6 + cricket(4100, 5.9, 3.3) * 0.4])
    return c / max(1e-6, np.max(np.abs(c)))


def breeze_layer():
    SR2 = 11025
    m = int(dur * SR2)
    spec = np.fft.rfft(rng.normal(size=m))
    freqs = np.fft.rfftfreq(m, 1 / SR2)
    spec *= 1 / np.maximum(freqs, 20) ** 0.9 * (freqs < 450)
    brown = np.fft.irfft(spec, m)
    brown /= np.max(np.abs(brown))
    b = np.interp(t, np.arange(m) / SR2, brown) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.045 * t + 1.0))
    return np.stack([b, b])


if args.style == "night":
    bed = pad_layer() * 0.55 + crickets_layer() * 0.035 + breeze_layer() * 0.22
    fade_in, fade_out = 5.0, 9.0
else:
    bed = pad_layer() * 0.45 + marimba_layer() * 0.35 + birds_layer() * 0.06
    fade_in, fade_out = 0.8, 2.5
fi, fo = int(fade_in * SR), int(fade_out * SR)
bed[:, :fi] *= np.linspace(0, 1, fi)
bed[:, -fo:] *= np.linspace(1, 0, fo)
bed /= np.max(np.abs(bed))
sf.write(os.path.join(args.work, "bed.wav"), bed.T.astype(np.float32), SR)

mix = os.path.join(args.work, "audio_mix.wav")
lufs = -16 if args.style == "day" else -18  # happy shorts a little louder, bedtime softer
cmd = [
    "ffmpeg", "-y", "-loglevel", "error",
    "-i", os.path.join(args.work, "narration.wav"),
    "-i", os.path.join(args.work, "bed.wav"),
    "-filter_complex",
    f"[0:a]aresample={SR},pan=stereo|c0=c0|c1=c0,apad=pad_dur={args.tail}[v];"
    f"[1:a]volume={bed_level}[b];"
    "[v][b]amix=inputs=2:normalize=0:duration=longest[m];"
    f"[m]loudnorm=I={lufs}:TP=-2:LRA=7[out]",
    "-map", "[out]", "-ar", str(SR), mix,
]
subprocess.run(cmd, check=True)
print("audio length:", round(dur, 1), "seconds ->", mix)
