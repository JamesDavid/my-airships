# St. Louis, 1904 — what it would take to survey it

Paris and Monaco were re-surveyed from live data (see
[PERIOD_NOTES.md](PERIOD_NOTES.md)). **St. Louis cannot be, and the reason is
worth writing down before anyone tries.**

## Why the OpenStreetMap flow does not apply

Paris and Monaco work because those cities *persisted*: the streets are still
there, so today's geometry can be screened back to 1901. The Louisiana Purchase
Exposition was staff and plaster, put up for a season and pulled down in 1905.
Of the whole fairground essentially two things survive — the Palace of Fine Arts
(now the Saint Louis Art Museum) and the Flight Cage.

Run the OSM flow over Forest Park and you import 2026: golf courses, the zoo,
modern park roads. That is not a period screen, it is contamination. **Do not do
it.**

## Why the terrain flow barely applies either

Measured off the terrain tiles (USGS 3DEP over the United States), along the
fair's grand axis from the Grand Basin up to the museum terrace:

```
m along   height
     0    153.8      the basin
   100    157.3
   200    162.2
   267    164.7      the crown begins
   400    164.5      flat across the top

rise 12.1 m over 417 m   crest 11.6 m above the Grand Basin
```

Two things follow.

**Art Hill is nearly four times too tall in the game.** `world_stlouis.js` builds
it as a truncated cone 46 m high (base radius 220, crown radius 96). The real
rise is about 12 m of ground, over roughly 230 m of slope — about 5% — and then
a genuinely flat crown, which is why Festival Hall could stand on it. The
commonly quoted figure for Art Hill is 60 feet (18 m); the difference from the
measured 12 m is the basin's water surface versus the ground at its lip, plus
the museum's own terracing. **Somewhere between 12 and 18 m is right. 46 is not.**

**DONE.** The hill is 16 m, inside that band. Everything that stood on it is now
derived from `HILL_H` rather than written out — the crown, Festival Hall's
bedding, its collider, the landmark's fly-over height and the vista — and the
Cascades are fitted to the mound's actual face, running from where the crown
breaks down to where the mound meets the level, at the length and pitch that
slope measures. Correct the height again and they follow it.

**And the modern ground is not the 1904 ground.** The fair regraded Forest Park
enormously — the River des Peres was culverted *for* the fair, the lagoons were
excavated for it, and much was undone afterwards. Art Hill and the Grand Basin
survive because they are the part that was kept. The rest of the DEM is
post-fair. So the DEM is a **check on the hand-built landforms**, not a
replacement for them.

## What a real survey of the fair would be

Not a data feed. A georeferencing job.

**The source** is the official plat of the Louisiana Purchase Exposition, 1904 —
the fair published detailed plans, and the Missouri Historical Society and the
Library of Congress hold them along with the Rand McNally and official guide
maps. What is needed is one plan, scanned, with enough identifiable control
points to tie it to real coordinates.

**The control points** are the things that still exist and can be found in
OpenStreetMap today, which is the one honest use of OSM here:

| feature | why it works |
|---|---|
| Palace of Fine Arts / Art Museum | standing, same footprint, same place |
| the Grand Basin | still there, still the same basin |
| the Flight Cage | standing, 1904 |
| Art Hill's crown | the landform, from the DEM above |

Four points is enough for an affine fit; more is better. With that, the plat's
pixel coordinates become lat/lon, and lat/lon becomes the game frame through the
same projection Paris and Monaco use — a `stlouis_geo.js` with an `ORIGIN` and a
`PLACES` table, exactly like `monaco_geo.js`.

**Then the palaces are traced by hand** off the plat: Education, Manufactures,
Electricity, Machinery, Transportation, Mines and Metallurgy, Liberal Arts,
Varied Industries, the twelve of them round the Grand Basin and the lagoons,
plus Festival Hall, the Colonnade of States, the Cascades, the Pike, and the
Aeronautic Concourse where the airship contest was actually held. That is a
few hundred polygons, and there is no way round doing it by eye.

## The buildings themselves

The plat gives footprints. It does not give what they looked like, and the
palaces were not plain boxes — they were Beaux-Arts exhibition halls with domes,
colonnades, corner pavilions and enormous arched entrances.

There is abundant photographic material: the Exposition was one of the most
heavily photographed events of its decade, and the official photographic
company's plates, the stereographs, and the Library of Congress's collection are
all public domain by age. The Missouri Historical Society's collection is the
deepest.

**This part has not been done, and it should be done before the modelling, not
after.** What is wanted from the photographs, per building:

- the roofline: dome, barrel vault, or flat with a parapet
- how many storeys the façade reads as, and the order of the columns
- the entrance: arch, portico, or colonnade, and roughly how wide against the
  building's own width
- the colour. They were not white — the "Ivory City" was a warm cream, and
  contemporary accounts and hand-tinted plates agree on that. The game's
  `0xefe9dc` is a reasonable start and should be checked against tinted sources.
- what stood on the roof: statuary groups, flagstaffs, quadrigae

A page of notes per palace, with a source cited for each, is the deliverable —
the same discipline as [HULLS.md](HULLS.md) and [HELM.md](HELM.md), where the
quote comes first and the geometry follows from it.

## Order of work

1. ~~**Art Hill's height**~~ — done.
2. **Photographic notes** on the palaces, one page each, sources cited.
3. **Georeference the plat** against the four surviving control points; emit
   `src/stlouis_geo.js`.
4. **Trace the footprints**; emit `src/stlouis_plan.js`.
5. **Model from the notes of step 2**, not from imagination.

Steps 3 and 4 are the long ones and they are hand work. Step 2 is what makes
step 5 worth anything, which is why it comes before the tracing and not after.
