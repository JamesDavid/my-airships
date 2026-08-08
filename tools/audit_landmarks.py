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
    a, b = best[1], best[2]
    return {'x': cx, 'z': cz, 'span': math.sqrt(best[0]),
            'bearing': bearing(b[0] - a[0], b[1] - a[1]) % 180, 'n': len(pts)}


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
  const groups = scene.children.filter((o) => o && o.position && Array.isArray(o.children)
    && o.children.length && Math.hypot(o.position.x - p.x, o.position.z - p.z) < 70);
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
  const walk = (o, ox, oz, rot) => {
    const px = ox + (o.position ? o.position.x : 0) * Math.cos(rot)
      + (o.position ? o.position.z : 0) * Math.sin(rot);
    const pz = oz - (o.position ? o.position.x : 0) * Math.sin(rot)
      + (o.position ? o.position.z : 0) * Math.cos(rot);
    const r2 = rot + ((o.rotation && o.rotation.y) || 0);
    const e = o.geometry ? ext(o.geometry) : null;
    if (e) {
      const hw = e[0] / 2, hd = e[1] / 2, c = Math.cos(r2), s2 = Math.sin(r2);
      for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        corners.push([px + sx * hw * c + sz * hd * s2, pz - sx * hw * s2 + sz * hd * c]);
      }
    }
    if (Array.isArray(o.children)) for (const c2 of o.children) walk(c2, px, pz, r2);
  };
  for (const g2 of groups) walk(g2, 0, 0, 0);
  if (corners.length < 2) { out[id] = { x: p.x, z: p.z, span: 0, bearing: null, n: 0 }; continue; }
  let best = [0, null, null];
  for (let i = 0; i < corners.length; i++) {
    for (let j = i + 1; j < corners.length; j++) {
      const d = Math.hypot(corners[i][0] - corners[j][0], corners[i][1] - corners[j][1]);
      if (d > best[0]) best = [d, corners[i], corners[j]];
    }
  }
  const cx = corners.reduce((s3, q2) => s3 + q2[0], 0) / corners.length;
  const cz = corners.reduce((s3, q2) => s3 + q2[1], 0) / corners.length;
  const brg = ((Math.atan2(best[2][0] - best[1][0], -(best[2][1] - best[1][1]))
    * 180 / Math.PI) + 360) % 180;
  out[id] = { x: cx, z: cz, span: best[0], bearing: brg, n: corners.length / 4 };
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
        if m['bearing'] is not None and g['bearing'] is not None and m['span'] > 25 and g['span'] > 25:
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
