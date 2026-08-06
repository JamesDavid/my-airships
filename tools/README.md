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

Paris was built the same way; see `docs/PERIOD_NOTES.md`.
