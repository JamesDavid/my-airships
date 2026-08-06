# The four things the 1904 fair left behind, from OpenStreetMap.
#
# STLOUIS_PLAT.md argues that the OSM flow must NOT be run over Forest Park —
# today's park is golf courses and a zoo, and importing it would be
# contamination, not a period screen. This is the one honest use of OSM here:
# four features that are physically the same objects the fair built, whose
# modern coordinates are therefore also their 1904 coordinates.
#
#   Saint Louis Art Museum   the Palace of Fine Arts, standing, same footprint
#   Grand Basin              the same basin, still full of water
#   1904 Flight Cage         standing where it was built, in the zoo
#   Art Hill                 the landform (also checked against the DEM)
#
# Everything else in the world is placed relative to these.
import json, time, urllib.request, urllib.parse

HOSTS = ['https://overpass-api.de/api/interpreter',
         'https://overpass.kumi.systems/api/interpreter']

# Forest Park, generously bounded.
BBOX = '38.625,-90.300,38.650,-90.265'

QUERY = """[out:json][timeout:180];
(
  nwr["name"="Saint Louis Art Museum"](%(b)s);
  nwr["name"="Grand Basin"](%(b)s);
  nwr["name"~"Flight Cage"](%(b)s);
  nwr["name"="Art Hill"](%(b)s);
  nwr["name"="Emerson Grand Basin"](%(b)s);
  nwr["name"~"World's Fair Pavilion"](%(b)s);
  nwr["name"="Post-Dispatch Lake"](%(b)s);
);
out center tags;""" % {'b': BBOX}

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

json.dump(d, open('stlouis_control_osm.json', 'w'))
for e in d['elements']:
    t = e.get('tags', {})
    c = e.get('center') or e
    print('%-12s %-34s %.6f %.6f  %s' % (
        e['type'], t.get('name', '?'), c.get('lat', 0), c.get('lon', 0),
        ','.join('%s=%s' % kv for kv in sorted(t.items()) if kv[0] != 'name')[:70]))
