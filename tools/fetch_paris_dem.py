# Fetch the ground under Paris — the BARE EARTH, not the rooftops.
#
# Monaco is built from the AWS terrain tiles (SRTM), and that is a *surface*
# model: it sees whatever is on top. Over a 550 m mountain a six-storey error is
# nothing. Paris's entire relief is about a hundred metres, from 26 m at the
# river to 130 m on Montmartre, and the same data is wrong by:
#
#     Trocadero / Chaillot   +11 m        the Seine at Austerlitz   +16 m
#     Eiffel Tower base       +8 m        Pantheon                   +6 m
#
# — a mean absolute error of 7.9 m, and a river reading sixteen metres ABOVE its
# own quays, which would drown every bridge.
#
# So Paris uses IGN's RGE ALTI instead: France's national bare-earth DTM, free,
# no key. It puts the Tower's foot at 33.9 m against a surveyed 33.
#
# The service takes 300 points to a request (400 is a 414), so this walks the
# grid in batches and caches as it goes — kill it and re-run and it resumes.
import json, math, os, time, urllib.parse, urllib.request

URL = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json'
BATCH = 300
OUT = 'paris_dem.json'

# The frame of src/paris_geo.js: +x east, -z north, the Eiffel Tower at (520, 300).
LAT0, LON0 = 48.85826, 2.29450
OX, OZ = 520.0, 300.0
MLAT = 111320.0
MLON = 111320.0 * math.cos(math.radians(LAT0))
def inv(x, z): return (LAT0 - (z - OZ) / MLAT, LON0 + (x - OX) / MLON)

# Wide enough for the whole world: the Seine from Austerlitz round to Suresnes,
# the Bois and Saint-Cloud in the west, Montmartre in the north.
STEP = 50
X_MIN, X_MAX = -5100, 6100
Z_MIN, Z_MAX = -3800, 2500
NX = int((X_MAX - X_MIN) / STEP) + 1
NZ = int((Z_MAX - Z_MIN) / STEP) + 1

pts = []
for k in range(NZ):
    for i in range(NX):
        pts.append(inv(X_MIN + i * STEP, Z_MIN + k * STEP))
print('%d x %d = %d samples, %d requests' % (NX, NZ, len(pts), (len(pts) + BATCH - 1) // BATCH))

vals = json.load(open(OUT))['h'] if os.path.exists(OUT) else []
print('resuming from %d' % len(vals))

def fetch(chunk):
    q = urllib.parse.urlencode({
        'lat': '|'.join('%.6f' % a for a, _ in chunk),
        'lon': '|'.join('%.6f' % b for _, b in chunk),
        'resource': 'ign_rge_alti_wld', 'zonly': 'true', 'delimiter': '|'})
    for attempt in range(5):
        try:
            r = urllib.request.urlopen(urllib.request.Request(
                URL + '?' + q, headers={'User-Agent': 'MyAirships/1.0'}), timeout=90)
            e = json.loads(r.read()).get('elevations')
            if e and len(e) == len(chunk): return e
            print('  short answer (%s), retrying' % (len(e) if e else 'none'))
        except Exception as ex:
            print('  %s, retrying' % str(ex)[:70])
        time.sleep(3 + attempt * 3)
    raise SystemExit('IGN would not answer')

t0 = time.time()
while len(vals) < len(pts):
    chunk = pts[len(vals):len(vals) + BATCH]
    vals.extend(fetch(chunk))
    if (len(vals) // BATCH) % 10 == 0 or len(vals) >= len(pts):
        json.dump({'step': STEP, 'x0': X_MIN, 'z0': Z_MIN, 'nx': NX, 'nz': NZ, 'h': vals},
                  open(OUT, 'w'))
        print('  %d/%d  %.0fs' % (len(vals), len(pts), time.time() - t0))
json.dump({'step': STEP, 'x0': X_MIN, 'z0': Z_MIN, 'nx': NX, 'nz': NZ, 'h': vals}, open(OUT, 'w'))

good = [v for v in vals if v > -1000]
print('done: %d samples, %d no-data; range %.1f .. %.1f m'
      % (len(vals), len(vals) - len(good), min(good), max(good)))
