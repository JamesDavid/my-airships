# Fetch the terrain tiles Monaco is built from.
#
# AWS Terrain Tiles, terrarium encoding, no key and no auth:
#   https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
#   elevation = (R * 256 + G + B / 256) - 32768
#
# A 7x7 block at zoom 14 covers the bay from Cap d'Ail to past Cap Martin and
# back to Mont Agel. Writes tiles/{x}_{y}.png, then mosaics them to
# monaco_dem.png, which tools/gen_monaco.py reads.
import os, math, urllib.request
from PIL import Image

Z = 14
X0, Y0, X1, Y1 = 8527, 5970, 8533, 5976
URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/%d/%d/%d.png'

os.makedirs('tiles', exist_ok=True)
for x in range(X0, X1 + 1):
    for y in range(Y0, Y1 + 1):
        f = 'tiles/%d_%d.png' % (x, y)
        if os.path.exists(f): continue
        req = urllib.request.Request(URL % (Z, x, y), headers={'User-Agent': 'MyAirships/1.0'})
        open(f, 'wb').write(urllib.request.urlopen(req, timeout=60).read())
        print('got', f)

W, H = (X1 - X0 + 1) * 256, (Y1 - Y0 + 1) * 256
big = Image.new('RGB', (W, H))
for x in range(X0, X1 + 1):
    for y in range(Y0, Y1 + 1):
        big.paste(Image.open('tiles/%d_%d.png' % (x, y)).convert('RGB'),
                  ((x - X0) * 256, (y - Y0) * 256))
big.save('monaco_dem.png')

def lon_of(i): return (X0 * 256 + i) / (2 ** Z * 256) * 360 - 180
def lat_of(j):
    t = math.pi * (1 - 2 * (Y0 * 256 + j) / (2 ** Z * 256))
    return math.degrees(math.atan(math.sinh(t)))
print('monaco_dem.png %dx%d  lon %.4f..%.4f  lat %.4f..%.4f'
      % (W, H, lon_of(0), lon_of(W - 1), lat_of(H - 1), lat_of(0)))
