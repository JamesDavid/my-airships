# Paris, 1901 — what it would take to finish it

[STLOUIS_PLAT.md](STLOUIS_PLAT.md) is a plan for a city that no longer exists.
This is the opposite problem, and it is worth saying why before anything else:

> **Paris persists.** The streets Santos-Dumont flew over are still there, still
> named, still the same width. The hills he had to climb over are the same
> hills. So unlike St. Louis, everything here can be *fetched* — and most of the
> work left is not survey, it is **screening**: separating the 1901 city out of
> the 2026 one.

Two of the three surveys are already done and they are good. The terrain is
IGN's national bare-earth model at 50 m, mean error 3.2 m
([PERIOD_NOTES.md](PERIOD_NOTES.md)). The Seine is walked through OSM's own
ordered ways, and after `tools/repair_seine.py` it is 198 stations with no
duplicate, no self-crossing and no turn over 94°.

The third — **the streets, and therefore the city** — is barely started, and
this document is mostly about that.

---

## What is measurably here now

Everything below was counted, not remembered:

| | |
|---|---|
| surveyed street | **65.4 km** over 336 ways |
| …against 1901 Paris | roughly **1,000 km** inside the fortifications |
| street coverage | **51%** of a 200 m grid inside the city has a street within 200 m |
| the other half | **30%** of the city is more than **600 m from any street at all** |
| buildings | 3,268 — **every one of them procedural**, generated as frontages along those 336 ways |
| real building footprints | **none** |
| named places in `paris_geo.PLACES` | 27 |
| …of which actually modelled | 16 |
| the Seine | 198 stations, 20.3 km drawn, one 3.3 km gap in the data |

## What the pilots have already said about it

Bug reports are the cheapest survey there is. Five were open; three are fixed
and **two are this document**:

- **#28 "no roads in paris again?"** — filed at (−25, 2059). There is a street
  115 m away. There is also, thirty per cent of the time, nothing within six
  hundred metres. This is not a bug, it is the coverage number above, and it is
  the single most visible thing wrong with Paris from the air.
- **#29 "building right at the end of bridge in the spot a road looks like it
  should be"** — filed at (318, 933). Six procedural buildings stand within
  100 m of it. With 7% of the street network, the frontage generator has to put
  three thousand buildings along sixty-five kilometres of road, so it packs them
  where the roads are and leaves the rest of the city empty — and nothing tells
  it that a bridge approach is not a building plot.

Both are the same fault seen from two directions. **Fix the street network and
both go away**, because the buildings are placed by the streets.

---

## Why the street network is thin, and it is not the bbox

The query is recorded at the head of `src/paris_streets.js`:

```
way[highway~"^(primary|secondary|trunk)$"][name](48.840,2.220,48.895,2.375)
```

The bbox is right — it matches the world's frame to within a few hundred metres
in both axes. **The class screen is what costs 93% of Paris.** `primary`,
`secondary` and `trunk` are the modern through-route classification; almost
every street inside a Haussmann block is `tertiary`, `residential` or
`unclassified`, and those are the streets that make a city read as a city from
two hundred metres up.

**And the tool that ran it is not in the repository.** Monaco has
`fetch_monaco_osm.py`; the terrain has `fetch_paris_dem.py`; the Seine has
`fetch_paris_seine.py`. The streets have a comment. That is the first thing to
fix, because nothing else here is repeatable until it is.

---

## The one great thing that is missing entirely

**The Thiers fortifications.** In 1901 Paris was a walled city: a continuous
bastioned enceinte about 33 km round, with a cleared glacis outside it and a
military road inside. It was not demolished until 1919–29. Every one of
Santos-Dumont's Paris flights began, ended and was watched from inside it, and
an airship at 150 m would have had it in view as the definite edge of the city
— which is exactly the thing the current world lacks, where Paris simply thins
out into countryside.

**It can be traced, and the method is pleasing.** The Boulevard Périphérique
(1973) was laid along the line of the demolished wall, and the Boulevards des
Maréchaux run just inside it. Those are the two things the current screen
*drops by name as anachronisms* — so the alignments already known to be wrong
for 1901 are precisely the ones that record where the 1901 wall stood. The same
logic as the St. Louis control points: one honest use of modern data to find
something that is gone.

Fetch the Périphérique's centreline, offset it inward to the enceinte's line,
and check it against the surviving bastions and the `Rue du Général-...`
military road remnants.

---

## The eleven places that exist only as coordinates

`paris_geo.PLACES` names 27 landmarks. `world.js` models 16. These are in the
table, correctly located, and have never been built:

