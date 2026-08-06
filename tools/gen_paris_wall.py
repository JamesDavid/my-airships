# The Thiers fortifications: the wall Paris was inside in 1901.
#
# Step 4 of docs/PARIS_1901.md.
#
# Paris was a walled city until 1919. The Thiers enceinte was a continuous
# bastioned rampart about 33 km round, with a wet-bottomed ditch, a cleared
# glacis outside it on which building was forbidden, and the military road — the
# rue Militaire — running inside. Every one of Santos-Dumont's Paris flights
# began, ended and was watched from inside it. An airship at a hundred and fifty
# metres had it in view as the definite edge of the city, and the world has had
# no edge at all: Paris simply thinned out into countryside.
#
# WHERE IT WAS, AND WHY THE OBVIOUS SOURCE IS WRONG HERE. The commune boundary
# of Paris follows the wall, because the wall WAS the city limit — and that is
# what tools/fetch_paris_streets.py uses to decide what counts as "outside the
# fortifications". But it fails at exactly the place this world needs it. The
# Bois de Boulogne and the Bois de Vincennes were annexed in 1859 and lie
# OUTSIDE the enceinte, so round both of them the boundary runs along the far
# edge of the wood, up to two kilometres beyond the rampart. The Bois de
# Boulogne is the WESTERN side — which is the side inside this map, and the side
# every Deutsch flight crossed on its way from Saint-Cloud to the Tower.
#
# So this falls back to what PARIS_1901 proposed in the first place: the
# BOULEVARD PÉRIPHÉRIQUE, laid in 1973 along the line of the demolished wall.
# The one alignment the period screen drops by name as an anachronism is the one
# that records where the 1901 wall stood.
#
# ONLY 16% of the commune boundary falls inside the survey's frame at all: the
# world is centred on the Tower and reaches west to Saint-Cloud, so eastern
# Paris is off the map. What comes out is the western arc, and that is the arc
# that matters.
import io
import json
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', '.cache', 'paris_peripherique.json')

ORIGIN = (48.85826, 2.29450)                # the Eiffel Tower, as paris_geo has it
ORIGIN_XZ = (520.0, 300.0)
MLAT = 111320.0
MLON = 111320.0 * math.cos(math.radians(ORIGIN[0]))
CENTRE = (48.8578, 2.3469)                  # Châtelet
INSEE = '75056'

# the survey's frame, from paris_terrain.js — the wall is clipped to it
X0, X1, Z0, Z1 = -5100, 6100, -3800, 2500


def xz(lat, lon):
    return (ORIGIN_XZ[0] + (lon - ORIGIN[1]) * MLON,
            ORIGIN_XZ[1] - (lat - ORIGIN[0]) * MLAT)


if not os.path.exists(CACHE):
    raise SystemExit('no cached Périphérique — see the query at the head of '
                     'this file')
d = json.load(io.open(CACHE, encoding='utf-8'))
# The inner carriageway alone: the two run a few tens of metres apart and taking
# both would give a doubled, braided ring.
segs = []
for e in d['elements']:
    if 'Int' not in e.get('tags', {}).get('name', ''):
        continue
    g = e.get('geometry') or []
    if len(g) > 1:
        segs.append([xz(p['lat'], p['lon']) for p in g])
print('%d inner-carriageway ways, %d nodes' % (len(segs), sum(len(s) for s in segs)))


def stitch(segs):
    segs = [list(s) for s in segs]
    ring = segs.pop(0)
    while segs:
        best, bi, brev, bend = 1e9, -1, False, False
        for i, s in enumerate(segs):
            for rev in (False, True):
                t = s[::-1] if rev else s
                d0 = math.dist(ring[-1], t[0])
                d1 = math.dist(ring[0], t[-1])
                if d0 < best:
                    best, bi, brev, bend = d0, i, rev, True
                if d1 < best:
                    best, bi, brev, bend = d1, i, rev, False
        if best > 400:
            break
        s = segs.pop(bi)
        if brev:
            s = s[::-1]
        ring = ring + s[1:] if bend else s[:-1] + ring
    return ring


