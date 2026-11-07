"""Makes src/app.ico - a pixel toolbox in the QuickLaunch colours. Run: python3 tools/make_icon.py"""
import pathlib
from PIL import Image
art = ["................","................",".....######.....","....#......#....","....#......#....","..############..",".#RRRRRRRRRRRR#.",".#RRRRRRRRRRRR#.",
       ".#RRRRYYYYRRRR#.",".#KKKKYKKYKKKK#.",".#RRRRYYYYRRRR#.",".#RRRRRRRRRRRR#.",".#RRRRRRRRRRRR#.","..############..","................","................"]
pal = {'.': (0, 0, 0, 0), '#': (15, 18, 40, 255), 'R': (41, 54, 111, 255), 'Y': (255, 205, 117, 255), 'K': (177, 62, 83, 255)}
im = Image.new('RGBA', (16, 16))
for y, row in enumerate(art):
    for x, c in enumerate(row): im.putpixel((x, y), pal[c])
out = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'app.ico'
im.resize((256, 256), Image.NEAREST).save(out, 'ICO', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (256, 256)])
print('wrote', out)
