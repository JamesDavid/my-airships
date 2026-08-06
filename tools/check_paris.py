# Does Paris hold together? Numbers, not screenshots.
#
# Step 2 of docs/PARIS_1901.md, and the twin of tools/check_stlouis.py. In St.
# Louis the checking script found two real faults nothing else would have — a
# lagoon drawn through a palace corner, and a race pylon thirty-six metres from
# a building. Paris has never had one, and it has had worse: a river that
# doubled back on itself for 1.1 km, nineteen zero-length segments, a 3.3 km
# reach drawn straight over the hills of Meudon, and a 3.3 km band of open sky
# where the ground should have been. All four were invisible in a screenshot
# and obvious in a measurement.
#
# Everything here reads the checked-in data. Nothing needs a browser, because
# nothing here needs three.js: the faults live in the data, which is the point.
import base64
import io
import json
import math
import os
import re
import struct

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')


def read(name):
    return io.open(os.path.join(SRC, name), encoding='utf-8').read()


def js_array(text, name):
    m = re.search(r'export const %s = (\[.*?\]);\n' % name, text, re.S)
    if not m:
        raise SystemExit('could not find %s' % name)
    return json.loads(m.group(1))


def js_streets(text, name):
    """The street lists are JS object literals with unquoted keys, not JSON."""
    body = re.search(r'export const %s = \[(.*?)\n\];' % name, text, re.S).group(1)
    out = []
    for w, pts in re.findall(r'w:\s*(\d+).*?pts:\s*(\[\[.*?\]\])', body, re.S):
        out.append({'w': int(w), 'pts': json.loads(pts)})
    return out


fails = []


def check(ok, label, detail=''):
    print('   %-4s %s%s' % ('ok' if ok else 'FAIL', label,
                            ('   ' + detail) if detail else ''))
    if not ok:
        fails.append(label)


# ---------------------------------------------------------------- the terrain
terr = read('paris_terrain.js')
hf = re.search(r'export const HF = \{(.*?)\};', terr, re.S).group(1)
X0 = int(re.search(r'x0:\s*(-?\d+)', hf).group(1))
Z0 = int(re.search(r'z0:\s*(-?\d+)', hf).group(1))
STEP = int(re.search(r'step:\s*(\d+)', hf).group(1))
NX = int(re.search(r'nx:\s*(\d+)', hf).group(1))
NZ = int(re.search(r'nz:\s*(\d+)', hf).group(1))
raw = base64.b64decode(re.search(r"const HF_DATA = '([^']*)'", terr).group(1))
H = struct.unpack('<%dh' % (len(raw) // 2), raw)     # decimetres above the sea
X1, Z1 = X0 + (NX - 1) * STEP, Z0 + (NZ - 1) * STEP
DATUM = float(re.search(r'export const PARIS_DATUM = ([\d.]+)', read('world.js')).group(1))

print('1. THE SURVEY')
print('   x %d..%d   z %d..%d   step %d   %d x %d = %d samples'
      % (X0, X1, Z0, Z1, STEP, NX, NZ, NX * NZ))
check(len(H) == NX * NZ, 'the heightfield has as many samples as it claims',
      '%d values, %d expected' % (len(H), NX * NZ))
asl = [h / 10.0 for h in H]
print('   ground %.1f..%.1f m ASL  (%.1f..%.1f from the Tower\'s foot)'
      % (min(asl), max(asl), min(asl) - DATUM, max(asl) - DATUM))
check(20 < min(asl) < 40 and 100 < max(asl) < 200,
      'Paris is between the Seine and Montmartre', 'datum %.1f' % DATUM)


def ground(x, z):
    fx = (x - X0) / STEP
    fz = (z - Z0) / STEP
    ix = max(0, min(NX - 2, int(fx)))
    iz = max(0, min(NZ - 2, int(fz)))
    tx, tz = fx - ix, fz - iz
    def at(a, b): return asl[b * NX + a]
    return ((at(ix, iz) * (1 - tx) + at(ix + 1, iz) * tx) * (1 - tz)
            + (at(ix, iz + 1) * (1 - tx) + at(ix + 1, iz + 1) * tx) * tz) - DATUM


# ---------------------------------------------------------------- the river
print('\n2. THE SEINE')
S = js_array(terr, 'SEINE_XZ')
GAP = int(re.search(r'export const RIVER_GAP = (\d+)', terr).group(1))
HALF = int(re.search(r'export const RIVER_HALF = (\d+)', terr).group(1))
segs = [math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]) for i in range(1, len(S))]
dup = sum(1 for d in segs if d < 1)
gaps = [(i + 1, d) for i, d in enumerate(segs) if d > GAP]
near = sum(1 for i in range(len(S)) for j in range(i + 6, len(S))
           if math.hypot(S[i][0] - S[j][0], S[i][1] - S[j][1]) < 40)
