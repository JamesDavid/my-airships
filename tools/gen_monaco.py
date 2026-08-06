# Generate src/monaco_geo.js and src/monaco_streets.js for My Airships.
#
#   terrain : NASA SRTM by way of the AWS terrain tiles (terrarium, zoom 14)
#   coast   : the DEM, floored where a period street ran; reclamations masked
#   streets : OpenStreetMap, screened to what stood in 1902
#   places  : OpenStreetMap, by name — nothing here is typed from memory
import math, io, json, base64, struct
from PIL import Image

# ---------------------------------------------------------------- the frame
LAT0, LON0 = 43.73380, 7.42150          # the head of the port, at La Condamine
OX, OZ = 40.0, 0.0                      # ...which sits at game (40, 0)
MLAT = 111320.0
MLON = 111320.0 * math.cos(math.radians(LAT0))
def fwd(lat, lon): return (OX + (lon - LON0) * MLON, OZ - (lat - LAT0) * MLAT)
def inv(x, z):     return (LAT0 - (z - OZ) / MLAT, LON0 + (x - OX) / MLON)

# ---------------------------------------------------------------- the DEM
Z = 14; N = 2 ** Z; TX0, TY0 = 8527, 5970
big = Image.open('monaco_dem.png').convert('RGB'); px = big.load(); IW, IH = big.size
def _px(i, j):
    i = max(0, min(IW - 1, int(i))); j = max(0, min(IH - 1, int(j)))
    r, g, b = px[i, j]; return r * 256 + g + b / 256 - 32768
def elev(lat, lon):
    i = (lon + 180) / 360 * N * 256 - TX0 * 256
    la = math.radians(lat)
    j = (1 - math.log(math.tan(la) + 1 / math.cos(la)) / math.pi) / 2 * N * 256 - TY0 * 256
    i0, j0 = int(i), int(j); fi, fj = i - i0, j - j0
    return (_px(i0, j0) * (1 - fi) * (1 - fj) + _px(i0 + 1, j0) * fi * (1 - fj)
          + _px(i0, j0 + 1) * (1 - fi) * fj + _px(i0 + 1, j0 + 1) * fi * fj)

# ---------------------------------------------------------------- the shore
# The SRTM is a coastal model with a coastal model's failing: its ocean mask is
# generous, and over Monaco it clamps the flat quarter of La Condamine and the
# shore strip under Monte Carlo to zero along with the water — which put the
# aerodrome in the bay. The mountain behind is excellent: the Tete de Chien
# comes out within a few metres of its surveyed 573, La Turbie of its 480, Mont
# Agel of its 1085. What is wrong is only the line where the sea stops.
#
# OpenStreetMap's own coastline was tried for this and abandoned. Its ways round
# Monaco do not stitch into one clean ring — the harbour, the digue and the
# modern basins interleave — and a point-in-polygon over the result came out
# speckled, alternating land and water across the same quarter every fifty
# metres. Sidedness against the nearest piece is worse: inside the mouth of a
# harbour the nearest piece is a quay pointing the other way.
#
# What is used instead is simpler and cannot come apart: WHERE A STREET RAN,
# THERE WAS LAND. The period street plan is already established below, from the
# same survey, and flooring the ground in a corridor along it puts La Condamine
# and the Monte Carlo shelf back above water exactly where the town was and
# nowhere else. The open sea, which the DEM has right, is left alone.
SHORE_FLOOR = 4.5        # metres — the quays of La Condamine stood about this
SEA_SHELF   = -3         # metres — where the ground goes under the water
FLOOR_REACH = 42.0       # metres either side of a centreline

