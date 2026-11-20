"""Pictures for "Little Ella's River Walk": a baby elephant, Mama and Papa walk to a river,
drink and splash, then carry on their journey. Four daytime scenes plus a thumbnail.

Usage:
  python make_scenes_elephant.py --out <work folder>
"""
import argparse
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from make_scenes import H, W, finish, glow, ground, hills, layer, over, sky
from story_elephant import SUBTITLE, TITLE

PAPA = (126, 136, 160)
MAMA = (150, 158, 182)
ELLA = (182, 188, 208)
PINK = (238, 178, 194)


def bez(p0, p1, p2, n=40):
    out = []
    for i in range(n):
        t = i / (n - 1)
        out.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
                    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]))
    return out


def tube(d, pts, r0, r1, color):
    for i, (px, py) in enumerate(pts):
        r = r0 + (r1 - r0) * i / (len(pts) - 1)
        d.ellipse((px - r, py - r, px + r, py + r), fill=color)


def elephant(base, x, y, s, col, pose="walk", step=0, bow=False, inner=(205, 178, 190)):
    """Faces right. (x, y) is the ground under the middle of the body. Returns base and trunk tip."""
    lay = layer()
    d = ImageDraw.Draw(lay)
    dark = tuple(int(c * 0.82) for c in col)
    light = tuple(min(255, int(c * 1.08)) for c in col)
    sw = 1 if step == 0 else -1
    walk = pose == "walk"

    def leg(lx, off, c):
        X = x + (lx + off) * s
        d.rounded_rectangle((X - 22 * s, y - 125 * s, X + 22 * s, y), radius=int(14 * s), fill=c)
        if c == col:
            for k in (-12, 0, 12):
                d.ellipse((X + (k - 5) * s, y - 9 * s, X + (k + 5) * s, y - 1 * s), fill=light)

    leg(-78, (12 * sw if walk else 0), dark)   # far back
    leg(52, (-12 * sw if walk else 0), dark)   # far front
    d.line([(x - 132 * s, y - 205 * s), (x - 150 * s, y - 165 * s), (x - 156 * s, y - 128 * s)], fill=dark, width=max(3, int(7 * s)), joint="curve")
    d.ellipse((x - 166 * s, y - 136 * s, x - 146 * s, y - 112 * s), fill=dark)
    d.ellipse((x - 140 * s, y - 268 * s, x + 118 * s, y - 84 * s), fill=col)
    d.ellipse((x - 110 * s, y - 258 * s, x + 60 * s, y - 200 * s), fill=light)
    leg(-48, (-12 * sw if walk else 0), col)   # near back
    leg(84, (12 * sw if walk else 0), col)     # near front

    if pose == "drink":
        hx, hy = x + 150 * s, y - 165 * s
    elif pose == "spray":
        hx, hy = x + 130 * s, y - 225 * s
    else:
        hx, hy = x + 132 * s, y - 218 * s
    r = 80 * s
    # trunk first so the head sits on top of its root
    if pose == "drink":
        path = bez((hx + 50 * s, hy + 20 * s), (hx + 105 * s, hy + 70 * s), (hx + 100 * s, y + 70 * s))
    elif pose == "spray":
        path = bez((hx + 52 * s, hy + 10 * s), (hx + 150 * s, hy + 40 * s), (hx + 165 * s, hy - 95 * s))
    else:
        path = bez((hx + 52 * s, hy + 18 * s), (hx + 125 * s, hy + 90 * s), (hx + 108 * s, hy + 170 * s))
        path += bez(path[-1], (hx + 100 * s, hy + 205 * s), (hx + 138 * s, hy + 196 * s), 14)[1:]
    tube(d, path, 27 * s, 12 * s, col)
    tip = path[-1]
    d.ellipse((hx - r, hy - r, hx + r, hy + r), fill=col)
    # ear
    ex, ey = hx - 58 * s, hy + 6 * s
    d.ellipse((ex - 64 * s, ey - 80 * s, ex + 64 * s, ey + 80 * s), fill=col, outline=dark, width=max(2, int(4 * s)))
    d.ellipse((ex - 44 * s, ey - 58 * s, ex + 40 * s, ey + 60 * s), fill=inner)
    # face
    d.ellipse((hx + 16 * s, hy - 32 * s, hx + 36 * s, hy - 8 * s), fill=(40, 40, 52))
    d.ellipse((hx + 24 * s, hy - 28 * s, hx + 31 * s, hy - 20 * s), fill=(255, 255, 255))
    d.arc((hx + 14 * s, hy + 2 * s, hx + 58 * s, hy + 36 * s), 20, 150, fill=(70, 60, 76), width=max(2, int(4 * s)))
    d.ellipse((hx + 34 * s, hy + 8 * s, hx + 62 * s, hy + 24 * s), fill=(236, 170, 186))
    if bow:
        bx, by = hx - 18 * s, hy - 78 * s
        d.polygon([(bx, by), (bx - 30 * s, by - 18 * s), (bx - 30 * s, by + 18 * s)], fill=(236, 104, 150))
        d.polygon([(bx, by), (bx + 30 * s, by - 18 * s), (bx + 30 * s, by + 18 * s)], fill=(236, 104, 150))
        d.ellipse((bx - 9 * s, by - 9 * s, bx + 9 * s, by + 9 * s), fill=(250, 140, 178))
    return over(base, lay, 0.9), tip


