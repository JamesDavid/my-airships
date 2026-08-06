# The real building footprints of central Paris — step 3 of docs/PARIS_1901.md.
#
# Paris's three thousand buildings were all procedural: frontages generated
# along the street list, which is why the city read as rows of boxes rather than
# as blocks. OpenStreetMap holds the actual footprints, and for the Haussmann
# core they are the 1901 footprints, because the core is what did not change.
#
# SCOPE, AND WHY IT IS NOT THE WHOLE MAP. A count query over the world's frame
# times out; the box below holds 15,794 buildings and covers the Tower, the
# Champ de Mars, the Trocadéro, the Invalides, the Champs-Élysées, the Étoile,
# the Grand and Petit Palais, the Madeleine and the Opéra — which is the theatre
# of every scenario in the game. Outside it the procedural frontages stay, and
# now that the minor street network is in they are no longer thin.
#
# WHAT IS SCREENED OUT, because today's footprints are not all 1901's:
#
#   - anything over eight storeys. The Haussmann cornice line is famously
#     uniform and the 1902 by-law capped it; a modern tower in the middle of it
#     is a modern tower.
#   - anything under 40 m², which is a shed, a kiosk or a lift head.
#   - anything on a landmark's site — those are modelled properly in
#     src/paris_landmarks.js and a footprint on top of one would fight it.
#   - anything inside the drawn channel of the Seine. The river is 144 m wide
#     here and today's quaysides sit right on its edge, so a handful of modern
#     footprints land in water this world draws. world.js filters them at load
#     as well, but a data file that needs filtering is a data file that lies.
#
# Each footprint is reduced to its SMALLEST-AREA ORIENTED BOX rather than an
# axis-aligned one: a Haussmann block sits at whatever angle its street does,
# and an axis-aligned box round a diagonal building is half again too fat.
import json
import math
import os
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', '.cache')
HOSTS = ['https://overpass.kumi.systems/api/interpreter',
         'https://overpass-api.de/api/interpreter']

BBOX = '48.845,2.255,48.878,2.325'
ORIGIN = (48.85826, 2.29450)
ORIGIN_XZ = (520.0, 300.0)
MLAT = 111320.0
MLON = 111320.0 * math.cos(math.radians(ORIGIN[0]))

MAX_LEVELS = 8            # the Haussmann cornice; anything taller is modern
MIN_AREA = 40.0           # a shed
STOREY = 3.4              # metres per storey where OSM gives levels


def overpass(q, key):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, key + '.json')
    if os.path.exists(p):
        print('(cached)')
        return json.load(open(p, encoding='utf-8'))
    for host in HOSTS:
        for a in range(4):
            try:
                print('  %s try %d' % (host.split('/')[2], a + 1))
                r = urllib.request.urlopen(urllib.request.Request(
                    host, data=urllib.parse.urlencode({'data': q}).encode(),
                    headers={'User-Agent': 'MyAirships/1.0'}), timeout=900)
                d = json.loads(r.read())
                json.dump(d, open(p, 'w', encoding='utf-8'))
                return d
            except Exception as e:
                print('   ', str(e)[:70])
                time.sleep(15)
    raise SystemExit('could not reach Overpass')


