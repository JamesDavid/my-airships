# The Seine's real geometry, for tools/gen_paris_terrain.py.
#
# The world used to carry a twenty-eight-point centreline traced by hand. It was
# out by as much as 1.5 km, ran over dry land for a fifth of its length, and read
# anything from 26 to 48 m against the bare-earth model — for a river whose
# surface actually falls from 27 to 24 m across the whole of Paris.
#
# Two things matter about this query. The bbox is deliberately wider than the
# world (the loop round the Bois leaves it and comes back), and it asks for the
# main channel BY NAME: the bras, the Marne and the Petit Bras are separate
# rivers, and including them turns an ordered walk into a braid.
import json, time, urllib.request, urllib.parse

HOSTS = ['https://overpass-api.de/api/interpreter',
         'https://overpass.kumi.systems/api/interpreter']

QUERY = """[out:json][timeout:240];
(way["waterway"="river"](48.790,2.140,48.960,2.460);
 way["natural"="water"]["water"="river"](48.790,2.140,48.960,2.460););
out geom;"""

d = None
for host in HOSTS:
    for attempt in range(3):
        try:
            r = urllib.request.urlopen(urllib.request.Request(
                host, data=urllib.parse.urlencode({'data': QUERY}).encode(),
                headers={'User-Agent': 'MyAirships/1.0'}), timeout=300)
            d = json.loads(r.read())
            break
        except Exception as e:
            print(' ', host, str(e)[:60]); time.sleep(8)
    if d: break
if not d: raise SystemExit('could not fetch the Seine')

json.dump(d, open('paris_water_osm.json', 'w'))
riv = [e for e in d['elements'] if e.get('tags', {}).get('waterway') == 'river' and 'geometry' in e]
main = [e for e in riv if e.get('tags', {}).get('name') == 'La Seine']
print('%d river ways, %d of them the main channel (%d nodes)'
      % (len(riv), len(main), sum(len(e['geometry']) for e in main)))
