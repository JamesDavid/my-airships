# Saint-Cloud, by its real coordinates — step 7 of docs/PARIS_1901.md.
#
# WHAT IS WRONG NOW. The whole Saint-Cloud scene is laid out in the world's old
# HALF FRAME and converted by world.js's H2(). The conversion is still correct;
# the ground under it is not. The aerodrome moved to the Aéro-Club's true
# position when the world was re-surveyed and the Seine moved to
# OpenStreetMap's, and none of the hand-placed scenery followed:
#
#   the Avre aqueduct        564 m from any water, 9 m from Longchamp's centre
#   the Pont de Saint-Cloud  636 m from any water
#   Deutsch's air-ship shed  3.9 km from the aerodrome it stands beside
#   the village church       187 m from the river
#
# And a rigid translation cannot save it, because the layout is wrong INSIDE
# itself too: it puts the bridge 612 m east of the village where the real one is
# 469 m west. So every one of these gets a real coordinate, the same way Monaco
# and the St. Louis control points did.
#
# Two pilots asked for this on the same minute (bug_reports #31 and #32), and
# they were right to: every Deutsch run in the game starts here.
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

ORIGIN = (48.85826, 2.29450)
ORIGIN_XZ = (520.0, 300.0)
MLAT = 111320.0
MLON = 111320.0 * math.cos(math.radians(ORIGIN[0]))


def xz(lat, lon):
    return (ORIGIN_XZ[0] + (lon - ORIGIN[1]) * MLON,
            ORIGIN_XZ[1] - (lat - ORIGIN[0]) * MLAT)


QUERY = '''[out:json][timeout:240];
(
  way["name"="Pont de Saint-Cloud"];
  way["name"~"[Aa]queduc de l'Avre"];
  way["name"~"Passerelle de l'Avre"];
  nwr["name"="Église Saint-Clodoald"];
  nwr["name"="Domaine national de Saint-Cloud"];
  nwr["name"="Parc de Saint-Cloud"];
  nwr["name"="Hippodrome de Longchamp"];
  nwr["name"="Hippodrome d'Auteuil"];
  nwr["name"="Grande Cascade"]["tourism"];
  rel["boundary"="administrative"]["admin_level"="8"]["name"="Saint-Cloud"];
);
out center geom tags;'''


def overpass(q, key):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, key + '.json')
    if os.path.exists(p):
        print('  (cached)')
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


d = overpass(QUERY, 'stcloud')
print('%d elements\n' % len(d['elements']))
for e in d['elements']:
    t = e.get('tags', {})
    nm = t.get('name', '?')
    g = e.get('geometry') or []
    if not g and e.get('members'):
        for m in e['members']:
            g += m.get('geometry') or []
    if g:
        la = sum(p['lat'] for p in g) / len(g)
        lo = sum(p['lon'] for p in g) / len(g)
        ends = ' ends (%.1f,%.1f)->(%.1f,%.1f)' % (
            xz(g[0]['lat'], g[0]['lon']) + xz(g[-1]['lat'], g[-1]['lon']))
    elif e.get('center'):
        la, lo, ends = e['center']['lat'], e['center']['lon'], ''
    elif 'lat' in e:
        la, lo, ends = e['lat'], e['lon'], ''
    else:
        continue
    x, z = xz(la, lo)
    print('%-34s %-9s %10.5f %9.5f   game (%7.0f,%7.0f)%s'
          % (nm[:34], e['type'], la, lo, x, z, ends))
