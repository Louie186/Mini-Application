"""Step 2: draw the six story pictures (plus a title card) with code.

These are simple, soft, hand-made-looking illustrations so the whole pipeline can be tested
without any paid image tool. Later, swap them for AI or public-domain art: just replace
scene1.png ... scene6.png in the output folder (1920x1080).

Usage:
  python make_scenes.py --out <work folder>
"""
import argparse
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from story_pilot01 import SUBTITLE, TITLE

W, H = 1920, 1080


# ---------- small helpers ----------
def sky(stops):
    ys = np.linspace(0, 1, H)
    pos = [s[0] for s in stops]
    cols = np.array([s[1] for s in stops], np.float32)
    col = np.stack([np.interp(ys, pos, cols[:, c]) for c in range(3)], 1)
    arr = np.repeat(col[:, None, :], W, axis=1)
    return Image.fromarray(arr.astype(np.uint8), "RGB").convert("RGBA")


def layer():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def over(base, lay, blur=0.0):
    if blur:
        lay = lay.filter(ImageFilter.GaussianBlur(blur))
    return Image.alpha_composite(base, lay)


def glow(base, cx, cy, r, color, strength=1.0):
    x0, x1 = max(0, int(cx - r)), min(W, int(cx + r))
    y0, y1 = max(0, int(cy - r)), min(H, int(cy + r))
    if x1 <= x0 or y1 <= y0:
        return base
    yy, xx = np.mgrid[y0:y1, x0:x1]
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r
    a = np.clip(1 - d, 0, 1) ** 2 * strength
    arr = np.asarray(base).astype(np.float32)
    arr[y0:y1, x0:x1, :3] += a[..., None] * np.array(color, np.float32)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