ring = stitch(segs)
print('stitched to %d points' % len(ring))

cx, cz = xz(*CENTRE)
rad = [math.hypot(p[0] - cx, p[1] - cz) for p in ring]
print('radius about Châtelet %.0f..%.0f m' % (min(rad), max(rad)))

# The Périphérique carries slip roads and interchange loops that dive well
# inside and outside the ring. The wall was a smooth oval; anything far off the
# local trend is a bretelle, not a rampart.
med = sorted(rad)[len(rad) // 2]
keep = [p for p, r in zip(ring, rad) if 0.80 * med < r < 1.25 * med]
print('%d of %d stations kept (%d on slip roads and loops)'
      % (len(keep), len(ring), len(ring) - len(keep)))

# resample to an even 60 m and clip to the survey
out = []
for i, p in enumerate(keep):
    if out and math.dist(out[-1], p) < 60:
        continue
    if math.dist(out[-1] if out else p, p) > 500:      # a cut where a lobe was
        out.append(None)
    out.append(p)
runs, cur = [], []
for p in out:
    if p is None:
        if len(cur) > 3:
            runs.append(cur)
        cur = []
    elif X0 <= p[0] <= X1 and Z0 <= p[1] <= Z1:
        cur.append(p)
    else:
        if len(cur) > 3:
            runs.append(cur)
        cur = []
if len(cur) > 3:
    runs.append(cur)
L = sum(math.dist(r[i - 1], r[i]) for r in runs for i in range(1, len(r)))
print('%d run%s inside the survey, %.1f km of rampart'
      % (len(runs), '' if len(runs) == 1 else 's', L / 1000))

body = ',\n'.join(
    '  [' + ','.join('[%g,%g]' % (round(x, 1), round(z, 1)) for x, z in r) + ']'
    for r in runs)
js = '''// The Thiers fortifications, 1841–1919 — the wall Paris was inside.
//
// GENERATED by tools/gen_paris_wall.py. Step 4 of docs/PARIS_1901.md.
//
// A continuous bastioned rampart about 33 km round, with a ditch, a cleared
// glacis outside on which building was forbidden, and the rue Militaire inside.
// It was not pulled down until 1919–29, so it stood through every flight in
// this game, and an airship at a hundred and fifty metres had it in view as the
// definite edge of the city. Without it Paris simply thinned out into
// countryside.
//
// Traced off the Boulevard Périphérique, laid in 1973 along the line of the
// demolished wall — the one alignment the period street screen drops by name as
// an anachronism is the one that records where the 1901 wall stood.
//
// NOT off the commune boundary, which is the obvious source and follows the
// wall everywhere except round the two Bois: they were annexed in 1859 and lie
// OUTSIDE the enceinte, so the boundary runs along the far edge of the wood
// instead. The Bois de Boulogne is the western side, which is the side inside
// this map.
//
// %.1f km in %d run%s — the arc of the ring that falls inside the survey's
// frame. Only a sixth of the wall is in frame at all: the world is centred on
// the Tower and reaches west to Saint-Cloud, so eastern Paris is off the map.
//
// Heights are the real thing: the rampart stood about 10 m over the glacis with
// a 3 m parapet, the ditch was some 15 m wide, and the glacis was cleared for
// 250 m — the zone non aedificandi, which is why the ring reads as a green belt
// in every period photograph.
export const WALL_RUNS = [
%s,
];

export const WALL = { rampart: 10, parapet: 3, ditch: 15, glacis: 250, base: 34 };
''' % (L / 1000, len(runs), '' if len(runs) == 1 else 's', body)
io.open(os.path.join(ROOT, 'src', 'paris_wall.js'), 'w',
        encoding='utf-8', newline='\n').write(js)
print('wrote src/paris_wall.js')