> petitpalais · madeleine · **louvre** · bastille · hoteldeville · gareorsay ·
> chatelet · republique · vendome · autueil · vaugirard

Several of them matter for 1901 specifically:

- **Gare d'Orsay** opened 28 May 1900 — brand new, and a very distinctive
  riverside mass right where the Deutsch runs crossed the river.
- **Petit Palais** and the **Pont Alexandre III** are 1900 Exposition work,
  a year old and gleaming.
- **Vaugirard** is Lachambre's balloon works — where Santos-Dumont's envelopes
  were actually made. It is the one address in the list that belongs to *him*.

---

## What still needs screening, and what the record has to settle

The 1901 screen is not just "drop the motorways". Things that were different,
and that a source has to settle rather than memory:

- **Sacré-Cœur was a building site.** Begun 1875, consecrated 1919. The dome was
  up by about 1899, the campanile not until 1914. `PLACES` already carries the
  note "then rising"; what it looked like in 1901 needs a dated photograph, and
  Montmartre is on the skyline from most of the map.
- **The Palais du Trocadéro** (1878) stood until 1937 — so the *Chaillot* palace
  that is there today is wrong, and the world already knows this.
- **The Galerie des Machines** (1889) still stood on the Champ de Mars until
  1909 — a 111 m clear span next to the Tower, and absent.
- **The 1900 Exposition** closed in November 1900 and was being demolished
  through 1901. `addExpoPavilions` puts pavilions along the river; *which* ones
  were still standing in October 1901, when the Deutsch prize was won, is a
  question with a dated answer.
- **The Métro** opened in July 1900 — surface works, entrances, spoil.

---

## Order of work

1. ~~**`tools/fetch_paris_streets.py`**~~ — **DONE.** The query is in the
   repository now, broadened to `tertiary|residential|unclassified`, and it
   writes `src/paris_streets_minor.js` rather than touching the existing 336
   (whose own tool is missing, so re-deriving them would be guessing at a screen
   that is already right). 4,122 ways, 546 km.

   | | before | after |
   |---|---|---|
   | street | 65.4 km | **623.5 km** |
   | ways | 336 | **4,462** |
   | within 200 m of a street | 51% | **91%** |
   | over 600 m from any street | 30% | **0.2%** |
   | buildings | 3,268 | 5,967 |

   The enceinte, which the screen needs and which was pulled down in 1919-29,
   is traced off the **commune boundary** rather than the Périphérique — the
   wall *was* the city limit, so the boundary still follows it, and it is one
   closed ring instead of a hundred motorway ways. Selected by INSEE code
   75056, not by relation id, because there are ten communes called Paris and
   picking by id had it tracing the fortifications of **Paris, Tennessee**. A
   sanity check on the ring's radius about Châtelet is what caught that.

   The minor streets are drawn in full but build at a quarter of a boulevard's
   density: at full density six hundred kilometres of street generates some
   fifty thousand frontages.

2. ~~**`tools/check_paris.py`**~~ — **DONE.** The twin of `check_stlouis.py`,
   and it reads only the checked-in data, so it needs no browser: the faults
   live in the data, which is the point. It tests the heightfield against its
   own header, the Seine for zero-length segments / self-approach / spikes /
   gaps, that the bed is under the water everywhere, the street coverage figures
   in this document so they cannot silently rot, every named place against the
   survey's frame, every gate against its ground, and that the tower gate is cut
   to the tower this world actually builds.

   It also asserts the **`RIVER_GAP` guard is still in all four places** in
   `world.js`. Its first run reported a street "crossing" the phantom reach as a
   failure — which was the test being wrong, not the world: a straight line over
   three kilometres of Meudon is bound to be crossed by something, and the guard
   already skips it. What matters is that the code keeps skipping it, so that is
   what is asserted now.

3. **Real building footprints** for the Haussmann core, from OSM, screened the
   same way the streets are. The core is largely unchanged since 1901, which is
   the whole reason this is possible; the point is to stop the Louvre being a
   procedural box the size of a Louvre-shaped block.

4. ~~**The Thiers enceinte**~~ — **DONE.** `src/paris_wall.js`, 5.6 km of
   rampart in two runs, built as a bastioned earthwork with a parapet and
   draped on the terrain. The city now stops at a wall instead of thinning out.

   The obvious source turned out to be the wrong one. The commune boundary
   follows the wall — that is what the street screen uses — **except round the
   two Bois**, annexed in 1859 and lying *outside* the enceinte, where the
   boundary runs along the far edge of the wood up to two kilometres beyond the
   rampart. The Bois de Boulogne is the western side, which is the side inside
   this map and the side every Deutsch flight crossed. So the wall is traced off
   the **Périphérique** after all, exactly as first proposed.

   Only a sixth of the ring is in frame at all: the world is centred on the
   Tower and reaches west to Saint-Cloud, so eastern Paris is off the map.

