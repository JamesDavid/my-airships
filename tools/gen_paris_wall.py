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


# ORDER THEM BY BEARING, not by stitching endpoints.
#
# The first attempt walked the ways end to end, which is how the Seine was
# walked — and it gave up as soon as two ways failed to meet within 400 m,
# leaving most of the ring unstitched. What came out was the northern arc only:
# the WESTERN wall, the one between the city and the Bois that every Deutsch
# flight crossed, was missing entirely, and a pilot said so — "you said paris
# was a walled city yet i don't see the city walls."
#
# The enceinte is a simple closed loop about the middle of Paris, so it does not
# need stitching at all. Sort every node by its bearing from Châtelet, take the
# median radius in each half-degree of arc, and the ring falls out in order with
# the slip roads and interchange loops averaged away.
cx, cz = xz(*CENTRE)
pts = [p for seg in segs for p in seg]
inframe = [p for p in pts if X0 <= p[0] <= X1 and Z0 <= p[1] <= Z1]
print('%d nodes, %d inside the survey' % (len(pts), len(inframe)))

BINS = 720                                   # half a degree of arc
bins = {}
for x, z in inframe:
    a = math.atan2(z - cz, x - cx)
    b = int((a + math.pi) / (2 * math.pi) * BINS) % BINS
    bins.setdefault(b, []).append(math.hypot(x - cx, z - cz))

ring = []
for b in range(BINS):
    rs = bins.get(b)
    if not rs:
        ring.append(None)                    # the ring is outside the frame here
        continue
    rs.sort()
    r = rs[len(rs) // 2]                     # median: a bretelle cannot drag it
    a = (b + 0.5) / BINS * 2 * math.pi - math.pi
    ring.append((cx + math.cos(a) * r, cz + math.sin(a) * r))

have = [r for r in ring if r]
rad = [math.hypot(p[0] - cx, p[1] - cz) for p in have]
print('%d of %d half-degree bins have wall in them; radius %.0f..%.0f m'
      % (len(have), BINS, min(rad), max(rad)))

# Walk the bins in order. An EMPTY bin is not a break — the Périphérique's
# nodes are sparse in places and the ring is still the ring across a gap of a
# few degrees. Only a real jump ends a run, which is where the wall leaves the
# survey and comes back somewhere else.
runs, cur = [], []
for p in [ring[i] for i in range(BINS) if ring[i]] + [None]:
    if p is None or (cur and math.dist(cur[-1], p) > 420):
        if len(cur) > 4:
            runs.append(cur)
        cur = []
    if p:
        cur.append(p)
if len(cur) > 4:
    runs.append(cur)
L = sum(math.dist(r[i - 1], r[i]) for r in runs for i in range(1, len(r)))
print('%d run%s inside the survey, %.1f km of rampart'
      % (len(runs), '' if len(runs) == 1 else 's', L / 1000))
for r in runs:
    print('   %3d stations  x %6.0f..%-6.0f  z %6.0f..%-6.0f'
          % (len(r), min(q[0] for q in r), max(q[0] for q in r),
             min(q[1] for q in r), max(q[1] for q in r)))

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
