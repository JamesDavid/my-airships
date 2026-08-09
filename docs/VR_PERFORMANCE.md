# The target, and what that rules out

Read this before proposing any rendering change. Most performance advice on the
web is desktop-shaped and several common suggestions are actively wrong here.

## The platform

- **Meta Quest 3**, standalone. Adreno 740, **tiled deferred** renderer.
- **Bandwidth-bound**, not compute-bound. On a tiler the expensive thing is
  moving pixels and vertices to and from tile memory, not shading them.
- 90 Hz, so **~11 ms a frame for everything**, both eyes.
- **Under 200 draw calls a frame** is the working budget.
- WebXR through the browser, three.js **r160 from a CDN, no build step.**

## Where we actually are

Measured by `tools/check_scenarios.mjs`, from the St-Cloud aerodrome:

| | |
|---|---|
| meshes in the Paris scene | 2,496 |
| **submitted over the Eiffel Tower** | **322** (577 before the smoke was cut) |
| **submitted from St-Cloud** | **533** — of which the aerodrome's own field is 303 |

Those two are measured in a *browser* with the cull applied, which is the honest
number. The headless checker counts a narrower set and reads lower; do not quote
it as the frame cost.
| budget | ~200 |

So this world is **draw-call bound**, by about 5×. That is the answer to
"confirm the bottleneck before optimizing" — it is already confirmed, and it
means resolution work will not help. The in-headset A/B (Options → Headset
resolution) is there to prove it rather than to find it: if stepping 0.9 → 0.7
does not move the frame rate, the number above is why.

**Options → Frame meter** puts fps, draw calls, triangles and the framebuffer
scale on the basket slate, live, inside the headset.

## Already done — do not "fix" these again

- **No post-processing in a headset.** `draw()` calls `renderer.render` in VR
  and `composer.render` only on the flat screen. On a tiler an EffectComposer
  forces a resolve of tile memory out to RAM and a re-read, which is the single
  most expensive thing available; it is not in the VR path.
- **MSAA on, no supersampling.** `antialias: true`, and with no post-pass it
  resolves on-tile, which is nearly free.
- **`preserveDrawingBuffer` is never set**, so the tiler does not load the
  previous frame back in.
- **No `MeshStandardMaterial`, no IBL.** Everything is Lambert, Phong or Basic.
- **Near plane is already 0.5 m.** Depth precision follows far/near, and this is
  the cheap end of that ratio. Nobody focuses closer than 0.3 m in a headset.
- **Foveation is already 1.0** (`renderer.xr.setFoveation(1)`). Maxed; the edge
  blur people report is that, working as intended. No gains left.
- **Shadows are switched off for the duration of a session** — a whole extra
  pass. See the check in `tools/check_vr.mjs`.
- **Chunked city with distance culling**: `CITY_NEAR = 1150`, buildings batched
  into ~1,000 chunk meshes, and only about 10% are in view from mid-city.

## What is NOT available

- **`OVR_multiview2` — three.js r160 has no support for it at all.** Grep the
  build: zero mentions. It would be the biggest single CPU win in WebXR, and it
  needs a three.js upgrade first, which is its own risk (this project has no
  build step and pins three by URL).

## What is worth doing, in order

0. **DONE — the clouds.** Twenty-two clouds of twenty-odd spheres were 430
   separate meshes: 464 of the 739 draws that are never culled at all, more
   than every monument in Paris put together, and the largest single item in
   the budget. `updateClouds` only ever moves `grp.position`, so a cloud is a
   rigid body and an `InstancedMesh` of it loses no animation whatever. Now two
   draws a cloud. **966 → 580 from the aerodrome.**

   The lesson generalises: before optimising a scene, count what is never
   culled and find out **what it actually is**. The assumption here was that
   the never-culled cost was the monuments. It was 63% clouds.

1. **Fewer draw calls.** 580 → 200 is the rest of the game. `InstancedMesh` /
   `BatchedMesh` for anything repeated; merge static geometry that shares a
   material. Fourteen instanced meshes exist already; the remaining calls are
   the landmarks and the ship.
0b. **DONE — the monuments are baked, not toggled.** A merged copy holds the
   same vertices in the same places, so close to it is indistinguishable from
   the original — which means for anything that never moves there is no reason
   to pay for the original at *any* distance. Nine of them are simply replaced
   by their merge; the detailed group stays in the scene hidden, costing
   nothing to draw and leaving real geometry for the size checks to measure.

   **The exception was the one that moves** — merging bakes transforms into
   vertices, so a merged copy of something that turns is *frozen*, and the
   Grande Roue really rotates at 0.025 rad/s. She had a distance swap to a
   frozen copy. She does not need one: she is **2 rims, 12 spokes and 16 cars**,
   which is identical geometry repeated round a circle, and that is what an
   `InstancedMesh` is for. **34 draws → 7, turning at every distance**, no
   frozen copy and no distance rule to get wrong.

   The general shape of that: *before freezing or hiding something that
   repeats, instance it.* A merge and an instance buy the same draw call; only
   the instance survives being animated.

   Two traps, both now guarded: a check asserts nothing which animates is ever
   baked; and the merger **skips instanced rows entirely**, because their
   geometry is one copy and the rest live in a matrix array the walker never
   reads — merging the wheel would have produced a single rim, a single spoke
   and a single car.

   Measured in the browser: **monument draws 262 → 75**, with 197 hidden and
   never submitted.

