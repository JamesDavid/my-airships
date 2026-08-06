# Geometry, not just centres, for the two control points that have a shape:
# the Art Museum's building outline (the Palace of Fine Arts) and the Grand
# Basin's water polygon. The fair's grand axis is the line between them, and a
# centroid-to-centroid line is not good enough to fix a bearing over 340 m —
# the museum is 106 m wide and the basin is 183 m across, so a few metres of
# centroid error is a degree of axis error, which is 7 m at the far palaces.
import json, math, time, urllib.request, urllib.parse

HOSTS = ['https://overpass-api.de/api/interpreter',
         'https://overpass.kumi.systems/api/interpreter']

QUERY = """[out:json][timeout:180];
(
  way["building"]["name"="Saint Louis Art Museum"](38.635,-90.300,38.645,-90.288);
  rel["name"="Emerson Grand Basin"](38.635,-90.300,38.288,-90.285);
  rel["name"="Emerson Grand Basin"](38.635,-90.300,38.650,-90.285);
);
out geom;"""

d = None
for host in HOSTS:
    for attempt in range(3):
        try:
            r = urllib.request.urlopen(urllib.request.Request(
                host, data=urllib.parse.urlencode({'data': QUERY}).encode(),
                headers={'User-Agent': 'MyAirships/1.0'}), timeout=200)
            d = json.loads(r.read())
            break
        except Exception as e:
            print(' ', host, str(e)[:70]); time.sleep(8)
    if d: break
if not d: raise SystemExit('could not reach Overpass')
json.dump(d, open('stlouis_geom_osm.json', 'w'))

LAT0 = 38.6395
MLAT = 111132.0
MLON = 111320.0 * math.cos(math.radians(LAT0))


def pts(e):
    if e['type'] == 'way':
        return [(g['lat'], g['lon']) for g in e['geometry']]
    out = []
    for m in e.get('members', []):
        for g in m.get('geometry', []) or []:
            out.append((g['lat'], g['lon']))
    return out


for e in d['elements']:
    p = pts(e)
    if not p:
        continue
    lat = [a for a, b in p]
    lon = [b for a, b in p]
    clat, clon = sum(lat) / len(lat), sum(lon) / len(lon)
    w = (max(lon) - min(lon)) * MLON
    h = (max(lat) - min(lat)) * MLAT
    print('%-8s %-26s n=%-4d centre %.6f %.6f   extent %.1f m E-W x %.1f m N-S'
          % (e['type'], e.get('tags', {}).get('name', '?'), len(p), clat, clon, w, h))
    print('     lat %.6f..%.6f   lon %.6f..%.6f' % (min(lat), max(lat), min(lon), max(lon)))
