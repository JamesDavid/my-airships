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

**DONE** — [STLOUIS_PALACES.md](STLOUIS_PALACES.md). It came out better than
photographs alone would have: the fair published an Official Guide while it was
standing, describing buildings the writer could walk out and look at, and it
names for each palace exactly the five things below. Every figure in the notes
is cited to a line of the Cornell scan so it can be re-checked.

The single most valuable finding was the colour, and it was not what anyone
would have guessed. The guide: *"The color of the exhibit buildings is ivory
white, **with dashes of color on the roofs**."* So `0xefe9dc` was right all
along and the **roofs** were the error — they were all one grey, and Machinery's
were red with green tower caps while Mines was "distinguished by a lavish use of
color."

What was wanted from the photographs, per building:

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

## Order of work — all of it done

1. ~~**Art Hill's height**~~ — `world_stlouis.js`, and now `stlouis_geo.js`.
2. ~~**Notes on the palaces**~~ — [STLOUIS_PALACES.md](STLOUIS_PALACES.md).
3. ~~**Georeference the plat**~~ — `src/stlouis_geo.js`.
4. ~~**Trace the footprints**~~ — `src/stlouis_plan.js`.
5. ~~**Model from the notes**~~ — `src/world_stlouis.js`.

### How steps 3 and 4 actually went

They were supposed to be hand work — "there is no way round doing it by eye."
There was one. The draughtsman filled every main exhibit palace with the same
pink wash and **nothing else on the sheet is that colour**, so the palaces can
be *segmented*: `tools/trace_stlouis_plat.py` thresholds the wash, labels the
blobs and reduces each to a centroid and a principal axis. Thirteen palaces come
out of it as measurements rather than estimates.

`tools/gen_stlouis_geo.py` then fits three things, and each has a check:

| | fitted from | checked against | result |
|---|---|---|---|
| axis | the fan's mirror symmetry — three mirror pairs, each giving the axis twice | Education and Electricity are mirror images and come out **sharing an x to 1.1 m** | 120.3° on the sheet |
| scale | Machinery, a plain 1,000 × 525 ft rectangle measuring 110.2 × 58.0 px — an aspect of 1.900 against a true 1.905 | the Concourse's fourteen acres (14.5), the six palaces' 525 ft width (median 2.75), the guide's "two miles from E. to W." (1.97) | **2.75 m per pixel** |
| bearing | the Art Museum and the flight cage, both still standing, both found in OSM by name | the angle they subtend on the sheet and on the earth differ by **under two degrees** | +276.8° |

**Residual: 23 m at the flight cage, 743 m from the anchor.** That is the honest
error bar on the whole world.

Only one of the four control points in the table above was actually needed. The
Grand Basin turned out to be useless — today's Emerson Grand Basin is a long
lake and the 1904 basin was a 600 ft semicircle, so their centroids are not the
same point — and the U.S. Government Building's supposed successor, the 1909
World's Fair Pavilion, stands on the **Missouri** building's site, 180 m away.
Two exact points and the fair's own symmetry did the work of four.

### And what the checking caught

`tools/check_stlouis.py` tests overlap, water, hill and course clearance
numerically. It found two real faults that no screenshot would have shown:

- the lagoon arms, drawn across the fan by eye, **ran through Electricity's
  corner**. Replaced with moats set out from the footprints, which is what
  "entirely surrounded by lagoons" actually means — and the gap between
  Electricity and Machinery is only 41 m, so the water had to be sized to fit.
- a race pylon stood **36 m from the Steam, Gas and Fuels building**. The
  triangle is now chosen by sweeping centre, radius and rotation against every
  built thing in the world: 222 m clear, and a course length within 3% of the
  one the race limit was tuned on.

It also re-cut **The Basin Sprint**, whose six gates were all in the old frame —
they would have stood over open park a kilometre from the things they are named
for. Bumped to `v: 3`, which retires the old times, because it is a different
course now.
