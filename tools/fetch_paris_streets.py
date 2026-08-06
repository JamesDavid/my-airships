# The minor streets of Paris, and the only thing that makes the city read as one.
#
# Step 1 of docs/PARIS_1901.md, and the fix for two bug reports:
#   #28  "no roads in paris again?"
#   #29  "building right at the end of bridge in the spot a road looks like it
#         should be"
#
# WHY. src/paris_streets.js carries 336 ways — 65.4 km of road, against roughly
# a thousand kilometres inside the 1901 fortifications. Thirty per cent of the
# city is more than six hundred metres from any street at all. The bbox was
# never the problem; the CLASS SCREEN was:
#
#     way[highway~"^(primary|secondary|trunk)$"][name]
#
# That is the modern through-route classification. Almost every street inside a
# Haussmann block is tertiary, residential or unclassified, and those are the
# streets that make a city read as a city from two hundred metres up. They are
# also where the buildings come from: Paris's three thousand buildings are
# frontages generated along the street list, so with seven per cent of the
# network the generator packs them onto the few roads it has and leaves the
# rest of the city empty. That is both reports, from two directions.
#
# WHAT THIS DOES NOT DO. It does not touch the existing 336. The tool that
# produced them is not in the repository — only the query, as a comment — so
# re-deriving them would mean guessing at a screen that is already right, and
# a guess that came out worse would be a regression nobody would notice. This
# writes a SECOND file, src/paris_streets_minor.js, and paris_plan.js lays it
# under the first.
#
# THE PERIOD SCREEN, carried over from the head of paris_streets.js:
#
#  - Alignments that did not exist are dropped by name.
#  - Renames are kept: the game shows no street names, so the Avenue du
#    Président Wilson is the Avenue du Trocadéro and draws in the same place.
#  - "Outside the Thiers fortifications and the Bois, only through roads are
#    kept: the suburbs of 1901 were nothing like as dense as they are now." A
#    minor street is by definition not a through road, so OUTSIDE THE ENCEINTE
#    EVERY STREET IN THIS FILE IS DROPPED.
#
# And that last rule needs the enceinte, which was pulled down in 1919-29.
# docs/PARIS_1901.md proposes tracing it off the Boulevard Périphérique, which
# was laid along the line of the demolished wall. There is a better source, and
# for the same reason: the wall WAS the city limit, so the commune boundary of
# Paris still follows it — OSM relation 197171, admin level 8. It is one closed
# ring instead of a hundred motorway ways, and it is the line itself rather than
# a road built near it. (It also swallows the two Bois, annexed in 1859 and
# outside the wall; they carry no residential street, so it costs nothing.)
#
# Both Overpass responses are cached under tools/.cache/ — the street query is
# seven thousand ways and 504s more often than it succeeds.
import json
import math
import os
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOSTS = ['https://overpass.kumi.systems/api/interpreter',
         'https://overpass-api.de/api/interpreter']

BBOX = '48.840,2.220,48.895,2.375'          # the world's frame, as before
RING_BBOX = '48.800,2.200,48.920,2.430'     # wide enough for the whole ring

# the projection of src/paris_geo.js, exactly
ORIGIN = (48.85826, 2.29450)
ORIGIN_XZ = (520.0, 300.0)
MLAT = 111320.0
MLON = 111320.0 * math.cos(math.radians(ORIGIN[0]))
CENTRE = (48.8578, 2.3469)                  # Châtelet, for the angular sweep


def xz(lat, lon):
    return (ORIGIN_XZ[0] + (lon - ORIGIN[1]) * MLON,
            ORIGIN_XZ[1] - (lat - ORIGIN[0]) * MLAT)


CACHE = os.path.join(ROOT, 'tools', '.cache')


def overpass(q, label, key):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, key + '.json')
    if os.path.exists(path):
        print('  %s (cached)' % label)
        return json.load(open(path, encoding='utf-8'))
    for host in HOSTS:
        for attempt in range(3):
            try:
                print('  %s (%s, try %d)' % (label, host.split('/')[2], attempt + 1))
                r = urllib.request.urlopen(urllib.request.Request(
                    host, data=urllib.parse.urlencode({'data': q}).encode(),
                    headers={'User-Agent': 'MyAirships/1.0'}), timeout=600)
                d = json.loads(r.read())
                json.dump(d, open(path, 'w', encoding='utf-8'))
                return d
            except Exception as e:
                print('    ', str(e)[:80])
                time.sleep(8)
    raise SystemExit('could not reach Overpass for ' + label)


# ------------------------------------------------------------------ 1. the wall
ring = overpass(
    '[out:json][timeout:240];relation["boundary"="administrative"]'
    '["admin_level"="8"]["name"="Paris"];out geom;',
    'the commune boundary, which is where the wall stood', 'paris_boundary')
# There are ten communes called Paris and the query returns all of them —
# Tennessee, Texas, Idaho, Kentucky, Yukon. Picking by relation id is how you
# end up tracing the Thiers fortifications round Paris, Tennessee. Pick by the
# thing that cannot be two places at once: the French INSEE commune code.
BINS = 240
cx, cz = xz(*CENTRE)
INSEE = '75056'                            # Paris, France, and nowhere else
rings = [e for e in ring['elements'] if e.get('tags', {}).get('ref:INSEE') == INSEE]
if not rings:
    raise SystemExit('no commune with INSEE %s in the response' % INSEE)
pts = []
for e in rings:
    for m in e.get('members', []):
        pts += m.get('geometry') or []
    pts += e.get('geometry') or []
