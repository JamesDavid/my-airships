# Does the traced fair actually hold together? Numbers, not screenshots.
#
# The discipline this project keeps (docs/PERIOD_NOTES.md) is that a world is
# checked by measurement and that you distrust your own test before your code.
# So: overlap, water, hill and race-course clearance, all against
# tools/stlouis_fit.json, which gen_stlouis_geo.py wrote.
import json
import re
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
fit = json.load(open(os.path.join(HERE, 'stlouis_fit.json')))
sites = fit['sites']
places = fit['places']

BASIN_R = 600 * 0.3048 / 2
HEAD = places['basin_head']
HILL = dict(h=16, toe=190, crown=270, flat=250, halfWidth=520)


def smooth(t):
    return 0.0 if t <= 0 else 1.0 if t >= 1 else t * t * (3 - 2 * t)


def ground(x, z):
    return HILL['h'] * smooth((x - HILL['toe']) / (HILL['crown'] - HILL['toe'])) \
        * (1 - smooth((abs(z) - HILL['flat']) / (HILL['halfWidth'] - HILL['flat'])))


def corners(s):
    c, sn = math.cos(-s['rot']), math.sin(-s['rot'])
    out = []
    for dx in (-s['l'] / 2, s['l'] / 2):
        for dz in (-s['w'] / 2, s['w'] / 2):
            out.append((s['x'] + dx * c - dz * sn, s['z'] + dx * sn + dz * c))
    return out


def sat_overlap(a, b):
    """Separating-axis test between two rotated rectangles."""
    for r in (a, b):
        for ang in (-r['rot'], -r['rot'] + math.pi / 2):
            ux, uz = math.cos(ang), math.sin(ang)
            pa = [p[0] * ux + p[1] * uz for p in corners(a)]
            pb = [p[0] * ux + p[1] * uz for p in corners(b)]
            if max(pa) < min(pb) or max(pb) < min(pa):
                return 0.0
    # they overlap; report the smallest penetration as a rough depth
    return 1.0


fails = 0

print('1. DO ANY TWO PALACES OVERLAP?')
n = 0
for i in range(len(sites)):
    for j in range(i + 1, len(sites)):
        a, b = sites[i], sites[j]
        if math.hypot(a['x'] - b['x'], a['z'] - b['z']) > (a['l'] + b['l']) / 2 + 20:
            continue
        if sat_overlap(a, b):
            # the Fine Arts wings are MEANT to touch the main building: it is an E
            pair = {a['id'], b['id']}
            if pair <= {'fine_arts', 'fine_arts_w', 'fine_arts_e'}:
                print('   (the Fine Arts E: %s and %s meet, as they should)' % (a['id'], b['id']))
                continue
            print('   OVERLAP %s / %s' % (a['id'], b['id']))
            n += 1
print('   %d unintended overlaps' % n)
fails += n

print('\n2. IS ANY PALACE STANDING IN THE WATER?')
mon = places['purchase_monument']
lagoons = [((HEAD[0] - BASIN_R + 8, 0.0), (mon[0] + 60, 0.0), 82.0)]


def moat(sid, gap=8.0, lw=22.0):
    """Mirrors the moat in world_stlouis.js: Education and Electricity were
    each 'entirely surrounded by lagoons'."""
    s = [x for x in sites if x['id'] == sid][0]
    c, sn = math.cos(-s['rot']), math.sin(-s['rot'])

    def to(lx, lz):
        return (s['x'] + lx * c - lz * sn, s['z'] + lx * sn + lz * c)
    hl, hw = s['l'] / 2 + gap + lw / 2, s['w'] / 2 + gap + lw / 2
    L, W = s['l'] + 2 * (gap + lw), s['w'] + 2 * (gap + lw)
    for sz in (-1, 1):
        lagoons.append((to(-L / 2, sz * hw), to(L / 2, sz * hw), lw))
    for sx in (-1, 1):
        lagoons.append((to(sx * hl, -W / 2), to(sx * hl, W / 2), lw))


moat('education')
moat('electricity')


def in_water(x, z):
    dx = x - HEAD[0]
    if dx <= 0 and dx * dx + z * z < BASIN_R ** 2:
        return 'the Grand Basin'
    for (x1, z1), (x2, z2), w in lagoons:
        ln = math.hypot(x2 - x1, z2 - z1)
        ux, uz = (x2 - x1) / ln, (z2 - z1) / ln
        t = (x - x1) * ux + (z - z1) * uz
        if 0 <= t <= ln and abs((x - x1) * -uz + (z - z1) * ux) < w / 2:
            return 'a lagoon'
    return None


n = 0
for s in sites:
    for cx, cz in corners(s) + [(s['x'], s['z'])]:
        w = in_water(cx, cz)
        if w:
            print('   %-20s has a corner in %s' % (s['id'], w))
            n += 1
            break
print('   %d palaces in the water' % n)
fails += n

print('\n3. ART HILL — is every palace on ground it can stand on?')
worst = 0
for s in sites:
    hs = [ground(cx, cz) for cx, cz in corners(s)]
    tilt = max(hs) - min(hs)
    worst = max(worst, tilt)
    flag = '  <-- more than 3 m of fall under one building' if tilt > 3 else ''
    print('   %-20s ground %5.1f..%5.1f  fall %4.1f m%s'
          % (s['id'], min(hs), max(hs), tilt, flag))
    if tilt > 3:
        fails += 1
print('   worst fall under any palace: %.1f m' % worst)

