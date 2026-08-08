# The real footprint of a city's landmarks, as rectangles the world can build to.
#
# Was tools/gen_paris_footprints.py, which did this for one city. Monaco needed
# the same thing — every landmark there is drawn at rotation.y = 0 and about
# half size, the Prince's Palace 60 m where it is 133 — so it takes a city now.
#
#   python tools/city_footprints.py paris
#   python tools/city_footprints.py monaco --refresh
#
# Two sources, in order, because neither is enough alone:
#
#   Nominatim  one query by name, and it gives a polygon for most things. It
#              returns a POINT for the Casino de Monte-Carlo and the Hotel de
#              Paris, which is no use for a footprint.
#   Overpass   for those: every building way in a small box round the place,
#              and take the one whose name matches or, failing that, the
#              largest — a landmark is the big building on its own square.
#
# What comes out is the SMALLEST-AREA oriented rectangle round the outline, not
# an axis-aligned box: a building sits at whatever angle its street does, and an
# axis-aligned box round a diagonal one is half again too fat.
import argparse
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

UA = {'User-Agent': 'MyAirships/1.0 historic reconstruction james.busch@gmail.com'}
OVERPASS = ['https://overpass.kumi.systems/api/interpreter',
            'https://overpass-api.de/api/interpreter']

# Each city: its projection anchor (from src/<city>_geo.js) and what to ask for.
# `q` is the Nominatim query; `osm` is a name to match in Overpass when the
# first gives only a point. A note explains any building that is not the one
# that stood there in the game's year — the SITE is what is being placed.
CITIES = {
    'paris': {
        'origin': (48.85826, 2.29450), 'oxz': (520.0, 300.0),
        'out': 'src/paris_footprints.js',
        'wanted': [
            ('eiffel', 'Tour Eiffel, Paris', None, None),
            ('etoile', "Arc de Triomphe de l'Étoile, Paris", None, None),
            ('trocadero', 'Palais de Chaillot, Paris', None,
             'the 1878 palace is gone; Chaillot keeps its wings and substructure'),
            ('invalides', 'Hôtel des Invalides, Paris', None, None),
            ('grandpalais', 'Grand Palais, Paris', None, None),
            ('petitpalais', 'Petit Palais, Paris', None, None),
            ('madeleine', 'Église de la Madeleine, Paris', None, None),
            ('opera', 'Opéra Garnier, Paris', None, None),
            ('louvre', 'Musée du Louvre, Paris', None, None),
            ('notredame', 'Cathédrale Notre-Dame de Paris', None, None),
            ('pantheon', 'Panthéon, Paris', None, None),
            ('montmartre', 'Basilique du Sacré-Cœur, Paris', None, None),
            ('bastille', 'Colonne de Juillet, Paris', None, None),
            ('hoteldeville', 'Hôtel de Ville, Paris', None, None),
            ('gareorsay', "Musée d'Orsay, Paris", None,
             "the Gare d'Orsay's train shed, now the museum"),
            ('republique', 'Monument à la République, Paris', None, None),
            ('vendome', 'Colonne Vendôme, Paris', None, None),
            ('ecolemil', 'École Militaire, Paris', None, None),
        ],
    },
    'monaco': {
        'origin': (43.73380, 7.42150), 'oxz': (40.0, 0.0),
        'out': 'src/monaco_footprints.js',
        'wanted': [
            ('rock', 'Palais princier de Monaco', None, None),
            ('oceano', 'Musée océanographique de Monaco', None,
             'begun 1899, still building in 1902'),
            # one building: way/161769674 contains both the Casino and the opera
            # POIs, which is correct — the Salle Garnier is built onto its sea front
            ('casino', 'Casino de Monte-Carlo', 'Casino de Monte-Carlo', None),
            ('opera', 'Salle Garnier, Monaco', 'Opéra de Monte-Carlo',
             'the Salle Garnier, on the Casino’s sea front — the same outline'),
            # The Hotel de Paris and the Hotel Hermitage are NOT here on purpose.
            # Both are mapped as POI nodes rather than buildings, and the nearest
            # ways to them are 22 m outbuildings — "largest in the box" handed
            # the Casino's own outline to the Hotel de Paris, which is how two
            # landmarks end up as one building. Nothing is fitted to a footprint
            # that cannot be identified; they stay where they were placed.
            ('cathedral', 'Cathédrale Notre-Dame-Immaculée, Monaco', None,
             'finished 1903, so a year off in 1902'),
            ('gare', 'Gare de Monaco-Monte-Carlo', 'Gare de Monaco',
             'the 1868 station stood at the head of the ravine; the present one '
             'is underground, so this is the SITE only'),
            ('fortantoine', 'Fort Antoine, Monaco', None, None),
            ('stedevote', 'Église Sainte-Dévote, Monaco', None, None),
        ],
    },
}


