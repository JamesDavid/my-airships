# Georeference the 1904 plat, and emit src/stlouis_geo.js and src/stlouis_plan.js.
#
# Steps 3 and 4 of docs/STLOUIS_PLAT.md. Read that first: it explains why the
# OpenStreetMap flow that built Paris and Monaco cannot be run here (the fair
# was pulled down in 1905 and today's Forest Park is a golf course and a zoo),
# and why this has to be a georeferencing job instead.
#
# WHAT IS MEASURED AND WHAT IS ASSUMED
#
# The sheet is
#   Ground Plan of the Louisiana Purchase Exposition, St. Louis, Mo., 1904.
#   Buxton & Skinner Stationery Co. Copyright 1904 by Parker Eng. Co.
#   archive.org item dr_ground-plan-of-the-louisiana-purchase-exposition-...
#   -st-louis-mo-1904-buxto-4776002, file 4776002.jpg, 1536 x 1046.
#
# Every palace position below is a CENTROID FOUND BY SEGMENTATION, not by eye:
# tools/trace_stlouis_plat.py thresholds the draughtsman's pink palace wash,
# labels the blobs and reduces each to a centroid and a principal axis. Those
# numbers are pasted in here so this file is reproducible without re-running the
# segmentation, and so that a wrong one can be corrected by hand.
#
# Every palace SIZE is the fair's own published figure from the Official Guide
# (see docs/STLOUIS_PALACES.md), not the blob's extent — the pink fill stops
# inside the colonnades and under-reads by a few per cent. Position and rotation
# come from the plan; extent comes from the record.
#
# THREE THINGS ARE FITTED, AND EACH HAS A CHECK.
#
# 1. THE AXIS. The main picture is a fan, mirror-symmetric about the grand axis.
#    Education/Electricity, Manufactures/Varied Industries and Liberal Arts/
#    Transportation are mirror pairs, and each pair gives the axis twice over —
#    once from the line joining the two centroids (the axis is its perpendicular
#    bisector) and once from the two long-axis bearings (which average to the
#    axis). Six independent estimates. They agree to about a degree.
#
# 2. THE SCALE. Machinery is the cleanest control on the sheet: a plain
#    rectangle, no bend, no detached colonnade, published at 1,000 x 525 ft, and
#    its blob measures 110.2 x 58.0 px — an aspect of 1.900 against a true
#    1.905. Both of its axes give 2.76 m/px. Checked three further ways below:
#    the other palaces' 525 ft width, the Aeronautic Concourse's fourteen acres,
#    and the guide's "two miles from E. to W." for the whole ground.
#
# 3. THE BEARING. Two things the fair built are still standing and still where
#    they were put, so they tie the sheet to the earth: the Palace of Fine Arts
#    (the Saint Louis Art Museum) and the Smithsonian's flight cage, both found
#    in OpenStreetMap by name. The angle they subtend at each other on the sheet
#    and on the ground differ by under two degrees, which is the whole of the
#    error in the rotation.
import json
import math
import os

PLAT = '4776002.jpg (1536 x 1046)'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src')

FT = 0.3048

# ---------------------------------------------------------------- measured
# Palace centroids and principal axes, in sheet pixels, from
# tools/trace_stlouis_plat.py. `ang` is the long axis in image degrees
# (x right, y down). `ft` is (width, length) from the Official Guide.
PALACES = [
    # id                  cx      cy     ang     w_ft   l_ft   guide line
    ('education',        373.4,  578.9,  47.43,   525,   750),   # G 2504
    ('electricity',      492.6,  648.9,  14.56,   525,   750),   # G 3122
    ('mines',            317.5,  480.6,  62.58,   525,   750),   # G 3513
    ('liberal_arts',     234.5,  526.6,  62.59,   525,   750),   # G 2822
    ('manufactures',     306.5,  643.3,  47.72,   525,  1200),   # G 2934
    ('varied_industries', 467.9, 739.3,  16.73,   525,  1250),   # G 3010
    ('machinery',        606.7,  657.3,  11.30,   525,  1000),   # G 3308
    ('transportation',   633.4,  742.3,   0.31,   525,  1300),   # G 3398
    ('agriculture',      855.3,  503.4,  89.22,   525,  1600),   # G 3610
    ('steam_gas_fuels',  703.9,  662.0, 116.85,   300,   330),   # G 3168
    ('us_government',    230.9,  414.9, 150.89,   175,   724),   # G 4008
    ('fine_arts',        514.8,  471.5,  30.79,   166,   348),   # G 2519
    ('fine_arts_w',      489.8,  443.5, 118.39,   204,   422),   # G 2521
    ('fine_arts_e',      551.5,  479.3, 121.68,   204,   422),   # G 2521
    ('horticulture',     852.5,  356.0,   1.19,   400,   400),   # G 3619
    ('forestry',         901.5,  695.0, 178.52,   283,   537),   # not published: the blob
]

