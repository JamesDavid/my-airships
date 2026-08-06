# The OpenStreetMap geometry Monaco's streets are screened from.
#
# Two queries, because the Rock is closed to carriages and its medieval lanes
# are tagged as footways rather than roads — leaving them out lost the whole of
# Monaco-Ville, palace and cathedral included.
import json, time, urllib.request, urllib.parse

HOSTS = ['https://overpass-api.de/api/interpreter',
         'https://overpass.kumi.systems/api/interpreter']

QUERIES = {
 'monaco_osm.json': """[out:json][timeout:180];
(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|pedestrian)$"](43.7220,7.3980,43.7640,7.4800);
 way["railway"="rail"](43.7220,7.3980,43.7640,7.4800););
out geom;""",
 'monaco_osm2.json': """[out:json][timeout:180];
(way["highway"~"^(footway|pedestrian|steps|path|service)$"](43.7280,7.4200,43.7340,7.4300);
 way["highway"](43.7360,7.4200,43.7420,7.4320););
out geom;""",
 # the landmark coordinates, so nothing has to be typed from memory
 'monaco_places.json': """[out:json][timeout:180];
(nwr["name"="Palais princier de Monaco"](43.72,7.39,43.77,7.49);
 nwr["tourism"="museum"](43.725,7.415,43.740,7.432);
 nwr["amenity"="casino"](43.735,7.420,43.745,7.435);
 nwr["tourism"="hotel"](43.730,7.415,43.745,7.435);
 nwr["historic"="fort"](43.725,7.395,43.760,7.440);
 nwr["natural"="peak"](43.72,7.39,43.79,7.49);
 nwr["place"~"^(town|suburb|quarter|village)$"](43.720,7.395,43.770,7.490););
out center tags;""",
}

for name, q in QUERIES.items():
    for host in HOSTS:
        try:
            r = urllib.request.urlopen(urllib.request.Request(
                host, data=urllib.parse.urlencode({'data': q}).encode(),
                headers={'User-Agent': 'MyAirships/1.0'}), timeout=240)
            d = json.loads(r.read())
            json.dump(d, open(name, 'w'))
            print(name, len(d['elements']), 'elements from', host)
            break
        except Exception as e:
            print(' ', host, 'failed:', e); time.sleep(6)
    else:
        raise SystemExit('could not fetch ' + name)