0b-detail. **The original per-monument figures.** Four of the twenty-three were 184 of their
   262 draws. Each monument of twelve draws or more now carries a copy of
   itself merged by material — same vertices, same silhouette — and the cull
   swaps to it past `LOD_FAR` (1,400 m), comfortably out in the haze. Measured
   in the browser, because the headless three gives every mesh its own material
   object and so cannot show the grouping:

   | | detail | far |
   |---|---|---|
   | Trocadéro | 58 | **2** |
   | Notre-Dame | 47 | **3** |
   | Madeleine | 45 | **2** |
   | Grande Roue | 34 | 17 |
   | Eiffel Tower | 13 | 5 |
   | **total** | **197** | **29** |

   Merging normally trades away frustum culling; these are *already* never
   culled, so there is nothing to give up. That is what makes it cheap here and
   not everywhere. The detailed group is kept and swapped back in close to,
   which also means every check that measures a monument's real size still has
   real geometry to measure.

0d. **DONE — the ship's dead structure is merged.** With the city batched and
   the field baked, the largest single object left was the player's own airship:
   **132 draws in 52 materials**. Most of her is dead structure — hull plates,
   keel rails, wicker, cornices, placards, fins — and what moves is the tiller,
   cords, levers, propeller, needles, trim weights, duckboard and slate.

   The two are told apart **without a list**: anything the code keeps a
   reference to is presumed to be something the code intends to move, and is
   left alone with its whole subtree. A hand-written list of exceptions would
   rot the first time somebody added a fitting. (`group`, `pitchGroup` and
   `scene` are excluded from that sweep — they contain the whole ship.)

   **132 → 87 draws**, all thirteen grabbable fittings still reachable, checked
   by the reach and grab tests that already existed.

0a. **DONE — the chimney smoke is three plumes, and they follow you.** It was
   54 plumes of 5 puffs, each puff its own transparent mesh: **270 draws**, the
   largest single item in the frame over the Tower. The code already knew and
   thinned the city to 26 plumes on phones rather than fix it.

   The fix was a design argument, not a rendering one. Smoke here is an
   *instrument* — "the city itself shows the wind" — and a pilot reads the
   surface wind off a chimney **near him**. He cannot read one two kilometres
   away, where it is a grey speck. So there are three, they re-home onto a
   rooftop near the ship whenever they fall behind, and they fade in so the
   change is not seen. **270 → 15**, and where there is no city to smoke — over
   St-Cloud, in the park — they go out entirely: **0**.

   The general lesson, and it is the better one: *before making a thing cheaper,
   ask what it is for.* Instancing 270 puffs would have been the clever answer
   and the wrong one.

0c. **DONE — the housetops shed their trim.** A house is three instanced rows:
   the block, its roof cap, its chimneys. So dropping the fiddly ones at range
   saves *draw calls*, not merely triangles. At half the haze's reach a 1 m
   chimney subtends **1.6 pixels an eye** — the worst thing there is to hand a
   tiler, which shades in 2×2 quads and so pays four times over for a one-pixel
   triangle. The roof cap is 15.9 px there and still shapes the skyline, so it
   holds on to 0.8 of the reach. **Over the Opéra the city costs 79 draws
   instead of 111**; 18–33 saved from every city viewpoint.

2. **Cull by screen-space size, not distance.** The chunk cull is still a
   distance test — the banding above is a coarse stand-in for it. A small object
   at 400 m and a large one at 400 m cost the same to submit and are not worth
   the same.
3. **LOD on the monuments.** They are marked `vrFar` and deliberately never
   culled — the Deutsch prize is flying to a Tower you can see from St-Cloud,
   5.4 km off — so they need cheap far versions rather than culling.
4. **Quantise vertex attributes** (Int16 positions, Int8 normals) and drop
   unused UV2/tangents. Pure bandwidth, and bandwidth is the constraint.

## What is NOT worth doing here, and why

- **Pulling the far plane in.** The usual advice is to cut far to buy depth
  precision — but the near plane is already out at 0.5, which is the cheap half
  of the ratio, and the sight lines are the game: 5,392 m aerodrome to the
  Tower, 9,763 m to Montmartre. Going 12,000 → 10,000 buys 1.2× of precision
  and costs Montmartre from St-Cloud. Not a trade worth making.
- **A logarithmic depth buffer** for coplanar surfaces. Expensive on mobile.
  Use `polygonOffset`, which the street decals already do.
- **Anything that adds a full-screen pass.** See the tile-memory note above.
