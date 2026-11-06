"""Builds QuickLaunch.hta from the template by inlining the icon (ico + png) as base64."""
import base64, io, pathlib
from PIL import Image
here = pathlib.Path(__file__).parent
art = ["..##########....",".#BBBBBBBBBB#...","#BBBBBBBYYKBB#..","#BBBBBBYYKBBB#..","#BBBBBYYKBBBB#..","#BBBBYYKBBBBB#..",
       "#BBBYYYYYYKBB#..","#BBBKKKYYKBBB#..","#BBBBBYYKBBBB#..","#BBBBYYKBBBBB#..","#BBBYYKBBBBBB#..","#BBBYKBBBBBBB#..",
       ".#BBBBBBBBBB#...","..##########....","................","................"]
pal = {'.':(0,0,0,0),'#':(15,18,40,255),'B':(41,54,111,255),'Y':(255,205,117,255),'K':(177,62,83,255)}
im = Image.new('RGBA',(16,16))
for y,row in enumerate(art):
    for x,c in enumerate(row): im.putpixel((min(15,x+1),min(15,y+1)),pal[c])
ico = io.BytesIO(); im.resize((256,256),Image.NEAREST).save(ico,'ICO',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(256,256)])
png = io.BytesIO(); im.resize((32,32),Image.NEAREST).save(png,'PNG')
t = (here/'QuickLaunch.template.hta').read_text()
t = t.replace('__ICO__',base64.b64encode(ico.getvalue()).decode()).replace('__LOGO__',base64.b64encode(png.getvalue()).decode())
assert all(ord(c)<127 for c in t), 'keep the HTA pure ASCII'
(here.parent/'QuickLaunch.hta').write_text(t, newline='\r\n')
print('built QuickLaunch.hta', len(t), 'chars')