def stars(base, count, ymax, seed=1, size=1.0):
    r = random.Random(seed)
    lay = layer()
    d = ImageDraw.Draw(lay)
    for _ in range(count):
        x, y = r.randint(0, W), r.randint(0, ymax)
        s = r.choice([1.5, 2, 2, 3, 3.5]) * size
        a = r.randint(120, 255)
        d.ellipse((x - s, y - s, x + s, y + s), fill=(255, 247, 220, a))
    base = over(base, lay, 0.7)
    for _ in range(max(3, count // 25)):
        x, y = r.randint(0, W), r.randint(0, ymax)
        base = glow(base, x, y, r.randint(14, 26), (255, 240, 200), 0.55)
    return base


def hills(base, color, y0, amp, seed, freq=1.0):
    r = random.Random(seed)
    ph = [r.random() * 6.28 for _ in range(3)]
    pts = [(0, H)]
    for x in range(0, W + 20, 20):
        y = y0 + amp * (0.6 * math.sin(x / 330 * freq + ph[0]) + 0.3 * math.sin(x / 140 * freq + ph[1]) + 0.1 * math.sin(x / 60 + ph[2]))
        pts.append((x, y))
    pts.append((W, H))
    lay = layer()
    ImageDraw.Draw(lay).polygon(pts, fill=color + (255,))
    return over(base, lay, 1.5)


def ground(base, y, top, bottom):
    arr = np.asarray(base).astype(np.float32)
    ys = np.linspace(0, 1, H - y)[:, None, None]
    col = np.array(top, np.float32) * (1 - ys) + np.array(bottom, np.float32) * ys
    arr[y:, :, :3] = col
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def grass(base, color, y, count, hmin, hmax, seed):
    r = random.Random(seed)
    lay = layer()
    d = ImageDraw.Draw(lay)
    for _ in range(count):
        x = r.randint(-20, W + 20)
        h = r.randint(hmin, hmax)
        lean = r.randint(-40, 40)
        w = r.randint(5, 11)
        d.polygon([(x - w, y + 20), (x + w, y + 20), (x + lean, y - h)], fill=color + (255,))
    return over(base, lay, 1.2)


def leaf_poly(cx, cy, w, h, ang, curve=0.0, n=40):
    top, bot, mid = [], [], []
    for i in range(n + 1):
        t = i / n
        x = (t - 0.5) * w
        prof = (math.sin(math.pi * t) ** 0.85) * h / 2
        bend = curve * (1 - (2 * t - 1) ** 2) * h
        top.append((x, -prof - bend))
        bot.append((x, prof - bend))
        mid.append((x, -bend))
    ca, sa = math.cos(ang), math.sin(ang)

    def rot(p):
        return (cx + p[0] * ca - p[1] * sa, cy + p[0] * sa + p[1] * ca)

    return [rot(p) for p in top + bot[::-1]], [rot(p) for p in mid]


def leaf(base, cx, cy, w, h, ang, curve, color, blur=1.4):
    poly, mid = leaf_poly(cx, cy, w, h, ang, curve)
    lay = layer()
    d = ImageDraw.Draw(lay)
    d.polygon(poly, fill=color + (255,))
    light = tuple(min(255, c + 28) for c in color)
    poly2, _ = leaf_poly(cx, cy - h * 0.06, w * 0.9, h * 0.55, ang, curve)
    d.polygon(poly2, fill=light + (150,))
    d.line(mid, fill=tuple(min(255, c + 45) for c in color) + (200,), width=5)
    return over(base, lay, blur)


# ---------- characters ----------
def snail(base, x, y, s=1.0, asleep=False, lantern=True):
    """Milo faces right. (x, y) is where his body touches the ground."""
    lay = layer()
    d = ImageDraw.Draw(lay)
    cream, belly = (240, 228, 198), (222, 206, 172)
    d.ellipse((x - 215 * s, y - 36 * s, x - 140 * s, y + 6 * s), fill=cream)
    d.ellipse((x - 175 * s, y - 66 * s, x + 125 * s, y + 8 * s), fill=cream)
    d.ellipse((x - 170 * s, y - 24 * s, x + 120 * s, y + 8 * s), fill=belly)
    d.ellipse((x + 55 * s, y - 128 * s, x + 158 * s, y + 8 * s), fill=cream)
    # shell
    sx, sy, sr = x - 35 * s, y - 128 * s, 108 * s
    d.ellipse((sx - sr, sy - sr, sx + sr, sy + sr), fill=(206, 172, 124))
    d.ellipse((sx - sr * 0.82, sy - sr * 0.82, sx + sr * 0.82, sy + sr * 0.82), fill=(216, 184, 136))
    pts = []
    for i in range(0, 260):
        th = i / 260 * 4.2 * math.pi
        rr = sr * 0.8 * (th / (4.2 * math.pi))
        pts.append((sx + rr * math.cos(th + 0.6), sy + rr * math.sin(th + 0.6)))
    d.line(pts, fill=(150, 112, 74), width=max(3, int(7 * s)), joint="curve")
    d.arc((sx - sr, sy - sr, sx + sr, sy + sr), 200, 340, fill=(236, 210, 170), width=max(3, int(8 * s)))
    # face
    if asleep:
        stalks = [((x + 130 * s, y - 110 * s), (x + 168 * s, y - 138 * s)), ((x + 146 * s, y - 106 * s), (x + 194 * s, y - 128 * s))]
    else:
        stalks = [((x + 124 * s, y - 112 * s), (x + 150 * s, y - 192 * s)), ((x + 142 * s, y - 110 * s), (x + 190 * s, y - 182 * s))]
    for a, b in stalks:
        d.line([a, b], fill=cream, width=max(4, int(9 * s)))
        if asleep:
            d.arc((b[0] - 11 * s, b[1] - 8 * s, b[0] + 11 * s, b[1] + 10 * s), 0, 180, fill=(70, 56, 60), width=max(2, int(4 * s)))
        else:
            d.ellipse((b[0] - 11 * s, b[1] - 11 * s, b[0] + 11 * s, b[1] + 11 * s), fill=(48, 40, 46))
            d.ellipse((b[0] - 4 * s, b[1] - 6 * s, b[0] + 2 * s, b[1] + 0), fill=(255, 255, 255))
    d.arc((x + 100 * s, y - 56 * s, x + 150 * s, y - 24 * s), 20, 150, fill=(160, 120, 100), width=max(2, int(4 * s)))
    d.ellipse((x + 96 * s, y - 52 * s, x + 114 * s, y - 38 * s), fill=(246, 196, 176))
    # lantern on a little stick
    lx, ly = x + 18 * s, y - 252 * s
    d.line([(sx, sy - sr + 4 * s), (sx + 40 * s, sy - sr - 52 * s), (lx, ly - 24 * s)], fill=(120, 90, 60), width=max(3, int(5 * s)), joint="curve")
    d.polygon([(lx - 14 * s, ly - 20 * s), (lx + 14 * s, ly - 20 * s), (lx, ly - 34 * s)], fill=(110, 80, 50))
    fill = (255, 214, 112) if lantern else (170, 128, 70)
    d.ellipse((lx - 24 * s, ly - 24 * s, lx + 24 * s, ly + 24 * s), fill=fill, outline=(190, 126, 44), width=max(2, int(3 * s)))
    base = over(base, lay, 0.9)
    if lantern:
        base = glow(base, lx, ly, 420 * s, (255, 170, 70), 0.55)
        base = glow(base, lx, ly, 120 * s, (255, 230, 150), 0.9)
    return base


def ladybird(base, cx, cy, s=1.0):
    lay = layer()
    d = ImageDraw.Draw(lay)
    for k in (-35, 0, 35):
        d.line([(cx + k * s, cy + 25 * s), (cx + (k - 12) * s, cy + 52 * s)], fill=(30, 28, 34), width=max(2, int(5 * s)))
        d.line([(cx + k * s, cy + 25 * s), (cx + (k + 12) * s, cy + 52 * s)], fill=(30, 28, 34), width=max(2, int(5 * s)))
    d.ellipse((cx - 64 * s, cy - 48 * s, cx + 64 * s, cy + 38 * s), fill=(205, 52, 46))
    d.line([(cx - 4 * s, cy - 46 * s), (cx - 4 * s, cy + 36 * s)], fill=(60, 20, 24), width=max(2, int(4 * s)))
    for dx, dy in [(-34, -14), (-30, 14), (24, -16), (28, 12), (-8, -30)]:
        d.ellipse((cx + (dx - 9) * s, cy + (dy - 9) * s, cx + (dx + 9) * s, cy + (dy + 9) * s), fill=(36, 30, 36))
    d.ellipse((cx + 44 * s, cy - 30 * s, cx + 100 * s, cy + 24 * s), fill=(36, 30, 36))
    d.arc((cx + 58 * s, cy - 14 * s, cx + 80 * s, cy + 2 * s), 0, 180, fill=(230, 230, 230), width=max(2, int(3 * s)))
    return over(base, lay, 0.9)


def toad(base, cx, cy, s=1.0):
    lay = layer()
    d = ImageDraw.Draw(lay)
    skin, belly = (112, 98, 62), (168, 150, 104)
    d.ellipse((cx - 140 * s, cy - 120 * s, cx + 140 * s, cy + 36 * s), fill=skin)
    d.ellipse((cx - 100 * s, cy - 40 * s, cx + 100 * s, cy + 40 * s), fill=belly)
    d.ellipse((cx - 150 * s, cy - 10 * s, cx - 70 * s, cy + 40 * s), fill=skin)
    d.ellipse((cx + 70 * s, cy - 10 * s, cx + 150 * s, cy + 40 * s), fill=skin)
    for ex in (-62, 62):
        d.ellipse((cx + (ex - 36) * s, cy - 150 * s, cx + (ex + 36) * s, cy - 78 * s), fill=skin)
        d.ellipse((cx + (ex - 24) * s, cy - 138 * s, cx + (ex + 24) * s, cy - 90 * s), fill=(220, 196, 112))
        d.line([(cx + (ex - 16) * s, cy - 114 * s), (cx + (ex + 16) * s, cy - 114 * s)], fill=(30, 26, 20), width=max(3, int(7 * s)))
        d.pieslice((cx + (ex - 38) * s, cy - 152 * s, cx + (ex + 38) * s, cy - 76 * s), 180, 360, fill=skin)
    d.arc((cx - 96 * s, cy - 104 * s, cx + 96 * s, cy - 36 * s), 20, 160, fill=(60, 50, 34), width=max(3, int(6 * s)))
    r = random.Random(4)
    for _ in range(14):
        wx, wy = cx + r.randint(-110, 110) * s, cy + r.randint(-80, -20) * s
        d.ellipse((wx - 6 * s, wy - 6 * s, wx + 6 * s, wy + 6 * s), fill=(90, 78, 46))
    return over(base, lay, 1.0)


def gate(base, x, y):
    lay = layer()
    d = ImageDraw.Draw(lay)
    wood, dark = (96, 70, 48), (70, 50, 36)
    for px in (x, x + 560):
        d.rounded_rectangle((px, y - 360, px + 60, y + 20), 10, fill=wood)
        d.ellipse((px - 6, y - 380, px + 66, y - 340), fill=wood)
    for yy in (y - 250, y - 120):
        d.rectangle((x + 40, yy, x + 580, yy + 36), fill=dark)
    return over(base, lay, 1.2)


def sunflower(base, x, y, height=760, bow=-170):
    lay = layer()
    d = ImageDraw.Draw(lay)
    p0, p1, p2 = (x, y), (x + 30, y - height * 0.62), (x + bow, y - height)
    pts = []
    for i in range(41):
        t = i / 40
        pts.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]))
    d.line(pts, fill=(70, 118, 74), width=18, joint="curve")
    base = over(base, lay, 1.2)
    base = leaf(base, pts[12][0] - 90, pts[12][1], 240, 90, math.radians(-25), 0.15, (64, 112, 72))
    base = leaf(base, pts[22][0] + 90, pts[22][1] - 10, 220, 80, math.radians(20), 0.12, (70, 120, 78))
    hx, hy = pts[-1]
    lay = layer()
    d = ImageDraw.Draw(lay)
    for ring, (r0, col, count, off) in enumerate([(98, (232, 176, 48), 20, 0.0), (82, (246, 204, 70), 20, 0.15)]):
        for i in range(count):
            a = (i + off) * 2 * math.pi / count
            cx, cy = hx + r0 * math.cos(a), hy + r0 * math.sin(a)
            poly = []
            for k in range(20):
                t = k / 20 * 2 * math.pi
                ex, ey = 56 * math.cos(t), 24 * math.sin(t)
                poly.append((cx + ex * math.cos(a) - ey * math.sin(a), cy + ex * math.sin(a) + ey * math.cos(a)))
            d.polygon(poly, fill=col + (255,))
    d.ellipse((hx - 66, hy - 66, hx + 66, hy + 66), fill=(86, 56, 32))
    r = random.Random(3)
    for _ in range(40):
        a, rr = r.random() * 6.28, r.random() * 58
        d.ellipse((hx + rr * math.cos(a) - 3, hy + rr * math.sin(a) - 3, hx + rr * math.cos(a) + 3, hy + rr * math.sin(a) + 3), fill=(52, 34, 20))
    d.arc((hx - 30, hy - 6, hx + 30, hy + 24), 20, 160, fill=(60, 40, 26), width=4)
    return over(base, lay, 1.2)


