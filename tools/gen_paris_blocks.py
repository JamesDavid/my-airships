# One box per CITY BLOCK, for the headset.
#
# Paris is 12,450 surveyed footprints drawn as instanced boxes. That is only a
# few draw calls, so it is not the draw calls that hurt — it is the vertices:
# 12,450 boxes of 24 vertices, body and roof, is ~600k per eye and 108 million a
# second at ninety hertz, which is about all a mobile chip has. And the overdraw
# of a thousand little boxes standing behind one another is worse.
#
# So for VR the footprints are merged into the blocks they belong to. NOT on a
# grid — a grid cuts across the streets and would pave over the Champs-Élysées.
# Blocks are found by CONNECTIVITY: the buildings of a terrace touch each other,
# and a street is fifteen to twenty-five metres of nothing. Stamp every
# footprint into a coarse raster, take the connected components, and what falls
# out is the block plan of the city.
#
# Each block becomes one box at the dominant angle of the buildings in it, sized
# to enclose them, and as tall as the tallest.
#
# Use: python tools/gen_paris_blocks.py
import json
import math
import os
import re
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CELL = 3.0            # raster resolution: finer than a street, coarser than a gap
GAP = 0               # no slack: a terrace touches, a street does not

src = open(os.path.join(ROOT, 'src', 'paris_buildings.js'), encoding='utf-8').read()
rows = json.loads('[' + re.search(r'\[\s*(\[.*?\])\s*,?\s*\];', src, re.S).group(1) + ']')
print('%d footprints' % len(rows))

def corners(b):
    x, z, w, l, ry, h = b
    c, s = math.cos(ry), math.sin(ry)
    # LOCAL X IS `l`, NOT `w`. world.js builds these as rw: bl, rd: bw — the
    # fourth field runs along the building's own x axis and the third across it.
    # Taking them the other way round turns every footprint through a right
    # angle, which is not obvious in the output and quietly ruins the blocks.
    out = []
    for sx in (-1, 1):
        for sz in (-1, 1):
            lx, lz = sx * l / 2, sz * w / 2
            out.append((x + lx * c + lz * s, z - lx * s + lz * c))
    return [out[0], out[1], out[3], out[2]]

# ---- stamp into a raster -------------------------------------------------
cells = {}
for i, b in enumerate(rows):
    cs = corners(b)
    xs = [p[0] for p in cs]; zs = [p[1] for p in cs]
    # ...only the cells the building ACTUALLY covers. Stamping the axis-aligned
    # bounding box instead fills the corners a rotated rectangle does not
    # occupy — for a long frontage at forty-five degrees that is twice its area
    # — and the surplus reaches across the street and welds the next block on.
    # It gave 105 blocks for the whole of Paris.
    x, z, w, l, ry, h = b
    c, s2 = math.cos(ry), math.sin(ry)
    hw, hl = l / 2 + CELL * GAP, w / 2 + CELL * GAP
    for gx in range(int(math.floor(min(xs) / CELL)) - GAP - 1, int(math.ceil(max(xs) / CELL)) + GAP + 2):
        for gz in range(int(math.floor(min(zs) / CELL)) - GAP - 1, int(math.ceil(max(zs) / CELL)) + GAP + 2):
            px = (gx + 0.5) * CELL - x
            pz = (gz + 0.5) * CELL - z
            lx = px * c - pz * s2
            lz = px * s2 + pz * c
            if abs(lx) <= hw and abs(lz) <= hl:
                cells.setdefault((gx, gz), []).append(i)

# ---- connected components over the raster --------------------------------
seen = set()
groups = []
for key in cells:
    if key in seen:
        continue
    q = deque([key]); seen.add(key); members = set()
    while q:
        gx, gz = q.popleft()
        members.update(cells.get((gx, gz), ()))
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                n = (gx + dx, gz + dz)
                if n in cells and n not in seen:
                    seen.add(n); q.append(n)
    if members:
        groups.append(sorted(members))
print('%d blocks (%.1fx fewer)' % (len(groups), len(rows) / max(1, len(groups))))

# ---- one box per block ---------------------------------------------------
out = []
for g in groups:
    bs = [rows[i] for i in g]
    # the block's angle is the dominant one of its buildings, weighted by size;
    # they are already at whatever angle their street runs
    best, bestw = 0.0, -1
    for b in bs:
        wgt = b[2] * b[3]
        if wgt > bestw:
            bestw, best = wgt, b[4]
    c, s = math.cos(-best), math.sin(-best)
    us, vs = [], []
    for b in bs:
        for (px, pz) in corners(b):
            us.append(px * c - pz * s)
            vs.append(px * s + pz * c)
    u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    cx = cu * math.cos(best) - cv * math.sin(best)
    cz = cu * math.sin(best) + cv * math.cos(best)
    h = max(b[5] for b in bs)
    # emitted in paris_buildings' own order — [x, z, across, ALONG, ry, h] with
    # the fourth field running along local x, so world.js can treat both lists
    # with exactly the same code
    out.append([round(cx, 1), round(cz, 1), round(v1 - v0, 1), round(u1 - u0, 1),
                round(best, 3), round(h, 1)])

body = ',\n'.join('[%g,%g,%g,%g,%g,%g]' % tuple(b) for b in out)
js = '''// One box per CITY BLOCK — the headset's Paris.
//
// GENERATED by tools/gen_paris_blocks.py from src/paris_buildings.js.
//
// %d blocks standing in for %d surveyed footprints, as [x, z, w, l, ry, h].
// Twelve thousand instanced boxes is only a few draw calls but about 600k
// vertices an eye, which is 108 million a second at ninety hertz — roughly all
// a mobile chip has — and the overdraw of a thousand little boxes behind one
// another is worse. In a headset these stand in their place.
//
// Found by CONNECTIVITY, not on a grid: a grid cuts across the streets and
// would pave over the Champs-Élysées. The buildings of a terrace touch and a
// street is fifteen to twenty-five metres of nothing, so stamping the
// footprints into a %g m raster and taking the connected components gives back
// the block plan of the city. Each block is one box at the dominant angle of
// its buildings, sized to enclose them all, as tall as its tallest.
export const PARIS_BLOCKS = [
%s,
];
''' % (len(out), len(rows), CELL, body)
open(os.path.join(ROOT, 'src', 'paris_blocks.js'), 'w', encoding='utf-8', newline='\n').write(js)
print('wrote src/paris_blocks.js (%d KB)' % (len(js) // 1024))