turns = []
for i in range(1, len(S) - 1):
    a = math.atan2(S[i][1] - S[i - 1][1], S[i][0] - S[i - 1][0])
    b = math.atan2(S[i + 1][1] - S[i][1], S[i + 1][0] - S[i][0])
    d = math.degrees(b - a)
    while d > 180:
        d -= 360
    while d < -180:
        d += 360
    turns.append((abs(d), i))
worst = max(turns)
print('   %d stations, %.2f km drawn' % (len(S), sum(segs) / 1000))
check(dup == 0, 'no zero-length segment', '%d found' % dup)
check(near == 0, 'the river never comes back on itself', '%d close pairs' % near)
check(worst[0] < 100, 'no station turns more than 100 degrees',
      'worst %.0f at %d' % worst)
print('   %d gap%s over %d m: %s'
      % (len(gaps), '' if len(gaps) == 1 else 's', GAP,
         ', '.join('%d m at station %d' % (d, i) for i, d in gaps) or 'none'))
# A gap is only allowable if it is the river LEAVING THE MAP. If both its ends
# stand on the frame, the water ran off the edge of the survey and came back —
# which is what really happens between Issy and Saint-Cloud, where the Seine
# loops two kilometres south through Meudon and Sevres, outside the world. If
# an end is in open country instead, the walk has torn and that IS a fault.
for i, d in gaps:
    for k, lbl in ((i - 1, 'starts'), (i, 'ends')):
        p = S[k]
        edge = min(p[0] - X0, X1 - p[0], p[1] - Z0, Z1 - p[1])
        check(edge < 60, 'the gap %s on the frame, not in open country' % lbl,
              '%.0f m from the edge at (%.0f, %.0f)' % (edge, p[0], p[1]))
water = set(round(p[2], 2) for p in S)
check(len(water) == 1, 'the water is one level', '%s' % sorted(water)[:4])
wy = sorted(water)[0] - DATUM
bed = [ground(p[0], p[1]) for p in S]
check(max(bed) < wy, 'the bed is under the water everywhere',
      'water %.2f, highest bed %.2f' % (wy, max(bed)))

# ---------------------------------------------------------------- the streets
print('\n3. THE STREETS')
ST = js_streets(read('paris_streets.js'), 'OSM_STREETS')
try:
    MIN = js_streets(read('paris_streets_minor.js'), 'OSM_MINOR')
except (OSError, AttributeError):
    MIN = []
ALL = ST + MIN
L = sum(math.hypot(w['pts'][i][0] - w['pts'][i - 1][0], w['pts'][i][1] - w['pts'][i - 1][1])
        for w in ALL for i in range(1, len(w['pts'])))
print('   %d trunk ways + %d minor = %d, %.1f km' % (len(ST), len(MIN), len(ALL), L / 1000))

