# Generate src/paris_terrain.js — the ground under Paris, and the Seine on it.
#
# Inputs (see tools/README.md):
#   paris_dem.json        IGN RGE ALTI bare earth, from fetch_paris_dem.py
#   paris_water_osm.json  OSM waterways, from fetch_paris_seine.py
import json, math, base64, struct, io

LAT0, LON0 = 48.85826, 2.29450          # the Eiffel Tower, as in paris_geo.js
OX, OZ = 520.0, 300.0
MLAT = 111320.0
MLON = 111320.0 * math.cos(math.radians(LAT0))
def fwd(la, lo): return (OX + (lo - LON0) * MLON, OZ - (la - LAT0) * MLAT)
def inv(x, z):   return (LAT0 - (z - OZ) / MLAT, LON0 + (x - OX) / MLON)
def dist(a, b):  return math.hypot(b[0] - a[0], b[1] - a[1])

D = json.load(open('paris_dem.json'))
NX, NZ, STEP, X0, Z0 = D['nx'], D['nz'], D['step'], D['x0'], D['z0']
H = list(D['h'])
def dem(x, z):
    fx = (x - X0) / STEP; fz = (z - Z0) / STEP
    i = int(math.floor(fx)); k = int(math.floor(fz))
    if i < 0 or k < 0 or i >= NX - 1 or k >= NZ - 1: return None
    tx, tz = fx - i, fz - k
    return (H[k*NX+i]*(1-tx)*(1-tz) + H[k*NX+i+1]*tx*(1-tz)
          + H[(k+1)*NX+i]*(1-tx)*tz + H[(k+1)*NX+i+1]*tx*tz)

# ---------------------------------------------------------------- the Seine
# Walked WAY TO WAY through OpenStreetMap's own ordered ways, upstream to
# downstream. Not node to node — a cloud of river nodes has two banks' worth of
# ambiguity in it — and not by snapping the old hand-drawn trace, which was out
# by as much as 1.5 km and read anything from 26 to 48 m off the bare-earth model.
W = json.load(open('paris_water_osm.json'))
ways = [[fwd(g['lat'], g['lon']) for g in e['geometry']]
        for e in W['elements'] if e.get('tags', {}).get('name') == 'La Seine' and 'geometry' in e]
BOX = (-5600, 6300, -4200, 2900)
ways = [w for w in ways if any(BOX[0] <= p[0] <= BOX[1] and BOX[2] <= p[1] <= BOX[3] for p in w)]
start = max(range(len(ways)), key=lambda i: max(ways[i][0][0], ways[i][-1][0]))
chain = ways.pop(start)
if chain[0][0] < chain[-1][0]: chain = chain[::-1]        # head = upstream
for JOIN in (600, 1200, 2500):
    while ways:
        best = None
        for i, w in enumerate(ways):
            for rev in (0, 1):
                ww = w[::-1] if rev else w
                dd = dist(chain[-1], ww[0])
                if best is None or dd < best[0]: best = (dd, i, rev)
        if best[0] > JOIN: break
        _, i, rev = best
        w = ways.pop(i)
        chain += (w[::-1] if rev else w)

