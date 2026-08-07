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

3. ~~**Real building footprints**~~ — **DONE.** `src/paris_buildings.js`:
   **12,450 real footprints** off OpenStreetMap, each reduced to its
   *smallest-area oriented box* — not an axis-aligned one, because a Haussmann
   block sits at whatever angle its street does and an axis-aligned box round a
   diagonal building is half again too fat.

   | | |
   |---|---|
   | buildings | 5,917 procedural → **15,745** (12,450 real + procedural outside the box) |
   | median height | **20.4 m** — a Haussmann six storeys |
   | median footprint | **299 m²** |

   Bounded to a 5.2 × 3.8 km box round the Tower, the Champ de Mars, the
   Trocadéro, the Invalides, the Champs-Élysées, the Étoile, both Palais, the
   Madeleine and the Opéra — the theatre of every scenario. A count query over
   the whole frame times out, and outside the box the procedural frontages are
   no longer thin now that the minor streets are in. **Inside the box the
   frontage generator is switched off entirely**: two cities on the same ground
   would interleave invented houses through the real blocks.

   Screened because today's footprints are not all 1901's: 687 dropped over
   eight storeys (the cornice line), 2,611 under 40 m², 18 slivers, 14 standing
   on a landmark, 14 in the Seine.

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

5. ~~**The eleven landmarks**~~ — **DONE.**
   [PARIS_LANDMARKS.md](PARIS_LANDMARKS.md) and `src/paris_landmarks.js`.
   Seven have **measured** footprints from OpenStreetMap; four carry a
   **published** figure and say so in the data, because OSM maps the Louvre as
   courtyards and wings and returns the department store across the road for the
   Hôtel de Ville. The projection was checked, not assumed: the Madeleine's
   fetched footprint lands 5 m from the coordinate `PLACES` already held.

   The 1901 screen mattered more than the geometry. **The Tuileries burned in
   1871 and were demolished in 1883**, so the Louvre is already the open U it is
   today and must not be closed — the one thing a modern photograph gets right
   for the wrong reason. The Vendôme column was pulled down by the Commune in
   1871 and re-erected in 1875, so it stands. The Hôtel de Ville is the 1892
   replacement, nine years old. The Gare d'Orsay had opened the previous May.

   Every landmark now has a site in `paris_plan.SITES` sized from its own
   footprint, so the frontage generator keeps off it — it had been running rows
   of houses straight over the Louvre.

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

---

## Backlog

- **SCENARIO II SHOULD BEGIN AT THE TOWER, NOT AT THE FALL.** A pilot asked
  whether "in the book was he coming from the opposite direction into a slight
  headwind after rounding the tower over the river Seine" (#66), and the answer
  is yes — that leg is real and the scenario skips it. Ch. XIII:

  > "I turned the Tower at the end of nine minutes and **took my way back to St
  > Cloud**; but my balloon was losing hydrogen through one of its two automatic
  > gas valves… By the time I had got back to **the fortifications of Paris, near
  > La Muette**, it caused the suspension wires to sag so much that those nearest
  > to the screw propeller caught in it as it revolved. I saw the propeller
  > cutting and tearing at the wires. **I stopped the motor instantly.**"

  So the afternoon has two halves and the game only plays the second. He rounds
  the Tower, flies WEST toward St Cloud — crossing the Seine, into the wind that
  is about to become his problem — and gets as far as La Muette before the
  propeller starts eating the suspension. Only then does he stop the motor, and
  only then does the drift east begin, which is where scenario II opens.

  What it should be:

  1. Start beside the Tower, just rounded, motor running, homeward — west, into
     the head wind, over the river.
  2. The balloon sags as she loses gas; at La Muette the wires foul the screw.
     The pilot must STOP THE MOTOR himself (the ALLUM. lever, or the key) — and
     if he does not, the propeller cuts them and it is a wreck.
  3. From that moment it is the scenario as it stands: no power, the wind
     carrying her back onto the Tower, and the ballast the only decision.

  That makes the ballast trade mean something, because you arrive at it having
  earned the situation rather than being handed it. It also gives the pilot the
  one thing the present version cannot explain — WHY the motor is dead.

  Not done here: it wants the geometry re-solved end to end (start point, wind,
  leak rate, where the fouling fires) and flown through `tools/check_scenarios.mjs`
  for every ballast choice, the way the current one was.


