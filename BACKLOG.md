# My Airships — Backlog

Ideas sourced from the memoir (see docs/BOOK_REFERENCE.md for passages).

## In progress / done this round

- [x] **Towing by the guide rope** — "I had the No. 9 towed to the railing of Bagatelle"
  (Ch. XXIII); menu option when landed: the men walk the ship to period destinations.
- [x] **Altitude-varying wind** — "he can leave one current for another" (Ch. VIII).
  Magnitude gradient near the ground plus a distinct upper current aloft that veers
  direction; clouds ride the upper river of air while ground smoke shows the surface wind.
- [x] **Campaign: historical scenarios** — scripted missions with each ship's real fate:
  No. 1's fold and the kite-boys' rescue; No. 5's leak and the Trocadéro rooftop;
  the Deutsch Prize run; the No. 9 landing at his own door; Monaco's imperfect-inflation
  final flight; the St. Louis grand prize.
- [x] **Competitor ships** — AI dirigibles (Deutsch's "La Ville de Paris", built on the
  No. 6's lines) flying the course against you.
- [x] **St. Louis 1904** — the Louisiana Purchase Exposition: white palaces, the Grand
  Basin, Festival Hall, the Observation Wheel, and the triangular pylon course he
  proposed to the Fair's organizers (Ch. XXIV).

- [x] **World records (online, optional)** — Supabase-backed ledger of times per course
  and ship class, a daily board on the seeded wind, and downloadable record-holder
  ghosts to chase. Submissions are validated by `src/anticheat.js` — the same module in
  the browser and in the Edge Function — which replays the ghost through the course's
  own gates at the ship's own physics. The whole feature vanishes when unconfigured.
  See docs/ONLINE.md.

- [x] **A review pass over the whole game** — fixed: the Monaco turn pylon standing
  inside the Tête de Chien; the gymkhana's Champs gate buried in a frontage (the clear
  corridor there was 7.8 m against a 13 m ring); the harbor gate whose lower rim was
  inside the Prince's Palace roof; petrol endurance far too short for the longer
  circuits (every ship now carries a 25% reserve flying flat out, and harbor/basin drop
  to 2 laps); GPU resources never released on travel between cities (a 2048² shadow map
  and thirteen bloom targets per journey); a mid-air wreck locking the fleet behind
  "land first"; the Deutsch and St. Louis scenarios starting the clock while the ship
  still sat on the pad; the Seine being decorative while other waters drowned you; one
  shared "best" across three cities with different limits.

- [x] **A second pass over the book and the period maps** — the St. Louis course rebuilt to
  his own proposal (equal-sided triangle, three laps, half again the Deutsch pace); the
  Passerelle de l'Avre, Deutsch's air-ship-house skeleton and its foundation trenches, the
  Île de Puteaux, Neuilly St James, the Jardin d'Acclimatation's captive balloon, the
  Moulin de Longchamp, Auteuil and Vaugirard in Paris; Monaco's sea wall with its
  four-metre drop, the electric tramway, and the escort running the coast; two new
  scenarios (the chestnut tree, the 14th of July review). See docs/PERIOD_NOTES.md.

- [x] **The last of the book's rules** — the Deutsch prize judged as written ("a closed
  curve in such a way that the axis of the Eiffel Tower should be within the interior of
  the circuit", measured by the bearing swept about the Tower); "The Longchamps Ten", his
  stopping exercise of 12 July 1901, as a trial in its own right, enforced in the game and
  in the run validator alike; the Aeronautic Concourse at St. Louis with its sheds, judges'
  stand and paling; and Saint-Cloud itself — the park's wooded hill, terraces and cascade,
  with the village between it and the aerodrome.

## Future — multiplayer, if it goes further

- [x] **Live race rooms** — Supabase Realtime *Presence* + *Broadcast*, never the DB.
  8 Hz packets carrying position, heading, throttle, rudder, gas and wreck state; remote
  ships drawn as their own class, a quarter-second in the past and interpolated. Public
  rooms announce themselves by presence on one shared lobby channel — no table, no
  heartbeat rows, no cleanup, and a room vanishes when its host's page closes. Air-to-air
  bumping is always on, resolved so each pilot pushes only their OWN ship: latency can
  never shove anyone else about, and contact costs way and gas but never wrecks.
  Still to do: spectate mode for a pilot waiting out a race; live gate splits so you can
  see who leads mid-race rather than only at the finish; and a reconnect path — a dropped
  socket currently needs a re-join from the menu.