def moon(base, cx, cy, r=150, bright=1.0):
    base = glow(base, cx, cy, r * 4.2, (120, 140, 200), 0.45 * bright)
    base = glow(base, cx, cy, r * 2.0, (200, 210, 240), 0.5 * bright)
    lay = layer()
    d = ImageDraw.Draw(lay)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(240, 240, 228, 255))
    k = r / 150.0
    for dx, dy, rr in [(-45, -30, 34), (40, 20, 44), (-10, 62, 22), (62, -52, 20), (-70, 38, 16)]:
        d.ellipse((cx + (dx - rr) * k, cy + (dy - rr) * k, cx + (dx + rr) * k, cy + (dy + rr) * k), fill=(228, 228, 216, 95))
    return over(base, lay, 1.2)


def beam(base, cx, cy, tx, ty, spread=330, alpha=34):
    lay = layer()
    ImageDraw.Draw(lay).polygon([(cx - 70, cy), (cx + 70, cy), (tx + spread, ty), (tx - spread, ty)], fill=(206, 220, 255, alpha))
    return over(base, lay, 24)


def finish(img, seed=5):
    """Soft paper grain and a gentle dark edge so it feels like a painted page."""
    rgb = np.asarray(img.convert("RGB")).astype(np.float32)
    rng = np.random.default_rng(seed)
    noise = rng.normal(0, 5.0, (H, W)).astype(np.float32)
    noise = np.asarray(Image.fromarray(np.clip(noise * 6 + 128, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.1))).astype(np.float32)
    rgb += ((noise - 128) / 6.0)[..., None]
    yy, xx = np.mgrid[0:H, 0:W]
    v = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    rgb *= (1 - 0.28 * np.clip(v - 0.55, 0, 1))[..., None]
    out = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")
    return out.filter(ImageFilter.GaussianBlur(0.6))