# Everything else on the sheet is drawn in outline, not filled, so these were
# read off gridded crops rather than segmented. Quoted to the pixel because that
# is what was read; believe them to about three pixels, which is eight metres.
FEATURES = {
    'festival_hall':   (495.0, 503.0),   # the pink mass inside the terrace arcs
    'colonnade_w':     (425.0, 481.0),   # the rosette kiosk at the W terminus
    'colonnade_e':     (545.0, 548.0),   # and at the E
    'grand_basin':     (440.9, 604.3),   # on the axis, at the water's centroid
    'basin_head':      (466.0, 540.0),   # where the cascades meet the water
    'purchase_monument': (387.2, 691.3),  # centre of the Plaza of St. Louis
    'pike_east':       (296.0, 820.0),   # the Lindell end of the concessions
    'pike_west':       (740.0, 820.0),   # the Skinker end
    'observation_wheel': (748.0, 604.0),
    'concourse':      (1050.0, 812.5),   # the Aeronautic Concourse of 1904
}
CONCOURSE_PX = (136.0, 57.0)             # its fenced box, W x D on the sheet

# The two surviving controls, from OpenStreetMap by name
# (tools/fetch_stlouis_control.py).
CTL = {
    # id            plat px          lat          lon
    'fine_arts':  ((514.8, 471.5), 38.639468, -90.294403),   # Saint Louis Art Museum
    'flight_cage': ((271.5, 336.0), 38.635549, -90.287487),  # 1904 Flight Cage
}

MLAT = 111132.0
MLON = 111320.0 * math.cos(math.radians(38.6395))

# ---------------------------------------------------------------- 1. the axis
print('THE AXIS — six estimates from three mirror pairs')
P = {p[0]: p for p in PALACES}
pairs = [('education', 'electricity'), ('manufactures', 'varied_industries'),
         ('liberal_arts', 'transportation')]
ests = []
for a, b in pairs:
    ax, ay, aa = P[a][1], P[a][2], P[a][3]
    bx, by, ba = P[b][1], P[b][2], P[b][3]
    cross = math.degrees(math.atan2(by - ay, bx - ax)) % 180
    from_pos = (cross + 90) % 180
    # the two long axes straddle the grand axis; average them the short way
    d = (ba - aa) % 180
    if d > 90:
        d -= 180
    from_ang = (aa + d / 2 + 90) % 180 if abs(d) > 60 else (aa + d / 2) % 180
    ests += [from_pos, from_ang]
    print('  %-18s/%-18s  bisector %6.2f   mean bearing %6.2f'
          % (a, b, from_pos, from_ang))
