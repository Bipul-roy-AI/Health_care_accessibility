# Distance atlas

`atlas.html` shows how far each part of Bangladesh is, in a straight line, from the nearest mapped hospital in the DGHS registry, summarised for 544 upazilas/thanas (ADM3), 64 districts and 8 divisions. It complements [Hospital research](HOSPITAL_RESEARCH.md), which measures from a single chosen place.

## What it shows

- Upazila choropleth with seven measures: median, 90th-percentile and nearest-any-hospital distance; hospital points, government hospital points and points per 1,000 km² inside each polygon; approved beds at mapped facilities. Click or search an upazila for all of its figures.
- National distance curves: share of land area within 0.5–40 km of a government, any, or non-government hospital.
- Division comparison: land within 5/10/20 km, median and 90th-percentile distance, and hospital listings per 100,000 (BBS Census 2022 division totals).
- Approved beds by division and ownership, facilities by decade of establishment, and how many facilities report service fields.
- Downloads: the 544-row upazila CSV, every JSON behind the page, and the upazila polygons.

## Method

- **Hospitals** reuse `HOSPITAL_TYPES` and the government-ownership set from `scripts/build_statistics.py`, so counts match the Statistics and Hospital research pages: 8,363 active listings, 6,027 with published coordinates (557 government, 5,470 other). Jail and military hospitals are in that list even though public access is restricted.
- **Grid:** 2 km cells over the national boundary in UTM 46N (41,924 cells). Nearest-point distances come from a k-d tree (SciPy). Cells are assigned to polygons by intersection.
- **Boundaries:** BBS / OCHA ROAP via geoBoundaries gbOpen BGD ADM2 and ADM3 (simplified; CC BY 3.0 IGO). geoBoundaries tags boundaryYear 2020; the source dataset is HDX "as of 2015". The ADM2 file is byte-identical to `data/research/districts.geojson`. Upazilas join the study's 544 BBS pcodes by (district pcode, name), one-to-one. Display copies are rounded to 4 decimal places.
- Registry-label counts (DGHS administrative fields) include listings without coordinates. Point counts use only published coordinates inside a polygon; 17 hospital points fall outside the simplified coastline.

## Limits

- Shares of **land area**, not people. Uninhabited land (Sundarbans, chars, water inside coastal polygons) inflates distances in Bagerhat, Bhola, Patuakhali, Cox's Bazar and Satkhira.
- **Straight-line kilometres**, not travel time. Rivers, ferries and roads are ignored.
- 7 small Dhaka thanas contain no grid cell; 42 upazilas have fewer than 5 cells and are marked low-confidence.
- Approved beds are licensed or sanctioned beds, not functional beds or service capacity. Only 11.7% of active facilities report emergency/ambulance/IPD fields, and 37.1% report an establishment year.
- A listing does not confirm a hospital is open or offers a given service.

## Rebuild

The atlas is a dated snapshot. The daily registry workflow does not rebuild it; when `data/dghs/index.json` changes, `tests/test_atlas.py` skips the snapshot check with a reminder.

```sh
pip install shapely pyproj scipy numpy
# geoBoundaries gbOpen BGD simplified GeoJSON (Git LFS; use media.githubusercontent.com):
#   releaseData/gbOpen/BGD/ADM2/geoBoundaries-BGD-ADM2_simplified.geojson
#   releaseData/gbOpen/BGD/ADM3/geoBoundaries-BGD-ADM3_simplified.geojson
python3 scripts/build_atlas.py --adm2 ADM2.geojson --adm3 ADM3.geojson
python3 -m unittest tests.test_atlas
BASE_URL=http://127.0.0.1:8000 node tests/atlas.cjs
```

No pharmacy data and no figures, data or code from Al Jubaer's #30DayMapChallenge series are used; the series is credited as inspiration.