# ---------- the six scenes ----------
def scene1():
    b = sky([(0, (24, 32, 76)), (0.45, (74, 62, 118)), (0.7, (196, 128, 120)), (1, (230, 168, 120))])
    b = stars(b, 90, 420, seed=11)
    b = glow(b, 1500, 700, 520, (255, 150, 90), 0.35)
    b = hills(b, (52, 66, 100), 640, 40, 1)
    b = hills(b, (36, 56, 78), 730, 36, 2, 1.3)
    b = ground(b, 840, (34, 62, 58), (18, 36, 38))
    stem = layer()
    ImageDraw.Draw(stem).line([(1560, 460), (1600, 600), (1580, 900)], fill=(52, 96, 68, 255), width=26)
    b = over(b, stem, 1.3)
    b = leaf(b, 1020, 440, 1260, 340, math.radians(-4), 0.12, (58, 112, 80))
    b = snail(b, 900, 880, 1.45)
    b = grass(b, (22, 46, 44), 930, 90, 60, 170, 9)
    for fx, fy in [(420, 620), (1460, 760), (260, 800), (1700, 540)]:
        b = glow(b, fx, fy, 38, (255, 240, 150), 0.8)
    return finish(b, 1)


def scene2():
    b = sky([(0, (14, 20, 54)), (0.6, (34, 44, 96)), (1, (60, 70, 120))])
    b = stars(b, 130, 560, seed=12)
    b = hills(b, (30, 44, 74), 700, 34, 3)
    b = ground(b, 860, (26, 50, 52), (14, 30, 34))
    b = leaf(b, 1230, 700, 1000, 280, math.radians(-3), 0.1, (62, 118, 84))
    b = snail(b, 560, 930, 1.25)
    b = ladybird(b, 1230, 626, 1.3)
    b = grass(b, (18, 38, 40), 960, 80, 50, 150, 10)
    return finish(b, 2)