# a bucket grid so the coverage sweep is not quadratic
CELL = 200
grid = {}
for w in ALL:
    for p in w['pts']:
        grid.setdefault((int(p[0] // CELL), int(p[1] // CELL)), []).append(p)


def nearest_street(x, z, rings=4):
    gx, gz = int(x // CELL), int(z // CELL)
    best = 1e9
    for r in range(rings):
        for dx in range(-r, r + 1):
            for dz in range(-r, r + 1):
                if r and max(abs(dx), abs(dz)) != r:
                    continue
                for p in grid.get((gx + dx, gz + dz), ()):
                    best = min(best, math.hypot(p[0] - x, p[1] - z))
        if best < r * CELL:
            break
    return best


tot = near200 = far600 = 0
for x in range(-3400, 3401, 200):
    for z in range(-2400, 2001, 200):
        tot += 1
        d = nearest_street(x, z)
        if d < 200:
            near200 += 1
        elif d > 600:
            far600 += 1
cov = 100.0 * near200 / tot
far = 100.0 * far600 / tot
print('   inside the city: %.0f%% within 200 m of a street, %.1f%% over 600 m from any'
      % (cov, far))
check(cov > 85, 'the city has streets in it', '%.0f%% (docs/PARIS_1901 says 91)' % cov)
check(far < 2, 'nowhere in the city is stranded', '%.1f%% over 600 m' % far)

# every street crossing the water needs a bridge, and the phantom reach has none
print('\n4. STREETS ACROSS THE WATER')


def seg_int(ax, az, bx, bz, cx, cz, dx_, dz_):
    r1x, r1z = bx - ax, bz - az
    r2x, r2z = dx_ - cx, dz_ - cz
    den = r1x * r2z - r1z * r2x
    if abs(den) < 1e-9:
        return False
    t = ((cx - ax) * r2z - (cz - az) * r2x) / den
    u = ((cx - ax) * r1z - (cz - az) * r1x) / den
    return 0 <= t <= 1 and 0 <= u <= 1


crossings = phantom = 0
for w in ALL:
    for i in range(1, len(w['pts'])):
        ax, az = w['pts'][i - 1]
        bx, bz = w['pts'][i]
        for k in range(1, len(S)):
            c, d = S[k - 1], S[k]
            if seg_int(ax, az, bx, bz, c[0], c[1], d[0], d[1]):
                if math.hypot(d[0] - c[0], d[1] - c[1]) > GAP:
                    phantom += 1
                else:
                    crossings += 1
                break
print('   %d street segments cross the drawn river' % crossings)
print('   %d cross the phantom reach — which is not a fault: a straight line'
      % phantom)
print('   over three kilometres of Meudon is bound to be crossed by something.')
print('   What matters is that the CODE never treats it as river, so:')
w = read('world.js')
check(w.count('RIVER_GAP') >= 6,
      'world.js guards every pairwise walk of the river with RIVER_GAP',
      '%d uses' % w.count('RIVER_GAP'))
for what, needle in [
        ('the water ribbon', 'p.distanceTo(pts[i - 1]) <= RIVER_GAP'),
        ('the bridge search', 'c.distanceTo(d2) > RIVER_GAP'),
        ('the city setback', 'dx * dx + dz * dz > RIVER_GAP * RIVER_GAP'),
        ('the water test', 'nearPolyline(riverPts, x, z, 71, RIVER_GAP)')]:
    check(needle in w, '%s breaks across a gap' % what)
print('   Paris had about thirty bridges in 1901; the crossings above are all')
print('   the surveyed street network offers the bridge finder.')

# ------------------------------------------------------------ the real blocks
print('\n5. THE SURVEYED CITY')
try:
    _bl = read('paris_buildings.js')
    _rows = [tuple(float(v) for v in m) for m in re.findall(
        r'\[(-?[\d.]+),(-?[\d.]+),([\d.]+),([\d.]+),(-?[\d.]+),([\d.]+)\]', _bl)]
except OSError:
    _rows = []
if _rows:
    _h = sorted(r[5] for r in _rows)
    _a = sorted(r[2] * r[3] for r in _rows)
    _xs = [r[0] for r in _rows]
    _zs = [r[1] for r in _rows]
    print('   %d real footprints   x %.0f..%.0f   z %.0f..%.0f'
          % (len(_rows), min(_xs), max(_xs), min(_zs), max(_zs)))
    print('   height median %.1f m, tallest %.1f;  footprint median %.0f m2'
          % (_h[len(_h) // 2], _h[-1], _a[len(_a) // 2]))
    # Paris is a city of six storeys — the Haussmann cornice, capped by by-law.
    # If the median drifts up, the modern screen has stopped working.
    check(17 < _h[len(_h) // 2] < 24,
          'the median block is a Haussmann six storeys',
          '%.1f m' % _h[len(_h) // 2])
    check(_h[-1] < 32, 'nothing modern got through the eight-storey screen',
          'tallest %.1f m' % _h[-1])
    _in = sum(1 for r in _rows
              if min(math.hypot(p[0] - r[0], p[1] - r[1]) for p in S) < 74)
    check(_in == 0, 'no surveyed block stands in the Seine', '%d do' % _in)
else:
    print('   src/paris_buildings.js is not present — step 3 has not been run.')

# --------------------------------------------------------------- Saint-Cloud
print('\n6. SAINT-CLOUD, AND THE THINGS THAT USED TO STAND IN A FIELD')
sc = read('paris_stcloud.js')


def sc_const(name):
    m = re.search(r'export const %s = \{ x: (-?[\d.]+), z: (-?[\d.]+), '
                  r'rx: (-?[\d.]+), rz: (-?[\d.]+) \}' % name, sc)
    return tuple(float(v) for v in m.groups())


def to_river(x, z):
    return min(math.hypot(p[0] - x, p[1] - z) for p in S)


for _nm, _label in (('PONT', 'the Pont de Saint-Cloud'),
                    ('AVRE', 'the Avre aqueduct')):
    _x, _z, _rx, _rz = sc_const(_nm)
    check(to_river(_x, _z) < 60, '%s is over the water' % _label,
          '%.0f m from the river' % to_river(_x, _z))

lcx, lcz, lcrx, lcrz = sc_const('LONGCHAMP')
print('   Longchamp is %.0f x %.0f m about (%.0f, %.0f). It was drawn 520 x 300,'
      % (lcrx * 2, lcrz * 2, lcx, lcz))
print('   which is the wrong way round: the real course is taller than it is wide,')
print('   and that is why its western two thirds fell outside every exclusion.')
check(lcrz > lcrx, 'Longchamps is taller than it is wide, as the ground is')

chx, chz, _a, _b = sc_const('CHURCH')
# NOT the station nearest in z: the Seine loops round the Bois, so it crosses
# any given latitude three times and "nearest by z" found a reach four
# kilometres east. The nearest station in both axes is the bank it stands on.
_st = min(S, key=lambda q: math.hypot(q[0] - chx, q[1] - chz))
check(chx < _st[0], 'the village church is on the WEST bank, where the town is',
      'church x %.0f, nearest river station x %.0f (%.0f m off)'
      % (chx, _st[0], math.hypot(_st[0] - chx, _st[1] - chz)))

wjs = read('world.js')
for _needle, _what in (
        ('skel.position.set(PAD_POS.x', "Deutsch's shed stands beside the aerodrome"),
        ('wb.position.set(PONT.x', 'the road bridge is at the real Pont de Saint-Cloud'),
        ('AQ = { x: AVRE.x', "the aqueduct is at the real Passerelle de l'Avre"),
        ('scChurch.position.set(CHURCH.x', 'the church is at Saint-Clodoald'),
        ('addOval(scene, AUTEUIL.x', 'Auteuil is drawn on its real ground')):
    check(_needle in wjs, _what)
_left = wjs.count('H2(-')
print('   %d objects are still placed in the old half frame: a windmill, a' % _left)
print('   railway halt and their colliders — Bois scenery with nothing nameable')
print('   to anchor them to, so they are left where they were put.')
check(_left <= 6, 'the half-frame placements are down to Bois scenery',
      '%d left' % _left)

# ------------------------------------------------------- can it be flown at all
print('\n7. SCENARIO VII — CAN IT BE FLOWN?')
# It could not. It used to start beside the Tower, 4,069 m from the aerodrome,
# with a motor scripted to quit after 34 to 60 seconds — 727 seconds of flying
# against the day's headwind. Two pilots reported it on the same afternoon.
_sc = read('scenarios.js')
_sh = read('ships.js')
_m = re.search(r"id: 'no5'.*?thrust: ([\d.]+), dragQ: ([\d.]+)", _sh, re.S)
_thr, _dq = float(_m.group(1)), float(_m.group(2))
_top = math.sqrt(_thr / _dq) * 3.6
# the start is derived from the park and the aerodrome, so it can be recomputed
_r = sc_const('ROTHSCHILD')
_geo = read('paris_geo.js')
_olat = float(re.search(r'ORIGIN = \{ lat: ([\d.]+), lon: ([\d.]+)', _geo).group(1))
_olon = float(re.search(r'ORIGIN = \{ lat: ([\d.]+), lon: ([\d.]+)', _geo).group(2))
_ox = float(re.search(r'ORIGIN_XZ = \{ x: (\d+), z: (\d+)', _geo).group(1))
_oz = float(re.search(r'ORIGIN_XZ = \{ x: (\d+), z: (\d+)', _geo).group(2))
_mlon = 111320.0 * math.cos(math.radians(_olat))
_stl = re.search(r'stcloud:\s*\[([\d.]+),\s*([\d.-]+)\]', _geo)
_sla, _slo = float(_stl.group(1)), float(_stl.group(2))
_scx = _ox + (_slo - _olon) * _mlon
_scz = _oz - (_sla - _olat) * 111320.0
_zx, _zz = _scx + 270, _scz - 240
_dx, _dz = _zx - _r[0], _zz - _r[1]
_L = math.hypot(_dx, _dz)
_ux, _uz = _dx / _L, _dz / _L
_startx, _startz = _r[0] - _ux * 900, _r[1] - _uz * 900
_run = math.hypot(_startx - _zx, _startz - _zz) - 240
_hi = _run / ((_top - 16) / 3.6)          # at 120 m, in the scenario's own wind
_lo = _run / ((_top - 16 * 0.42) / 3.6)   # down low, where the wind is 42%
print('   No. 5 makes %.1f km/h; the scenario sets a %.1f km/h wind aloft' % (_top, 16.0))
print('   start -> ring edge %.0f m:  %.0f s high, %.0f s low' % (_run, _hi, _lo))
check(_hi < 420, 'the run home can be flown before anything else goes wrong',
      '%.0f s' % _hi)
check(_lo < _hi, 'flying LOW is rewarded, as the book and the world both advise',
      '%.0f s saved' % (_hi - _lo))
_park_gap = math.hypot((_zx - _ux * (240 + 180)) - _r[0],
                       (_zz - _uz * (240 + 180)) - _r[1])
print('   the motor dies 180 m outside the ring, %.0f m upwind of the park'
      % _park_gap)
check(_park_gap < _r[2] + 70 or _park_gap < 400,
      'the park is within reach on the drift once the motor is dead',
      '%.0f m, park half-extent %.0f' % (_park_gap, _r[2]))
for _n, _w in (('ctx.setWind(', 'the scenario sets its own weather'),
               ('ctx.ship.motorDead = true', 'the failure is irreparable'),
               ('ROTHSCHILD.x - ux * 900', 'the start is derived from the park')):
    check(_n in _sc, _w)

# ------------------------------------------------- against the book's own figure
print('\n8. LONGCHAMPS — THE ONE LAP HE MEASURED')
# Ch. XII, 12 July 1901: "Ten times in succession I made the circuit of
# Longchamps… which altogether made up a distance of about 35 kilometres."
BOOK_LAP = 3500.0
_lrx, _lrz = sc_const('LONGCHAMP')[2], sc_const('LONGCHAMP')[3]


def ellipse_perimeter(a, b):
    return math.pi * (3 * (a + b) - math.sqrt((3 * a + b) * (a + 3 * b)))


_full = ellipse_perimeter(_lrz, _lrx)
_inset = float(re.search(r'const LAP_INSET = ([\d.]+)', read('tracks.js')).group(1))
_lap = ellipse_perimeter(_lrz * _inset, _lrx * _inset)
print('   the traced course is %.0f x %.0f m; right round it is %.0f m'
      % (_lrx * 2, _lrz * 2, _full))
print('   the book says 35 km for ten circuits — %.0f m a lap' % BOOK_LAP)
check(abs(_full - BOOK_LAP) / BOOK_LAP < 0.05,
      'the traced racecourse and the 1901 memoir are the same ground',
      'they differ by %.1f%%' % (100 * abs(_full - BOOK_LAP) / BOOK_LAP))
check(abs(_lap - BOOK_LAP) < 60, 'the circuit flown is his 3.5 km',
      '%.0f m at LAP_INSET %.3f' % (_lap, _inset))

# -------------------------------------------------- can the prize be won at all
print('\n9. THE DEUTSCH PRIZE — CAN IT BE WON?')
_m6 = re.search(r"id: 'no6'.*?thrust: ([\d.]+), dragQ: ([\d.]+)", _sh, re.S)
_v6 = math.sqrt(float(_m6.group(1)) / float(_m6.group(2)))
_twr = re.search(r'eiffel:\s*\[([\d.]+),\s*([\d.-]+)\]', _geo)
_tx = _ox + (float(_twr.group(2)) - _olon) * _mlon
_tz = _oz - (float(_twr.group(1)) - _olat) * 111320.0
_th = int(re.search(r'export const TOWER_H = (\d+)', wjs).group(1))
_padx, _padz = _scx + 400, _scz - 200
_stx, _stz = _padx + 220, _padz - 40
_D = math.hypot(_stx - (_tx + 340), _stz - _tz)
_wb = re.search(r'const windB = new THREE\.Vector3\(([\d.]+), 0, ([\d.]+)\)', wjs)
_base = math.hypot(float(_wb.group(1)), float(_wb.group(2)))
_worst = _base * 1.25 * 1.3            # the strongest daily draw, aloft
print('   No. 6 makes %.1f km/h; ring to tower gate %.0f m, there and back %.2f km'
      % (_v6 * 3.6, _D, 2 * _D / 1000))
print('   the daily wind is drawn from %.1f m/s, up to %.1f km/h aloft'
      % (_base, _worst * 3.6))
_t = _D / (_v6 - _worst) + _D / (_v6 + _worst)
print('   worst case out-and-back: %.1f min against the historic half-hour'
      % (_t / 60))
check(_v6 > _worst * 1.4, 'the No. 6 can make headway against the strongest day',
      '%.1f vs %.1f km/h' % (_v6 * 3.6, _worst * 3.6))
check(_t < 1800 * 0.85, 'the prize is winnable with time in hand for the motor',
      '%.1f min of the 30' % (_t / 60))
for _n, _w in (('dailyWind.copy(todaysWind)', "a scenario's weather is put back"),):
    check(wjs.count('setWind') >= 0 and read('main.js').count(_n) >= 3,
          _w, '%d restore sites' % read('main.js').count(_n))

# ---------------------------------------------------------------- the places
print('\n10. THE PLACES AND THE COURSE')
geo = read('paris_geo.js')
PL = re.findall(r'(\w+):\s*\[([\d.]+),\s*([\d.-]+)\]', geo.split('export const PLACES')[1].split('};')[0])
OLAT = float(re.search(r'ORIGIN = \{ lat: ([\d.]+), lon: ([\d.]+)', geo).group(1))
OLON = float(re.search(r'ORIGIN = \{ lat: ([\d.]+), lon: ([\d.]+)', geo).group(2))
OX = float(re.search(r'ORIGIN_XZ = \{ x: (\d+), z: (\d+)', geo).group(1))
OZ = float(re.search(r'ORIGIN_XZ = \{ x: (\d+), z: (\d+)', geo).group(2))
MLAT = 111320.0
MLON = 111320.0 * math.cos(math.radians(OLAT))
out_of_frame = []
for name, la, lo in PL:
    x = OX + (float(lo) - OLON) * MLON
    z = OZ - (float(la) - OLAT) * MLAT
    if not (X0 <= x <= X1 and Z0 <= z <= Z1):
        out_of_frame.append(name)
print('   %d named places' % len(PL))
check(not out_of_frame, 'every named place is inside the survey',
      ', '.join(out_of_frame))

tracks = read('tracks.js')
blk = tracks[tracks.index("location: 'paris'"):] if "location: 'paris'" in tracks else ''
gates = [tuple(float(v) for v in g) for g in re.findall(
    r'x:\s*(-?[\d.]+),\s*y:\s*(-?[\d.]+),\s*z:\s*(-?[\d.]+),\s*r:\s*(-?[\d.]+)',
    tracks)]
low = []
for gx, gy, gz, gr in gates:
    if X0 <= gx <= X1 and Z0 <= gz <= Z1 and gy < 8:
        low.append((gx, gz, gy))
print('   %d gates in tracks.js (all worlds)' % len(gates))
check(not low, 'no Paris gate is written below 8 m over its ground',
      '%s' % low[:4])

TOWER_H = int(re.search(r'export const TOWER_H = (\d+)', read('world.js')).group(1))
anch = re.search(r'const TOWER_ANCH = (\[\[.*?\]\]);', read('world.js')).group(1)
top = max(a[0] for a in json.loads(anch))
check(TOWER_H == top, 'the tower gate is cut to the tower this world builds',
      'TOWER_H %d, tower top %d' % (TOWER_H, top))

print()
print('12. THE TOWER VISTA LOOKS OVER THE TOWER, NOT THROUGH IT')
_w = open(os.path.join(ROOT, 'src', 'world.js'), encoding='utf-8').read()
_m = re.search(r'vistaPos: new THREE\.Vector3\(TOWER_POS\.x([^,]*), ([^,]+), TOWER_POS\.z', _w)
_th = int(re.search(r'export const TOWER_H = (\d+)', _w).group(1))
if not _m:
    print('   FAIL cannot find vistaPos')
    fails.append('vistaPos missing')
else:
    _off, _hgt = _m.group(1).strip(), _m.group(2).strip()
    print('   vista at x%s, y = %s   (the Tower is %d m)'
          % (_off or ' + 0 (on axis)', _hgt, _th))
    if _hgt.startswith('TOWER_H +') and _off == '':
        print('   ok   on the axis and clear of the top')
    else:
        print('   FAIL the lens is down inside the ironwork')
        fails.append('tower vista obstructed')

print('\n%s' % ('ALL CHECKS PASS' if not fails
                else '%d FAILURES: %s' % (len(fails), '; '.join(fails))))
raise SystemExit(1 if fails else 0)
