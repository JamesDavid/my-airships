# The palaces of 1904, from the record

Step 2 of [STLOUIS_PLAT.md](STLOUIS_PLAT.md). The plat gives footprints; this
gives what stood on them. Same discipline as [HULLS.md](HULLS.md) and
[HELM.md](HELM.md): **the quote comes first and the geometry follows from it.**

## Sources

The spine of this document is the fair's own guidebook, written while the fair
was standing and describing buildings the writer could walk out and look at:

> **[G]** *Official Guide to the Louisiana Purchase Exposition at the City of
> St. Louis, State of Missouri, April 30th to December 1st, 1904.* By authority
> of the United States of America. Compiled by M. J. Lowenstein. Issued by
> authority of the Louisiana Purchase Exposition.
> Cornell copy, full text: https://archive.org/details/cu31924015340114
> (downloaded as `cu31924015340114_djvu.txt`; line numbers below are into that
> OCR text so anything here can be re-checked.)

Every figure marked **[G]** is a direct reading of that text. Where the OCR is
damaged the reading is reconstructed and *said to be* reconstructed. Two
secondary sources fill gaps the guide leaves:

- **[FH]** atthefair.homestead.com, Festival Hall page — dome and restaurant
  seating figures. http://atthefair.homestead.com/festivalhall-solo.html
- **[WU]** Washington University, *The Source*, "World's Fair 'aeronautic
  concourse' honored" (2004) — the concourse's location on the modern campus.
  https://source.washu.edu/2004/11/world-fair-aeronautic-concourse-honored/

Photographic corroboration is the Library of Congress's Louisiana Purchase
Exposition holdings (public domain by age), e.g. loc.gov/item/2013649762 and
2013649766, both "Festival Hall and Central Cascade" — these confirm the
Cascades' step count and Festival Hall's silhouette against the hill.

Feet are the source's unit. Metres are given because the game is metric:
**1 ft = 0.3048 m**, and nothing here is rounded before that conversion.

---

## The colour question — settled, and it is not what the game does

This was the highest-value single item in the step, because it is one line of
code that affects every building in the world. The guide answers it directly:

> "The color of the exhibit buildings is **ivory white, with dashes of color on
> the roofs**. This preserves the majesty of the white, while at the same time
> it lessens the strain on visitors' eyes." — **[G]** line 857

So two findings, and the second is the interesting one.

**The walls.** "Ivory white" is a warm off-white, and it is the fair's own word,
not a later romanticism. `0xefe9dc` is a warm off-white. **The game's wall colour
is right and should not be changed.** The "Ivory City" nickname is corroborated
by the guide's own prose — "a city of ivory palaces of matchless grandeur"
(**[G]** 1496).

**The roofs are not ivory, and in the game they are.** Every palace roof in
`world_stlouis.js` is `0xb9b2a0`, a grey. The guide is explicit that the roofs
carried the colour, and it says so twice more in the specific:

- Machinery: "can be easily identified by its **red sloping roofs** and its
  **green capped towers**" — **[G]** 3143
- Mines and Metallurgy: "The building is further distinguished by a **lavish use
  of color**" — **[G]** 3421

That is the correction to make. The palaces should read as an ivory colonnade
under coloured roofs, which is a different picture from an all-grey-and-cream
one, and it is *why* the fair looked the way it did in the tinted plates.

**Materials.** "Except the United States Government building, which has steel
trusses, and the Palace of Art, which is a brick and stone building, all the big
exhibit buildings of the Exposition are of wood and staff" (**[G]** 853). Staff
is plaster and hemp fibre on a wooden frame — which is why nothing survived, and
why the surfaces are matte, not shiny. Lambert, not Phong.

**One exception to the whole scheme.** The Palace of Fine Arts "Because of its
color and architecture, which render it **out of harmony with the general scheme
of the Fair**, it is screened from view by Festival Hall" (**[G]** 2513). It is
Bedford stone — grey — and it was deliberately hidden behind the hall. If it is
ever modelled it should be grey and it should be *behind* Festival Hall from the
basin.

---

## A height calibration, because the guide gives no palace heights

The guide gives every palace's plan dimensions and not one palace's height. The
nearest thing to a scale rod is the United States Government Building, described
in full because it was the exception (**[G]** 4000–4008):

