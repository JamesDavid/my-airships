# Period research notes — Paris 1901 & Monaco 1902

Supplementary to BOOK_REFERENCE.md; sources at bottom. These drive the world-building
choices in `src/world.js` and `src/world_monaco.js`.

## Paris, 1900–1903

- **The 1900 Exposition Universelle** covered ~112 ha along the Seine from Les Invalides
  to the Champ de Mars. Santos-Dumont's Deutsch Prize flights (1901) crossed this
  landscape; his No. 5/No. 6 photographs show exposition-era riverfront.
- **La Grande Roue de Paris** (1900): a 100 m Ferris wheel near the Champ de Mars
  (avenue de Suffren), standing until 1920 — visible in period photos with the Tower
  behind. → modeled south of the Champ de Mars, slowly turning.
- **Old Palais du Trocadéro** (1878): Moorish-Byzantine rotunda with two slim ~80 m
  towers and long curved wings, directly across the Seine from the Tower ("the Trocadero
  was seen through the base of the Eiffel Tower"). The Trocadéro hotels' courtyard is
  where the No. 5 was wrecked. → rotunda + twin towers + curved wings modeled.
- **Grand Palais** (1900): stone colonnade with the great glass barrel roof, off the
  Champs-Élysées. → modeled with translucent glass vault.
- **Seine geography**: the river loops *around* the Bois de Boulogne — from the Champ de
  Mars/Passy reach it curves west, then runs between the Bois and the St. Cloud heights.
  The Aéro Club grounds at St. Cloud were on the west bank: the race crossed the river
  immediately after the start, and again at the Tower. → second (western) river reach
  added under the start ring.
- **Skyline landmarks** of the day: Notre-Dame's twin towers, the Panthéon dome, the
  Opéra, Sacré-Cœur rising on Montmartre (domes complete by ~1899), Les Invalides' gold
  dome. Haussmann blocks: cream limestone façades, iron balcony lines at the 2nd and 5th
  floors, zinc mansard roofs, chimney-pot clusters.
- **River traffic**: barges and bateaux-mouches steamers on the Seine.

## Monaco, winter 1902

- **Tête de Chien** (556 m): the rock promontory dominating the principality from behind,
  with La Turbie above — the "mountains sheltering the bay" of the book. → one dominant
  massif modeled behind the amphitheatre of hills.
- **Monte Carlo Casino** (Garnier, embellished through 1900 — the clock returned to its
  central position that year): cream Belle Époque palace, seaside towers with green
  copper cupolas, on the Monte Carlo height NE of the port. Hôtel Hermitage luxury
  rebuild 1900. → casino with twin cupola towers + clock face; terraced hotels stepping
  down to La Condamine.
- **Port Hercules / La Condamine**: the harbor quarter where the Prince built
  Santos-Dumont's aerodrome on the Boulevard de la Condamine, over the sea wall from
  the pebble beach (book A9/A11).

## The crossings at Saint-Cloud (implemented)

The Seine's western reach carried three structures in a fixed order, and the
game places them at half scale in that order and spacing:

1. **Pont de Saint-Cloud** — the stone road bridge on the Paris–Versailles road,
   upstream of the others. Carries the road out of the town, over the river and
   on into the Bois toward Longchamp.
2. **Passerelle de l'Avre** — Gustave Eiffel's iron aqueduct-footbridge of 1891,
   carrying Avre water to Paris "à la lisière du bois de Boulogne". It stands
   **0.5 km downstream** of the Saint-Cloud crossing (250 m here), which puts it
   under the homeward line of the Deutsch course — exactly as the book's plate
   "Returning to Aéro Club Grounds above Aqueduct" shows. No road: a water
   conduit with a footway, running into an earth embankment at each bank.
3. **Pont de Suresnes** — **1.5 km downstream** of the Avre passerelle (750 m
   here), with the Île de Puteaux below it and Neuilly St James beyond.

Sources: fr.wikipedia.org/wiki/Passerelle_de_l'Avre (position in the succession
of Seine crossings: "Viaduc de Saint-Cloud à 0,5 km amont, Pont de Suresnes à
1,5 km aval"; Eiffel, inaugurated 1891); structurae.net/en/structures/avre-aqueduct;
en.wikipedia.org/wiki/Pont_de_Saint-Cloud.

## Wind-reading (goal: environment as instrument)

Period-plausible wind tells implemented: water surface streams downwind (wave-normal
scroll driven by the live wind vector); trees and scrub sway and lean; flags on the
aerodrome, the Tower, and the Arc stream; chimney smoke over the city and steamer smoke
in the bay drift downwind; anchored yachts ride head-to-wind; clouds (cumulus and high
cirrus) drift with the gradient wind.

## St. Louis, 1904 — the fan plan

The official ground plans (Library of Congress; Missouri Digital Heritage; AGS
Library/UWM) show the fair's celebrated fan: **Festival Hall** on Art Hill at the
apex, the **Cascades** spilling down to the **Grand Basin**, and the great
exhibit palaces arranged in radiating arcs around lagoon-lined avenues.
**The Pike** — the mile-long midway of attractions — ran along the northern
edge, with the **Observation Wheel** (the rebuilt 1893 Ferris giant) beside it,
and the **Louisiana Purchase Monument** column on the plaza. The **Aeronautic
Concourse** at the western edge hosted the airship trials. → all modeled:
palace fan with tangent orientation, lagoon avenues with water, Pike attraction
rows with entrance arch, monument, cascades.

## Monaco street plan (implemented)

`src/monaco_plan.js`: Boulevard de la Condamine along the waterfront (the
aerodrome's address), Rue Grimaldi behind it, the Avenue de Monte-Carlo and
Avenue de la Costa climbing to the Casino, the Boulevard des Moulins through
Monte Carlo, the Rampe Major up the Rock (Prince's Palace with its corner
towers, the Cathedral), Sainte-Dévote's chapel in her ravine, the
Nice–Ventimiglia railway cut along the slope, and the first jetty works of
Port Hercule.

## Sources

- Getty Images / Alamy period photo collections of the Exposition Universelle 1900
  (Grande Roue with Tower behind; Trocadéro through the Tower's base):
  gettyimages.com/photos/exposition-universelle-1900, alamy.com/stock-photo/paris-1900-exposition.html
- Internet Archive, Edison films of the 1900 Exposition: archive.org/details/the-paris-e-xposition-universelle-1900
- Exposition Universelle 1900 overview: kids.kiddle.co/Exposition_Universelle_(1900)
- Monte-Carlo SBM company history (casino embellishments, 1900 clock; Hermitage 1900):
  montecarlosbm-corporate.com/the-company/history
- Architecture of Monaco: en.wikipedia.org/wiki/Architecture_of_Monaco
- Period photo, "Monaco Monte Carlo Avenue towards Condamine" (~1900, Possemiers):
  abebooks.com listing 22869524382
- 1904 World's Fair ground plans: Library of Congress (loc.gov/item/2007633932,
  Pharus-map loc.gov/item/99466762), Missouri Digital Heritage (official ground
  plan), AGS Library Digital Map Collection (UWM)


## The helm: a bar, not a wheel

The game shows the helm as a **bar** lying athwartships on a pivot at its middle, with a
cord from each end running aft to its own side of the rudder. Earlier builds showed a
ship's wheel on a raked column, on the strength of one line in the English memoir.

**That line is the translator's, not Santos-Dumont's.** The 1904 English text says, of the
Deutsch run:

> "It was to abandon the **steering wheel** for a moment, at the risk of drifting from my
> course, in order to devote my attention to the carburating lever and the lever
> controlling the electric spark." (Ch. XVIII)

The French original — *Dans l'air*, [Internet Archive `danslair00santgoog`](https://archive.org/details/danslair00santgoog),
also at [Gallica](https://gallica.bnf.fr/ark:/12148/bpt6k932715h) — reads:

> "Au risque de dévier, j'abandonnai momentanément **le gouvernail**, pour concentrer mon
> attention sur la manette du carburateur et le levier commandant l'étincelle électrique."

*Le gouvernail* is the rudder, or the steering generally. There is no wheel in it. The word
**volant** — French for a steering wheel — appears nowhere in the book in that sense; every
*roue* in the text belongs to the ox-cart argument of his Brazilian boyhood.

What the French does say, describing the No. 4:

> "Pour conduire, mes mains reposaient sur **le guidon de la bicyclette, relié au
> gouvernail**." (Ch. XI)

— rendered in the English as "my hands reposed on the bicycle handle-bars connected with my
rudder". A handlebar: a bar across the pilot, pivoted at its centre, worked by pushing one
hand and pulling the other.

And the rudder was worked by **cords**, not by any gearing:

> "Les **cordes commandant le gouvernail**, le moteur, le water-ballast, les poids
> déplaçables, fonctionnent-elles librement?" (his pre-flight checklist, Ch. XXI)

> "une des **cordes manœuvrant le gouvernail** se rompit" — the broken rudder cord that
> forced the No. 5 down into the Trocadéro gardens (Ch. XV)

> "d'autres, notamment celles du gouvernail, s'accrochaient au propulseur" — the rudder
> cords fouling the screw (Ch. XX)

At Monaco he calls it **la barre** — the ordinary French for a tiller — three times in two
pages: *"Je donnai un coup de barre à bâbord, la main serrée sur le gouvernail"*; *"je
poussai la barre"*; *"donnai vivement un coup de barre"*. The English renders all three as
"helm".

### What is still open: which way the cords run

A bar and two cords can be rigged two ways, and the book does not say which.

- **Straight** (port end → port side of the rudder): pushing the port hand forward tautens
  the port cord, draws the port side of the rudder forward, and swings her trailing edge to
  port — she turns to port. Direct, like an aeroplane's rudder bar.
- **Crossed**: the same push turns her to starboard — like a bicycle's handlebar, which
  goes left by bringing the left grip *back*. Santos-Dumont was a keen cyclist and called
  the No. 4's control a *guidon*, so this is not far-fetched.

The game uses the **straight** rig: helm to port sends the port end ahead. It is the sense
that reads correctly to a player pressing left, and the drawn linkage is consistent with
it — the cord that goes taut is the one that hauls the rudder the way it is seen to go.