def acacia(base, x, y, s=1.0):
    lay = layer()
    d = ImageDraw.Draw(lay)
    bark = (104, 78, 52)
    d.polygon([(x - 14 * s, y), (x + 14 * s, y), (x + 6 * s, y - 220 * s), (x - 6 * s, y - 220 * s)], fill=bark)
    d.line([(x, y - 180 * s), (x - 90 * s, y - 260 * s)], fill=bark, width=int(12 * s))
    d.line([(x, y - 200 * s), (x + 100 * s, y - 270 * s)], fill=bark, width=int(12 * s))
    for cx, cy, rx, ry in [(-110, -285, 120, 38), (0, -305, 150, 44), (115, -290, 120, 38), (40, -330, 100, 32)]:
        d.ellipse((x + (cx - rx) * s, y + (cy - ry) * s, x + (cx + rx) * s, y + (cy + ry) * s), fill=(84, 118, 64))
    return over(base, lay, 1.3)


def cloud(base, x, y, s=1.0):
    lay = layer()
    d = ImageDraw.Draw(lay)
    for cx, cy, rr in [(-70, 10, 50), (0, -15, 70), (75, 8, 52), (20, 25, 55)]:
        d.ellipse((x + (cx - rr) * s, y + (cy - rr) * s, x + (cx + rr) * s, y + (cy + rr) * s), fill=(255, 255, 255, 225))
    return over(base, lay, 4)


def sun(base, x, y, r=80, color=(255, 232, 150)):
    base = glow(base, x, y, r * 5, (255, 220, 150), 0.35)
    lay = layer()
    ImageDraw.Draw(lay).ellipse((x - r, y - r, x + r, y + r), fill=color + (255,))
    return over(base, lay, 2)


def tufts(base, y, count, seed, color=(150, 150, 70), x0=0, x1=W):
    r = random.Random(seed)
    lay = layer()
    d = ImageDraw.Draw(lay)
    for _ in range(count):
        x = r.randint(x0, x1)
        yy = y + r.randint(0, H - y)
        h = r.randint(20, 55)
        for k in (-8, 0, 8):
            d.line([(x, yy), (x + k * 1.6, yy - h)], fill=color, width=4)
    return over(base, lay, 0.8)


def water_lines(base, y0, y1, seed, x0=0, x1=W):
    r = random.Random(seed)
    lay = layer()
    d = ImageDraw.Draw(lay)
    for _ in range(40):
        x = r.randint(x0, x1)
        y = r.randint(y0, y1)
        w = r.randint(30, 110)
        d.arc((x - w, y - 8, x + w, y + 8), 200, 340, fill=(235, 248, 255, 170), width=3)
    return over(base, lay, 0.8)


def day_sky():
    return sky([(0, (118, 178, 232)), (0.45, (178, 214, 242)), (0.62, (246, 228, 190)), (1, (230, 200, 140))])


def savanna(b, horizon=650):
    b = hills(b, (160, 176, 128), horizon - 20, 26, 21)
    b = hills(b, (182, 176, 112), horizon + 20, 22, 22, 1.3)
    return ground(b, horizon + 60, (226, 196, 122), (204, 168, 96))


def scene1():
    b = day_sky()
    b = sun(b, 1600, 170)
    b = cloud(b, 420, 170, 1.2)
    b = cloud(b, 1150, 120, 0.9)
    b = savanna(b)
    b = acacia(b, 300, 760, 1.2)
    b = acacia(b, 1700, 735, 0.7)
    b, _ = elephant(b, 520, 930, 1.3, PAPA, step=0)
    b, _ = elephant(b, 1330, 930, 1.12, MAMA, step=1)
    b, _ = elephant(b, 950, 950, 0.66, ELLA, step=1, bow=True, inner=PINK)
    b = tufts(b, 900, 70, 1)
    return finish(b, 11)