river = []
for i in range(len(chain) - 1):
    a, b = chain[i], chain[i + 1]
    L = dist(a, b); n = max(1, int(L // 90))
    for t in range(n):
        river.append((a[0] + (b[0]-a[0])*t/n, a[1] + (b[1]-a[1])*t/n))
river.append(chain[-1])
# Clip to the ground we actually have. Beyond the DEM box groundAt() clamps to
# the edge cell, so a centreline point out there reports the river running
# thirteen metres inside a hillside.
XE, ZE = X0 + (NX - 1) * STEP, Z0 + (NZ - 1) * STEP
river = [(x, z) for (x, z) in river if X0 <= x <= XE and Z0 <= z <= ZE]

# The water surface: the bare-earth model read along the channel, smoothed and
# then forced DOWNHILL. A river does not flow uphill, and a raw sample wanders a
# metre or two either way over a bridge pier or a moored barge.
raw = [dem(x, z) for x, z in river]
fill = next(v for v in raw if v is not None)
raw = [(v if v is not None else fill) for v in raw]
sm = list(raw)
for _ in range(14):
    sm = [sm[0]] + [(sm[i-1] + 2*sm[i] + sm[i+1]) / 4 for i in range(1, len(sm)-1)] + [sm[-1]]
for i in range(1, len(sm)):
    sm[i] = min(sm[i], sm[i-1])

# ...and then FLATTENED, deliberately.
#
# The measured fall is 3.4 m over 23 km — one part in seven thousand, which no
# eye will ever catch. What the eye catches immediately is the alternative: the
# game draws the Seine as a single reflecting sheet, because three.js's water
# needs a plane to mirror in, and a sloping bed under a flat sheet leaves the
# quays standing proud of the water upstream and the water standing over the
# quays downstream. Four sheets would fix it and cost four reflection passes a
# frame.
#
# So the surface is one level, the median of the measured profile. The profile
# itself is what found the right centreline in the first place — a hand-traced
# river read 26 to 48 m along its length, and this one reads 24 to 27.
level = sorted(sm)[len(sm) // 2]
print('Seine: %d points, measured %.1f -> %.1f m, laid flat at %.1f'
      % (len(river), sm[0], sm[-1], level))
WATER = [level] * len(sm)

# ------------------------------------------------------- carve the channel
# The bare-earth model already sits at water level in the channel, but it is not
# FLAT there: it wanders with the bed and the piers. The ribbon the game draws is
# a flat band, so the ground under it is levelled to the water and graded back up
# to the real bank over the next sixty metres.
HALF, GRADE = 72.0, 60.0
BED = 1.4          # the bed sits this far under the surface
CELL = 200.0
buck = {}
for i, (x, z) in enumerate(river):
    buck.setdefault((int(x // CELL), int(z // CELL)), []).append(i)
def near_river(x, z):
    best = None
    for dx in (-1, 0, 1):
        for dz in (-1, 0, 1):
            for i in buck.get((int(x // CELL) + dx, int(z // CELL) + dz), ()):
                d = math.hypot(river[i][0] - x, river[i][1] - z)
                if best is None or d < best[0]: best = (d, i)
    return best

carved = 0
for k in range(NZ):
    for i in range(NX):
        x, z = X0 + i * STEP, Z0 + k * STEP
        nb = near_river(x, z)
        if nb is None: continue
        d, idx = nb
        if d > HALF + GRADE: continue
        w = WATER[idx]
        g = H[k * NX + i]
        nv = (w - BED) if d <= HALF else (w - BED) + (g - w + BED) * ((d - HALF) / GRADE)
        if abs(nv - g) > 0.05: carved += 1
        H[k * NX + i] = nv
print('carved %d of %d samples for the channel' % (carved, NX * NZ))

# ---------------------------------------------------------------- write it
vals = [max(-32768, min(32767, int(round(v * 10)))) for v in H]     # decimetres
b64 = base64.b64encode(struct.pack('<%dh' % len(vals), *vals)).decode()
riv = ','.join('[%g,%g,%g]' % (round(x, 1), round(z, 1), round(WATER[i], 2))
               for i, (x, z) in enumerate(river))

HEAD = '''// The ground under Paris, and the Seine lying on it.
//
// GENERATED - tools/gen_paris_terrain.py. See docs/PERIOD_NOTES.md.
//
// THE DATA IS BARE EARTH, and it had to be. Monaco is built from the AWS
// terrain tiles (SRTM), which are a *surface* model: they see rooftops. Over a
// 550 m mountain a six-storey error is nothing. Paris's whole relief is about a
// hundred metres - 26 m at the river to 129 on Montmartre - and the same data is
// out by +11 m on the Chaillot bluff, +8 at the Tower's foot, and +16 in the
// middle of the Seine, which would put the river above its own quays and drown
// every bridge. Mean absolute error 7.9 m.
//
// So this is IGN's RGE ALTI instead: France's national bare-earth model, free
// and unkeyed. Mean absolute error against surveyed heights, 3.4 m - and where
// it disagrees, it is usually right and the remembered figure wrong.
//
// Heights are DECIMETRES above sea level, Int16, little-endian, base64: a
// %d x %d grid at %d m over %.1f by %.1f km. Whole metres would terrace a city
// this gentle into visible steps.
//
// The frame is paris_geo.js's: +x east, -z north, the Eiffel Tower at (%g, %g).

const HF_DATA = '%s';

function decode(s) {
  const bin = atob(s);
  const buf = new ArrayBuffer(bin.length);
  const b8 = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) b8[i] = bin.charCodeAt(i);
  return new Int16Array(buf);
}

export const HF = { x0: %d, z0: %d, step: %d, nx: %d, nz: %d, h: decode(HF_DATA) };

/** The ground at (x, z), metres above sea level, bilinear off the grid. */
export function groundAt(x, z) {
  const fx = (x - HF.x0) / HF.step, fz = (z - HF.z0) / HF.step;
  let i = Math.floor(fx), k = Math.floor(fz);
  if (i < 0) i = 0;
  if (k < 0) k = 0;
  if (i > HF.nx - 2) i = HF.nx - 2;
  if (k > HF.nz - 2) k = HF.nz - 2;
  const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - k));
  const a = HF.h[k * HF.nx + i],       b = HF.h[k * HF.nx + i + 1];
  const c = HF.h[(k + 1) * HF.nx + i], d = HF.h[(k + 1) * HF.nx + i + 1];
  return (a * (1 - tx) * (1 - tz) + b * tx * (1 - tz)
        + c * (1 - tx) * tz       + d * tx * tz) * 0.1;
}

/** The steepness at (x, z), as a gradient. */
export function slopeAt(x, z) {
  const d = HF.step * 0.5;
  return Math.hypot((groundAt(x + d, z) - groundAt(x - d, z)) / (2 * d),
                    (groundAt(x, z + d) - groundAt(x, z - d)) / (2 * d));
}

/**
 * The Seine, [x, z, waterY], upstream to downstream - walked through
 * OpenStreetMap's own ordered ways rather than traced by hand. The old
 * twenty-eight-point trace was out by as much as 1.5 km and ran over dry land
 * for a fifth of its length; read against the bare-earth model it gave "water
 * levels" from 26 to 48 m. This one reads 24 to 27 and falls downhill the whole
 * way, because it is actually on the river.
 */
export const SEINE_XZ = [%s];

const RIV_CELL = 200;
const RIV_BUCKETS = new Map();
SEINE_XZ.forEach((p, i) => {
  const k = Math.floor(p[0] / RIV_CELL) + ',' + Math.floor(p[1] / RIV_CELL);
  if (!RIV_BUCKETS.has(k)) RIV_BUCKETS.set(k, []);
  RIV_BUCKETS.get(k).push(i);
});

/** Distance to the Seine's centreline, and the water height there. */
export function riverNear(x, z) {
  const cx = Math.floor(x / RIV_CELL), cz = Math.floor(z / RIV_CELL);
  let bd = Infinity, bi = -1;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const list = RIV_BUCKETS.get((cx + dx) + ',' + (cz + dz));
      if (!list) continue;
      for (const i of list) {
        const p = SEINE_XZ[i];
        const d = Math.hypot(p[0] - x, p[1] - z);
        if (d < bd) { bd = d; bi = i; }
      }
    }
  }
  return bi < 0 ? null : { dist: bd, y: SEINE_XZ[bi][2], i: bi };
}

/** The half-width of the drawn channel, and how far the bank is graded back. */
export const RIVER_HALF = %g, RIVER_GRADE = %g;

/** True in the water. */
export function inRiver(x, z) {
  const n = riverNear(x, z);
  return !!n && n.dist <= RIVER_HALF;
}
'''

io.open(r'C:\Users\James\Desktop\MyAirships\src\paris_terrain.js', 'w',
        encoding='utf-8', newline='\n').write(
    HEAD % (NX, NZ, STEP, NX * STEP / 1000.0, NZ * STEP / 1000.0, OX, OZ, b64,
            X0, Z0, STEP, NX, NZ, riv, HALF, GRADE))
print('written src/paris_terrain.js')
