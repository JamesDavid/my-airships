# Every Paris landmark, measured against its real footprint.
#
# The Trocadéro was forty degrees out and better than a third size, and nobody
# knew until a pilot said the palace "seems like it is wrong rotation" (#112).
# It was found by pulling the real footprint off OpenStreetMap and comparing —
# so do that for all of them, once, and keep the tool.
#
# For each landmark this fetches the real building outline, reduces it to the
# three things the game can be wrong about, and prints the game's own numbers
# beside them:
#
#   WHERE   the centre of the footprint, against PLACES
#   HOW BIG the longest span across it, against what the game draws
#   WHICH WAY  the bearing of that longest span, against the game's rotation
#
# The game's side is measured on the BUILT SCENE — the colliders each landmark
# pushes — not on the source, because the source is what I would be checking
# against my own reading of it.
#
# Use: python tools/audit_landmarks.py [--refresh]
#
# Footprints are cached in tools/osm_landmarks.json so the audit runs offline
# and Overpass is asked once. --refresh asks again.
import json
import math
import os
import subprocess
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(HERE, 'osm_landmarks.json')

# The frame, from src/paris_geo.js — kept here as numbers so the audit does not
# depend on a JS runtime, and asserted against the file below.
ORIGIN = (48.85826, 2.29450)
OXZ = (520.0, 300.0)
M_LAT = 111320.0
M_LON = 111320.0 * math.cos(math.radians(ORIGIN[0]))


def geo(lat, lon):
    return (OXZ[0] + (lon - ORIGIN[1]) * M_LON,
            OXZ[1] - (lat - ORIGIN[0]) * M_LAT)


def bearing(dx, dz):
    return (math.degrees(math.atan2(dx, -dz)) + 360) % 360


# What to ask OSM for. The query is the building as it stands; where the 1900
# building is gone the successor on the same substructure is named instead, and
# said so, because the SITE is what the game is placing.
WANTED = [
    ('eiffel',      'Tour Eiffel, Paris',                       None),
    ('etoile',      "Arc de Triomphe de l'Étoile, Paris",       None),
    ('trocadero',   'Palais de Chaillot, Paris',
     'the 1878 palace is gone; Chaillot keeps its wings and substructure'),
    ('invalides',   'Hôtel des Invalides, Paris',               None),
    ('grandpalais', 'Grand Palais, Paris',                      None),
    ('petitpalais', 'Petit Palais, Paris',                      None),
    ('madeleine',   'Église de la Madeleine, Paris',            None),
    ('opera',       'Opéra Garnier, Paris',                     None),
    ('louvre',      'Musée du Louvre, Paris',                   None),
    ('notredame',   'Cathédrale Notre-Dame de Paris',           None),
    ('pantheon',    'Panthéon, Paris',                          None),
    ('montmartre',  'Basilique du Sacré-Cœur, Paris',           None),
    ('bastille',    'Colonne de Juillet, Paris',                None),
    ('hoteldeville', 'Hôtel de Ville, Paris',                   None),
    ('gareorsay',   "Musée d'Orsay, Paris",
     "the Gare d'Orsay's train shed, now the museum"),
    ('republique',  'Monument à la République, Paris',          None),
    ('vendome',     'Colonne Vendôme, Paris',                   None),
    ('ecolemil',    'École Militaire, Paris',                   None),
]


def fetch(q):
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode(
        {'q': q, 'format': 'json', 'polygon_geojson': '1', 'limit': '1'})
    req = urllib.request.Request(url, headers={
        'User-Agent': 'MyAirships/1.0 historic reconstruction james.busch@gmail.com'})
    return json.loads(urllib.request.urlopen(req, timeout=60).read().decode('utf8'))


def rings(gj):
    """Every outer ring of a Polygon or MultiPolygon, as lon/lat pairs."""
    t = gj.get('type')
    if t == 'Polygon':
        return [gj['coordinates'][0]]
    if t == 'MultiPolygon':
        return [poly[0] for poly in gj['coordinates']]
    if t in ('LineString',):
        return [gj['coordinates']]
    if t == 'Point':
        return [[gj['coordinates']]]
    return []


