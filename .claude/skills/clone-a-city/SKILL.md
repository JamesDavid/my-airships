---
name: clone-a-city
description: Build a real city into a 3-D game world from open data, clamped to a historical year — terrain from a DEM, water and streets and building footprints from OpenStreetMap, landmarks on their true outlines — and keep it honest with an audit that fails. Use when asked to reconstruct a city or a place at a particular date, to add a city to a flight/driving/walking game, or to check whether an existing hand-built world matches the real one.
---

# Clone a city, at a year

Three cities were built this way for *My Airships* (Paris 1901, Monaco 1902,
St. Louis 1904). Everything below is what actually went wrong, twice, in each
of them. The fetching is easy and is not where the time goes.

## The two things that matter

**1. Nobody notices a wrong building until someone flies at it.** Twelve of
Paris's eighteen monuments were hand-built from period pictures and placed with
a position and nothing else — no rotation, no size. The Hôtel de Ville stood at
90° to its own street at exactly the right length. The Invalides was 349 m of
building drawn as a 65 m dome. The École Militaire was in the coordinate table
and in nothing else: not drawn at all, 264 m out. It took a player saying "the
trocodero palace seems like it is wrong rotation" to find any of it. Monaco was
identical: every landmark at `rotation.y = 0` and about half size.

**2. The audit is the deliverable, not the import.** Write the check that
compares the built world against the sources *first*, and make sure it fails
before you make it pass. Mine was wrong three times and every wrong version
failed in the direction that flatters. See "How the audit lies to you" below.

## The pipeline

Run in this order; each step is checkable on its own.

1. **Frame.** One anchor lat/lon and one projection, in metres. Every later
   number goes through it. `x` east, `-z` north for three.js.
   Keep it in one file (`<city>_geo.js`) and never let anything place by eye.
2. **Terrain.** A DEM (SRTM/Copernicus), resampled to a heightfield. Publish
   `groundAt(x, z)`; everything else asks it rather than assuming a plane.
3. **Water.** Coastline/river polygons from OSM. **Clamp the terrain under
   them** — a surveyed riverbed that pokes through the water plane z-fights,
   and looks exactly like a rendering bug.
4. **Streets.** The OSM street graph. Draw as one mesh, not one per segment.
5. **Buildings.** Footprints reduced to the **smallest-area oriented box**
   (rotating callipers over the convex hull) — never axis-aligned. A building
   sits at whatever angle its street does, and an axis-aligned box round a
   diagonal one is half again too fat.
6. **Landmarks.** Named monuments get the same treatment plus a hand-built
   model. This is the step everyone gets wrong; see below.
7. **Year clamp.** Research, not data. See below.
8. **Audit.** The loop that closes it.

`tools/city_footprints.py` in this repo does 5–6 for two cities and is the
template.

## Landmarks: fit, don't place

A landmark needs four numbers from the map — centre, long side, short side,
bearing — and then:

```
fitToBox(group, footprint):
    measure what the group actually DRAWS (walk its meshes)
    if it is drawn longer in Z than X, add 90° to the rotation and swap the scale
    position  = footprint centre
    rotation.y = footprint bearing
    scale      = (len/drawnX, 1, wid/drawnZ)      # HORIZONTAL ONLY
```

- **Scale horizontally only.** Heights are researched separately (a guide book,
  a photograph) and must not be scaled with the plan.
- **Colliders must follow the stone.** Have the fitter return the transform it
  applied and put every collider through it. A collider left behind is worse
  than none: the player hits a building that is not there and flies through the
  one that is.
- **Rotation convention.** `rotation.y = t` sends local +X to
  `(cos t, 0, -sin t)`. A box laid along a side running `(dx, dz)` wants
  `atan2(-dz, dx)`. Writing `-a` instead of `-(a + π/2)` stands every segment of
  a curved wall out from it like a fin — reported as "the wall pieces are 90
  degrees off", and it was exactly 90.
- **Curved plans are not rectangles.** For an arc, take the chord and the
  sagitta and derive the radius: `R = (c²/4 + s²)/2s`, subtending
  `2·asin(c/2R)`. The Trocadéro is a 426 m chord with a 117 m sagitta — an arc
  of radius 252 m spanning 115°, with the rotunda standing *on* the arc at its
  apex, not at the centre of the circle.

## Getting the outlines

- **Nominatim** with `polygon_geojson=1` gives a usable polygon for most named
  buildings, one query each. Cache the results and check them in, so the build
  runs offline and the service is asked once.