- Ionic colonnade, columns **5 ft** diameter (1.52 m) and **45 ft** high (13.72 m)
- an attic **15 ft** high (4.57 m) above the Ionic order, statue-crowned
- "The height from the bottom of the stylobate to the top of the attic is
  **82 feet**" — **25.0 m**
- its dome **100 ft** in diameter (30.48 m); top of the crowning quadriga
  **175 ft** above the ground (**53.34 m**)
- portico 15 ft wide × 524 ft long; interior floor 175 × 724 ft; roof on steel
  trusses 70 ft high at 35 ft centres

**Take 25 m as the palace cornice height and 50–55 m as the top of a quadriga or
corner tower.** The exhibit palaces are the same architectural family — colossal
order over a high base, attic above, sculpture on the attic — and this is the one
building of that family the guide measured. The game currently builds palaces
`22 + rand()*6` metres to the roof, which is close by luck; it is the *sculpture*
that is missing, and that is another 25 m of silhouette.

Cross-check: "hills that rise to a height of **65 feet**" (**[G]** 829) = 19.8 m,
against Art Hill's measured 12 m of ground and the 16 m now built. The palaces
therefore stood taller than the hills around them, which is what the panoramas
show.

---

## The eight palaces of the main picture

Listed in the guide's own order. Each entry is only what the source says.

### Palace of Education and Social Economy

- **Plan.** "irregular, approaching a quadrangle" — **[G]** 2447
- **Storeys.** Reads as one colossal order over a base; a central court, later
  roofed over for exhibits — **[G]** 2443
- **Entrance.** "The principal entrances are on the axis of the building and in
  the form of the **Roman triumphal arch**. Stately **Corinthian** columns are
  grouped in pairs and above the entrance is an elaborate attic, crowned by
  appropriate sculpture. Above the doors are **broken pediments that bear
  reclining figures**." — **[G]** 2448
- **Roofline.** Flat with parapet and attic; no dome. "The entrances are
  connected outside by a **colonnade of monumental proportions**." — **[G]** 2453
- **Recognisable by.** "its simplicity. The style … is **pure classic**." — **[G]** 2454
- **On the roof.** All sculpture by Robert Bringhurst — **quadriga over main
  entrances**; "Goldenrod," an architectural figure **repeated six times over the
  entrance colonnades**; "Thread of Fate" and "Flight of Time" flanking the
  quadriga; "Music" and "Manual Training" on block pedestals right and left of
  each main entrance — **[G]** 1221–1233
- **Architects.** Eames & Young, St. Louis — **[G]** 2502
- **Footprint.** **525 × 750 ft** = **160.0 × 228.6 m**. Guide says "7.1 acres";
  the rectangle is 9.04 acres, and the guide gives 9.1 for the identically-sized
  Liberal Arts and Mines. **Read 7.1 as a typo for 9.1.** Cost $400,000.
- **Sited.** Fronting west on the Grand Basin at the foot of the east approach
  to the Terrace of States; entirely surrounded by lagoons, reached by
  monumental bridges; faces Manufactures to the north, Mines to the east — **[G]** 2432

### Palace of Electricity

- **Plan.** "corresponds to that of the Palace of Education, but there is a
  central court of wide dimension surrounded by a low, broad inner veranda" —
  **[G]** 3031. Its twin, mirrored across the Grand Basin.
- **Columns.** "On the east side, the columns, **grouped in pairs**, project far
  beyond the wall and are connected by a low balcony. Above the colonnade is a
  beautiful **Corinthian cornice**." — **[G]** 3038
- **Roofline.** "The court pavilions are crowned by **pyramidal towers**" —
  **[G]** 3040. Six of them (**[G]** 3108). The eaves line is deliberately
  broken: "The somewhat interrupted effect of the broken line of eaves produces
  a remarkable result when the building is illuminated by electricity, imparting
  the appearance of lightning." — **[G]** 3022
- **On the roof.** Bela Pratt's "Light Overcoming Darkness" repeated on all six
  pyramidal towers: "The central figure is a **nude, holding aloft a star**.
  Figures of 'Darkness' crouch at her feet." Lower on the towers, "Wonders of
  the Lightning" and "Wonders of the Aurora." — **[G]** 3108. **This is the
  recognition mark — a star held up over each tower.**
- **Architects.** Walker & Kimball, Boston and Omaha — **[G]** 3120
- **Footprint.** **525 × 750 ft** = **160.0 × 228.6 m**, 9.1 acres. Cost $415,000.
- **Sited.** Balances Education across the Grand Basin, at the west end of the
  Terrace of States; **the lagoon surrounds it entirely and six bridges connect
  it** — **[G]** 3017

