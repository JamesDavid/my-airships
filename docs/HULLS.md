# The hulls and the shifting weights

What the envelopes were actually made of, how they were hung, and how the
counterweights worked — from the memoir, with the game's model checked against
it. Sources as in [HELM.md](HELM.md): the 1904 English *My Airships*
([Gutenberg #42344](https://www.gutenberg.org/ebooks/42344)) against the French
original *Dans l'air* ([archive.org](https://archive.org/details/danslair00santgoog)).

## The envelopes

**Japanese silk, varnished, and nothing else.** For the No. 1 he had 30 kg to
spend on the balloon material and its varnish together, which ruled out the
usual construction:

> "I gave up the usual network and *chemise*, or outer cover; indeed, I
> considered this second envelope, holding the balloon proper within it, to be
> not only superfluous but harmful, if not dangerous. Instead I attached the
> suspension cords of my basket **directly to the balloon envelope by means of
> small wooden rods introduced into long horizontal hems sewed on both sides to
> its stuff** for a great part of the balloon's length." — Ch. VI

That is the distinctive thing about how his ships were rigged, and it is why
they look so bare next to a Zeppelin: no net over the bag, no outer cover, just
a seam down each flank with battens in it and the suspension taken straight off
them.

**Dimensions, as built.** The game's figures already match the book:

| | book | game |
|---|---|---|
| No. 1 | 25 m × 3.5 m, 180 m³, "cylindrical, terminating fore and aft in cones" | 25 × 3.5 |
| No. 3 | 20 m × 7.5 m, 500 m³, "shorter and very much thicker" | 20 × 7.5 |
| No. 5 keel | 18 m, 41 kg, aluminium joints | 18 m truss |
| No. 3 keel | a 10 m bamboo pole | 10 m pole |

The No. 3 also ran on **ordinary illuminating gas**, not hydrogen — its 500 m³
gave three times the No. 1's lift, so he could afford a gas with half the lift
of hydrogen and be free of the Jardin d'Acclimatation's hydrogen plant.

**The ballonnet, and its disappearance.** The Nos. 1 and 2 carried an interior
air balloon to hold the envelope's shape:

> "the little interior air balloon, which was sewed inside to the bottom of the
> great balloon like a kind of closed pocket… *G* is the great balloon filled
> with hydrogen gas, *A* the interior air balloon, *VV* the automatic gas
> valves, *AV* the latter's air valve, and *TV* the tube by which the rotary
> ventilator fed the interior air balloon." — Ch. X

The air valve was deliberately **weaker** than the gas valves, so that under
pressure all the air left the ballonnet before any hydrogen left the envelope.
The fan was driven off the motor, and it twice "refused to work adequately at
the critical moment" — which is what folded the No. 2. From the No. 3 he threw
it out: the rounder form held itself, helped by the bamboo pole.

**Piano wire.** From the No. 4-5 era, and he counts it among his best ideas:

> "I asked myself why I should not use this same piano wire for all my dirigible
> balloon suspensions in place of the cords and ropes used in all kinds of
> balloons up to this time… These piano wires, **8/10ths of a millimetre** in
> diameter, possess a high coefficient of rupture and a surface so slight that
> their substitution for the ordinary cord suspensions constitutes a greater
> progress than many a more showy device. Indeed, it has been calculated that
> **the cord suspensions offered almost as much resistance to the air as did the
> balloon itself**." — Ch. XIII

## The shifting weights

This is the part the game had wrong. The system is **two sacks, not one sliding
weight**:

> "There now remained nothing to devise but a system of shifting weights, which
> from the very first I saw would be indispensable. For this purpose I placed
> **two bags of ballast, one fore and one aft, suspended from the balloon
> envelope by cords. By means of lighter cords each of these two weights could
> be drawn into the basket**, thus shifting the centre of gravity of the whole
> system. **Pulling in the fore weight would cause the stem of the balloon to
> point diagonally upward; pulling in the aft weight would have just the
> opposite effect.**" — Ch. VI

Two things follow that are easy to get backwards:

1. They do not slide along a rail from end to end. Each hangs at its own end,
   and is **hauled inboard toward the basket** — one at a time. At rest both
   hang out at the extremities.
2. Nose-up is the **fore** weight coming in. That reads oddly at first, because
   "move weight aft to raise the nose" makes you picture a single weight
   travelling backwards — but the weight being moved aft *is the one that was
   out at the bow*, and the aft one never moves.

**They moved to the keel with the No. 3**, and that mattered more than he
expected:

> "These, because of the **greater distance they were now set apart at the
> extremities of the pole keel**, worked with an effectiveness that astonished
> even myself. This proved my greatest triumph, for it was already clear to me
> that the central truth of dirigible ballooning must be ever: 'To descend
> without sacrificing gas and to mount without sacrificing ballast.'" — Ch. XI

**The guide rope is part of the same system**, not a separate thing:

> "with me it is the central feature of my shifting weights (Figs. 8 and 9)"
> — Ch. XVII

and over water it becomes a true *stabilisateur*: "According to its greater or
less immersion, therefore, it ballasts or unballasts the air-ship."

## What the game does now

- Two sacks, hung at the keel extremities (at the envelope's flanks on the No. 1,
  No. 2 and the No. 3's pole, which have no keel to hang from), each on its own
  cord, with the lighter hauling cord drawn to the basket.
- Nose-up hauls the **fore** sack in and leaves the aft one out; nose-down the
  reverse. Verified on the No. 6: at rest both at ±9 m; at full nose-up the fore
  sack stands at +1.6 m and the aft at −9 m.
- It previously drew **one** sphere sliding along the keel — the right physics,
  since the trim response was always modelled as a shift of the centre of
  gravity, but the wrong object and the wrong motion.

## Still not modelled

- The **ballonnet** and its motor-driven fan on the Nos. 1 and 2. The game has
  the *consequence* — envelope slack, folding, the propeller fouling the
  suspension — but not the air balloon itself, nor the fan that could fail.
- The **battened hems** along the envelope's flanks: the suspension currently
  meets the hull at a line of points rather than at a visible seam with rods.
- Illuminating gas versus hydrogen on the No. 3.
