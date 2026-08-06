# The landmarks of Paris, 1901 — what each one was, and where its figures come from

Step 5 of [PARIS_1901.md](PARIS_1901.md). `paris_geo.PLACES` named twenty-seven
landmarks and `world.js` modelled sixteen. **A coordinate is not a building**, so
the other eleven stood as nothing at all — and worse than nothing, because the
frontage generator ran rows of houses straight over the Louvre and the Hôtel de
Ville.

Same discipline as [STLOUIS_PALACES.md](STLOUIS_PALACES.md): the source comes
first and the geometry follows from it, and **where a figure is inferred it says
so**. `src/paris_landmarks.js` carries a `src` field on every entry:

| | |
|---|---|
| **`measured`** | the footprint OpenStreetMap holds, reduced to its smallest-area oriented box by `tools/fetch_paris_landmarks.py`. For these the outline *is* the 1901 outline, because they are all still standing on the same ground. |
| **`published`** | a figure from the record, used where the fetch would not give one usable building. |

The projection is checked, not assumed: the Madeleine's fetched footprint centre
comes out **5 m** from the coordinate `PLACES` already held, and the Théâtre du
Châtelet's **50 m**. `PLACES` was right.

---

## The 1901 screen

This is the part that makes it a period world rather than an import. Every one
of these needed a date checked:

- **Gare d'Orsay** — opened **28 May 1900**. One year old in October 1901, and a
  very distinctive riverside mass right where the Deutsch runs cross the water.
- **Petit Palais** — 1900 Exposition work by Charles Girault, a year old.
- **Colonne Vendôme** — 1810; **pulled down by the Commune in 1871 and
  re-erected in 1875**, so it stands in 1901. It would have been wrong to build
  it for a world set thirty years earlier and wrong to omit it for this one.
- **Colonne de Juillet** — 1840, on the site of the Bastille.
- **Hôtel de Ville** — the medieval one **burned in 1871**; this is the
  replacement, Ballu and Deperthes, finished **1892**. Nine years old.
- **Louvre** — **the Tuileries Palace that used to close its western end burned
  in 1871 and was demolished in 1883.** So by 1901 the Louvre is already the
  open U it is today, and it must *not* be closed. This is the single most
  likely thing to get wrong from a modern photograph, because a modern
  photograph shows exactly the right answer for the wrong reason.
- **Place de la République** — Morice's bronze Republic was set up in 1883.

---

## The buildings

### Measured — footprint from OpenStreetMap

| | footprint | height used | what it is |
|---|---|---|---|
| **Église de la Madeleine** | 128.5 × 43.3 m | 30 m | A Roman temple and nothing else: **fifty-two Corinthian columns all the way round**, a pediment, no dome and no tower. Built as a peripteral colonnade, which is what makes it unmistakable from the air. |
| **Gare d'Orsay** | 220.7 × 94.1 m | 32 m | A hotel front on the quay with the **glazed barrel vault** of the train hall behind it, and the two great clocks on the end wall. |
| **Théâtre du Châtelet** | 91.5 × 45.7 m | 26 m | The 1862 theatre on the place. |
| **Colonne Vendôme** | 6.5 × 6.4 m | 44 m | Shaft on a plinth, figure on top. |
| **Colonne de Juillet** | 18 × 18 m | 47 m | The July Column, with the gilt *Génie de la Liberté*. |
| **Place de la République** | 224.8 × 65.5 m | — | A *place*, not a building: paving and the bronze. |
| **Grand Palais** | 240 × 159 m | 44 m | Already modelled; kept in the table as a **control**, and it matches. |

The Opéra Garnier was also fetched as a control — 100.8 × 148.8 m, 70 m high —
and agrees with what was already built.

### Published — figure from the record, stated as such

| | footprint | height | why not measured |
|---|---|---|---|
| **Palais du Louvre** | 420 × 190 m | 30 m | OSM maps it as courtyards and wings — *Cour Marly*, *Cour Visconti*, ministry blocks — not as one building. |
| **Hôtel de Ville** | 110 × 85 m | 48 m + belfry | The largest building near the coordinate came back as **Le BHV Marais**, the department store across the road. |
| **Petit Palais** | 130 × 90 m | 24 m + dome | It sits in the Grand Palais's shadow: an area query returns its much larger neighbour. |
| **Vaugirard** | 62 × 34 m | 14 m | **Lachambre's balloon works**, where Santos-Dumont's envelopes were actually made — the one address in the list that belongs to him. Long gone and never surveyed, so it is built from the record like the palaces of St. Louis: a works yard and a shed long enough to lay an envelope out in. |

---

## What is still owed

- The published four should be replaced with measured footprints when someone
  works out a query that separates the Louvre's wings from its courtyards. The
  positions are right either way — they come from `PLACES`, which the measured
  ones confirm to within fifty metres.
- **Heights are massing, not survey.** None of these carries a cited height; they
  are chosen to look right against the ones that do (the Opéra's 70 m, the
  Vendôme column's 44). A pilot at 150 m reads silhouette and footprint, and
  those are sourced; the cornice line is not.
- Every landmark now has a **site** in `paris_plan.SITES`, sized from its own
  footprint, so the frontage generator keeps off it. That radius is derived
  rather than typed, so it cannot drift from the building actually drawn.
