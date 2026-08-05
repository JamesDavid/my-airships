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
- **St. Louis, 1904**: the World's Fair grand prize that never happened — his proposed
  triangular pylon course, flown against rival dirigibles (Deutsch's *La Ville de Paris*
  among them).
- **Six historical scenarios** (Esc menu): the No. 1's fold and the kite-boys' rescue,
  the No. 5's crash onto the Trocadéro roof, the Deutsch Prize run, landing the No. 9 at
  his own door, Monaco's fatal 14th of February — flown better — and the $100,000 race.
- **Read the wind like a pilot**: currents veer and strengthen with altitude ("he can
  leave one current for another") — smoke, flags, trees, water, and clouds each show a
  different layer of the sky. The crew will also tow your ship by its guide rope to
  period destinations.
- **Time trials — the aerial gymkhana** ("Ten times in succession I made the circuit of
  Longchamps"): lap circuits through the Grande Roue, under the Arc de Triomphe, over
  the bay, and threading the Observation Wheel. Instant restart on Enter, per-gate split
  times, and a **ghost** of your best run to race against — copy its code and send it to
  a friend to race asynchronously. Dives trade altitude for speed; times are kept per
  ship class. A **track editor** (G drops a gate) lets you build and share circuits, and
  the **wind is seeded by the date** — everyone flies the same sky today.
- **World records** (optional): point the game at a Supabase project and every
  personal best is entered in a public ledger — boards per course and ship class, a
  daily board flown on today's seeded wind, and the record-holder's ghost available to
  download and chase. Submitted runs are scrutineered against the course geometry and
  the ship's own physics, on the server, before they reach the ledger. Configure
  nothing and the feature simply doesn't exist — see [docs/ONLINE.md](docs/ONLINE.md).
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

Optional online leaderboards need a free Supabase project and two keys —
[docs/ONLINE.md](docs/ONLINE.md) walks through it, including deploying the
server-side run validator. To check that validator after any change to the
courses, ships, or its own rules:

```
node supabase/test-anticheat.mjs     # honest runs accepted, ten forgeries refused
```

## The source material

`docs/BOOK_REFERENCE.md` is the design bible: a catalogue of the memoir's locale
descriptions, handling passages, and per-ship specifications — each quoted and mapped to
the graphics or physics rule it drives. Read it with the book at
[gutenberg.org/ebooks/42344](https://www.gutenberg.org/ebooks/42344).

*"Por ceos nunca d'antes navegados!"* — Through skies never before sailed.
(Camões' line, altered by one word, as it flew on his airship's streamer.)

## Credits & license

Code: MIT. Text quotations and historical details from Alberto Santos-Dumont,
*My Airships* (1904), public domain. Built with three.js.
