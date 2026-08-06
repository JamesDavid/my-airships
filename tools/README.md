# tools

Off-line generators. Nothing here ships to the browser — they write the
`src/*_geo.js` and `src/*_streets.js` modules that do.

Run them from a scratch directory (they leave tiles and OSM dumps behind), with
Python 3 and Pillow:

```
python fetch_monaco_dem.py     # 49 terrain tiles -> monaco_dem.png
python fetch_monaco_osm.py     # Overpass -> monaco_osm.json, monaco_osm2.json
python gen_monaco.py           # -> src/monaco_geo.js, src/monaco_streets.js
```

`gen_monaco.py` prints what it kept and what it threw away. Read that output:
it is the record of which streets were screened out of 1902 and why.

Paris is the same idea with different data:

```
python fetch_paris_dem.py      # IGN RGE ALTI bare earth -> paris_dem.json
python fetch_paris_seine.py    # Overpass -> paris_water_osm.json
python gen_paris_terrain.py    # -> src/paris_terrain.js
```

Paris does NOT use the terrain tiles Monaco uses. They are a surface model and
see rooftops; over a 550 m mountain that is nothing, but Paris's whole relief is
about a hundred metres and the same data puts the Seine sixteen metres above its
own quays. `fetch_paris_dem.py` says so at the top, with the numbers.

See `docs/PERIOD_NOTES.md` for the method and how it was checked.