def build_floor_index(streets):
    cell = 100.0
    idx = {}
    for st in streets:
        for i in range(len(st['pts']) - 1):
            a, b = st['pts'][i], st['pts'][i + 1]
            n = max(1, int(math.dist(a, b) // 25))
            for t in range(n + 1):
                px = a[0] + (b[0] - a[0]) * t / n
                pz = a[1] + (b[1] - a[1]) * t / n
                idx.setdefault((int(px // cell), int(pz // cell)), []).append((px, pz))
    return cell, idx

def near_street(cell, idx, x, z, reach):
    cx, cz = int(x // cell), int(z // cell)
    span = int(reach // cell) + 1
    r2 = reach * reach
    for dx in range(-span, span + 1):
        for dz in range(-span, span + 1):
            for (px, pz) in idx.get((cx + dx, cz + dz), ()):
                if (px - x) ** 2 + (pz - z) ** 2 < r2: return True
    return False

# ------------------------------------------------- the twentieth century, off
# Every one of these is made ground, poured into the sea long after 1902. The
# SRTM was flown in 2000 and the OSM coastline is today's, so both have all of
# it; here it goes back to being water, and no street is laid on it.
RECLAIMED = {
 # Fontvieille — 22 hectares taken from the sea 1966-73, under the Rock's west
 # face. In 1902 the water came to the foot of the cliff.
 'fontvieille': [(43.7330,7.4230),(43.7305,7.4110),(43.7240,7.4120),(43.7226,7.4232),
                 (43.7268,7.4272),(43.7296,7.4262)],
 # the port's outer digue and its seaward apron — 2002
 'digue':       [(43.7320,7.4248),(43.7298,7.4248),(43.7284,7.4292),(43.7300,7.4312),
                 (43.7324,7.4304)],
 # Larvotto's beaches and the Portier ground — 1960s, and Mareterra in 2024
 'larvotto':    [(43.7428,7.4286),(43.7414,7.4320),(43.7440,7.4416),(43.7496,7.4442),
                 (43.7512,7.4402),(43.7470,7.4328),(43.7450,7.4284)],
}
# The SRTM is a *surface* model at thirty metres and it cannot see into a
# harbour: it bridges the two quays of Port Hercule and reports solid ground
# across the middle of the anchorage. The basin is put back — in game
# coordinates, because a harbour is easier to read off the ground than off a
# pair of decimal degrees. The outline was checked against OpenStreetMap by
# asking for buildings in it: there are none over the water and plenty either
# side, which is how far north the anchorage reaches — further than it looks.
BASIN_XZ = [(240,-250),(165,-215),(140,-90),(175,30),(245,160),(350,230),
            (465,195),(500,50),(455,-130),(330,-240)]
BASINS = {'porthercule': [inv(x, z) for (x, z) in BASIN_XZ]}

def _inpoly(lat, lon, poly):
    inside = False; n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        if (a[0] > lat) != (b[0] > lat):
            xi = a[1] + (lat - a[0]) * (b[1] - a[1]) / (b[0] - a[0])
            if lon < xi: inside = not inside
    return inside
# Made ground is flat and low — Fontvieille stands about five metres over the
# water. The height guard keeps a slack polygon from ever biting into the Rock,
# which comes out of the same water to sixty.
def reclaimed(lat, lon):
    if any(_inpoly(lat, lon, p) for p in BASINS.values()) and elev(lat, lon) < 30:
        return True
    if not any(_inpoly(lat, lon, p) for p in RECLAIMED.values()): return False
    return elev(lat, lon) < 22

# ---------------------------------------------------------------- heightfield
STEP = 50
X_MIN, X_MAX = -2100, 5300
Z_MIN, Z_MAX = -4800, 1400
nx = int((X_MAX - X_MIN) / STEP) + 1
nz = int((Z_MAX - Z_MIN) / STEP) + 1
# ---------------------------------------------------------------- the streets
# Screened to 1902. Monaco grew in three bursts and the screen follows them: the
# Rock is medieval, La Condamine and Monte Carlo are Charles III's (1860-1889),
# and everything named for a twentieth-century person, driven through the
# mountain, or standing on made ground is later.
PERIOD = {
 # -- La Condamine and the port -------------------------------------------
 'Boulevard Albert 1er': 26,        # the Boulevard de la Condamine of 1902 —
                                    # renamed later, and the aerodrome stood on it
 'Rue Grimaldi': 18, 'Avenue du Port': 14, 'Rue de Millo': 12,
 'Rue Princesse Caroline': 12, 'Rue Princesse Florestine': 11,
 'Rue Princesse Antoinette': 11, 'Rue Terrazzani': 10, 'Rue Saige': 11,
 'Rue Suffren Reymond': 10, 'Rue Imberty': 10, 'Rue Baron Sainte-Suzanne': 10,
 'Rue Plati': 10, 'Rue Bosio': 10, 'Rue du Marché': 10, 'Rue Malbousquet': 10,
 'Place d\u2019Armes': 20, "Place d'Armes": 20, 'Rue de la Turbie': 12,
 'Boulevard Charles III': 20, 'Rue des Princes': 10, 'Rue du Portier': 10,
 'Avenue de la Quarantaine': 10, 'Avenue de La Quarantaine': 10,
 # -- the climb, and Monte Carlo -------------------------------------------
 'Avenue de Monte-Carlo': 20, 'Avenue de la Costa': 16, "Avenue d'Ostende": 20,
 'Avenue des Beaux-Arts': 14, 'Place du Casino': 34, 'Boulevard des Moulins': 20,
 'Avenue des Spélugues': 14, 'Avenue de la Madone': 14, 'Avenue Saint-Michel': 14,
 'Avenue de Grande-Bretagne': 14, 'Boulevard de Suisse': 14,
 "Boulevard d'Italie": 14, 'Boulevard de Belgique': 14,
 'Avenue Princesse Alice': 12, "Avenue de l'Hermitage": 12,
 'Avenue Saint-Laurent': 11, 'Avenue Saint-Romain': 11, 'Avenue de Saint-Romain': 11,
 'Avenue Saint-Charles': 11, 'Boulevard des Moneghetti': 14,
 'Rue des Roses': 9, 'Rue des Iris': 9, 'Rue des Lauriers': 9,
 'Rue des Genêts': 9, 'Rue des Giroflées': 9, 'Avenue des Citronniers': 11,
 'Avenue des Oliviers': 11, 'Avenue des Pins': 11, 'Rue de la Source': 9,
 'Avenue Crovetto-Frères': 11, 'Rue Bel Respiro': 9, 'Rue Bellevue': 9,
 # -- the Rock. The lanes up there are medieval and have not moved; several
 #    carry a nineteenth- or twentieth-century name over a seventeenth-century
 #    alignment, and it is the alignment being placed. They are tagged as
 #    footways in OpenStreetMap because the Rock is closed to carriages.
 'Place du Palais': 26, 'Rue Colonel Bellando de Castro': 8,
 'Rue Princesse Marie de Lorraine': 8, 'Rue des Remparts': 8, 'Rue du Rocher': 8,
 'Avenue Saint-Martin': 10, 'Avenue de la Porte Neuve': 12,
 'Rue Augustin Vento': 8, 'Ruelle Sainte-Barbe': 6, 'Ruelle Saint-Jean': 6,
 'Rue Émile de Loth': 8, 'Place de la Visitation': 12, 'Rampe Major': 10,
 'Rue Basse': 8, 'Rue Comte Félix Gastaldi': 8, "Rue de l'Église": 7,
 'Rue des Carmes': 7, 'Rue des Fours': 7, 'Rue des Orangers': 7,
 'Rue Notre-Dame-de-Lorete': 7, 'Rue de la Gaîté': 7, 'Ruelle de la Fonderie': 6,
 'Passage de la Fonderie': 6, "Passage de l'Ancienne Poterie": 6,
 'Passage de la Miséricorde': 6, 'Passage du Coin': 6, 'Rue de Vedel': 7,
 'Ruelle Sainte-Dévote': 6, 'Escalier Sainte-Dévote': 6, 'Rue des Spelugues': 8,
 # -- out of the town -------------------------------------------------------
 'Route de la Turbie': 12, 'Boulevard de la Turbie': 12, 'Chemin de la Turbie': 9,
 'Grande Corniche': 14, 'Voie Romaine': 9, 'Chemin Romain': 8,
 'Route de la Tête de Chien': 9, 'Route du Mont Agel': 9,
 "Avenue du Cap d'Ail": 12, 'Route de Menton': 14, 'Chemin de Saint-Roch': 8,
 'Chemin des Révoires': 8, 'Avenue de la Plage': 10,
}
# Named for people or things that did not exist yet, or built on made ground, or
# driven through the mountain. Kept as a list so the reason stays on the record.
DENY_SUBSTR = ['Tunnel', 'Moyenne Corniche', 'Fontvieille', 'Larvotto', 'Mareterra',
   'Albert II', 'Louis II', 'Rainier III', 'Princesse Grace', 'Kennedy', 'Churchill',
   'Le Corbusier', 'Jean Jaurès', 'de Gaulle', 'Leclerc', 'Verdun', 'Foch',
   'Jardin Exotique', 'Papalins', 'Castelans', 'Gabian', 'Bretelle', 'Giratoire',
   'Rond-Point', 'Impasse', 'Square', 'Esplanade', 'Promenade', 'Virage', 'Rascasse',
   'Pasteur', 'Pierre Curie', 'Sacha Guitry', 'Hector Otto', 'Winston',
   'Notari', 'Paul Doumer', 'Hanotaux', 'Henry Dunant', 'Jules Ferry', 'Victor Hugo',
   'Anciens Combattants', 'Professeur Langevin', 'Robert Bineau', 'Jean Bouin',
   'Prince Pierre', 'Princesse Charlotte', 'Danemark', 'Hôpital', 'Hopital', 'Stade']

ways = {}
for f in ('monaco_osm.json', 'monaco_osm2.json'):
    for e in json.load(open(f))['elements']:
        if e.get('type') == 'way' and 'geometry' in e: ways[e['id']] = e
n_osm = len(ways)
streets = []; kept_names = set(); n_cut = 0
for e in ways.values():
    t = e.get('tags', {})
    if t.get('tunnel') or t.get('covered') == 'yes': continue
    name = t.get('name', '')
    rail = t.get('railway') == 'rail'
    if rail:
        w = 8
    else:
        if not name or any(s in name for s in DENY_SUBSTR): continue
        if name not in PERIOD: continue
        w = PERIOD[name]
    # A way that runs onto made ground is CUT there, not thrown away: the
    # Boulevard Albert 1er is a period street for most of its length and a
    # 1960s one at the far end.
    runs = [[]]
    for g in e['geometry']:
        x, z = fwd(g['lat'], g['lon'])
        ok = (not reclaimed(g['lat'], g['lon'])
              and X_MIN <= x <= X_MAX and Z_MIN <= z <= Z_MAX)
        if not ok:
            if runs[-1]: runs.append([]); n_cut += 1
            continue
        p = (round(x, 1), round(z, 1))
        if not runs[-1] or abs(x - runs[-1][-1][0]) + abs(z - runs[-1][-1][1]) > 6:
            runs[-1].append(p)
    for pts in runs:
        if len(pts) < 2: continue
        streets.append({'name': name or 'Chemin de fer', 'w': w, 'rail': rail, 'pts': pts})
        kept_names.add(name or '(railway)')

print('streets kept', len(streets), 'from', len(kept_names), 'names of', n_osm,
      'OSM ways;', n_cut, 'cut at made ground or the edge')
print('allowed but not found:', sorted(n for n in PERIOD if n not in kept_names))

# The floor corridor, from the streets just screened.
FLOOR_CELL, FLOOR_IDX = build_floor_index(streets)

vals = []; n_floored = 0
for k in range(nz):
    z = Z_MIN + k * STEP
    for i in range(nx):
        x = X_MIN + i * STEP
        la, lo = inv(x, z)
        h = elev(la, lo)
        # where a street ran, there was land
        if h < SHORE_FLOOR and near_street(FLOOR_CELL, FLOOR_IDX, x, z, FLOOR_REACH):
            h = SHORE_FLOOR; n_floored += 1
        # ...and the made ground and the harbour are water again, last word
        if reclaimed(la, lo): h = 0.0
        # The sea is written as a shelf THREE METRES DOWN rather than a flat
        # zero. It costs nothing and it buys the coastline: bilinear between a
        # five-metre quay and a minus-three seabed crosses zero somewhere inside
        # the cell, so the waterline falls where it belongs instead of stepping
        # round the grid in fifty-metre blocks.
        if h <= 0: h = SEA_SHELF
        vals.append(max(-32768, min(32767, int(round(h)))))
print('floored %d samples along the street plan' % n_floored)

# One-cell islands are DEM noise, not islands. Monaco has no offshore rocks in
# the bay, and a stray positive sample out at sea renders as a sandbank.
def gv(i, k): return vals[k * nx + i]
culled = 0
for k in range(1, nz - 1):
    for i in range(1, nx - 1):
        if gv(i, k) <= 0: continue
        if max(gv(i-1,k), gv(i+1,k), gv(i,k-1), gv(i,k+1)) <= 0:
            vals[k * nx + i] = SEA_SHELF; culled += 1
print('culled %d one-cell islands' % culled)
hf_b64 = base64.b64encode(struct.pack('<%dh' % len(vals), *vals)).decode()

# ---------------------------------------------------------------- the places
# Every one of these came out of OpenStreetMap by name — see the queries in
# docs/PERIOD_NOTES.md. Placing them from memory put the Tete de Chien two
# kilometres north of where it stands and the palace four hundred metres east.
PLACES = {
 'aerodrome':  (43.73443, 7.42138, "the aerodrome, on the Boulevard de la Condamine"),
 'condamine':  (43.73415, 7.42176, "La Condamine, the flat quarter at the head of the port"),
 'stage':      (43.73443, 7.42287, "the landing-stage the Prince built out over the water"),
 'port':       (43.73326, 7.42510, "Port Hercule — in 1902 a bare anchorage, no digue"),
 'rock':       (43.73128, 7.42015, "the Palais princier, on the Place du Palais"),
 'monacoville':(43.73097, 7.42482, "Monaco-Ville, the old town along the Rock"),
 'cathedral':  (43.73034, 7.42270, "the cathedral, finished 1903"),
 'oceano':     (43.73066, 7.42553, "the Musee oceanographique, Albert I's, building 1899-1910"),
 'fortantoine':(43.73306, 7.42793, "Fort Antoine, 1710s, on the Rock's north point"),
 'casino':     (43.73916, 7.42802, "the Casino of Monte Carlo"),
 'opera':      (43.73896, 7.42837, "the Salle Garnier, the opera on the Casino's sea front"),
 'hoteldeparis':(43.73901, 7.42747, "the Hotel de Paris, 1864"),
 'hermitage':  (43.73846, 7.42596, "the Hotel Hermitage, 1896"),
 'boulingrins':(43.73998, 7.42641, "the Jardin des Boulingrins, above the Casino"),
 'stedevote':  (43.73752, 7.42092, "the chapel of Sainte-Devote, in her ravine"),
 'gare':       (43.73826, 7.41950, "the station of 1868, at the head of the ravine"),
 'tetedechien':(43.73181, 7.40273, "the Tete de Chien, 573 m, standing over the whole bay"),
 'forttete':   (43.73237, 7.40259, "the fort on its summit, 1880s"),
 'laturbie':   (43.74530, 7.40113, "La Turbie, up the mountain"),
 'trophee':    (43.74479, 7.40176, "the Trophy of Augustus, standing there since 6 BC"),
 'montdesmules':(43.74625, 7.42178, "the Mont des Mules, 291 m, behind Beausoleil"),
 'agel':       (43.77507, 7.42598, "Mont Agel, 1085 m — the mountain that shelters the bay"),
 'capmartin':  (43.75586, 7.47773, "Cap Martin, the turn of the coastal run"),
 'pointemartin':(43.75098, 7.48294, "the Pointe du Cap Martin, the outermost rock"),
 'capdail':    (43.72305, 7.39694, "Cap d'Ail, the other way along the shore"),
 'beausoleil': (43.74377, 7.42589, "Beausoleil, over the frontier and up the hill"),
}

# ---------------------------------------------------------------- write it out
out = io.StringIO()
out.write('''// Monaco, by its real coordinates and its real ground.
//
// The terrain is NASA's SRTM, by way of the AWS terrain tiles (terrarium
// encoding, zoom 14), resampled onto a %d m grid over the bay. It is the actual
// mountain: the Tete de Chien comes out within a few metres of its surveyed
// 573, La Turbie of its 480, and Mont Agel stands behind the town above a
// thousand, which is why the bay is sheltered "from behind against the wind and
// cold by mountains" as the book has it.
//
// FULL scale, the same frame as Paris: +x east, -z north, one metre to the
// unit. The origin is the head of Port Hercule at La Condamine, at game (%g, %g).
//
// TWO THINGS THE MODERN DATA GETS WRONG FOR 1902, both corrected here:
//
//  1. The SRTM's ocean mask is generous. It clamps the flat quarter of La
//     Condamine and the shore strip under Monte Carlo to zero along with the
//     water, which put the aerodrome in the bay. The waterline therefore comes
//     from OpenStreetMap's coastline, and the DEM is only ever raised to meet
//     it — never lowered, so its real hillsides stand untouched.
//
//  2. Monaco has grown into the sea since. Fontvieille (1966-73), the Larvotto
//     beaches (1960s), the outer digue (2002) and Mareterra (2024) are all in
//     both the DEM and the modern coastline, and none of them existed. They are
//     masked back to water, and no street is laid on them. Port Hercule, which
//     the thirty-metre DEM bridges as though it were solid, is dug back out.
//
// Regenerate with the script in docs/PERIOD_NOTES.md.

export const SCALE = 1;                        // real metres per game metre
export const ORIGIN = { lat: %.5f, lon: %.5f };
export const ORIGIN_XZ = { x: %g, z: %g };

const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = 111320 * Math.cos(ORIGIN.lat * Math.PI / 180);

/** A real latitude and longitude, in game coordinates. */
export function geo(lat, lon) {
  return { x: ORIGIN_XZ.x + (lon - ORIGIN.lon) * M_PER_DEG_LON,
           z: ORIGIN_XZ.z - (lat - ORIGIN.lat) * M_PER_DEG_LAT };
}
/** ...as a bare pair. */
export function xz(lat, lon) { const p = geo(lat, lon); return [Math.round(p.x), Math.round(p.z)]; }

/**
 * The places, by their true coordinates. Every one of these came out of
 * OpenStreetMap by name: placing them from memory had put the Tete de Chien two
 * kilometres north of where it stands and the palace four hundred metres east.
 */
export const PLACES = {
''' % (STEP, OX, OZ, LAT0, LON0, OX, OZ))
kw = max(len(k) for k in PLACES)
for k, (a, b, why) in PLACES.items():
    out.write('  %-*s [%.5f, %.5f],   // %s\n' % (kw + 1, k + ':', a, b, why))
out.write('''};

/** A named place, in game coordinates. */
export function place(id) { const p = PLACES[id]; return p ? geo(p[0], p[1]) : null; }

// ---------------------------------------------------------------------------
// The ground: Int16 metres above the sea, little-endian, base64 — %d samples on
// a %d m grid, %d by %d, over seven and a half kilometres by six.
const HF_DATA = '%s';

function decodeHF(s) {
  const bin = atob(s);
  const buf = new ArrayBuffer(bin.length);
  const b8 = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) b8[i] = bin.charCodeAt(i);
  return new Int16Array(buf);
}

export const HF = { x0: %d, z0: %d, step: %d, nx: %d, nz: %d, h: decodeHF(HF_DATA) };

/** The ground at (x, z), bilinear off the grid. Out at sea it is 0. */
export function groundAt(x, z) {
  const fx = (x - HF.x0) / HF.step, fz = (z - HF.z0) / HF.step;
  const i = Math.floor(fx), k = Math.floor(fz);
  if (i < 0 || k < 0 || i >= HF.nx - 1 || k >= HF.nz - 1) return 0;
  const tx = fx - i, tz = fz - k;
  const a = HF.h[k * HF.nx + i],       b = HF.h[k * HF.nx + i + 1];
  const c = HF.h[(k + 1) * HF.nx + i], d = HF.h[(k + 1) * HF.nx + i + 1];
  const v = a * (1 - tx) * (1 - tz) + b * tx * (1 - tz)
          + c * (1 - tx) * tz       + d * tx * tz;
  return v > 0 ? v : 0;
}

/** True where the ground is at or below the sea — the 1902 shore. */
export function isSea(x, z) { return groundAt(x, z) <= 0.05; }

/** The steepness at (x, z), as a gradient. A cliff is no place for a shed. */
export function slopeAt(x, z) {
  const d = HF.step;
  const gx = (groundAt(x + d, z) - groundAt(x - d, z)) / (2 * d);
  const gz = (groundAt(x, z + d) - groundAt(x, z - d)) / (2 * d);
  return Math.hypot(gx, gz);
}
''' % (len(vals), STEP, nx, nz, hf_b64, X_MIN, Z_MIN, STEP, nx, nz))
io.open(r'C:\Users\James\Desktop\MyAirships\src\monaco_geo.js', 'w',
        encoding='utf-8', newline='\n').write(out.getvalue())

s = io.StringIO()
s.write('''// Monaco's streets, 1902 — from OpenStreetMap, screened to the period.
//
// GENERATED. See monaco_geo.js for the frame and how to regenerate.
//
// Monaco grew in three bursts and the screen follows them: the Rock is
// medieval, La Condamine and Monte Carlo are Charles III's (1860-1889), and
// everything named for a twentieth-century person, driven through the mountain,
// or standing on made ground is later and is not here. %d ways survive of the
// %d OpenStreetMap offers, under %d period names.
//
// The lanes on the Rock are tagged as footways there, because it is closed to
// carriages now; they are the medieval alignments all the same, and it is the
// alignment being placed rather than the name over it.
//
// Full scale, +x east, -z north, the head of the port at (%g, %g).

export const STREETS_MC = [
''' % (len(streets), n_osm, len(kept_names), OX, OZ))
for st in sorted(streets, key=lambda a: (-a['w'], a['name'])):
    pts = ','.join('[%g,%g]' % (p[0], p[1]) for p in st['pts'])
    s.write('  { name: %s, w: %d,%s frontage: true, pts: [%s] },\n'
            % (json.dumps(st['name'], ensure_ascii=False), st['w'],
               ' rail: true,' if st['rail'] else '', pts))
s.write('];\n')
io.open(r'C:\Users\James\Desktop\MyAirships\src\monaco_streets.js', 'w',
        encoding='utf-8', newline='\n').write(s.getvalue())
print('written: %d x %d heightfield, %d streets' % (nx, nz, len(streets)))
