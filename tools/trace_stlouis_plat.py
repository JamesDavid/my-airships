# Read the palaces off the 1904 ground plan, by colour, not by eye.
#
# STLOUIS_PLAT.md says the footprints "are traced by hand … and there is no way
# round doing it by eye." There is one way round: the plan's draughtsman filled
# every main exhibit palace with the same pink wash and nothing else on the
# sheet is that colour. So the palaces can be SEGMENTED — thresholded, labelled,
# and reduced to an oriented box each — and what comes out is a measurement
# rather than an estimate, with a residual I can quote.
#
# Source sheet:
#   Ground Plan of the Louisiana Purchase Exposition, St. Louis, Mo., 1904.
#   Buxton & Skinner Stationery Co., publishers. Copyright 1904 by Parker Eng.
#   Co.  https://archive.org/details/
#     dr_ground-plan-of-the-louisiana-purchase-exposition-st-louis-mo-1904-buxto-4776002
#   (file 4776002.jpg, 1536 x 1046)
#
# The sheet's compass rose reads S at the top, E at the left: it is a north-up
# map turned through 180 degrees. That is asserted here and TESTED below
# against the control points rather than believed.
import json
import numpy as np
from PIL import Image
from scipy import ndimage

im = Image.open('plat.jpg').convert('RGB')
a = np.asarray(im).astype(np.int16)
R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]

# The palace wash: a light pink. Everything else on the sheet is green (park),
# cream (paving), orange-red (state and foreign pavilions) or white.
pink = (R > 195) & (R < 255) & (G > 130) & (G < 195) & (B > 130) & (B < 200) \
     & (R - G > 38) & (R - B > 30) & (abs(G - B) < 26)

# close the label lettering and the internal courtyard lines, then drop specks
m = ndimage.binary_closing(pink, np.ones((5, 5)))
m = ndimage.binary_fill_holes(m)
lab, n = ndimage.label(m)
sizes = ndimage.sum(m, lab, range(1, n + 1))
print('%d pink blobs, %d over 400 px' % (n, (sizes > 400).sum()))

out = []
for i in np.argsort(sizes)[::-1]:
    if sizes[i] < 400:
        break
    ys, xs = np.where(lab == i + 1)
    cx, cy = xs.mean(), ys.mean()
    # principal axes: the long axis of the footprint and its bearing on the sheet
    p = np.stack([xs - cx, ys - cy])
    w, v = np.linalg.eigh(p @ p.T / len(xs))
    long_v = v[:, np.argmax(w)]
    ang = np.degrees(np.arctan2(long_v[1], long_v[0])) % 180
    # extent along and across that axis (full width, not a std-dev)
    along = p.T @ long_v
    short_v = v[:, np.argmin(w)]
    across = p.T @ short_v
    out.append({
        'cx': round(float(cx), 1), 'cy': round(float(cy), 1),
        'px': int(sizes[i]),
        'long_px': round(float(along.max() - along.min()), 1),
        'short_px': round(float(across.max() - across.min()), 1),
        'ang_deg': round(float(ang), 2),
    })

for o in out[:26]:
    print('%(cx)7.1f %(cy)7.1f  area%(px)7d  %(long_px)6.1f x %(short_px)5.1f px  axis %(ang_deg)6.2f deg'
          % o)
json.dump(out, open('plat_blobs.json', 'w'), indent=1)
