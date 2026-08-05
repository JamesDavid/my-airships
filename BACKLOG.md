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
  ships drawn as their own class, a quarter-second in the past and interpolated. Rooms
  announce themselves by presence on one shared lobby channel — no table, no heartbeat
  rows, no cleanup, and a room vanishes when the last pilot in it leaves. The announcement
  is made by whoever HOLDS the room rather than whoever opened it, so a room outliving its
  founder stays listed; a private room is simply one that makes no announcement, and that
  fact rides in the host's presence record so an inherited room stays private. The room's
  topic is its code alone — the trial is not part of the address, since the host may move
  the whole room to another course mid-session and a pilot arriving on a code has no way
  to guess. Each rival carries an arrow and a range in the roster panel, on the same
  convention as the wind arrow: it turns with your own head, so up is dead ahead. Air-to-air
  bumping is always on, resolved so each pilot pushes only their OWN ship: latency can
  never shove anyone else about, and contact costs way and gas but never wrecks.
  Spectating and live gate splits are in: a pilot can stand down and ride with anyone in
  the room (every camera works, including standing in their basket), and each gate pass is
  broadcast so the panel shows a running order — deepest into the course first — instead of
  only a finishing list.
  A room is a shared sky: everyone flies free in the same city, seeing and bumping each
  other, until its host calls a race — eight seconds and everyone on a starting grid,
  spaced abeam in an order the whole room agrees on. The host owns the course and the
  city; the room follows. Hosting passes to the longest-standing pilot if the host leaves.
  Ships may be swapped in mid-air in free flight — she is taken over where she flew — but
  not inside a scenario or a running trial.
  Still to do: a reconnect path (a dropped socket needs a re-join from the menu); chat if
  rooms ever fill with strangers; and scenarios are deliberately solo — they are scripted
  personal stories and do not belong inside a shared race room.

- [x] **A fault book** — pilots report what went wrong from inside the game: the round
  beetle button above the menu, and an Options entry. A report carries what they typed, a
  picture (the rendered view by default — read in the same tick as the render, since the
  drawing buffer is gone by the next one — or the whole window through `getDisplayMedia`,
  which makes the browser ask them what to share), and the state they were flying in:
  ship, place, course, race, room, instruments, viewport, user-agent, and the last 25
  errors thrown. That ring buffer is installed on the first line of `main.js`, before
  anything else can throw, so nobody has to reproduce a fault with the console open.
  `bug_reports` is insert-only for `anon` and readable by nobody. Like everything else
  online it degrades to nothing: unconfigured, the button is never built. See
  docs/ONLINE.md.

- [ ] **Virtual reality (WebXR / Quest)** — three.js has it built in: `renderer.xr.enabled`,
  an XRButton, and `setAnimationLoop`. It runs in the Quest browser off the same Pages URL,
  no store. The game suits it unusually well: you sit still in a detailed cockpit while the
  world moves, with no strafing, no snap-turns, gentle accelerations and a fixed basket as
  an anchor — the usual nausea triggers are absent. The rendering is a day; the game around
  it is one to two weeks, because VR deletes the screen-space UI. The HUD, menu, record
  office and slider overlay are all DOM and would have to move into the world — which suits
  us, since the barometer, compass and levers are already physical objects — and the natural
  control is putting both hands on the actual tiller and hauling the actual trim line. Performance wants a
  look too: a Quest renders twice at 72–90 Hz, so the bloom pass and the Water shader would
  need a lower-quality path. Worth a stereo-only proof first (headset view, keyboard control,
  HUD suppressed) to see whether the sensation lands.
- [ ] **Spectator / press box** — watch a live room from the Trocadéro terrace.
- [ ] **Rooms for the historic courses** — needs a server-side notion of the aerodrome
  finish radius before those times can be trusted online.

## Maybe

- [ ] **The helm rigged the bicycle way** — the bar has a cord to each side of the rudder,
  and the book never says whether those cords ran straight or crossed. The game rigs them
  **straight**: push the port hand forward, turn to port, like a rudder bar. Crossed would
  reverse it and give a *bicycle's* feel — a handlebar goes left by bringing the left grip
  BACK — which is arguable, since he was a keen cyclist, rented the Parc des Princes track
  for his experiments, sat the No. 4 on an actual bicycle frame, started its motor with
  pedals, and called its control a *guidon*. One sign flip on `wheelA` in
  `Airship.updateTransforms`. Against it: the straight rig is what a player pressing left
  expects, and the drawn linkage currently agrees with itself. Wants a photograph of a
  basket showing the cord routing, or the French edition's *épures*, before it is worth
  doing. See docs/HELM.md §5.

## Future — systems

- [ ] **The ballonnet, and a fan that can fail** — the Nos. 1 and 2 carried an
  interior air balloon sewn inside the bottom of the envelope, fed by a rotary
  ventilator off the motor, with an air valve deliberately weaker than the gas
  valves so that all the air left before any hydrogen did. Its fan "twice
  refused to work adequately at the critical moment", and that is what folded
  the No. 2. The game has the consequence — slack envelope, folding, the screw
  eating the suspension — but not the cause, and a fan you must nurse would make
  those two ships play as differently as they flew. From the No. 3 the rounder
  hull dispensed with it entirely. See docs/HULLS.md.
- [ ] **The battened hems** — no net, no chemise: the suspension was taken
  straight off small wooden rods in long horizontal hems sewn down both flanks
  of the envelope. Currently the wires meet the hull at a line of bare points.

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