def scene3():
    b = sky([(0, (12, 18, 50)), (0.6, (32, 42, 92)), (1, (58, 66, 116))])
    b = stars(b, 140, 520, seed=13)
    b = hills(b, (28, 40, 70), 690, 34, 4)
    b = ground(b, 850, (28, 52, 50), (14, 30, 32))
    b = gate(b, 1040, 880)
    b = toad(b, 1320, 880, 1.5)
    b = snail(b, 500, 930, 1.25)
    b = grass(b, (18, 38, 38), 960, 80, 50, 150, 11)
    return finish(b, 3)


def scene4():
    b = sky([(0, (10, 16, 48)), (0.6, (28, 38, 88)), (1, (54, 62, 112))])
    b = stars(b, 200, 600, seed=14)
    b = hills(b, (26, 38, 68), 700, 34, 5)
    b = ground(b, 860, (26, 50, 48), (14, 28, 30))
    b = sunflower(b, 1420, 930, 690, -200)
    b = snail(b, 620, 930, 1.3)
    b = grass(b, (16, 36, 36), 960, 80, 50, 150, 12)
    return finish(b, 4)


def scene5():
    b = sky([(0, (8, 12, 44)), (0.55, (24, 34, 84)), (1, (48, 58, 108))])
    b = stars(b, 240, 640, seed=15)
    b = moon(b, 960, 250, 150)
    b = hills(b, (24, 36, 66), 720, 30, 6)
    b = ground(b, 860, (26, 48, 52), (14, 28, 32))
    b = beam(b, 960, 330, 900, 930)
    b = snail(b, 900, 930, 1.5, lantern=True)
    b = glow(b, 900, 800, 380, (170, 190, 255), 0.22)
    b = grass(b, (14, 32, 36), 970, 80, 50, 140, 13)
    return finish(b, 5)


