# The landmarks of Paris — step 5 of docs/PARIS_1901.md.
#
# paris_geo.PLACES named 27 and world.js modelled 16. A coordinate is not a
# building, so these eleven stood as nothing at all:
#
#   petitpalais · madeleine · louvre · bastille · hoteldeville · gareorsay ·
#   chatelet · republique · vendome · autueil · vaugirard
#
# (autueil is a racecourse and is traced in paris_stcloud.js, so ten here.)
#
# TWO SOURCES, AND THE SPLIT IS STATED PER BUILDING, exactly as
# docs/STLOUIS_PALACES.md does it — position and orientation from the plan,
# extent from the record.
#
#   MEASURED   the footprint OpenStreetMap holds, reduced to its smallest-area
#              oriented box (tools/fetch_paris_landmarks.py). For these
#              buildings the outline is the 1901 outline, because they are all
#              still standing on the same ground.
#   PUBLISHED  a figure from the record, used where the fetch would not give a
#              usable outline — the Louvre and the Hôtel de Ville are mapped as
#              courtyards and wings rather than one building, and the Petit
#              Palais sits inside the Grand Palais's shadow. Marked `src:
#              'published'` in the output so nobody mistakes one for the other.
#
# THE 1901 SCREEN, which is the whole reason this is not just "import Paris":
#
#   Gare d'Orsay      opened 28 May 1900 — one year old, and a very distinctive
#                     riverside mass right where the Deutsch runs cross the water
#   Petit Palais      1900 Exposition work, a year old
#   Colonne de Juillet 1840, on the site of the Bastille
#   Colonne Vendôme   1810; toppled by the Commune in 1871 and RE-ERECTED in
#                     1875, so it stands in 1901
#   Hôtel de Ville    burned in 1871 and rebuilt 1873–1892 — the building here
#                     is the new one, which is correct for 1901
#   Louvre            the Tuileries Palace that closed its western end burned in
#                     1871 and was demolished in 1883, so by 1901 the Louvre is
#                     already the open U it is today. Do NOT close it.
#   Vaugirard         Lachambre's balloon works, where Santos-Dumont's envelopes
#                     were actually made. Long gone and never surveyed, so it is
#                     built from the record like the palaces of St. Louis: a
#                     works yard with a shed long enough to lay out an envelope.
import io
import json
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', '.cache')


def load(name):
    p = os.path.join(CACHE, name)
    return json.load(io.open(p, encoding='utf-8')) if os.path.exists(p) else {}


boxes = load('paris_landmarks_boxes.json')      # {name: [area,cx,cz,hu,hv,ang,n,h]}
boxes2 = load('paris_landmarks_boxes2.json')
boxes.update(boxes2)

# OSM name -> (our id, height in metres, kind, note)
MEASURED = {
    'Église de la Madeleine': ('madeleine', 30, 'temple',
                               'the Napoleonic temple, 1842 — 52 Corinthian columns all round'),
    "Musée d'Orsay": ('gareorsay', 32, 'station',
                      "the Gare d'Orsay, opened 28 May 1900 — a barrel-vaulted train hall behind a hotel front"),
    'Théâtre du Châtelet': ('chatelet', 26, 'theatre', 'the 1862 theatre on the place'),
    'Colonne Vendôme': ('vendome', 44, 'column',
                        'the 1810 column; toppled by the Commune 1871, re-erected 1875'),
    'Colonne de Juillet': ('bastille', 47, 'column',
                           'the July Column, 1840, on the site of the Bastille'),
    'Place de la République': ('republique', 0, 'square',
                               'the place, with Morice’s bronze Republic of 1883 at its centre'),
    'Grand Palais': ('grandpalais', 44, 'palace', 'already modelled — kept here as a control'),
}

