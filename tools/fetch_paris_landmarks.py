# The landmarks of Paris, by their real footprints — step 5 of PARIS_1901.md.
#
# paris_geo.PLACES names 27 landmarks and world.js modelled 16. These eleven
# were in the table, correctly located, and had never been built:
#
#   petitpalais · madeleine · louvre · bastille · hoteldeville · gareorsay ·
#   chatelet · republique · vendome · autueil · vaugirard
#
# A coordinate is not a building. This fetches the FOOTPRINT of each — the
# outline OpenStreetMap holds, which for these is the same outline as 1901
# because they are all still standing — and reduces it to an oriented box, so
# the world can raise the right mass at the right angle instead of a procedural
# block the size of a Louvre-shaped hole.
#
# WHAT IS AND IS NOT PERIOD. Every one of these stood in 1901 except where noted
# in gen_paris_landmarks.py, which carries the dates and the shapes. The Gare
# d'Orsay had opened the year before, in May 1900; the Petit Palais was 1900
# Exposition work a year old. Auteuil is a racecourse, not a building, and is
# already traced in paris_stcloud.js. Vaugirard is Lachambre's balloon works —
# where Santos-Dumont's envelopes were actually made, and the one address in the
# list that belongs to him — and it is long gone, so it gets the same treatment
# as the palaces of St. Louis: built from the record, not fetched.
import json
import math
import os
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', '.cache')
HOSTS = ['https://overpass-api.de/api/interpreter',
         'https://overpass.kumi.systems/api/interpreter']

ORIGIN = (48.85826, 2.29450)
ORIGIN_XZ = (520.0, 300.0)
MLAT = 111320.0
MLON = 111320.0 * math.cos(math.radians(ORIGIN[0]))

# name in OSM -> the key in paris_geo.PLACES
WANT = {
    'Petit Palais': 'petitpalais',
    'Église de la Madeleine': 'madeleine',
    'Palais du Louvre': 'louvre',
    "Opéra Bastille": None,                       # 1989 — fetched only to reject
    'Hôtel de Ville': 'hoteldeville',
    "Musée d'Orsay": 'gareorsay',                 # the Gare d'Orsay's own shell
    'Théâtre du Châtelet': 'chatelet',
    'Colonne Vendôme': 'vendome',
    'Colonne de Juillet': 'bastille',             # the July Column, 1840
    'Palais Garnier': 'opera',                    # already built; a control
}

Q = '''[out:json][timeout:240];
(
  way["name"="Petit Palais"](48.855,2.300,48.875,2.330);
  way["name"="Église de la Madeleine"](48.865,2.315,48.875,2.330);
  rel["name"="Palais du Louvre"](48.855,2.325,48.868,2.345);
  way["name"="Palais du Louvre"](48.855,2.325,48.868,2.345);
  way["name"="Hôtel de Ville"](48.853,2.348,48.860,2.356);
  way["name"="Musée d'Orsay"](48.858,2.320,48.863,2.328);
  way["name"="Théâtre du Châtelet"](48.855,2.343,48.860,2.350);
  nwr["name"="Colonne Vendôme"](48.865,2.326,48.870,2.332);
  nwr["name"="Colonne de Juillet"](48.850,2.366,48.856,2.373);
  way["name"="Palais Garnier"](48.869,2.329,48.874,2.335);
  nwr["name"="Place de la République"](48.865,2.360,48.870,2.368);
);
out geom tags;'''


def overpass(q, key):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, key + '.json')
    if os.path.exists(p):
        print('(cached)')
        return json.load(open(p, encoding='utf-8'))
    for host in HOSTS:
        for a in range(3):
            try:
                print('  %s try %d' % (host.split('/')[2], a + 1))
                r = urllib.request.urlopen(urllib.request.Request(
                    host, data=urllib.parse.urlencode({'data': q}).encode(),
                    headers={'User-Agent': 'MyAirships/1.0'}), timeout=300)
                d = json.loads(r.read())
                json.dump(d, open(p, 'w', encoding='utf-8'))
                return d
            except Exception as e:
                print('   ', str(e)[:70])
                time.sleep(6)
    raise SystemExit('could not reach Overpass')


def oriented_box(pts):
    """Smallest-area box round a footprint: centre, half-extents, bearing.

    Rotating calipers over the hull's own edges — a building's box is aligned
    with one of its walls, and taking the axis-aligned bounding box instead
    would make every diagonal building far too fat."""
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
        area = (max(us) - min(us)) * (max(vs) - min(vs))
        if best is None or area < best[0]:
            cu = (max(us) + min(us)) / 2
            cv = (max(vs) + min(vs)) / 2
            best = (area, ax + ux * cu - uz * cv, az + uz * cu + ux * cv,
                    (max(us) - min(us)) / 2, (max(vs) - min(vs)) / 2,
                    math.atan2(uz, ux))
    return best


d = overpass(Q, 'paris_landmarks')
print('%d elements\n' % len(d['elements']))
rows = {}
for e in d['elements']:
    t = e.get('tags', {})
    nm = t.get('name', '?')
    g = e.get('geometry') or []
    for m in e.get('members', []):
        g = g + (m.get('geometry') or [])
    if not g and 'lat' in e:
        g = [{'lat': e['lat'], 'lon': e['lon']}]
    if len(g) < 3:
        continue
    pts = [(ORIGIN_XZ[0] + (p['lon'] - ORIGIN[1]) * MLON,
            ORIGIN_XZ[1] - (p['lat'] - ORIGIN[0]) * MLAT) for p in g]
    b = oriented_box(pts)
    if not b:
        continue
    area, cx, cz, hu, hv, ang = b
    if nm in rows and rows[nm][0] > area:
        continue
    rows[nm] = (area, cx, cz, hu, hv, ang, len(pts),
                t.get('building:levels') or t.get('height') or '')
for nm, (area, cx, cz, hu, hv, ang, n, lv) in sorted(rows.items()):
    print('%-26s (%7.0f,%7.0f)  %6.1f x %6.1f m  bearing %6.1f deg  %3d nodes  %s'
          % (nm[:26], cx, cz, hu * 2, hv * 2, math.degrees(ang) % 180, n, lv))
json.dump({k: v for k, v in rows.items()},
          open(os.path.join(CACHE, 'paris_landmarks_boxes.json'), 'w'))
print('\nwrote tools/.cache/paris_landmarks_boxes.json')