5. **The eleven landmarks**, modelled from photographs with a source cited per
   building — the same discipline as
   [STLOUIS_PALACES.md](STLOUIS_PALACES.md), [HULLS.md](HULLS.md) and
   [HELM.md](HELM.md), where the quote comes first and the geometry follows
   from it.

6. ~~**Close the Seine's 3.3 km gap**~~ — **RESOLVED, and it was never a hole
   in the data.** Measured: the gap *starts* 18 m from the survey's southern
   edge and *ends* 29 m from it, and the real reach between them runs **2,005 m
   beyond** that edge — the Seine loops south through Meudon and Sèvres, right
   out of the world, and comes back at Saint-Cloud.

   So the river is not torn. It leaves the map and returns, which is what a map
   edge looks like, and `RIVER_GAP` is the complete and correct treatment rather
   than a patch over something missing. Actually closing it would mean extending
   the survey two kilometres south — a re-fetch of the IGN model over a bigger
   frame and a regeneration of `paris_terrain.js` — which is a different job
   from this one and buys two kilometres of water nobody flies over.

   `check_paris.py` now asserts the distinction, because it is the one that
   matters: **a gap whose ends stand on the frame is the map ending; a gap with
   an end in open country is a torn walk, and that would be a fault.**

Steps 1 and 2 are the ones that pay for themselves immediately. Step 1 is also
the only one of the six that any pilot has actually asked for, twice.

7. **RE-LAY THE SAINT-CLOUD SCENE against the real bank.** Two pilots filed
   this on the same minute and it is the largest thing still wrong with Paris:

   > "Longchamps racecourse has a bridge in the middle of it? I thought you
   > cleaned this up."
   > "This is a modern map but the river and where things are is the same.
   > Let's make the Saint Cloud, bois, aero club and longchamp course
   > realistically detailed given their prominence in the story."

   They are right, and the cause is measurable. The whole Saint-Cloud group —
   the Pont de Saint-Cloud, the Avre aqueduct, the village, the church, the
   Paris–Versailles road — is laid out in the world's **old half frame** and
   converted by `H2`. The conversion is still correct; the ground under it is
   not. The aerodrome moved to the Aéro-Club's true position when the world was
   re-surveyed, and the Seine moved to OpenStreetMap's, and none of these
   hand-placed objects followed:

   | | stood | should be near |
   |---|---|---|
   | Avre aqueduct | 564 m from any water, **9 m from Longchamp's centre** | on the river |
   | Pont de Saint-Cloud | 636 m from any water | on the river |
   | Deutsch's air-ship shed | **3.9 km from the aerodrome** | "scarcely two air-ships' lengths" from Santos-Dumont's doors |
   | village church | 187 m from the river | in the village |

   Both crossings are now snapped onto the surveyed river, which clears the
   racecourse and puts a bridge over water instead of over grass. **That is a
   patch, not the fix.** The group's *internal* layout is wrong too: it puts the
   bridge 612 m east of the village where the real one is 469 m west, so no
   rigid translation can save it. It has to be re-laid — the village on the west
   bank, the aerodrome on the flat, Deutsch's shed beside Santos-Dumont's, the
   Paris–Versailles road actually running through them — against real
   coordinates, the way the palaces of St. Louis were.

   This is the most-flown corner of the map: every Deutsch run starts here.

---

## What this does **not** propose

Said plainly so nobody spends a week on it:

- **Not a photogrammetric Paris.** The world is a 1901 airship simulator, and
  the pilot is at 100–300 m doing 40 km/h. Massing, skyline and street pattern
  are what read at that distance. Window mullions do not.
- **Not modern OSM buildings imported wholesale.** Outside the Haussmann core —
  the Bois, the suburbs beyond the enceinte, La Défense — today's footprints are
  worse than nothing, exactly as importing today's Forest Park would have been
  in St. Louis.
- **Not a hand-traced anything.** Paris has been hand-traced twice already and
  both attempts had to be thrown away: the avenues drawn in the old half-frame
  whose coordinates were merely doubled, and the twenty-eight-point Seine that
  ran 1.5 km wide of the real river and spent a fifth of its length on dry land.
  If it cannot be fetched and screened by a script in `tools/`, it should not
  go in.