# they cluster near 121; take the mean of everything within 5 deg of the median
ests.sort()
med = ests[len(ests) // 2]
keep = [e for e in ests if abs(e - med) < 5]
AXIS = sum(keep) / len(keep)
print('  median %.2f, keeping %d of %d, AXIS = %.3f deg (image)'
      % (med, len(keep), len(ests), AXIS))

# ---------------------------------------------------------------- 2. the scale
print('\nTHE SCALE')
BLOB = {'machinery': (110.2, 58.0), 'transportation': (133.1, 59.2),
        'manufactures': (125.7, 60.3), 'education': (67.3, 58.4),
        'electricity': (68.2, 56.6), 'mines': (77.7, 52.6)}
print('  Machinery long  %.1f px for 1000 ft -> %.4f m/px'
      % (BLOB['machinery'][0], 1000 * FT / BLOB['machinery'][0]))
print('  Machinery short %.1f px for  525 ft -> %.4f m/px'
      % (BLOB['machinery'][1], 525 * FT / BLOB['machinery'][1]))
widths = sorted(525 * FT / BLOB[k][1] for k in BLOB)
print('  the six 525 ft widths, sorted: %s' % ' '.join('%.3f' % w for w in widths))
print('  their median %.4f' % ((widths[2] + widths[3]) / 2))
acres = CONCOURSE_PX[0] * CONCOURSE_PX[1]
print('  Concourse %.0f x %.0f px; at 14 acres that is %.4f m/px'
      % (CONCOURSE_PX + (math.sqrt(14 * 4046.86 / acres),)))
SCALE = 2.75
print('  taking SCALE = %.3f m/px (Machinery and the median width bracket it,'
      % SCALE)
print('   and 1150 px of ground E-W x %.2f = %.0f m = %.2f miles against the'
      % (SCALE, 1150 * SCALE, 1150 * SCALE / 1609.34))
print('   guide\'s "two miles from E. to W.")')

# ---------------------------------------------------------------- 3. the frame
# +x runs UP the grand axis toward Festival Hall, +z ninety degrees clockwise
# from it, exactly as Paris and Monaco have x east and z south. The sheet is a
# plain rotation into that frame — no mirror — because three.js viewed from
# above has the same handedness as image coordinates.
UPHILL = (AXIS + 180) % 360
UX = (math.cos(math.radians(UPHILL)), math.sin(math.radians(UPHILL)))
UZ = (math.cos(math.radians(UPHILL + 90)), math.sin(math.radians(UPHILL + 90)))
OPX, OPY = FEATURES['grand_basin']


def xz(px, py):
    dx, dy = px - OPX, py - OPY
    return (dx * UX[0] + dy * UX[1]) * SCALE, (dx * UZ[0] + dy * UZ[1]) * SCALE


def rot(ang_img):
    """A sheet bearing, as a three.js rotation.y for a mesh whose local +x is
    the building's long axis."""
    c, s = math.cos(math.radians(ang_img)), math.sin(math.radians(ang_img))
    gx, gz = c * UX[0] + s * UX[1], c * UZ[0] + s * UZ[1]
    return math.atan2(-gz, gx)


# ---------------------------------------------------------------- 4. the earth
# Fine Arts fixes the origin; the flight cage fixes the bearing.
(fx, fy), flat, flon = CTL['fine_arts']
(cx, cy), clat, clon = CTL['flight_cage']
cage_e = (clon - flon) * MLON
cage_n = (clat - flat) * MLAT
true_brg = math.degrees(math.atan2(cage_e, cage_n)) % 360
sheet_brg = math.degrees(math.atan2(cy - fy, cx - fx)) % 360
# a sheet bearing B is a true bearing B + OFFSET
OFFSET = (true_brg - sheet_brg) % 360
print('\nTHE BEARING')
print('  Fine Arts -> flight cage: %.1f m on the ground, %.1f px on the sheet'
      % (math.hypot(cage_e, cage_n), math.hypot(cx - fx, cy - fy)))
print('  that baseline gives %.4f m/px (vs the %.3f taken above: %.1f%%)'
      % (math.hypot(cage_e, cage_n) / math.hypot(cx - fx, cy - fy), SCALE,
         100 * (math.hypot(cage_e, cage_n) / math.hypot(cx - fx, cy - fy) / SCALE - 1)))
print('  sheet bearing %.2f, true bearing %.2f  ->  OFFSET %.2f deg' %
      (sheet_brg, true_brg, OFFSET))
UPHILL_TRUE = (UPHILL + OFFSET) % 360
print('  so the game +x axis (up the grand axis) runs at true bearing %.2f'
      % UPHILL_TRUE)

# where the origin lands on the earth
ox_m, oz_m = xz(fx, fy)                      # Fine Arts, in game metres
# walk back from Fine Arts to the origin
bx = math.radians(UPHILL_TRUE)
bz = math.radians(UPHILL_TRUE + 90)
o_e = -(ox_m * math.sin(bx) + oz_m * math.sin(bz))
o_n = -(ox_m * math.cos(bx) + oz_m * math.cos(bz))
OLAT = flat + o_n / MLAT
OLON = flon + o_e / MLON
print('  ORIGIN (the Grand Basin, game 0,0) = %.6f, %.6f' % (OLAT, OLON))

# residual: predict the flight cage from the fitted frame and compare
gx_c, gz_c = xz(cx, cy)
pe = gx_c * math.sin(bx) + gz_c * math.sin(bz)
pn = gx_c * math.cos(bx) + gz_c * math.cos(bz)
te = (clon - OLON) * MLON
tn = (clat - OLAT) * MLAT
print('  RESIDUAL at the flight cage, %.0f m from the anchor: %.1f m'
      % (math.hypot(cage_e, cage_n), math.hypot(pe - te, pn - tn)))

# ---------------------------------------------------------------- 5. emit
places, sites = {}, []
for pid, px, py, ang, w_ft, l_ft in PALACES:
    x, z = xz(px, py)
    places[pid] = (round(x, 1), round(z, 1))
    sites.append({'id': pid, 'x': round(x, 1), 'z': round(z, 1),
                  'w': round(w_ft * FT, 1), 'l': round(l_ft * FT, 1),
                  'rot': round(rot(ang), 4)})
for fid, (px, py) in FEATURES.items():
    x, z = xz(px, py)
    places[fid] = (round(x, 1), round(z, 1))

for k, v in sorted(places.items()):
    print('  %-20s %8.1f %8.1f' % (k, v[0], v[1]))

print('\n  concourse fenced field: %.0f x %.0f m = %.2f acres'
      % (CONCOURSE_PX[0] * SCALE, CONCOURSE_PX[1] * SCALE,
         CONCOURSE_PX[0] * CONCOURSE_PX[1] * SCALE * SCALE / 4046.86))
pe_, pw_ = FEATURES['pike_east'], FEATURES['pike_west']
print('  the Pike as drawn: %.0f m' % (math.hypot(pw_[0] - pe_[0], pw_[1] - pe_[1]) * SCALE))
json.dump({'places': places, 'sites': sites,
           'origin': [OLAT, OLON], 'bearing_x': UPHILL_TRUE, 'scale': SCALE},
          open(os.path.join(OUT, '..', 'tools', 'stlouis_fit.json'), 'w'), indent=1)
print('\nwrote tools/stlouis_fit.json')

# how well does the fan mirror about z = 0? this is the honest error bar
print('\nSYMMETRY CHECK (a mirror pair should share an x and oppose a z)')
for a, b in pairs + [('mines', 'machinery'), ('fine_arts_w', 'fine_arts_e'),
                     ('colonnade_w', 'colonnade_e')]:
    ax, az = places[a]
    bx, bz = places[b]
    print('  %-18s/%-18s  dx %6.1f m   z %7.1f vs %7.1f  (mid %6.1f)'
          % (a, b, bx - ax, az, bz, (az + bz) / 2))
print('  on the axis:  ' + '  '.join(
    '%s z=%.1f' % (k, places[k][1])
    for k in ('festival_hall', 'basin_head', 'fine_arts', 'purchase_monument')))

# ---------------------------------------------------------------- 6. the JS
NAMES = {
    'education': 'Palace of Education and Social Economy',
    'electricity': 'Palace of Electricity',
    'mines': 'Palace of Mines and Metallurgy',
    'liberal_arts': 'Palace of Liberal Arts',
    'manufactures': 'Palace of Manufactures',
    'varied_industries': 'Palace of Varied Industries',
    'machinery': 'Palace of Machinery',
    'transportation': 'Palace of Transportation',
    'agriculture': 'Palace of Agriculture',
    'steam_gas_fuels': 'Steam, Gas and Fuels Building',
    'us_government': 'United States Government Building',
    'fine_arts': 'Palace of Fine Arts',
    'fine_arts_w': 'Fine Arts, west wing',
    'fine_arts_e': 'Fine Arts, east wing',
    'horticulture': 'Palace of Horticulture',
    'forestry': 'Palace of Forestry, Fish and Game',
    'festival_hall': 'Festival Hall',
    'colonnade_w': 'Colonnade of States, west kiosk',
    'colonnade_e': 'Colonnade of States, east kiosk',
    'grand_basin': 'the Grand Basin',
    'basin_head': 'the head of the Grand Basin',
    'purchase_monument': 'the Louisiana Purchase Monument',
    'pike_east': 'the Pike, Lindell end',
    'pike_west': 'the Pike, Skinker end',
    'observation_wheel': 'the Observation Wheel',
    'concourse': 'the Aeronautic Concourse',
}

geo_js = '''// St. Louis, 1904 — the frame of the Louisiana Purchase Exposition.
//
// GENERATED by tools/gen_stlouis_geo.py. Do not edit by hand; edit the
// generator, which carries the whole method and its error bars.
//
// This is step 3 of docs/STLOUIS_PLAT.md. Unlike Paris and Monaco, none of it
// comes from a live data feed: the fair was staff and plaster and it was pulled
// down in 1905, so the geometry is georeferenced off the fair's own published
// ground plan (Buxton & Skinner, 1904) and its own published dimensions
// (docs/STLOUIS_PALACES.md), tied to the earth by the two things it built that
// are still standing — the Palace of Fine Arts, now the Saint Louis Art Museum,
// and the Smithsonian's flight cage, now in the zoo.
//
// HOW GOOD IS IT
//   scale        %(scale).3f m per sheet pixel, from Machinery's published
//                1,000 x 525 ft against its measured 110.2 x 58.0 px, and
//                confirmed by the Concourse's fourteen acres (%(acres).2f) and
//                by the guide's "two miles from E. to W." (%(miles).2f)
//   axis         from the fan's own mirror symmetry, six estimates agreeing to
//                about a degree. Education and Electricity, which are mirror
//                images, come out sharing an x to %(mirror).1f m.
//   bearing      the two surviving controls subtend the same angle on the sheet
//                and on the earth to under two degrees
//   residual     %(resid).1f m at the flight cage, %(base).0f m from the anchor
//
// THE FRAME. +x runs UP the grand axis, from the Grand Basin toward Festival
// Hall and the museum behind it; +z is ninety degrees clockwise from that,
// which is the same relation Paris and Monaco have between east and south. The
// origin is the centre of the Grand Basin, because that is what the fair itself
// was composed around: "As all the buildings and avenues of the Exposition
// radiate from this feature."
export const ORIGIN = { lat: %(olat).6f, lon: %(olon).6f };
export const BEARING_X = %(bearing).3f;      // degrees true, of the game's +x

const M_PER_DEG_LAT = 111132.0;
const M_PER_DEG_LON = 111320.0 * Math.cos(ORIGIN.lat * Math.PI / 180);
const _bx = BEARING_X * Math.PI / 180, _bz = (BEARING_X + 90) * Math.PI / 180;

/** A latitude and longitude, in game metres. */
export function geo(lat, lon) {
  const e = (lon - ORIGIN.lon) * M_PER_DEG_LON;
  const n = (lat - ORIGIN.lat) * M_PER_DEG_LAT;
  return { x: e * Math.sin(_bx) + n * Math.cos(_bx),
           z: e * Math.sin(_bz) + n * Math.cos(_bz) };
}

/** …and back, for anyone checking the world against a modern map. */
export function latlon(x, z) {
  const e = x * Math.sin(_bx) + z * Math.sin(_bz);
  const n = x * Math.cos(_bx) + z * Math.cos(_bz);
  return { lat: ORIGIN.lat + n / M_PER_DEG_LAT, lon: ORIGIN.lon + e / M_PER_DEG_LON };
}

/**
 * Every place on the fairground, in game metres, traced off the 1904 plat.
 * The palaces are segmented centroids; the rest were read off gridded crops
 * and are good to about eight metres.
 */
export const PLACES = {
%(places)s};

export function place(id) {
  const p = PLACES[id];
  if (!p) throw new Error('no such place at the Exposition: ' + id);
  return { x: p.x, z: p.z, name: p.name };
}

/**
 * Art Hill, as a function rather than a cone.
 *
 * Measured off the terrain tiles along the fair's grand axis (STLOUIS_PLAT.md):
 * the ground climbs 12.1 m from the Grand Basin and then goes genuinely level,
 * which is why Festival Hall and the museum could stand on it at all. The
 * commonly quoted figure for Art Hill is sixty feet, and the difference from
 * the measured twelve is the basin's water against the ground at its lip plus
 * the museum's own terracing; sixteen sits inside that band.
 *
 * The DEM takes 267 m to make that climb. THE FAIR DID NOT: the toe here is the
 * water's edge at x = 190 and the crown is the Terrace of States at x = 270,
 * because the fair cut the slope into a stepped cascade face eighty metres long
 * rather than a hillside. That is not a contradiction of the DEM — the DEM is
 * today's ground, regraded after 1905 — and it is checked against the fair's
 * own plumbing: sixteen metres of face plus the twenty-four feet the water is
 * thrown above the terrace is about seventy-five feet, against the ninety the
 * guide says the pumps had to lift it.
 *
 * In this frame the climb is exactly the +x axis, which is what the axis was
 * chosen to be, so the hill is a ridge across the head of the basin rather than
 * a cone dropped on the plain: the palaces down the fan stay on the level.
 *
 * The crown is flat ACROSS the fan as well as along it, out to the ends of the
 * Colonnade of States, because the Terrace of States was a terrace: the fourteen
 * states sat in a level arc and the two kiosks at its ends stood at the same
 * height as Festival Hall between them. Then it falls away to the level of the
 * palaces, which is why Mines and Machinery — the innermost pair of the fan —
 * come out within half a metre of zero.
 */
export const HILL = { h: 16, toe: 190, crown: 270, flat: 250, halfWidth: 520 };

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function groundAt(x, z) {
  const up = smooth((x - HILL.toe) / (HILL.crown - HILL.toe));
  const out = smooth((Math.abs(z) - HILL.flat) / (HILL.halfWidth - HILL.flat));
  return HILL.h * up * (1 - out);
}
''' % {
    'scale': SCALE,
    'acres': CONCOURSE_PX[0] * CONCOURSE_PX[1] * SCALE * SCALE / 4046.86,
    'miles': 1150 * SCALE / 1609.34,
    'mirror': abs(places['electricity'][0] - places['education'][0]),
    'resid': math.hypot(pe - te, pn - tn),
    'base': math.hypot(cage_e, cage_n),
    'olat': OLAT, 'olon': OLON, 'bearing': UPHILL_TRUE,
    'places': ''.join("  %-19s { x: %8.1f, z: %8.1f, name: '%s' },\n"
                      % (pid + ':', p[0], p[1], NAMES.get(pid, pid).replace("'", "\\'"))
                      for pid, p in sorted(places.items())),
}
open(os.path.join(OUT, 'stlouis_geo.js'), 'w', newline='\n', encoding='utf-8').write(geo_js)
print('\nwrote src/stlouis_geo.js')

plan_js = '''// The footprints of the Louisiana Purchase Exposition, 1904.
//
// GENERATED by tools/gen_stlouis_geo.py. Step 4 of docs/STLOUIS_PLAT.md.
//
// Position and rotation are traced off the fair's own ground plan; WIDTH AND
// LENGTH ARE NOT. They are the fair's published dimensions from the Official
// Guide (docs/STLOUIS_PALACES.md, every figure cited to a line), because the
// draughtsman's pink wash stops inside the colonnades and under-reads a palace
// by a few per cent. So the plan says where and which way round, and the
// record says how big — which is the right way round for both of them.
//
// `w` is across the building and `l` along its long axis, in metres. `rot` is a
// three.js rotation.y that puts the local +x on the long axis.
export const SITES = [
%(sites)s];

export const SITE = Object.fromEntries(SITES.map((s) => [s.id, s]));

/** The Pike, as the plat draws it: one straight mile of concessions. The
 *  guide's "one and one-half miles … turning sharply to the south" counts the
 *  leg down University Way that this sheet draws as a separate plaza. */
export const PIKE = { from: 'pike_east', to: 'pike_west', width: 78 };

/** The Aeronautic Concourse: the fenced field the airship contest flew from.
 *  %(cw).0f x %(cd).0f m off the plat, which is %(cacres).2f acres against the
 *  fourteen the record gives — the closest thing to a scale check the sheet
 *  contains. The paling round it was thirty feet high (docs/STLOUIS_PALACES). */
export const CONCOURSE = { w: %(cw).0f, d: %(cd).0f, fence: 9.14 };

/** The Grand Basin: "semi-circular in shape and 600 feet in diameter." */
export const BASIN = { r: %(basin).1f };
''' % {
    'sites': ''.join(
        "  { id: '%s', x: %8.1f, z: %8.1f, w: %6.1f, l: %6.1f, rot: %8.4f },\n"
        % (s['id'], s['x'], s['z'], s['w'], s['l'], s['rot']) for s in sites),
    'cw': CONCOURSE_PX[0] * SCALE, 'cd': CONCOURSE_PX[1] * SCALE,
    'cacres': CONCOURSE_PX[0] * CONCOURSE_PX[1] * SCALE * SCALE / 4046.86,
    'basin': 600 * FT / 2,
}
open(os.path.join(OUT, 'stlouis_plan.js'), 'w', newline='\n', encoding='utf-8').write(plan_js)
print('wrote src/stlouis_plan.js')