- **It returns a POINT** for anything mapped as a POI node inside a bigger
  building — the Casino de Monte-Carlo, the Hôtel de Paris. For those, ask
  Overpass for building ways in a small box and take the one that **contains**
  the node.
- **Do not fall back to "the largest building in the box."** It handed the
  Casino's own outline to the Hôtel de Paris — two landmarks, one building.
- **If you cannot identify it, do not fit it.** The Hôtel de Paris and the
  Hermitage are left out of Monaco's footprint set on purpose, and the tool says
  so where a reader will find it. Fitting to a footprint you cannot verify is
  worse than leaving the hand-placed guess.

## The year clamp

OSM is present-day. A city of year Y differs three ways and each needs different
handling. Keep them as an explicit table with a citation on every row.

| | what to do |
|---|---|
| **Not yet built** | Drop it. (Sacré-Cœur was unfinished in 1901.) |
| **Since demolished** | OSM cannot help. **Georeference a period plan against whatever survives.** |
| **Replaced on the same ground** | Use the successor's footprint and say so. |

The second is the important one and it generalises. St. Louis 1904 was a World's
Fair, demolished entire — so it is built from the fair's own 1904 ground plan,
georeferenced against the two things still standing (the Palace of Fine Arts,
now the art museum, and the Smithsonian flight cage). Running an OSM audit
against St. Louis would compare the world to buildings that do not exist. But
those two survivors *are* in OSM, and they are the anchors: check them and you
have checked the whole plat fit.

The third is why "the SITE is what matters": the Palais du Trocadéro was
replaced by the Palais de Chaillot, which stands on its substructure and keeps
its wings, so Chaillot's outline is the right source for the 1878 palace.

## How the audit lies to you

Write the audit, then break the world on purpose and confirm it fails. Mine
passed on a world that was wrong in twelve places. Three real failure modes, all
of which look like a working check:

- **It measures the neighbourhood.** "Every collider within 320 m that is tall
  or large" gave every monument a span of about 600 m — twice the search radius
  — and condemned all eighteen. Ask for the landmark's *own* pieces: publish
  them separately, or take the largest group standing on the site.
- **It measures nothing.** "The landmark's own colliders, centre to centre"
  gives anything built from a single box a span of **zero**, so the Eiffel
  Tower and eleven others measured as too small. Use each piece's own extent,
  and account for `scale` on every node — a child with `scale.x = 3` measured
  unscaled is a third of its real width.
- **It measures an angle that does not exist.** A near-square building's longest
  span is a diagonal and its bearing is meaningless; judged that way the
  Panthéon read 56° out just after being laid on its own footprint. Compare
  *oriented boxes*, by the same smallest-area rule on both sides, and only judge
  the angle where the real footprint is at least 1.5× as long as it is wide.

And the worst kind, which is not a lie but a trap: **a check that asserts the
presence of the broken code.** One here tested that the source read
`holdFor = 0` — the bug itself — so it passed for as long as the bug survived
and would have failed on any fix. Three attempts at that bug changed nothing.
If a check greps for source text, it can only tell you nobody has retyped it.

## After the fit, re-measure everything that touched the old geometry

Growing a building moves the world around it. Every one of these was caught by a
checker rather than by eye:

- **Course gates and rings.** A ring 66 m from the Trocadéro was open air at
  115 m across and swept by the galleries at 426. A ring beside Notre-Dame was
  clear while she was two boxes and a cone and is through her 69 m towers once
  she stands on her outline.
- **Gardens and approaches.** The Trocadéro's cascade began 34 m from the
  rotunda and ended up buried inside a palace reaching 109 m down its own axis.
- **Anything placed by a landmark's height.** A collectible hung at 86 m went
  up twice, to 106 and then 132, as the towers first moved onto higher ground
  and then grew to their true 82 m.
- **Duplicates.** Paris had **two Madeleines** — a 38 m box placed by eye and
  the measured 128 m temple on the same ground behind it. Fitting exposed it.
- **Decorative geometry skewing the fit.** A four-sided cone turned 45° has its
  corners off the axes, so a pyramid roof's own footprint is a diamond and tilts
  the fit of the building under it. Draw roofs square to the plan.

## Definition of done

- Every landmark within tolerance: 60 m of position, a third of the span, 20°.
- The check runs **offline** from checked-in data, and fails when the fitting is
  removed. Verify that by removing it.
- Every course, ring, garden and spawn re-measured against the new geometry.
- Anything not fitted is listed, with the reason, in the file a reader will open.