def scene2():
    b = day_sky()
    b = sun(b, 1560, 190)
    b = cloud(b, 700, 150, 1.0)
    b = savanna(b)
    lay = layer()
    d = ImageDraw.Draw(lay)
    d.polygon([(1180, 720), (1920, 700), (1920, 1080), (1420, 1080), (1330, 900)], fill=(96, 166, 214, 255))
    d.polygon([(1200, 722), (1920, 704), (1920, 760), (1260, 770)], fill=(140, 196, 232, 255))
    b = over(b, lay, 2)
    b = water_lines(b, 760, 1060, 2, 1350, 1900)
    b = acacia(b, 1080, 740, 0.8)
    b, _ = elephant(b, 340, 930, 1.15, PAPA, step=1)
    b, _ = elephant(b, 900, 930, 1.0, MAMA, step=0)
    b, _ = elephant(b, 640, 950, 0.6, ELLA, step=0, bow=True, inner=PINK)
    b = tufts(b, 900, 50, 2, x1=1250)
    return finish(b, 12)


def scene3():
    b = day_sky()
    b = sun(b, 1680, 150)
    b = cloud(b, 380, 140, 1.1)
    b = hills(b, (160, 176, 128), 560, 24, 23)
    b = ground(b, 620, (222, 192, 120), (200, 166, 96))
    lay = layer()
    d = ImageDraw.Draw(lay)
    pts = [(0, H)] + [(x, 880 + 12 * math.sin(x / 120)) for x in range(0, W + 40, 40)] + [(W, H)]
    d.polygon(pts, fill=(92, 162, 212, 255))
    b = over(b, lay, 2)
    b = water_lines(b, 900, 1060, 3)
    b, _ = elephant(b, 420, 870, 1.15, PAPA, pose="drink")
    b, _ = elephant(b, 1280, 870, 1.05, MAMA, pose="drink")
    b, tip = elephant(b, 870, 880, 0.68, ELLA, pose="spray", bow=True, inner=PINK)
    # splashes and ripples
    lay = layer()
    d = ImageDraw.Draw(lay)
    r = random.Random(8)
    tx, ty = tip
    for _ in range(26):
        a = math.radians(r.uniform(-160, -20))
        dist = r.uniform(30, 150)
        px, py = tx + dist * math.cos(a), ty + dist * math.sin(a)
        rr = r.uniform(5, 11)
        d.ellipse((px - rr, py - rr * 1.3, px + rr, py + rr * 1.3), fill=(200, 232, 255, 230))
    for cx in (420 + 1.15 * 250, 1280 + 1.05 * 250):
        for k in (1, 2):
            d.ellipse((cx - 40 * k, 950 - 10 * k, cx + 40 * k, 950 + 10 * k), outline=(230, 246, 255, 190), width=3)
    b = over(b, lay, 0.8)
    return finish(b, 13)


def scene4():
    b = sky([(0, (98, 120, 196)), (0.4, (226, 150, 160)), (0.62, (252, 196, 140)), (1, (226, 176, 112))])
    b = sun(b, 1480, 560, 95, (255, 206, 120))
    b = cloud(b, 520, 200, 1.0)
    b = savanna(b, 660)
    lay = layer()
    d = ImageDraw.Draw(lay)
    d.polygon([(0, 760), (520, 740), (380, 1080), (0, 1080)], fill=(96, 152, 200, 255))
    for bx, by in [(820, 260), (900, 230), (980, 270)]:
        d.arc((bx - 22, by - 10, bx, by + 10), 200, 340, fill=(70, 60, 70), width=4)
        d.arc((bx, by - 10, bx + 22, by + 10), 200, 340, fill=(70, 60, 70), width=4)
    b = over(b, lay, 1.5)
    b = acacia(b, 1780, 760, 0.9)
    b, _ = elephant(b, 760, 940, 1.15, PAPA, step=1)
    b, _ = elephant(b, 1560, 940, 1.02, MAMA, step=0)
    b, _ = elephant(b, 1150, 960, 0.62, ELLA, step=0, bow=True, inner=PINK)
    b = tufts(b, 910, 50, 4, (170, 140, 70), x0=560)
    return finish(b, 14)


def thumbnail(img):
    img = img.convert("RGBA")
    lay = layer()
    d = ImageDraw.Draw(lay)
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", 120)
    tw = d.textlength(TITLE, font=font)
    x, y = (W - tw) / 2, 70
    for ox, oy in [(-4, 0), (4, 0), (0, -4), (0, 4), (3, 3)]:
        d.text((x + ox, y + oy), TITLE, font=font, fill=(70, 50, 60, 255))
    d.text((x, y), TITLE, font=font, fill=(255, 248, 232, 255))
    return Image.alpha_composite(img, lay).convert("RGB")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    imgs = {}
    for i, fn in enumerate([scene1, scene2, scene3, scene4], 1):
        imgs[i] = fn()
        imgs[i].save(os.path.join(args.out, f"scene{i}.png"))
        print("saved scene", i)
    thumbnail(imgs[3]).resize((1280, 720)).save(os.path.join(args.out, "thumbnail.jpg"), quality=90)
    print("saved thumbnail")