def nominatim(q):
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode(
        {'q': q, 'format': 'json', 'polygon_geojson': '1', 'limit': '1'})
    req = urllib.request.Request(url, headers=UA)
    return json.loads(urllib.request.urlopen(req, timeout=60).read().decode('utf8'))


def overpass(query):
    last = None
    for host in OVERPASS:
        try:
            req = urllib.request.Request(
                host, data=urllib.parse.urlencode({'data': query}).encode(), headers=UA)
            return json.loads(urllib.request.urlopen(req, timeout=180).read().decode('utf8'))
        except Exception as ex:                       # noqa: BLE001
            last = ex
    raise last


def by_box(lat, lon, name, half=0.0016):
    """Every building near a point; the one that is named, else the largest."""
    q = ('[out:json][timeout:120];way["building"](%f,%f,%f,%f);out geom tags;'
         % (lat - half, lon - half, lat + half, lon + half))
    d = overpass(q)
    best = None
    for e in d.get('elements', []):
        g = e.get('geometry')
        if not g or len(g) < 4:
            continue
        nm = (e.get('tags', {}).get('name') or '')
        # rough area, in degrees squared — only used to rank
        a = 0.0
        for i in range(len(g) - 1):
            a += g[i]['lon'] * g[i + 1]['lat'] - g[i + 1]['lon'] * g[i]['lat']
        a = abs(a) / 2
        named = bool(name) and name.lower()[:12] in nm.lower()
        score = (1 if named else 0, a)
        if best is None or score > best[0]:
            best = (score, e, nm)
    if not best:
        return None
    e = best[1]
    return {'type': 'Polygon',
            'coordinates': [[[p['lon'], p['lat']] for p in e['geometry']]]}, \
        'way/%s' % e['id'], best[2]


def rings(gj):
    t = gj.get('type')
    if t == 'Polygon':
        return [gj['coordinates'][0]]
    if t == 'MultiPolygon':
        return [poly[0] for poly in gj['coordinates']]
    if t == 'LineString':
        return [gj['coordinates']]
    return []


def hull(pts):
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts

    def half(ps):
        out = []
        for p in ps:
            while len(out) >= 2:
                (ax, az), (bx, bz) = out[-2], out[-1]
                if (bx - ax) * (p[1] - az) - (bz - az) * (p[0] - ax) <= 0:
                    out.pop()
                else:
                    break
            out.append(p)
        return out
    return hull_join(half(pts), half(list(reversed(pts))))


def hull_join(lower, upper):
    return lower[:-1] + upper[:-1]