def measure(gj):
    """Centre, longest span and its bearing, in game coordinates."""
    pts = [geo(c[1], c[0]) for r in rings(gj) for c in r]
    if not pts:
        return None
    cx = sum(p[0] for p in pts) / len(pts)
    cz = sum(p[1] for p in pts) / len(pts)
    if len(pts) == 1:
        return {'x': cx, 'z': cz, 'span': 0.0, 'bearing': None, 'n': 1}
    # the two points furthest apart — the building's own longest axis
    best = (0.0, None, None)
    # O(n^2) is fine at these sizes, and exact beats a hull approximation here
    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            d = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2
            if d > best[0]:
                best = (d, pts[i], pts[j])
    # ...and the same smallest-area rectangle for the real outline, so the two
    # sides of the comparison are measured by one rule
    from math import atan2, cos, sin, degrees
    hullp = pts
    bestbox = None
    for i in range(len(hullp)):
        ax, az = hullp[i]
        bx, bz = hullp[(i + 1) % len(hullp)]
        if ax == bx and az == bz:
            continue
        ang = atan2(bz - az, bx - ax)
        c, sn = cos(-ang), sin(-ang)
        us = [(q[0] * c - q[1] * sn, q[0] * sn + q[1] * c) for q in hullp]
        u0 = min(u for u, v in us); u1 = max(u for u, v in us)
        v0 = min(v for u, v in us); v1 = max(v for u, v in us)
        area = (u1 - u0) * (v1 - v0)
        if bestbox is None or area < bestbox[0]:
            bestbox = (area, u1 - u0, v1 - v0, ang, (u0 + u1) / 2, (v0 + v1) / 2)
    _, du, dv, ang, bu, bv = bestbox
    if dv > du:
        du, dv = dv, du
        ang += math.pi / 2
    # the BOX centre, not the mean of the vertices: the world is placed to the
    # box, and a U-shaped building like the Louvre has its vertex mean well off
    # its box centre — 67 m for the Louvre, which is not an error in the world
    cb, sb = math.cos(ang if dv <= du else ang - math.pi / 2), math.sin(ang if dv <= du else ang - math.pi / 2)
    cx = bu * math.cos(bestbox[3]) - bv * math.sin(bestbox[3])
    cz = bu * math.sin(bestbox[3]) + bv * math.cos(bestbox[3])
    brg = (math.degrees(math.atan2(math.cos(ang), math.sin(ang))) + 360) % 180
    return {'x': cx, 'z': cz, 'span': du, 'wid': dv, 'bearing': brg,
            'diag': math.sqrt(best[0]), 'n': len(pts)}


def load(refresh=False):
    cache = {}
    if os.path.exists(CACHE) and not refresh:
        cache = json.load(open(CACHE, encoding='utf8'))
    missing = [w for w in WANTED if w[0] not in cache]
    for pid, q, note in missing:
        try:
            d = fetch(q)
            if not d:
                print('  no result for %s (%s)' % (pid, q))
                continue
            cache[pid] = {'q': q, 'osm': '%s/%s' % (d[0].get('osm_type'), d[0].get('osm_id')),
                          'geojson': d[0].get('geojson')}
            print('  fetched %-12s %s' % (pid, cache[pid]['osm']))
        except Exception as ex:                       # noqa: BLE001
            print('  FAILED %s: %s' % (pid, ex))
    if missing:
        json.dump(cache, open(CACHE, 'w', encoding='utf8'))
    return cache