# id -> (x, z, w, l, bearing deg, height, kind, note). PUBLISHED figures.
PUBLISHED = {
    # Charles Girault, 1900. A trapezoid about a semicircular garden court,
    # one tall storey with a domed entrance pavilion on the avenue.
    'petitpalais': (2002, -565, 90, 130, 25, 24, 'palace',
                    '1900 Exposition work, a year old in 1901'),
    # The palace about the Cour Carrée with its two long wings down to the
    # Seine and the rue de Rivoli. The Tuileries that used to close the west
    # end burned in 1871 and was demolished in 1883, so by 1901 it is open.
    'louvre': (3661, -1, 190, 420, 22, 30, 'palace',
               'open at the west end: the Tuileries were demolished in 1883'),
    # Ballu and Deperthes, 1873–1892, on the shell of the one the Commune burned.
    'hoteldeville': (4747, 488, 85, 110, 20, 48, 'palace',
                     'rebuilt 1873–1892 after the fire of 1871'),
    # Lachambre's balloon works — never surveyed, gone. A works yard and a shed
    # long enough to lay an envelope out in.
    'vaugirard': (1180, 2170, 34, 62, 12, 14, 'works',
                  "Lachambre's balloon works, where his envelopes were made"),
}

rows = []
for nm, (pid, h, kind, note) in MEASURED.items():
    b = boxes.get(nm)
    if not b:
        print('!! no footprint for %s (%s)' % (nm, pid))
        continue
    _area, cx, cz, hu, hv, ang = b[:6]
    rows.append(dict(id=pid, x=round(cx, 1), z=round(cz, 1),
                     w=round(hv * 2, 1), l=round(hu * 2, 1),
                     ry=round(-ang, 4), h=h, kind=kind, src='measured', note=note))
for pid, (x, z, w, l, deg, h, kind, note) in PUBLISHED.items():
    rows.append(dict(id=pid, x=x, z=z, w=w, l=l,
                     ry=round(-math.radians(deg), 4), h=h, kind=kind,
                     src='published', note=note))

rows.sort(key=lambda r: r['id'])
for r in rows:
    print('%-13s %-9s (%7.1f,%7.1f) %6.1f x %6.1f m  h %3d  %-8s %s'
          % (r['id'], r['src'], r['x'], r['z'], r['w'], r['l'], r['h'], r['kind'],
             r['note'][:44]))

js = '''// The landmarks of Paris, 1901 — step 5 of docs/PARIS_1901.md.
//
// GENERATED by tools/gen_paris_landmarks.py. See docs/PARIS_LANDMARKS.md for
// what each of these was in 1901 and where its figures come from.
//
// paris_geo.PLACES named twenty-seven landmarks and world.js modelled sixteen.
// A coordinate is not a building, so the rest stood as nothing at all.
//
// `src` is the honest half of this file:
//   'measured'  the footprint OpenStreetMap holds, reduced to its smallest-area
//               oriented box — and for these the outline is the 1901 outline,
//               because they are all still standing on the same ground.
//   'published' a figure from the record, where the fetch would not give a
//               usable outline: the Louvre and the Hôtel de Ville are mapped as
//               courtyards and wings rather than as one building, the Petit
//               Palais sits in the Grand Palais's shadow, and Lachambre's
//               balloon works at Vaugirard was never surveyed at all.
//
// `w` is across the building and `l` along it; `ry` is a three.js rotation.y.
export const LANDMARKS = [
%s];
''' % ''.join(
    "  { id: '%s', x: %s, z: %s, w: %s, l: %s, ry: %s, h: %s, kind: '%s',\n"
    "    src: '%s' },   // %s\n" % (r['id'], r['x'], r['z'], r['w'], r['l'],
                                    r['ry'], r['h'], r['kind'], r['src'], r['note'])
    for r in rows)
io.open(os.path.join(ROOT, 'src', 'paris_landmarks.js'), 'w',
        encoding='utf-8', newline='\n').write(js)
print('\nwrote src/paris_landmarks.js (%d landmarks)' % len(rows))