- **CAN THE DEUTSCH PRIZE BE WON INTO THE DAY'S WIND?** Unresolved, and it
  matters, because it is the race the whole game is named around.

  In still air the No. 6 goes round the 10.8 km course in 1,086 s against the
  1,800 s limit. Into the seeded daily wind (4.3 m/s) no autopilot I have
  written gets round at all. The arithmetic says it should: 35 km/h against
  15.5 km/h of wind is 19.5 km/h over the ground outbound, 5.4 km at that is
  16.6 minutes, and the homeward leg is fast — call it 22 minutes against a
  30-minute limit.

  So I believe the failure is the pilot and not the ship, but I have not
  proved it, and until it is proved the honest statement is that **nobody has
  demonstrated the Deutsch prize can be won in wind.**

  What went wrong each time, so the next attempt need not rediscover it:

  - **The throttle is a RATE, not a setting.** It is the brass lever:
    `input.throttle` is added to the current position, so passing 0 means
    "leave it where it is", not "shut it". A pilot that passes 0 to slow down
    does not slow down.
  - **Buoyancy, not thrust, is what beats you.** Fuel burns off, the ship
    gets light, and she rises — and `windAt()` blends in the upper current
    from 180 m, up to 67° veered and 30% stronger. Climbing into that on the
    homeward leg turns a headwind into a beam wind and blows you back. My
    first pilot drifted from 122 m to 224 m and went backwards over the
    ground.
  - **You cannot vent your way out of it.** My second pilot held altitude by
    venting whenever it was high, dumped every cubic metre of hydrogen, and
    sat down in a field. Venting is irreversible; ballast is the only lift
    you get back, and there are six bags of it.
  - The book's own advice is the answer and is already in the rival AI: ride
    high downwind, hug the deck against it (`Rival.update` in scenarios.js
    targets 135 m downwind and 45 m upwind). A pilot that does that, manages
    trim rather than the valve, and drops ballast late should get round.

  Worth doing as a proper autopilot in `tools/fly_track.mjs`, which already
  flies the three time trials gate by gate with the shipped gate test.


- ~~**THE SHIPS FLY TWICE AS FAST AS THEY DID.**~~ **DONE — but not for the
  reason this entry gave, which was wrong.**

  It rested on one number: Puteaux and back, "about 3 kilometres (2 miles), done
  in nine minutes" on the No. 5, which is 20 km/h. But that was an excursion, in
  wind, and the book gives a *measured* airspeed four paragraphs earlier in the
  same chapter — the one occasion he ever got a clean reading. Ch. XIII:

  > "Mr Maurice Farman followed me round the racecourse in his automobile at its
  > second speed. His estimate was between **26 and 30 kilometres** (16 and 18½
  > miles) per hour **with my guide rope dragging**... Our calculation at the
  > time was about **5 kilometres (3 miles) per hour** [for the rope's braking],
  > which would have brought my **proper speed up to between 30 and 35
  > kilometres** (18½ and 21½ miles) per hour."

  So the fleet was 6–11% fast, not 100%. It has now been trimmed by 10%
  (`DRAG_TRIM` in `src/ships.js`), on the **drag** rather than the thrust:
  the motors are documented down to the horsepower and the No. 6's 66 kg of
  measured pull, while the drag coefficients were never measured, only tuned
  until a ship felt right. The correction belongs on the guess.

  | | before | after | the book |
  |---|---|---|---|
  | No. 5, rope clear | 37.2 | **33.5** | 30–35 ("proper speed") |
  | No. 5, rope dragging | 33.4 | **30.3** | 26–30 (Farman's motor-car) |
  | No. 6 | 38.9 | **35.0** | — |
  | No. 7 racer | 64.0 | **57.7** | 70–80 by design, never realised |
  | No. 9 runabout | 23.3 | **20.9** | 20–25 |

  Flown afterwards to check nothing became impossible: the No. 6 goes round the
  Deutsch course in 1,088 s against the 1,800 s limit — still 40% of margin,
  where history had 1.6% (his 29:31). Scenario II still lands on the Trocadéro
  hotels with the ballast untouched. `tools/check_scenarios.mjs` asserts every
  ship against the range the book gives.

  **The boards were reset with it.** `BOARD_ERA` in `src/main.js` retires every
  local best and race time, because a record set on a ship 10% faster is not a
  record on this one. The world board needed nothing — `public.times` was empty.

- **Ballast by ship: sand or water.** The UI button says SAND for every ship.
  The book does not use one material throughout — check `docs/BOOK_REFERENCE.md`
  and the memoir per vessel, and label the button with what that ship actually
  carried. Small, and it is the sort of detail this project is for.
- **Versailles cannot be shown.** The Château is 12.2 km west and 6.2 km south
  of the Tower, which is far outside the survey (x −5100..6100, z −3800..2500).
  Only the Paris–Versailles road toward it is in frame, and it is drawn. If
  Versailles is ever wanted, the survey has to grow, not the scenery.