def game_side():
    """What the game actually builds, measured on the scene it builds."""
    js = r'''
import './tools/headless.mjs';
import { buildWorld } from './src/world.js';
import { PLACES, place } from './src/paris_geo.js';
import { FOOTPRINTS } from './src/paris_footprints.js';
const scene = { children: [], add(...o) { this.children.push(...o); },
  remove() {}, traverse(f) { f(this); } };
const w = buildWorld(scene, 'paris');
const out = {};
for (const id of Object.keys(PLACES)) {
  const p = place(id);
  if (!p) continue;
  // every collider this landmark owns: the ones near it that are NOT ordinary
  // city blocks. A landmark's pieces are pushed to lmColliders and end up in
  // world.buildings, so take everything within 320 m and keep the tall or
  // large ones, then measure their spread.
  // WHAT THE GAME DRAWS, which is the question. Colliders were the first
  // attempt and they answer a different one: eight monuments push none at all
  // (the Grand Palais famously carries no collider), so they measured zero and
  // the audit called them too small. Walk the meshes instead, take each one's
  // own extent from its geometry, and turn it by the group it hangs in.
  // near its PLACE or near its real footprint centre: a monument fitted to its
  // footprint stands on the latter, and searching only the former lost it
  const fp = FOOTPRINTS[id];
  const groups = scene.children.filter((o) => o && o.position && Array.isArray(o.children)
    && o.children.length
    && (Math.hypot(o.position.x - p.x, o.position.z - p.z) < 70
      || (fp && Math.hypot(o.position.x - fp.x, o.position.z - fp.z) < 70)));
  const corners = [];
  const ext = (g2) => {
    const q = (g2 && g2.parameters) || {};
    if (q.width !== undefined) return [q.width, q.depth !== undefined ? q.depth : q.width];
    if (q.radiusTop !== undefined || q.radiusBottom !== undefined) {
      const r = Math.max(q.radiusTop || 0, q.radiusBottom || 0); return [2 * r, 2 * r];
    }
    if (q.radius !== undefined) return [2 * q.radius, 2 * q.radius];
    return null;
  };
  // scale counts: a group fitted to its footprint carries the stretch there,
  // and a walker that ignores it measures the drawing rather than the building
  const walk = (o, ox, oz, rot, kx, kz) => {
    const lx = (o.position ? o.position.x : 0) * kx;
    const lz = (o.position ? o.position.z : 0) * kz;
    const px = ox + lx * Math.cos(rot) + lz * Math.sin(rot);
    const pz = oz - lx * Math.sin(rot) + lz * Math.cos(rot);
    const r2 = rot + ((o.rotation && o.rotation.y) || 0);
    const sx2 = kx * ((o.scale && o.scale.x) || 1);
    const sz2 = kz * ((o.scale && o.scale.z) || 1);
    const e = o.geometry ? ext(o.geometry) : null;
    if (e) {
      const hw = e[0] * sx2 / 2, hd = e[1] * sz2 / 2, c = Math.cos(r2), s2 = Math.sin(r2);
      for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        corners.push([px + sx * hw * c + sz * hd * s2, pz - sx * hw * s2 + sz * hd * c]);
      }
    }
    if (Array.isArray(o.children)) for (const c2 of o.children) walk(c2, px, pz, r2, sx2, sz2);
  };
  // start each walk in the GROUP's frame and descend into its children — do not
  // hand the group to walk(), which would apply its own position a second time
  // THE MONUMENT'S OWN GROUP, which is the biggest one standing there. Taking
  // every group within 70 m swept in its outbuildings -- the Trocadero's
  // cascade runs 340 m down the hill from the same point, and measured with it
  // the palace read 339 m long at fifty degrees to itself.
  if (!groups.length) { out[id] = { x: p.x, z: p.z, span: 0, bearing: null, n: 0 }; continue; }
  const g2 = groups.reduce((a2, b2) => (b2.children.length > a2.children.length ? b2 : a2));
  {
    const rot = (g2.rotation && g2.rotation.y) || 0;
    const kx = (g2.scale && g2.scale.x) || 1, kz = (g2.scale && g2.scale.z) || 1;
    for (const c2 of g2.children) walk(c2, g2.position.x, g2.position.z, rot, kx, kz);
  }
  if (corners.length < 2) { out[id] = { x: p.x, z: p.z, span: 0, bearing: null, n: 0 }; continue; }
  // THE SMALLEST-AREA RECTANGLE, not the longest diagonal. A near-square
  // building's longest span is a diagonal, and its bearing says nothing about
  // which way the building faces -- judged that way the Pantheon and Sacre-Coeur
  // read 56 and 37 degrees out when they had just been laid on their own
  // footprints. Same rule the footprints themselves are made with.
  let bA = null;
  for (let i = 0; i < corners.length; i++) {
    const a2 = corners[i], b2 = corners[(i + 1) % corners.length];
    const ang = Math.atan2(b2[1] - a2[1], b2[0] - a2[0]);
    const c = Math.cos(-ang), s2 = Math.sin(-ang);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const q2 of corners) {
      const u = q2[0] * c - q2[1] * s2, v = q2[0] * s2 + q2[1] * c;
      if (u < u0) u0 = u; if (u > u1) u1 = u;
      if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!bA || area < bA.area) bA = { area, ang, du: u1 - u0, dv: v1 - v0 };
  }
  let ln = bA.du, wd = bA.dv, ang2 = bA.ang;
  if (wd > ln) { const t2 = ln; ln = wd; wd = t2; ang2 += Math.PI / 2; }
  const cx = corners.reduce((s3, q2) => s3 + q2[0], 0) / corners.length;
  const cz = corners.reduce((s3, q2) => s3 + q2[1], 0) / corners.length;
  // the long side as a compass bearing, mod 180
  const brg = ((Math.atan2(Math.cos(ang2), Math.sin(ang2)) * 180 / Math.PI) + 360) % 180;
  out[id] = { x: cx, z: cz, span: ln, wid: wd, bearing: brg, n: corners.length / 4 };
}
console.log(JSON.stringify(out));
'''
    path = os.path.join(ROOT, 'tmp_audit_probe.mjs')
    open(path, 'w', encoding='utf8').write(js)
    try:
        r = subprocess.run(['node', 'tmp_audit_probe.mjs'], cwd=ROOT,
                           capture_output=True, text=True, timeout=300)
        line = [ln for ln in r.stdout.splitlines() if ln.startswith('{')]
        if not line:
            print('probe gave nothing:\n', r.stdout[-800:], r.stderr[-800:])
            return {}
        return json.loads(line[-1])
    finally:
        if os.path.exists(path):
            os.remove(path)