- [ ] **Virtual reality (WebXR / Quest)** — three.js has it built in: `renderer.xr.enabled`,
  an XRButton, and `setAnimationLoop`. It runs in the Quest browser off the same Pages URL,
  no store. The game suits it unusually well: you sit still in a detailed cockpit while the
  world moves, with no strafing, no snap-turns, gentle accelerations and a fixed basket as
  an anchor — the usual nausea triggers are absent. The rendering is a day; the game around
  it is one to two weeks, because VR deletes the screen-space UI. The HUD, menu, record
  office and slider overlay are all DOM and would have to move into the world — which suits
  us, since the barometer, compass and levers are already physical objects — and the natural
  control is grabbing the actual wheel and hauling the actual trim line. Performance wants a
  look too: a Quest renders twice at 72–90 Hz, so the bloom pass and the Water shader would
  need a lower-quality path. Worth a stereo-only proof first (headset view, keyboard control,
  HUD suppressed) to see whether the sensation lands.
- [ ] **Spectator / press box** — watch a live room from the Trocadéro terrace.
- [ ] **Rooms for the historic courses** — needs a server-side notion of the aerodrome
  finish radius before those times can be trusted online.

## Future — systems

- [ ] **Weather days** (menu-selectable): rain (wet envelope heavy, gusts — the No. 2's
  lesson), the Nice storm thermal column that lifts you while venting, fog ("the balloon
  itself had completely disappeared"), night flight over the lit city (A7).
- [ ] **Pre-flight weighing ritual** — his surveillance checklist (balloon filled? valves?
  rigging? cords? ballast weighed?) as an interactive pad step; skipping it raises
  failure odds (the Monaco moral).
- [ ] **Retour de flamme** — the No. 9 petrol fire over the Ile de Puteaux, beaten out
  with the Panama hat: rare fire event with a frantic extinguish interaction.
- [ ] **Guide-rope snag events** — the oak-tree "salad basket" shaking; rope catching
  chimneys, telegraph wires.
- [ ] **Spherical balloon cross-country mode** — with directional wind layers: drift to a
  named target using only ballast/valve; oxygen above the clouds; the becalmed-over-Paris
  day; landing before ballast runs out (Fontainebleau).
- [ ] **Campaign economy** — hydrogen 3,000 fr to fill the No. 7, 50 fr/day upkeep, no
  insurance, prizes as income (Deutsch 100,000 fr; Brazil 125,000 fr — he gave most away;
  make the donation a closing beat).

## Future — scenarios & world life

- [ ] The military test (Ch. XXIII): rail waggon to Belfort, two-hour inflation, cross the
  hostile zone above rifle range into the "besieged" town.
- [ ] Submarine spotting over the Monaco sea (the airship sees what warships cannot).
- [ ] The children's fête (Clarkson Potter) and the lady navigator's solo (29 June 1903).
- [ ] The 14 July military review with the 21-shot revolver salute (partly covered by
  flavor; make it a scenario with formations below).
- [ ] Captive balloon at the Jardin d'Acclimatation; Langley and Edison cameo visits.
- [ ] Press clippings: finishing a feat generates a period newspaper front page from your
  photograph-mode shot ("the newspaper men of Paris would be my Scientific Commission").
- [ ] Rooftop landing pads — "guide ropes caught by their domestics on their own roof
  gardens"; an ornamental landing-stage at his Champs-Élysées window.
- [ ] Achievements: "Man flies!" set (from the pigeon-flies game); flying under the Arc de
  Triomphe ("had I thought myself worthy"); zero-ballast zero-gas day (the No. 9's
  perfect afternoon).
- [ ] North Pole guide-roping bonus map (Ch. XXII: "to the Pole and back between
  breakfast and supper").
- [ ] No. 10 Omnibus passenger service scoring; ghost replays / async multiplayer times.
- [ ] Brazil prologue: the coffee plantation, kites, and the St. John's Eve fire balloons.