### Palace of Manufactures

- **Plan.** "conforms to the broken line of the main transverse avenue" —
  **[G]** 2839. Not a rectangle: it is bent.
- **Entrance.** "The south facade, facing on the lagoon, is ornamented by a
  succession of **deep Roman arches** on each side of a **colossal Roman niche
  that forms the main entrance**. The smaller arches terminate in other
  entrances. This same treatment is repeated on the opposite facade." — **[G]** 2840
- **Roofline.** "the **rich cresting on the roof**" is a named distinctive
  mark — **[G]** 2846. Flat with a decorated parapet, no dome.
- **Colonnade.** "An **open colonnade connects the entrances on the shorter
  facades**, lending a shadowy effect to the design." — **[G]** 2846
- **Interior court.** Circular, colonnaded — **[G]** 2848
- **Recognisable by.** "the **Greek Sphinx, on block pedestals, guarding all the
  entrances**" — **[G]** 2845
- **On the roof.** **Quadriga over the main entrances** (Charles Lopez and
  F. G. R. Roth); "Progress of Manufactures" on pylons flanking the main
  entrance (Isidore Konti); "Victory" in the main entrance, repeated three times
  in three niches (Michael Tonetti); "Energy" and "Power" flanking the east and
  west entrances (L. O. Lawrie); **"casque with flags, and female figures with
  eagle-crowned shields, on the roof-line"** (Amateis); Fountains of Neptune and
  Venus flanking the north and south entrances and corner pavilions (Philip
  Martiny) — **[G]** 1159–1179, 2921