def main():
    refresh = '--refresh' in sys.argv
    print('')
    print('EVERY PARIS LANDMARK, AGAINST ITS REAL FOOTPRINT')
    print('   Where OpenStreetMap has the building, its outline is reduced to a')
    print('   centre, a longest span and the bearing of that span, and set beside')
    print('   what the game actually builds — measured on the built scene, not on')
    print('   the source, because the source is only my reading of it.')
    print('')
    osm = load(refresh)
    game = game_side()
    if not game:
        print('   could not measure the game side')
        return 1
    rows = []
    for pid, q, note in WANTED:
        o = osm.get(pid)
        m = measure(o['geojson']) if o and o.get('geojson') else None
        g = game.get(pid)
        if not m or not g:
            rows.append((pid, None, None, None, note, 'no footprint' if not m else 'not placed'))
            continue
        dpos = math.hypot(m['x'] - g['x'], m['z'] - g['z'])
        dspan = g['span'] - m['span']
        dbear = None
        # a nearly-square building has no meaningful long axis: judge the angle
        # only where the real footprint is half again as long as it is wide
        elongated = m.get('wid', 0) > 0 and m['span'] / m['wid'] > 1.5
        if m['bearing'] is not None and g['bearing'] is not None and elongated and m['span'] > 25:
            dbear = abs(m['bearing'] - g['bearing'])
            if dbear > 90:
                dbear = 180 - dbear
        rows.append((pid, dpos, (m['span'], g['span'], dspan), dbear, note, None))

    print('   %-12s %8s   %-22s %9s' % ('landmark', 'position', 'span  (real / game)', 'bearing'))
    print('   %-12s %8s   %-22s %9s' % ('', 'out by', '', 'out by'))
    print('')
    bad = []
    for pid, dpos, span, dbear, note, err in rows:
        if err:
            print('   %-12s %s' % (pid, err))
            continue
        flag = ''
        if dpos > 60:
            flag += ' POSITION'
        if span[0] > 25 and abs(span[2]) > max(40, span[0] * 0.35):
            flag += ' SIZE'
        if dbear is not None and dbear > 20:
            flag += ' ROTATION'
        if flag:
            bad.append((pid, flag.strip()))
        print('   %-12s %6.0f m   %5.0f / %-5.0f  %+6.0f %7s%s' % (
            pid, dpos, span[0], span[1], span[2],
            ('%.0f' % dbear) if dbear is not None else '-', flag))
        if note:
            print('   %-12s   (%s)' % ('', note))
    print('')
    if bad:
        print('   %d worth looking at: %s' % (len(bad), ', '.join(
            '%s (%s)' % (p, f) for p, f in bad)))
    else:
        print('   every landmark within tolerance')
    print('')
    print('   Tolerances: 60 m of position, a third of the span or 40 m, 20 degrees.')
    print('   A span is the longest line across the real outline; for a tower or a')
    print('   column it is small and its bearing means nothing, so bearings are only')
    print('   judged where both spans exceed 25 m.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
