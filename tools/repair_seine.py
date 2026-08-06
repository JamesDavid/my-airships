# The Seine doubles back on itself. Straighten it out.
#
# WHAT THE PILOTS SAW  (bug_reports #26 and #30, both filed from the same reach)
#   "junky polygons jn the river"
#   "should there be a bridge here where the land breaks the river"
#
# WHAT IS ACTUALLY THERE. SEINE_XZ in src/paris_terrain.js is a walk through
# OpenStreetMap's own ordered ways — which fixed the old hand-traced river, but
# left two faults of its own:
#
#   1. NINETEEN EXACT DUPLICATE STATIONS. Where two ways meet at a shared node
#      the walk emits that node twice. A zero-length segment in a ribbon is a
#      zero-area quad: degenerate triangles with no normal. That is the "junky
#      polygons".
#
#   2. TWO CLOSED EXCURSIONS. Between stations 93 and 122 the walk runs 1.1 km
#      north-west, turns round, comes 1.1 km back to the very station it started
#      from, and sets off again on a slightly different alignment. Stations 108
#      and 134 do the same. A ribbon through a 177-degree reversal is a bow-tie:
#      the water folds over itself and pinches shut, which is what reads as the
#      land breaking the river.
#
# A river does not return to where it was. So: delete every closed excursion —
# every run that leaves a station and comes back to it — and every zero-length
# step, which is just an excursion of length nothing. One rule handles both.
#
# This edits the generated SEINE_XZ in place rather than re-running
# gen_paris_terrain.py, because that would want IGN's whole elevation service
# again for a fault that is only in the river's plan. The bed the old line
# carved stays carved: the two alignments are never more than 160 m apart and
# the channel is 144 m wide with sixty more of graded bank either side, so what
# is left is a shallow dip beside the water, not a scar. gen_paris_terrain.py
# is fixed too, so a real regeneration does not put it back.
import io
import json
import math
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src', 'paris_terrain.js')
TOL = 1.0          # metres: two stations this close are the same place


def load():
    s = io.open(SRC, encoding='utf-8').read()
    m = re.search(r'export const SEINE_XZ = (\[.*?\]);\n', s, re.S)
    if not m:
        raise SystemExit('could not find SEINE_XZ in ' + SRC)
    return s, m, json.loads(m.group(1))


def excursions(P):
    """Every run that leaves a station and comes back to it, longest first."""
    out = []
    i = 0
    while i < len(P):
        last = -1
        for j in range(len(P) - 1, i, -1):
            if math.hypot(P[j][0] - P[i][0], P[j][1] - P[i][1]) <= TOL:
                last = j
                break
        if last > i:
            out.append((i, last))
            i = last + 1
        else:
            i += 1
    return out


def turn_at(P, i):
    a = math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0])
    b = math.atan2(P[i + 1][1] - P[i][1], P[i + 1][0] - P[i][0])
    d = math.degrees(b - a)
    while d > 180:
        d -= 360
    while d < -180:
        d += 360
    return d


# A river's real bends are gentle. Measured on this line once the excursions are
# out, the median turn between stations is 0.6 degrees and the 95th percentile
# is 17; then there is a clean cliff to 41, 57, 94, 162, 170. Anything past a
# hundred is the walk stepping backwards over a junction node, not a meander.
SPIKE = 100.0


def repair(P):
    rounds = 0
    while True:
        rounds += 1
        if rounds > 400:
            raise SystemExit('the repair did not converge')
        exc = excursions(P)
        if exc:
            i, j = exc[0]
            print('   station %d comes back to itself at %d — dropping %d station%s'
                  % (i, j, j - i, '' if j - i == 1 else 's'))
            del P[i + 1:j + 1]
            continue
        spikes = sorted(((abs(turn_at(P, i)), i) for i in range(1, len(P) - 1)),
                        reverse=True)
        if spikes and spikes[0][0] > SPIKE:
            d, i = spikes[0]
            print('   station %d turns %.0f degrees at (%.0f, %.0f) — a step '
                  'backwards, not a meander; dropping it' % (i, d, P[i][0], P[i][1]))
            del P[i]
            continue
        return P


def report(P, label):
    dup = sum(1 for i in range(1, len(P))
              if math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]) < TOL)
    near = 0
    for i in range(len(P)):
        for j in range(i + 6, len(P)):
            if math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]) < 40:
                near += 1
    worst, wi = 0.0, 0
    for i in range(1, len(P) - 1):
        a = math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0])
        b = math.atan2(P[i + 1][1] - P[i][1], P[i + 1][0] - P[i][0])
        d = math.degrees(b - a)
        while d > 180:
            d -= 360
        while d < -180:
            d += 360
        if abs(d) > abs(worst):
            worst, wi = d, i
    segs = [math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])
            for i in range(1, len(P))]
    length = sum(segs)
    print('%s: %d stations, %d zero-length, %d non-adjacent pairs under 40 m, '
          'sharpest turn %.0f deg at %d, length %.2f km'
          % (label, len(P), dup, near, worst, wi, length / 1000))
    return dup, near, abs(worst)


s, m, P = load()
print('BEFORE')
report(P, '  ')
print('\nREPAIRING')
P = repair([list(p) for p in P])
print('\nAFTER')
dup, near, worst = report(P, '  ')

if dup or near or worst > SPIKE:
    raise SystemExit('\nthe repair did not clean it up — refusing to write')

body = '[' + ','.join(
    '[%s,%s,%s]' % (round(p[0], 1), round(p[1], 1), round(p[2], 2)) for p in P) + ']'
io.open(SRC, 'w', encoding='utf-8', newline='\n').write(
    s[:m.start(1)] + body + s[m.end(1):])
print('\nwrote %s' % SRC)