print('\n4. THE RACE COURSE')
TRI_C = (60.0, 1480.0)
TRI_R, TRI_ROT = 500.0, 0.2793
PAD = places['concourse']
pylons = []
for i in range(3):
    a = -math.pi / 2 + TRI_ROT + i * 2 * math.pi / 3
    pylons.append((TRI_C[0] + math.cos(a) * TRI_R, TRI_C[1] + math.sin(a) * TRI_R))
nearest = 1e9
for k, p in enumerate(pylons):
    for s in sites:
        d = min(math.hypot(p[0] - cx, p[1] - cz) for cx, cz in corners(s))
        if d < nearest:
            nearest, who = d, (k, s['id'])
    print('   pylon %d at %7.1f %7.1f   ground %.2f m' % (k, p[0], p[1], ground(*p)))
print('   nearest palace corner to any pylon: %.0f m (pylon %d, %s)'
      % (nearest, who[0], who[1]))
if nearest < 60:
    print('   TOO CLOSE')
    fails += 1
side = TRI_R * math.sqrt(3)
lap = side * 3
out = math.hypot(PAD[0] - pylons[0][0], PAD[1] - pylons[0][1])
total = out * 2 + lap * 3
print('   side %.0f m, lap %.0f m, three laps %.0f m' % (side, lap, lap * 3))
print('   out and home from the Concourse %.0f m each' % out)
print('   whole course %.0f m = %.2f miles' % (total, total / 1609.34))
print('   at the old pace (9054 m in 1030 s) that is a limit of %.0f s'
      % (total / 9054 * 1030))

print('\n5. THE BASIN SPRINT — the lap circuit, re-cut onto the survey')
src = open(os.path.join(HERE, '..', 'src', 'tracks.js'), encoding='utf-8').read()
blk = src[src.index("id: 'basin'"):]
blk = blk[blk.index('gates: ['):blk.index('],', blk.index('gates: ['))]
gates = [tuple(float(v) for v in g)
         for g in re.findall(r'x:\s*(-?[\d.]+),\s*y:\s*(-?[\d.]+),\s*z:\s*(-?[\d.]+),\s*r:\s*(-?[\d.]+)', blk)]
print('   %d gates read out of src/tracks.js' % len(gates))
named = {0: 'the wheel', 1: "the Pike's midway", 2: 'the Plaza of St. Louis',
         3: 'the Grand Basin', 4: 'Festival Hall', 5: 'the lagoon avenue'}
for i, (gx, gy, gz, gr) in enumerate(gates):
    d = min(min(math.hypot(gx - cx, gz - cz) for cx, cz in corners(s)) for s in sites)
    who = min(sites, key=lambda s: min(math.hypot(gx - cx, gz - cz) for cx, cz in corners(s)))['id']
    # …and to the thing it is NAMED for, which is the point of the gate
    tgt = {0: 'observation_wheel', 1: None, 2: 'purchase_monument',
           3: 'basin_head', 4: 'festival_hall', 5: None}[i]
    near = ''
    if tgt:
        near = '   %.0f m from %s' % (math.hypot(gx - places[tgt][0], gz - places[tgt][1]), tgt)
    print('   gate %d %-22s %6.0f %6.0f  AGL %4.0f  nearest palace %5.0f m (%s)%s'
          % (i, named[i], gx, gz, gy + ground(gx, gz), d, who, near))
    if d < gr + 15:
        print('        TOO CLOSE to %s' % who)
        fails += 1
    if in_water(gx, gz) and gy + ground(gx, gz) < 12:
        print('        LOW OVER %s' % in_water(gx, gz))
        fails += 1
lap = sum(math.hypot(gates[i][0] - gates[i - 1][0], gates[i][2] - gates[i - 1][2])
          for i in range(len(gates)))
print('   lap %.0f m, two laps %.0f m' % (lap, lap * 2))

print('\n6. THE FAIR AS A WHOLE')
xs = [s['x'] for s in sites] + [p[0] for p in places.values()]
zs = [s['z'] for s in sites] + [p[1] for p in places.values()]
print('   extent  x %.0f .. %.0f   z %.0f .. %.0f  (%.2f x %.2f km)'
      % (min(xs), max(xs), min(zs), max(zs),
         (max(xs) - min(xs)) / 1000, (max(zs) - min(zs)) / 1000))
print('   the guide: "two miles from E. to W. and one mile from N. to S."')

print('\n7. COLLIDERS STAND AT THE ANGLE THEIR BUILDINGS DO')
_w = open(os.path.join(HERE, '..', 'src', 'world_stlouis.js'), encoding='utf-8').read()
# Everything on this fairground is laid out on the survey's bearing, so a
# collider pushed without `ry` is either a wall beside the building (the box
# drawn AROUND a rotated footprint) or a hole in its roof (bug #47).
if 'Math.abs(Math.cos(site.rot))' in _w:
    print('   FAIL palaces still collide as the axis-aligned box around the footprint')
    fails += 1
else:
    print('   palaces collide as their own oriented box')
_pike = re.search(r'buildings\.push\(\{ x, z, w: w \+ 4[^;]*;', _w, re.S)
if not _pike or 'ry:' not in _pike.group(0):
    print('   FAIL The Pike\'s attractions collide unrotated on a diagonal midway')
    fails += 1
else:
    print('   The Pike collides at the midway\'s angle')

print('\n%s' % ('ALL CHECKS PASS' if fails == 0 else '%d FAILURES' % fails))
raise SystemExit(1 if fails else 0)