def min_area_box(pts):
    h = hull(pts)
    if len(h) < 3:
        cx = sum(p[0] for p in pts) / len(pts)
        cz = sum(p[1] for p in pts) / len(pts)
        return cx, cz, 0.0, 0.0, 0.0
    best = None
    for i in range(len(h)):
        ax, az = h[i]
        bx, bz = h[(i + 1) % len(h)]
        if (ax, az) == (bx, bz):
            continue
        ang = math.atan2(bz - az, bx - ax)
        c, s = math.cos(-ang), math.sin(-ang)
        us = [(p[0] * c - p[1] * s, p[0] * s + p[1] * c) for p in h]
        u0, u1 = min(u for u, v in us), max(u for u, v in us)
        v0, v1 = min(v for u, v in us), max(v for u, v in us)
        area = (u1 - u0) * (v1 - v0)
        if best is None or area < best[0]:
            cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
            cb, sb = math.cos(ang), math.sin(ang)
            best = (area, cu * cb - cv * sb, cu * sb + cv * cb, u1 - u0, v1 - v0, ang)
    _, cx, cz, du, dv, ang = best
    if dv > du:
        du, dv = dv, du
        ang += math.pi / 2
    return cx, cz, du, dv, ang


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('city', choices=sorted(CITIES))
    ap.add_argument('--refresh', action='store_true')
    args = ap.parse_args()
    C = CITIES[args.city]
    cache_path = os.path.join(HERE, 'osm_%s_landmarks.json' % args.city)
    cache = {}
    if os.path.exists(cache_path) and not args.refresh:
        cache = json.load(open(cache_path, encoding='utf8'))

    for pid, q, osmname, note in C['wanted']:
        if pid in cache and cache[pid].get('geojson'):
            continue
        gj = src = None
        try:
            d = nominatim(q)
            if d and d[0].get('geojson', {}).get('type') in ('Polygon', 'MultiPolygon'):
                gj = d[0]['geojson']
                src = '%s/%s' % (d[0].get('osm_type'), d[0].get('osm_id'))
                print('  %-13s %s' % (pid, src))
            elif d:
                # a point: go to Overpass for the building on that spot
                lat, lon = float(d[0]['lat']), float(d[0]['lon'])
                got = by_box(lat, lon, osmname or q)
                if got:
                    gj, src, nm = got
                    print('  %-13s %s  (by box: %s)' % (pid, src, nm or 'largest'))
        except Exception as ex:                       # noqa: BLE001
            print('  %-13s FAILED %s' % (pid, ex))
        if gj:
            cache[pid] = {'q': q, 'osm': src, 'note': note, 'geojson': gj}
        time.sleep(1.1)                               # be polite to the service
    json.dump(cache, open(cache_path, 'w', encoding='utf8'))

    lat0, lon0 = C['origin']
    ox, oz = C['oxz']
    m_lat = 111320.0
    m_lon = 111320.0 * math.cos(math.radians(lat0))

    rows = []
    for pid, q, osmname, note in C['wanted']:
        e = cache.get(pid)
        if not e or not e.get('geojson'):
            print('  %-13s no outline' % pid)
            continue
        pts = [(ox + (c[0] - lon0) * m_lon, oz - (c[1] - lat0) * m_lat)
               for r in rings(e['geojson']) for c in r]
        if len(pts) < 3:
            print('  %-13s too few points' % pid)
            continue
        cx, cz, ln, wd, ang = min_area_box(pts)
        rows.append((pid, cx, cz, ln, wd, -ang, e.get('osm', '?'), e.get('note')))

    out = os.path.join(ROOT, C['out'])
    with open(out, 'w', encoding='utf8') as f:
        f.write('// The real footprint of each %s landmark — GENERATED by\n' % args.city)
        f.write('// tools/city_footprints.py from OpenStreetMap outlines.\n')
        f.write('//\n')
        f.write('// The smallest-area rectangle round the real outline: where it stands, how\n')
        f.write('// long and how wide it is, and the three.js rotation.y that lays a box along\n')
        f.write('// it. Anything placed by eye can be placed by this instead.\n')
        f.write('//\n')
        f.write('// { x, z, len, wid, ry } — metres and radians, in game coordinates.\n')
        f.write('export const FOOTPRINTS = {\n')
        for pid, cx, cz, ln, wd, ry, osm, note in rows:
            f.write('  %-14s { x: %8.1f, z: %8.1f, len: %6.1f, wid: %6.1f, ry: %7.4f },  // %s\n'
                    % (pid + ':', cx, cz, ln, wd, ry, osm))
            if note:
                f.write('  %-14s // %s\n' % ('', note))
        f.write('};\n\n')
        f.write('/** The footprint of a landmark, or null. */\n')
        f.write('export function footprint(id) { return FOOTPRINTS[id] || null; }\n')
    print('wrote %s with %d footprints' % (C['out'], len(rows)))
    for pid, cx, cz, ln, wd, ry, osm, note in rows:
        print('  %-13s %6.0f x %-5.0f m  at (%7.0f, %7.0f)  ry %+.3f' % (pid, ln, wd, cx, cz, ry))
    return 0


if __name__ == '__main__':
    sys.exit(main())
