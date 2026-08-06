# Period research notes — Paris 1901 & Monaco 1902

Supplementary to BOOK_REFERENCE.md; sources at bottom. These drive the world-building
choices in `src/world.js` and `src/world_monaco.js`.

## Paris, 1900–1903

- **The 1900 Exposition Universelle** covered ~112 ha along the Seine from Les Invalides
  to the Champ de Mars. Santos-Dumont's Deutsch Prize flights (1901) crossed this
  landscape; his No. 5/No. 6 photographs show exposition-era riverfront.
- **La Grande Roue de Paris** (1900): a 100 m Ferris wheel near the Champ de Mars
  (avenue de Suffren), standing until 1920 — visible in period photos with the Tower
  behind. → modeled south of the Champ de Mars, slowly turning.
- **Old Palais du Trocadéro** (1878): Moorish-Byzantine rotunda with two slim ~80 m
  towers and long curved wings, directly across the Seine from the Tower ("the Trocadero
  was seen through the base of the Eiffel Tower"). The Trocadéro hotels' courtyard is
  where the No. 5 was wrecked. → rotunda + twin towers + curved wings modeled.
- **Grand Palais** (1900): stone colonnade with the great glass barrel roof, off the
  Champs-Élysées. → modeled with translucent glass vault.
- **Seine geography**: the river loops *around* the Bois de Boulogne — from the Champ de
  Mars/Passy reach it curves west, then runs between the Bois and the St. Cloud heights.
  The Aéro Club grounds at St. Cloud were on the west bank: the race crossed the river
  immediately after the start, and again at the Tower. → second (western) river reach
  added under the start ring.
- **Skyline landmarks** of the day: Notre-Dame's twin towers, the Panthéon dome, the
  Opéra, Sacré-Cœur rising on Montmartre (domes complete by ~1899), Les Invalides' gold
  dome. Haussmann blocks: cream limestone façades, iron balcony lines at the 2nd and 5th
  floors, zinc mansard roofs, chimney-pot clusters.
- **River traffic**: barges and bateaux-mouches steamers on the Seine.

## Monaco, winter 1902

- **Tête de Chien** (556 m): the rock promontory dominating the principality from behind,
  with La Turbie above — the "mountains sheltering the bay" of the book. → one dominant
  massif modeled behind the amphitheatre of hills.
- **Monte Carlo Casino** (Garnier, embellished through 1900 — the clock returned to its
  central position that year): cream Belle Époque palace, seaside towers with green
  copper cupolas, on the Monte Carlo height NE of the port. Hôtel Hermitage luxury
  rebuild 1900. → casino with twin cupola towers + clock face; terraced hotels stepping
  down to La Condamine.
- **Port Hercules / La Condamine**: the harbor quarter where the Prince built
  Santos-Dumont's aerodrome on the Boulevard de la Condamine, over the sea wall from
  the pebble beach (book A9/A11).

## The crossings at Saint-Cloud (implemented)

The Seine's western reach carried three structures in a fixed order, and the
game places them at half scale in that order and spacing:

1. **Pont de Saint-Cloud** — the stone road bridge on the Paris–Versailles road,
   upstream of the others. Carries the road out of the town, over the river and
   on into the Bois toward Longchamp.
2. **Passerelle de l'Avre** — Gustave Eiffel's iron aqueduct-footbridge of 1891,
   carrying Avre water to Paris "à la lisière du bois de Boulogne". It stands
   **0.5 km downstream** of the Saint-Cloud crossing (250 m here), which puts it
   under the homeward line of the Deutsch course — exactly as the book's plate
   "Returning to Aéro Club Grounds above Aqueduct" shows. No road: a water
   conduit with a footway, running into an earth embankment at each bank.
3. **Pont de Suresnes** — **1.5 km downstream** of the Avre passerelle (750 m
   here), with the Île de Puteaux below it and Neuilly St James beyond.

Sources: fr.wikipedia.org/wiki/Passerelle_de_l'Avre (position in the succession
of Seine crossings: "Viaduc de Saint-Cloud à 0,5 km amont, Pont de Suresnes à
1,5 km aval"; Eiffel, inaugurated 1891); structurae.net/en/structures/avre-aqueduct;
en.wikipedia.org/wiki/Pont_de_Saint-Cloud.

## Wind-reading (goal: environment as instrument)

Period-plausible wind tells implemented: water surface streams downwind (wave-normal
scroll driven by the live wind vector); trees and scrub sway and lean; flags on the
aerodrome, the Tower, and the Arc stream; chimney smoke over the city and steamer smoke
in the bay drift downwind; anchored yachts ride head-to-wind; clouds (cumulus and high
cirrus) drift with the gradient wind.

## St. Louis, 1904 — the fan plan

The official ground plans (Library of Congress; Missouri Digital Heritage; AGS
Library/UWM) show the fair's celebrated fan: **Festival Hall** on Art Hill at the
apex, the **Cascades** spilling down to the **Grand Basin**, and the great
exhibit palaces arranged in radiating arcs around lagoon-lined avenues.
**The Pike** — the mile-long midway of attractions — ran along the northern
edge, with the **Observation Wheel** (the rebuilt 1893 Ferris giant) beside it,
and the **Louisiana Purchase Monument** column on the plaza. The **Aeronautic
Concourse** at the western edge hosted the airship trials. → all modeled:
palace fan with tangent orientation, lagoon avenues with water, Pike attraction
rows with entrance arch, monument, cascades.

## Monaco, from the survey (implemented)

Monaco used to be eight hand-placed cones and an invented street skeleton on a
half-scale frame, and the errors were the same kind Paris had before it was
re-surveyed: the Tête de Chien stood two kilometres north of the mountain it
actually is, and the palace four hundred metres east of the Rock. It is now
built from real data, at full scale, in the same frame as Paris — +x east,
−z north, one metre to the unit.

**Terrain — `src/monaco_geo.js`.** NASA's SRTM, by way of the AWS terrain tiles
(terrarium encoding, zoom 14, no key and no auth):

```
https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
elevation = (R * 256 + G + B / 256) - 32768
```

A 7×7 block of tiles is resampled onto a 50 m grid, 149 × 125, over 7.4 km by
6.2 km, and shipped as base64 Int16. It is the actual mountain, checked against
the surveyed heights:

| | surveyed | in the game |
|---|---|---|
| Mont Agel | 1085 m | 1093 |
| Tête de Chien | 573 m | 534 (a sharp summit on a 50 m grid) |
| Trophy of Augustus, La Turbie | 480 m | 487 |
| Casino terrace | ~50 m | 50 |
| the Rock | ~50–60 m | 47 |
| the sea | 0 | 0 |

**The coast is not the modern coast**, and this is where the work was. Two
things had to be undone:

1. *The SRTM's ocean mask is generous.* It clamps the flat quarter of La
   Condamine and the shore strip under Monte Carlo to zero along with the water
   — which put the aerodrome in the bay. OpenStreetMap's own `natural=coastline`
   was tried as a replacement waterline and abandoned: the ways around Monaco do
   not stitch into one clean ring (harbour, digue and modern basins interleave),
   and point-in-polygon over the result came out *speckled*, alternating land and
   water across the same quarter every fifty metres. Sidedness against the
   nearest piece is worse — inside the mouth of a harbour the nearest piece is a
   quay pointing the other way. What is used instead cannot come apart: **where a
   street ran, there was land.** The period street plan floors the ground in a
   42 m corridor along itself.

2. *Monaco has grown a long way into the sea since 1902.* Fontvieille (1966–73),
   the Larvotto beaches (1960s), the outer digue (2002) and Mareterra (2024) are
   all in both the DEM and the modern coastline. They are masked back to water,
   guarded by a height test so a slack polygon can never bite into the Rock, and
   no street is laid on them. Port Hercule, which a 30 m surface model bridges as
   though it were solid ground, is dug back out.

   The result was checked against 204 probe points, asking OpenStreetMap for
   buildings within 55 m of each: 177 agree. Of the 27 that do not, most are
   *meant* to — they are today's buildings standing on ground that did not exist,
   in Fontvieille, on the digue and out at Le Portier.

The sea is written into the grid as a shelf three metres down rather than a flat
zero. It costs nothing and it buys the coastline: bilinear between a five-metre
quay and a −3 seabed crosses the waterline inside the cell, instead of stepping
round the grid in 50 m blocks.

**Streets — `src/monaco_streets.js`.** OpenStreetMap, screened to 1902. Monaco
grew in three bursts and the screen follows them: the Rock is medieval, La
Condamine and Monte Carlo are Charles III's (1860–1889), and everything named
for a twentieth-century person, driven through the mountain, or standing on made
ground is later. 340 ways survive of the 2,540 OSM offers, under 95 period
names. The lanes on the Rock come in as *footways* — it is closed to carriages
now — and had to be asked for separately; leaving them out lost the whole of
Monaco-Ville, palace and cathedral included. They are medieval alignments under
modern names, and it is the alignment being placed.

**Places.** Every landmark comes out of OpenStreetMap by name. None is typed
from memory, because typing them from memory is exactly what put the Tête de
Chien on the wrong mountain.

**Regenerating.** `tools/fetch_monaco_dem.py`, `tools/fetch_monaco_osm.py`,
`tools/gen_monaco.py` — see `tools/README.md`. The generator prints what it kept
and what it threw away; that output is the record.

**What the ground being real changed elsewhere.** `Airship.groundUnder()` — ground
contact, the wreck's resting height and the guide rope all measure from the
hill instead of from zero. `addBuildingMeshes` takes a base `y`, so a house on
the Boulevard des Moulins has sixty metres of rock under it. `makeClouds` takes
a box, a base height and a ground function, because the Paris defaults put every
cloud inside the Tête de Chien and every cloud shadow inside the hill. The
Harbor Circuit's gates and the Bay of Monaco scenario hang off `place()` rather
than being written out, for the same reason the Paris gymkhana does.

**Two things that looked like rendering bugs and were not.** The sea appeared to
z-fight in tan patches a few hundred metres out: it was the water *reflecting*
the clouds, whose flat low-poly undersides read as sandbanks with the waves
rippling over them. `keepOutOfReflection()` takes them out of the reflection
pass; their shadows still fall on the water, which is the cue that matters.
And the escort launches were making 340 km/h — the old tick read their "speed"
as a fraction of the whole five-kilometre lane, per second. They now sail at
five knots in a breath and seven with something behind them, walked along the
lane by **arc length** rather than by waypoint index (by index they surged
through the bends and dawdled on the straights), on a lane sampled every 25 m
and pushed clear of the water's edge — verified at 0 of 17,150 samples ashore.

**Still hand-modelled**, on true positions and true ground: the palace, the
cathedral, the Musée océanographique (in its scaffolding — begun 1899, not
finished until 1910), the Casino, the Salle Garnier, the Hôtel de Paris, the
Hermitage, the two forts, the Trophy of Augustus, the aerodrome and its
landing-stage. Building *footprints* from OSM are not done here or in Paris.

## Sources

- Getty Images / Alamy period photo collections of the Exposition Universelle 1900
  (Grande Roue with Tower behind; Trocadéro through the Tower's base):
  gettyimages.com/photos/exposition-universelle-1900, alamy.com/stock-photo/paris-1900-exposition.html
- Internet Archive, Edison films of the 1900 Exposition: archive.org/details/the-paris-e-xposition-universelle-1900
- Exposition Universelle 1900 overview: kids.kiddle.co/Exposition_Universelle_(1900)
- Monte-Carlo SBM company history (casino embellishments, 1900 clock; Hermitage 1900):
  montecarlosbm-corporate.com/the-company/history
- Architecture of Monaco: en.wikipedia.org/wiki/Architecture_of_Monaco
- Period photo, "Monaco Monte Carlo Avenue towards Condamine" (~1900, Possemiers):
  abebooks.com listing 22869524382
- 1904 World's Fair ground plans: Library of Congress (loc.gov/item/2007633932,
  Pharus-map loc.gov/item/99466762), Missouri Digital Heritage (official ground
  plan), AGS Library Digital Map Collection (UWM)


## The hulls and the shifting weights

Japanese silk with no net and no outer cover, the suspension taken straight off
battened hems sewn along the envelope's flanks; a ballonnet on the first two
ships and none after; piano wire in place of cord from the No. 4. The
counterweights are **two** sacks hauled inboard one at a time, not one weight
sliding along the keel. Set out with the passages in
**[docs/HULLS.md](HULLS.md)**.

## The helm

The helm is a **bar pivoted at its middle with a cord to each side of the rudder**, not a
ship's wheel. The English memoir says "steering wheel" once; the French original says *le
gouvernail*, and the word *volant* never appears in that sense. The full evidence — the
No. 4's "guidon de la bicyclette, relié au gouvernail", the rudder cords that break and
foul the screw, *la barre* at Monaco, and which way the bar moves — is in
**[docs/HELM.md](HELM.md)**.