def scene6():
    b = sky([(0, (5, 8, 28)), (0.6, (14, 20, 56)), (1, (28, 36, 76))])
    b = stars(b, 260, 700, seed=16)
    b = moon(b, 1560, 190, 70, 0.55)
    b = hills(b, (14, 22, 46), 740, 28, 7)
    b = ground(b, 870, (18, 34, 40), (10, 20, 26))
    b = glow(b, 900, 900, 520, (140, 160, 230), 0.2)
    b = snail(b, 900, 940, 1.5, asleep=True, lantern=False)
    b = grass(b, (10, 22, 28), 975, 70, 50, 130, 14)
    return finish(b, 6)


def title_card(scene_img):
    img = scene_img.convert("RGBA")
    dark = Image.new("RGBA", (W, H), (6, 10, 30, 90))
    img = Image.alpha_composite(img, dark)
    lay = layer()
    d = ImageDraw.Draw(lay)
    font_big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", 124)
    font_sub = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 46)
    lines = ["Milo and the", "Little Lantern"]
    y = 150
    glow_lay = layer()
    gd = ImageDraw.Draw(glow_lay)
    for ln in lines:
        tw = d.textlength(ln, font=font_big)
        gd.text(((W - tw) / 2, y), ln, font=font_big, fill=(255, 205, 110, 255))
        d.text(((W - tw) / 2, y), ln, font=font_big, fill=(255, 244, 220, 255))
        y += 150
    tw = d.textlength(SUBTITLE, font=font_sub)
    d.text(((W - tw) / 2, y + 20), SUBTITLE, font=font_sub, fill=(224, 226, 250, 255))
    img = Image.alpha_composite(img, glow_lay.filter(ImageFilter.GaussianBlur(18)))
    return Image.alpha_composite(img, lay).convert("RGB")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    made = {}
    for i, fn in enumerate([scene1, scene2, scene3, scene4, scene5, scene6], 1):
        img = fn()
        made[i] = img
        img.save(os.path.join(args.out, f"scene{i}.png"))
        print("saved scene", i)
    title_card(made[1]).save(os.path.join(args.out, "title.png"))
    title_card(made[5]).convert("RGB").resize((1280, 720)).save(os.path.join(args.out, "thumbnail.jpg"), quality=90)
    print("saved title card and thumbnail")