- **Architects.** Carrère & Hastings, New York — **[G]** 2933
- **Footprint.** **1,200 × 525 ft** = **365.8 × 160.0 m**, 14.5 acres (630,000
  sq ft = 14.46 — the guide's arithmetic checks). Cost $720,000.
- **A tower that was never built.** "As originally designed, these buildings
  were to be treated with gigantic towers **400 feet high** at the center of the
  north facades, but these were abandoned as impracticable." — **[G]** 2834.
  **Do not model the towers.** Period drawings show them; the fair did not have
  them.

### Palace of Varied Industries

Designed in symmetry with Manufactures, on the other side of the Plaza of
St. Louis, and the most ornate of the group.

- **Entrance.** "an elaborate entrance thrown back behind a **circular detached
  colonnade of majestic proportions**. An **ornate dome overlooks the open court
  thus formed**." — **[G]** 2959. **This palace has a dome, and it is over the
  south entrance court, not over the middle of the building.**
- **Facades.** "The **Ionic** colonnade that ornaments the four facades rests on
  a **high base that is broken, between the columns, by arched entrances**.
  Behind this screen-like arcade is a shaded path for pedestrians." — **[G]** 2971
- **Roofline.** "The **square pavilions at the corners are crowned by low
  domes**, and the east and north entrance have **graceful towers in the style of
  the Spanish Renaissance**." Plus "**pairs of towers above center of south and
  north facades**." — **[G]** 2957, 2974
- **On the roof.** Torch-bearer **repeated ten times above the entablature of the
  swinging colonnade** (Bruno L. Zimm); lions surmounting the pylons of the south
  entrance (Ruckstuhl); tympanum groups in the east and south pediments;
  "Industry of Man" and "Industry of Woman" seated between the columns of the
  east facade — **[G]** 1202–1219
- **Architects.** Van Brunt & Howe, Kansas City — **[G]** 3008
- **Footprint.** OCR reads "13(10) by 52.5 feet, providing **656,250 square
  feet**". 656,250 ÷ 525 = 1,250 exactly, so the plan is **1,250 × 525 ft** =
  **381.0 × 160.0 m**. (The "14.5 acres" quoted is the Manufactures figure
  repeated; 656,250 sq ft is 15.07 acres.) Cost $650,000.
- **Same abandoned tower.** "a 400-foot tower designed for the north facade was
  abandoned" after high winds in the first winter — **[G]** 2951

### Palace of Liberal Arts

- **Plan.** "a quadrangle" — **[G]** 2751
- **Entrances.** "The main facade on the Sunken Gardens is enriched by **three
  magnificent Roman triumphal arches**, one in the center forming the main
  entrance and two smaller ones near the ends of the facade. The arches are
  connected by a **Doric colonnade** and **the corners are treated in the form of
  round pavilions**. The smaller triumphal arches are repeated near the ends of
  the two shorter facades." — **[G]** 2752
- **Roofline.** Flat; "The roof is supported by single trusses, spanning the
  entire exhibit space without columns." — **[G]** 2763
- **Style.** "The general architecture is of the period of **Louis XVI**." —
  **[G]** 2764
- **Recognisable by.** "its **many triumphal arches** and its **abundance of
  ornament**" — **[G]** 2765
- **On the roof.** "Liberal Arts is **the most heavily decorated of the
  Exposition palaces**. A massive **quadriga** and two flanking groups, which
  surmount the main triumphal arch entrance … **This is the most gigantic
  quadriga ever placed on any Exposition palace.**" — **[G]** 2815. Also
  "Apotheosis of Liberal Arts" groups on the pylons, "Ceramics" and "Invention"
  on the four corners of the end pylons, cupids with shields above the
  entablature, reclining figures over the broken pediment of the central
  door — **[G]** 1276–1290
- **Architects.** Barnett, Haynes & Barnett, St. Louis — **[G]** 2813
- **Footprint.** **525 × 750 ft** = **160.0 × 228.6 m**, 9.1 acres. Cost $480,000.
- **Sited.** Extreme east of the main picture, near the park border; faces
  north-west on the Plaza of Orleans and south-west on the Sunken Gardens,
  opposite Mines and Metallurgy — **[G]** 2741

### Palace of Mines and Metallurgy

The odd one out, and the guide knows it: "perhaps the most remarkable of the
palaces, being **an entirely new departure in Exposition architecture**"
(**[G]** 3407).

- **Plan.** Rectangular, matching Liberal Arts. "The side walls of the building
  are **set back 20 feet** and the extensions are treated with **screen effect**,
  affording fine **covered promenades around the entire building**." — **[G]** 3415
- **The screen.** "The base of the screen is adorned with **sculpture panels
  illustrating the operations of Metallurgy and Mining**"; and "distinguished
  from its sister palaces by a **huge frieze on the colonnade wall**" —
  **[G]** 3419, 3507
- **Entrances.** "**Four stately entrances** pierce the facades, each displaying
  a **pair of obelisks** and fine statuary ornamentation." — **[G]** 3421.
  **Obelisks, not columns — this is the visual signature.**
- **Centre.** "A **colonnade rotunda** marks the center of the building." — **[G]** 3430
- **Style.** "**composite, comprising features of the Egyptian, Byzantine and
  Greek**" — **[G]** 3431
- **Colour.** "further distinguished by a **lavish use of color**" — **[G]** 3421
- **On the roof/screen.** "Coal," "Iron," "Gold," "Copper" — four figures above
  the frieze line on the screen wall (Charles Mulligan); architectural figures
  between the columns; "Torch-bearer" with attendant figures and a frieze at the
  base of the obelisks — **[G]** 1191–1200
- **Architect.** Theo. C. Link, St. Louis — **[G]** 3511
- **Footprint.** **525 × 750 ft** = **160.0 × 228.6 m**, 9.1 acres. Cost $500,000.
- **Sited.** Inner part of the east wing of the fan, between Government Terrace
  and Art Hill, opposite Liberal Arts and Education. Its outdoor exhibits are in
  "**the gulch** leading southwest into the Plateau of States" — **[G]** 3404

### Palace of Machinery

- **Style.** "reflects the **spirit of renaissance daringly carried out**. The
  **German spirit** shows itself in the **high sloping roofs**, backing impressive
  and profusely decorated entrances." — **[G]** 3153
- **Recognisable by.** "its **red sloping roofs** and its **green capped
  towers**" — **[G]** 3143. **The only palace with a pitched roof, and it is red.**
- **Entrances.** "The treatment of the central entrances from the north and east
  is extremely ornate." Six entrances carry a repeated tympanum group — **[G]** 3156, 1236
- **On the roof.** "Shield Holders," repeated eight times above the cornice on
  the east and north entrances (A. A. Weinmann); "**Atlas with Globe**," a
  colossal group on the north facade (R. H. Perry); a group over the north
  pavilion — **[G]** 1235–1244
- **Interior.** No courts; high truss lines; broad concreted aisles — **[G]** 3170
- **Architects.** Wideman, Walsh and Boisseliere, St. Louis — **[G]** 3306
- **Footprint.** Dimensions line: **1,000 × 525 ft** = **304.8 × 160.0 m**,
  12.2 acres, cost $510,000 (**[G]** 3308). The architecture paragraph says
  "1,000 feet by 500 feet, **with a rectangle cut out of the southwestern
  corner**" (**[G]** 3158) — **the notch is real and should be modelled.** Its
  annex, the Steam, Gas and Fuels building, is **330 × 300 ft** (100.6 × 91.4 m)
  to the west, **and its boiler smokestacks are a landmark**: "the smokestacks of
  the boilers will readily locate it" (**[G]** 3146).
- **Sited.** South-easterly of the eight; north front across the Machinery
  Gardens from Transportation; east front on the lagoon facing Electricity —
  **[G]** 3131

### Palace of Transportation

- **Plan.** Rectangular, "**the most spacious of the exhibit palaces on the main
  picture**" — **[G]** 3321
- **Entrance — the best-measured feature at the whole fair.** "The east and west
  fronts are provided with **three magnificent entrances, embracing more than
  half of the entire facade**, each of the arched openings being **64 feet wide
  and 52 feet high**" — **19.51 m wide × 15.85 m high** — **[G]** 3323.
  Three of those on a 525 ft (160 m) end wall is 192 ft of opening in 525 ft;
  with their pylons they read as "more than half."
- **No columns.** "**This is the only building in the group that is not decorated
  with classic columns.** The decorative effect is produced by the use of
  **massive pylons** and sculptural ornaments." — **[G]** 3326
- **Roofline.** "Above each of the main entrances runs a **curving entablature**
  that gives support to colossal figures holding shields. The three arches,
  separated by square pylons, form a **gigantic porch that is flanked by round
  towers**." — **[G]** 3328
- **On the roof — the recognition mark.** The round towers "are crowned by
  **eagles holding on their backs the hollow, ribbed sphere of the universe,
  containing the solid sphere of the earth**, by which the building may be
  recognized." — **[G]** 3331
- **Style.** "an adaptation of the style prevalent in France at the time of the
  Louisiana Purchase" — **[G]** 3336
- **Working detail.** "At the east end **14 tracks enter the building**,
  providing four miles of trackage"; sixty doors — **[G]** 3334, 3351. It
  "presents its **station-like front** towards the east on the Plaza of Orleans"
  — **[G]** 3316
- **Architect.** E. L. Masqueray (the fair's designer-in-chief) — **[G]** 3396
- **Footprint.** **525 × 1,300 ft** = **160.0 × 396.2 m**, 15.6 acres. Cost $700,000.

---

## The head of the fan: Festival Hall, the Cascades, the Terrace

### Festival Hall

- **Dome.** 145 ft across (**44.2 m**), on a cylindrical base 200 ft across
  (**61.0 m**); the whole 200 ft high (**61.0 m**), the dome reportedly larger
  than St. Peter's — **[FH]**
- **On the dome.** "The **Victory** that surmounts the splendid dome, **the first
  Victory to take the form of a man**, was modeled by a woman, Miss E. B.
  Longman" (**[G]** 1071), and it was **gilded**: "'Victory,' crowning dome,
  gilded" (**[G]** 1268). **A gold figure on a cream dome, at the top of the
  hill — this is the single most visible object in the fair and the game should
  render it as gold.**
- **Entrance.** "Music" and "Dance" flanking the main entrance (August
  Lukemann); "Apollo and Muses" (Philip Martiny); a cartouche with two figures
  above the entrance (John Flanagan) — **[G]** 1266–1274
- **Before the door.** H. A. MacNeil's "The Triumph of Liberty," "an allegorical
  veil before the entrance to the Hall of Festivals" — and **the Main Cascade
  issues from it** (**[G]** 1074). Festival Hall's front door and the Cascade's
  source are the same architectural object.
- **Inside.** Auditorium seating 3,500 (some sources 4,500) — **[FH]**. The
  world's largest organ: 33 ft wide, 62 ft long, **40 ft high**, 140 speaking
  stops, 10,059 pipes — **[G]** 1773
- **Architect.** Cass Gilbert.
- **Flanks.** East and West Cascade Restaurants, matched in design, **1,200
  seats each** — **[FH]**; the guide calls them the "two pavilions" that with
  Festival Hall "form the point of the fan" (**[G]** 1699).

### The Cascades

Everything here is directly measured in the guide (**[G]** 1696–1748):

- **Three cascades**, the central one much the largest.
- The central one begins "in an artistic **hood, or veil**, just in front of
  Festival Hall … The water gushes forth from this fount **24 feet above the
  level of the terrace**" — **7.32 m**
- "spreads out into a stream **45 feet wide and 14 inches deep**" — 13.72 m wide,
  0.356 m deep — "and **leaps from weir to weir, down the long slope of ledges or
  steps**, spreading to a width of **150 feet** as it takes its final plunge into
  the Grand Basin" — 45.72 m at the bottom. **The cascade is a widening wedge,
  not a constant-width ribbon, and it is stepped, not smooth.** The game builds
  three parallel 8 m strips. The centre one should be a wedge from 13.7 m to
  45.7 m.
- The side cascades rise from fountains in basins in front of the two pavilions.
- "Four magnificent **jets d'eau**, or artificial geysers, arise from the Grand
  Basin at the foot of the side Cascades. On a quiet day these fountains throw
  streams which attain a height of **75 feet**" — **22.9 m**
- Flow **90,000 gallons per minute** over the three; pumps lift it about **90 ft**
  (27.4 m). (The pumping figure gives an independent check on the hill: the head
  the pumps had to beat is 90 ft ≈ 27 m from basin to fountain, which is the
  hill *plus* the 24 ft the water is thrown above the terrace plus friction.
  Consistent with a 12–18 m hill; **not** consistent with the 46 m the game once
  built.)
- Rough construction alone cost $120,000; balustrades and staircases another
  $100,000.
- **Sculpture** (H. A. MacNeil, main cascade): "Fountain of Liberty" at the head;
  "Physical Strength" balanced by "Physical Liberty" on the first leap; "Cupid
  with Dolphin" on successive leaps; "Pegasus and Sea Nymphs" on the last leap.
  Side cascades (Isidore Konti): "Atlantic Ocean" at the head of the west,
  "Pacific Ocean" at the head of the east, then figures on each successive leap
  — **[G]** 1292–1311

### The Grand Basin

- "**semi-circular in shape and 600 feet in diameter**" — **182.9 m** — **[G]** 1714.
  A semicircle, flat side toward the cascades.

### The Colonnade of States / Terrace of States

- "a **peristyle swinging around the west of the gardens** and connecting
  Festival Hall with **two elaborately finished kiosks**" — **[G]** 1090
- "At regular intervals along the terrace, in front of the Colonnade, are
  **seated female figures, emblematic of the fourteen states** developed from the
  Louisiana Purchase Territory." Each in its own shrine, the peristyle "formed
  of **seven hemi-cycles** on each side of Festival Hall" — **[G]** 1093, 1356
- "The Colonnade itself is embellished with **groups crowning the summits of its
  terminals**." — **[G]** 1100. West terminal group "Strength"; groups at the
  east end by Alexander Kncl; a bear for the lampadaire (**[G]** 1326)
- **So: a curved colonnade in fourteen bays, seven each side of the hall,
  with a seated figure in front of each bay and a sculptural group on each end.**
  The west terminus is the Directors' Club Pavilion (**[G]** 906).
- Approached "by way of successive flights of broad **pink stairways**" from the
  Plaza of St. Anthony and the Plaza of Orleans (**[G]** 1107). **Pink stairs, not
  ivory.**

### The Plaza of St. Louis and its monument

- **Louisiana Purchase Monument**, "**100 feet high**" (**30.5 m**), rising from
  the centre of the Plaza of St. Louis; designed by Masqueray; four groups of
  statuary at its base; **"Peace" crowning the shaft**, by Karl Bitter — **[G]** 1116.
  *The game builds it 43 m. It should be 30.5.*
- At the north end of the plaza, in line with Festival Hall and the monument,
  "**The Apotheosis of St. Louis**" — an equestrian statue "towering **fifty
  feet** into the air" (15.2 m) — **[G]** 1126

---

## The Pike

- "**Forty amusements**, which cost $5,000,000, extend **one and one-half miles**
  from the **Lindell Entrance west to Skinker Road**, **turning sharply to the
  south at that point**, and continuing in a direct line **between the Palaces of
  Transportation and Machinery on the east and the Foreign Governments' plaza and
  the Palaces of Agriculture and Horticulture on the west**." — **[G]** 5974
- **The Pike is an L, not a straight strip.** The game builds two straight rows
  along the north edge. The long leg runs east–west along the north; the short
  leg turns south at the west end. 1.5 miles = **2.41 km** total.
- At its entrance, Frederic Remington's "Cowboys Shooting Up a Western Town" —
  **[G]** 5961
- The Pike occupies the Catlin tract, "sixty acres … used entirely for
  concessions. The Pike runs the entire length of this tract, a distance of
  nearly a mile." — **[G]** 820

---

## The Aeronautic Concourse

The reason this world exists at all.

- **Location.** On the tract leased from Washington University; today "the field
  west of Olin Library extending to the Field House," with the commemorative
  plaque on the south-facing wall of McMillan Hall — **[WU]**
- **Size.** "roughly **14 acres**", fenced — **[WU]** — 56,656 m², e.g. a square
  238 m on a side. **The game's concourse is 250 × 210 m = 52,500 m². That is
  within 8% and needs no change.**
- **The fence.** A **30-foot** paling (9.14 m) "ostensibly to shelter the
  airships from the wind" — **[WU]**. **The game builds 2.4 m posts. This is the
  largest single error in the concourse: the fence was three storeys high and it
  is why the field reads as an enclosure in every photograph.**
- **From the Intramural Railway**, the concourse lies between Station No. 4 (the
  Convention Gate) and the gymnasium and Athletic Fields — **[G]** 918, 1000. The
  Model Indian School, the Alaska Pavilion and the ethnology area are further
  west; the barracks are "just south of the Aeronautic Concourse" (**[G]** 6584).
- **The prize and the course.** "the Exposition has offered a grand prize of
  **$100,000** to the airship which shall make the best record over a
  **prescribed course, marked by captive balloons**, at a speed of **not less
  than 20 miles an hour**." Other prizes for balloon races totalling $50,000;
  "five or six dirigible balloons, airships and aeroplanes in actual
  competition"; over 80 entries by 1 June — **[G]** 6193–6216.
  **Captive balloons mark the course.** The game marks it with three pylons
  flying flags. Balloons on cables would be right, and they are the fair's own
  description of the thing the pilot is flying around.

---

## What this changes in `world_stlouis.js`

Ordered by how much of the picture each one fixes. Step 5 works from this list.

1. **Coloured roofs.** Every palace roof is grey `0xb9b2a0`. Machinery's is red
   with green tower caps; the rest carry "dashes of color." **[G]** 857, 3143
2. **The 30-foot concourse fence** instead of 2.4 m posts. **[WU]**
3. **Roof sculpture.** Quadrigae on Manufactures, Education and Liberal Arts;
   stars on Electricity's six pyramidal towers; eagles-with-globes on
   Transportation's round towers; Atlas on Machinery's north front. Every palace
   in the guide is identified to the visitor **by what stood on its roof**, and
   the game has none of it. **[G]** 1159–1290
4. **A gilded Victory on Festival Hall's dome.** **[G]** 1268
5. **Palace footprints and identities** instead of eight random boxes — the
   dimensions above, in metres, are exact. (This is step 4.)
6. **The Cascade as a widening stepped wedge**, 13.7 m to 45.7 m. **[G]** 1709
7. **The Louisiana Purchase Monument at 30.5 m**, not 43. **[G]** 1117
8. **The Pike bent into its L**, 2.41 km long. **[G]** 5974
9. **Captive balloons** on the race course rather than pylons. **[G]** 6199
10. **A semicircular Grand Basin, 182.9 m across**, flat side to the cascades.
    **[G]** 1714

## What the record does not give

Stated so nobody mistakes a guess for a source:

- **No palace height is published anywhere in the guide.** The 25 m cornice used
  here is inferred from the Government Building's measured 82 ft, which is a
  building of the same order by the same fair — a good inference, and an
  inference.
- **No column counts** for any palace colonnade. Bay spacing has to come from
  photographs, not text.
- **No colour beyond "ivory white" and "dashes of color on the roofs"**, except
  Machinery (red/green) and Mines ("lavish"). Individual roof colours for the
  other six are unrecorded here and should be read off tinted plates if anyone
  wants them exact.
- **The Colonnade of States' length** is not given. Fourteen bays in seven
  hemicycles a side is the shape; the radius is not stated.
