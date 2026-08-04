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
