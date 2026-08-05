# The helm — what Santos-Dumont actually steered with

The game draws the helm as a **bar lying athwartships, pivoted at its middle, with a cord
from each end running aft to its own side of the rudder**. Push one hand away, pull the
other back, and she comes round.

Earlier builds drew a ship's wheel on a raked column. That was wrong, and it was wrong
because of a single word introduced by the 1904 English translator. This note records the
evidence, so nobody re-litigates it from the English text alone.

## Sources

| | |
|---|---|
| English | *My Airships* (1904 translation) — [Gutenberg #42344](https://www.gutenberg.org/ebooks/42344) |
| French | *Dans l'air* (1904, the original) — [Internet Archive `danslair00santgoog`](https://archive.org/details/danslair00santgoog) · [Gallica `bpt6k932715h`](https://gallica.bnf.fr/ark:/12148/bpt6k932715h) |

Chapter numbers below are the English edition's.

## 1. The "steering wheel" is the translator's

The one place in the whole memoir where the English names a wheel:

> "It was to abandon the **steering wheel** for a moment, at the risk of drifting from my
> course, in order to devote my attention to the carburating lever and the lever
> controlling the electric spark." — Ch. XV, *Winning the Deutsch Prize*

The French for the same sentence:

> "Au risque de dévier, j'abandonnai momentanément **le gouvernail**, pour concentrer mon
> attention sur la manette du carburateur et le levier commandant l'étincelle électrique."

***Le gouvernail*** **is the rudder** — or the steering, generally. There is no wheel in it.

Two negative checks confirm it is not a translation artefact of some other passage:

- **`volant`**, the French word for a steering wheel, appears nowhere in the book in that
  sense. Every hit is *cerf-volant* (kite) or the participle of *voler* (to fly).
- **`roue`** (wheel) appears only in the ox-cart argument of his Brazilian boyhood, where
  Pedro insists that Nature nowhere employs "the device you call the wheel."

## 2. What the book does describe: a handlebar, worked by cords

Describing the No. 4 — the bicycle-saddle ship:

> "Pour conduire, mes mains reposaient sur **le guidon de la bicyclette, relié au
> gouvernail**."
>
> "my hands reposed on the **bicycle handle-bars connected with my rudder**."
> — Ch. XI, *The Exposition Summer*

A *guidon* is a handlebar: a bar across the pilot, pivoted at its centre, worked by pushing
one hand and pulling the other. The English keeps this one intact.

The rudder was worked by **cords**, with no gearing anywhere in the description:

> "Do the **cords commanding rudder**, motor, water ballast, and the shifting guide rope
> work freely?" — his pre-flight checklist, Ch. XX
>
> "Les **cordes commandant le gouvernail**, le moteur, le water-ballast, les poids
> déplaçables, fonctionnent-elles librement?"

> "At this moment **one of the cords managing my rudder broke**. It was absolutely
> necessary to repair it at once, and to repair it I must descend to earth." — Ch. XII —
> the failure that put the No. 5 down in the Trocadéro Gardens
>
> "une des **cordes manœuvrant le gouvernail** se rompit"

> "many of the diagonal wires had begun to give way… and others, **including those of the
> rudder, caught in the propeller**." — Ch. XX, over the Île de Puteaux
>
> "d'autres, notamment **celles du gouvernail**, s'accrochaient au propulseur"

That a rudder cord can *break*, and that rudder cords can *foul the screw*, are both
inconsistent with a geared column and entirely consistent with a bar pulling two lines.

## 3. At Monaco he calls it *la barre*

Three times in two pages of Ch. XVIII, *Flights in Mediterranean Winds*. ***Barre*** is the
ordinary French for a tiller — a wheel would be *barre à roue*, or *volant*. The English
renders all three as "helm", which conceals the word:

| French | English as printed |
|---|---|
| "Je donnai un **coup de barre** à bâbord, la main serrée sur le gouvernail." | "Porting my helm I held the rudder tight." |
| "j'**appuyai légèrement sur la barre**. Obéissant, l'avant de l'aéronef s'infléchit de l'autre côté" | "I shoved the helm around a short arc. Obedient, the air-ship's stem swung to the other side" |
| "donnai vivement un **coup de barre**" | "I gave a sharp turn to the helm" |

The middle one is the most telling: *appuyer sur la barre* is to **press on** the bar. The
"short arc" — the rotational reading — is the translator's, not his.

## 4. Which way it moves in the game

Established from the code, not assumed:

- `A` / `←` gives `rudder = +1`.
- The forward vector is `(cos yaw, 0, −sin yaw)`, so increasing `yaw` swings the nose
  toward `−z`. With up = `+y`, right = forward × up = `+z`, so `−z` is **port**. Positive
  helm therefore turns her to **port**.
- The rudder mesh takes `rotation.y = −input × 0.5`, which puts its trailing edge to port
  on a port turn — the deflection that actually produces the yaw.
- A cord can only pull. For the rudder's **port** arm to be drawn forward (which is what
  swings the trailing edge to port), the **port** end of the bar must move forward, away
  from the stern, tautening the port cord.

So: **helm to port sends the port end of the bar ahead.** The bar was previously driven the
other way, pushing the starboard end forward on a port turn — the bar and the rudder
appeared to be fighting each other. See the commit "The bar was fighting its own rudder".

A second fault was found at the same time: `updateTiller` placed both the bar ends and the
rudder arms with `−sin`, where a point at local `(0, 0, d)` carried round by
`rotation.y = t` lands at `(d·sin t, 0, d·cos t)`. Both cords hung off points mirrored fore
and aft of the ends they belonged to.

Verified afterwards on a live `Airship` at full port helm: the cord roots lie on the bar's
own axis (direction ratio −0.714 against the grip's −0.715), the port grip stands forward
of the pivot, and at the stern the port rudder arm is the one drawn forward.

## 5. Still open: straight cords or crossed?

**The book never says.** A bar and two cords can be rigged either way, and the two give
opposite feels:

- **Straight** — port end → port side of the rudder. Pushing the port hand forward tautens
  the port cord and turns her to port. Direct, like an aeroplane's rudder bar or a pair of
  rudder pedals.
- **Crossed** — the same push turns her to starboard. This is how a *bicycle* handlebar
  behaves: it goes left by bringing the left grip **back**, not forward.

The crossed reading is not far-fetched. Santos-Dumont was a keen cyclist, rented the Parc
des Princes bicycle track for his experiments, sat the No. 4 on an actual bicycle frame,
started its motor with **pedals**, and called its control a *guidon*. A man who built that
much bicycle into an airship might well have wanted it to steer like one.

**The game rigs them straight**, because that is the sense that reads correctly to a player
pressing left, and because the drawn linkage is then self-consistent — the cord that goes
taut is the one hauling the rudder the way it is seen to go. Switching to the crossed rig
is a one-line sign flip on `wheelA` in `updateTransforms`; it is on the backlog as a maybe.

Settling it for good wants a photograph or engraving of a basket showing the cord routing,
or the *épures* (technical plates) in the French edition, which have not been examined.
