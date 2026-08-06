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

2. **`tools/check_paris.py`**, modelled on `check_stlouis.py`. In St. Louis the
   checking script found two real faults nothing else would have — a lagoon
   through a palace corner and a pylon 36 m from a building. Paris has never
   had one. It should test: buildings in the river, buildings off their ground,
   gates under the terrain, streets crossing the Seine without a bridge, the
   river's own geometry (the checks `repair_seine.py` already makes), and the
   coverage figures in this document so they cannot silently rot.

3. **Real building footprints** for the Haussmann core, from OSM, screened the
   same way the streets are. The core is largely unchanged since 1901, which is
   the whole reason this is possible; the point is to stop the Louvre being a
   procedural box the size of a Louvre-shaped block.

4. **The Thiers enceinte**, traced as above. It gives Paris an edge.

5. **The eleven landmarks**, modelled from photographs with a source cited per
   building — the same discipline as
   [STLOUIS_PALACES.md](STLOUIS_PALACES.md), [HULLS.md](HULLS.md) and
   [HELM.md](HELM.md), where the quote comes first and the geometry follows
   from it.

6. **Close the Seine's 3.3 km gap.** Between Issy and Saint-Cloud the river
   leaves the survey, loops south through Meudon and Sèvres, and comes back.
   The walk joined the two ends with a straight line over the hills;
   `RIVER_GAP` now stops that being drawn, but the honest fix is to fetch the
   missing reach with a bbox that reaches far enough south to contain it.

Steps 1 and 2 are the ones that pay for themselves immediately. Step 1 is also
the only one of the six that any pilot has actually asked for, twice.

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