def oriented_box(pts):
    best = None
    n = len(pts)
    for i in range(n):
        ax, az = pts[i]
        bx, bz = pts[(i + 1) % n]
        L = math.hypot(bx - ax, bz - az)
        if L < 1e-6:
            continue
        ux, uz = (bx - ax) / L, (bz - az) / L
        us = [(p[0] - ax) * ux + (p[1] - az) * uz for p in pts]
        vs = [-(p[0] - ax) * uz + (p[1] - az) * ux for p in pts]
        du, dv = max(us) - min(us), max(vs) - min(vs)
        if best is None or du * dv < best[0]:
            cu, cv = (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2
            best = (du * dv, ax + ux * cu - uz * cv, az + uz * cu + ux * cv,
                    du, dv, math.atan2(uz, ux))
    return best


d = overpass('[out:json][timeout:900];way["building"](%s);out geom tags;' % BBOX,
             'paris_buildings')
print('%d building ways offered' % len(d['elements']))

# the landmark sites, so a footprint never fights a modelled building
lm = []
import re
lm_src = open(os.path.join(ROOT, 'src', 'paris_landmarks.js'), encoding='utf-8').read()
# …and the river, so nothing is written into the water
terr = open(os.path.join(ROOT, 'src', 'paris_terrain.js'), encoding='utf-8').read()
SEINE = json.loads(re.search(r'export const SEINE_XZ = (\[.*?\]);', terr, re.S).group(1))
RIVER_HALF = int(re.search(r'export const RIVER_HALF = (\d+)', terr).group(1))


def in_channel(x, z):
    return any((p[0] - x) ** 2 + (p[1] - z) ** 2 < RIVER_HALF ** 2 for p in SEINE)

for m in re.finditer(r"x: (-?[\d.]+), z: (-?[\d.]+), w: ([\d.]+), l: ([\d.]+)", lm_src):
    x, z, w, l = (float(v) for v in m.groups())
    lm.append((x, z, math.hypot(w, l) / 2 + 20))

kept, drop = [], {'levels': 0, 'small': 0, 'landmark': 0, 'thin': 0, 'river': 0}
for e in d['elements']:
    g = e.get('geometry') or []
    if len(g) < 4:
        continue
    t = e.get('tags', {})
    lv = t.get('building:levels')
    try:
        lv = float(lv) if lv else None
    except ValueError:
        lv = None
    if lv and lv > MAX_LEVELS:
        drop['levels'] += 1
        continue
    pts = [(ORIGIN_XZ[0] + (p['lon'] - ORIGIN[1]) * MLON,
            ORIGIN_XZ[1] - (p['lat'] - ORIGIN[0]) * MLAT) for p in g]
    b = oriented_box(pts)
    if not b:
        continue
    area, cx, cz, du, dv, ang = b
    if area < MIN_AREA:
        drop['small'] += 1
        continue
    if min(du, dv) < 3.0:
        drop['thin'] += 1
        continue
    if any((cx - lx) ** 2 + (cz - lz) ** 2 < lr * lr for lx, lz, lr in lm):
        drop['landmark'] += 1
        continue
    if in_channel(cx, cz):
        drop['river'] += 1
        continue
    h = lv * STOREY if lv else (14 + min(10, area / 90))
    kept.append((round(cx, 1), round(cz, 1), round(dv, 1), round(du, 1),
                 round(-ang, 3), round(h, 1)))

print('kept %d; dropped %d over %d storeys, %d under %d m2, %d slivers, '
      '%d on a landmark, %d in the Seine'
      % (len(kept), drop['levels'], MAX_LEVELS, drop['small'], MIN_AREA,
         drop['thin'], drop['landmark'], drop['river']))

body = ',\n'.join('[%g,%g,%g,%g,%g,%g]' % b for b in kept)
js = '''// The real building footprints of central Paris — step 3 of PARIS_1901.md.
//
// GENERATED by tools/fetch_paris_buildings.py from OpenStreetMap.
//
// %d buildings, as [x, z, w, l, ry, h]: centre, across, along, three.js
// rotation.y, height. Each is the SMALLEST-AREA oriented box round the real
// footprint — not an axis-aligned one, because a Haussmann block sits at
// whatever angle its street does and an axis-aligned box round a diagonal
// building is half again too fat.
//
// Bounded to the theatre of the game — the Tower, the Champ de Mars, the
// Trocadéro, the Invalides, the Champs-Élysées, the Étoile, the two Palais, the
// Madeleine and the Opéra. Outside it the procedural frontages stay, and since
// the minor street network went in they are no longer thin.
//
// Screened, because today's footprints are not all 1901's: nothing over eight
// storeys (the Haussmann cornice line, capped by by-law), nothing under 40 m2,
// no slivers, and nothing standing on a landmark's site — those are modelled
// properly in src/paris_landmarks.js.
export const OSM_BUILDINGS = [
%s,
];
''' % (len(kept), body)
open(os.path.join(ROOT, 'src', 'paris_buildings.js'), 'w',
     encoding='utf-8', newline='\n').write(js)
print('wrote src/paris_buildings.js (%d KB)' % (len(js) // 1024))