prof = [0.0] * BINS
for p in pts:
    x, z = xz(p['lat'], p['lon'])
    a = math.atan2(z - cz, x - cx)
    b = int((a + math.pi) / (2 * math.pi) * BINS) % BINS
    prof[b] = max(prof[b], math.hypot(x - cx, z - cz))
print('  relation %d (INSEE %s), %d boundary nodes'
      % (rings[0]['id'], INSEE, len(pts)))
# fill any empty bin from its neighbours, then smooth
for _ in range(4):
    for i in range(BINS):
        if prof[i] == 0:
            near = [prof[(i + d) % BINS] for d in (-2, -1, 1, 2) if prof[(i + d) % BINS]]
            if near:
                prof[i] = sum(near) / len(near)
prof = [(prof[(i - 1) % BINS] + prof[i] + prof[(i + 1) % BINS]) / 3 for i in range(BINS)]
print('  enceinte radius about Châtelet: %.0f..%.0f m' % (min(prof), max(prof)))
# From Châtelet the wall stands about 4.5 km away at its nearest, and the
# commune reaches about 9.5 km at its furthest — the tip of the Bois de
# Vincennes, annexed in 1859 and well outside the wall. Anything outside that
# band means the ring is not the ring, which is how Paris, Tennessee was caught.
if not (3000 < min(prof) < 6000 and 7000 < max(prof) < 11000):
    raise SystemExit('that is not the shape of Paris — check the boundary relation')


def inside_the_wall(x, z):
    a = math.atan2(z - cz, x - cx)
    b = int((a + math.pi) / (2 * math.pi) * BINS) % BINS
    return math.hypot(x - cx, z - cz) <= prof[b]


# ------------------------------------------------------------------ 2. the streets
data = overpass(
    '[out:json][timeout:600];'
    'way["highway"~"^(tertiary|residential|unclassified)$"]["name"](%s);'
    'out geom;' % BBOX, 'the minor street network', 'paris_minor_streets')
ways = [e for e in data['elements'] if e.get('geometry')]
print('  %d named minor ways offered' % len(ways))

# Alignments that did not exist in 1901, dropped by name. Same list as the head
# of paris_streets.js, plus the classes of modern minor road that only exist
# because of the works that made them.
ANACHRONISM = (
    'périphérique', 'peripherique', 'georges-pompidou', 'georges pompidou',
    'grand-maillot', 'lemonnier', 'voie express', 'bretelle', 'échangeur',
    'rampe', 'parking', 'tunnel', 'souterrain', 'passerelle', 'esplanade',
)
WIDTH = {'tertiary': 18, 'residential': 14, 'unclassified': 14}

kept, dropped = [], {'name': 0, 'outside': 0, 'short': 0}
for w in ways:
    t = w.get('tags', {})
    nm = t.get('name', '')
    low = nm.lower()
    if any(a in low for a in ANACHRONISM):
        dropped['name'] += 1
        continue
    pts = [xz(p['lat'], p['lon']) for p in w['geometry']]
    # "Outside the Thiers fortifications and the Bois, only through roads are
    # kept." A residential street is not a through road.
    if not any(inside_the_wall(x, z) for x, z in pts):
        dropped['outside'] += 1
        continue
    # simplify to twelve metres, as the trunk network was
    out = [pts[0]]
    for p in pts[1:]:
        if math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) >= 12:
            out.append(p)
    if len(out) < 2 or (len(out) == 2 and math.hypot(out[1][0] - out[0][0],
                                                     out[1][1] - out[0][1]) < 30):
        dropped['short'] += 1
        continue
    kept.append({'w': WIDTH.get(t['highway'], 14),
                 'pts': [[round(x, 1), round(z, 1)] for x, z in out]})

print('  kept %d; dropped %d by name, %d outside the wall, %d too short'
      % (len(kept), dropped['name'], dropped['outside'], dropped['short']))
L = sum(math.hypot(w['pts'][i][0] - w['pts'][i - 1][0], w['pts'][i][1] - w['pts'][i - 1][1])
        for w in kept for i in range(1, len(w['pts'])))
print('  %.1f km of minor street' % (L / 1000))

# ------------------------------------------------------------------ 3. emit
body = ',\n'.join(
    '  { w: %d, frontage: true, pts: %s }'
    % (w['w'], '[' + ','.join('[%g,%g]' % (p[0], p[1]) for p in w['pts']) + ']')
    for w in kept)
js = '''// The minor streets of Paris, 1901 — tertiary, residential and unclassified.
//
// GENERATED by tools/fetch_paris_streets.py. Step 1 of docs/PARIS_1901.md.
//
// src/paris_streets.js carries the trunk network: 336 ways, 65.4 km, the
// through routes. This is everything else inside the Thiers fortifications —
// %d ways, %.1f km — and it is what turns a set of boulevards back into a city.
// Without it thirty per cent of Paris was more than six hundred metres from any
// street, which a pilot filed as "no roads in paris again?", and the frontage
// generator had to pack three thousand buildings onto the few roads it had.
//
// Screened the same way as the trunk network: alignments that did not exist are
// dropped by name, renames are kept, and outside the fortifications nothing
// minor survives at all — "the suburbs of 1901 were nothing like as dense as
// they are now." The wall itself was pulled down in 1919-29 and is traced off
// the Boulevard Périphérique, which was laid along its line.
export const OSM_MINOR = [
%s,
];
''' % (len(kept), L / 1000, body)
open(os.path.join(ROOT, 'src', 'paris_streets_minor.js'), 'w',
     encoding='utf-8', newline='\n').write(js)
print('wrote src/paris_streets_minor.js (%d KB)' % (len(js) // 1024))
