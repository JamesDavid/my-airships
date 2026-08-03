# My Airships ✈️🎈

**Fly Alberto Santos-Dumont's dirigibles over 1901 Paris — a browser flight game built
from his 1904 memoir, *My Airships*.**

**▶ Play it here: https://jamesdavid.github.io/my-airships/** — no install, just a modern browser.

![Guide-roping over the Bois de Boulogne at dawn](media/paris.jpg)

Before the Wright brothers were famous, a small Brazilian in a Panama hat was flying
petrol-engined balloons around the Eiffel Tower and parking them at his own front door on
the Champs-Élysées. This game is his memoir made playable: every ship, every mechanic, and
every hazard comes from the book (Project Gutenberg [#42344](https://www.gutenberg.org/ebooks/42344),
public domain).

## The game

- **Win the Deutsch Prize**: St. Cloud → round the Eiffel Tower → home, against the clock —
  the race he won on 19 October 1901 with 29 seconds to spare.
- **Winter in Monaco**: launch from the aerodrome of La Condamine and run the coast to
  Cap Martin, guide-roping low over the waves. Don't put her in the bay.
- **Fly the whole fleet** — each ship handles like the book says it did:

| Ship | Character |
|---|---|
| The "Brazil" | spherical balloon — no motor, no rudder; drift, ballast, and the guide rope |
| No. 1 – No. 2 | long fragile cylinders that fold "like a pocket knife" when starved of gas |
| No. 3 | the big-bellied one on a bamboo pole keel — slow but unfoldable |
| No. 4 | the bicycle-saddle ship with the bow propeller |
| No. 5 | first pine-truss keel… and the weak valve that wrecked it |
| No. 6 | the Deutsch Prize winner — balanced and honest |
| No. 7 | the racer: 60 hp, two propellers, ~70 km/h |
| No. 9 | the beloved runabout — an egg driven thick end first, lands in streets |
| No. 10 | "The Omnibus" — twelve passengers, turns like a steamer |

![Over the bay of Monaco](media/monaco.jpg)

## How it flies (the book's own physics)

- **"To descend without sacrificing gas and to mount without sacrificing ballast."**
  Hydrogen and sand are permanent spends; the skilled way to climb and dive is the
  *shifting weights* plus the propeller — free diagonal flight.
- **The guide rope** trails beneath you: fly low and it grounds itself, automatically
  steadying your altitude (over water it is perfect). It also drags like a brake, drapes
  over rooftops, and snags.
- **Wind is a river**, strongest aloft: ride it high downwind, crawl home low against it.
- **Watch the envelope**: cloud shadow and the cool air over forests shrink the gas; a
  sagging envelope at full throttle lets the propeller eat the suspension wires; climb too
  fast and the valves vent your precious hydrogen. Petrol runs out too — then you are a
  free balloon.
- The motor is **capricious**. When it sputters, work the spark lever (tap F).

## Controls

Press **Esc** for the menu (choose ship and location), **H** for the key reference.

| Key | Action |
|---|---|
| W / S | throttle · A / D rudder · Q / E shifting weights (nose down / up) |
| SPACE | drop a ballast sack · V (hold) vent hydrogen · F coax the motor |
| ENTER | start the timed trial, near the gold ring |
| C | camera: chase / **aboard the basket** / postcard / vista |
| P | photograph mode (sepia + grain) · M sound · R reset |

## Run locally

Any static server from the repo root, then open the page:

```
python -m http.server 8140    # → http://localhost:8140/
```

Uses [three.js](https://threejs.org/) from a CDN import map — no build step, no
dependencies. Keep the tab focused; browsers pause background tabs.

## The source material

`docs/BOOK_REFERENCE.md` is the design bible: a catalogue of the memoir's locale
descriptions, handling passages, and per-ship specifications — each quoted and mapped to
the graphics or physics rule it drives. Read it with the book at
[gutenberg.org/ebooks/42344](https://www.gutenberg.org/ebooks/42344).

*"Por mares nunca d'antes navegados!"* — O'er seas hereto unsailed.

## Credits & license

Code: MIT. Text quotations and historical details from Alberto Santos-Dumont,
*My Airships* (1904), public domain. Built with three.js.
