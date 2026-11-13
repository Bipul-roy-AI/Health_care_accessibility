# Distance and location quality

> **Now part of the Access page.** The Distance page was merged into `accessibility.html`: choose *Basis → Land* on its map for these measures; the national curves are in *People versus land* and the coordinate audit in *Location data quality*. `atlas.html` redirects. The data files in `data/atlas/` and this method are unchanged.

`atlas.html` (the **Distance** page) shows straight-line distance to the nearest DGHS hospital and primary-care facility for every division, district, upazila/thana and union in Bangladesh. `scripts/build_atlas.py` also produces the facility-location audit used by every map on the site.

## Location quality audit

A published DGHS coordinate is used for maps and distances only if it:

1. lies within **1 km of the district recorded in the same DGHS record** (1 km allows for boundary simplification), and
2. is **not identical** (6 decimals) to a coordinate of a facility recorded in another district or upazila. Shared coordinates across areas are placeholders: for example, 87 hospitals and diagnostic centres from different upazilas share one point near Savar.

Snapshot of 2026-11-13: of 28,462 published active coordinates, **5,106 (17.9%) are flagged**: 2,508 lie outside their recorded district (1,396 by more than 20 km, up to 467 km) and 3,082 share a coordinate across areas (a record can have both). For hospitals, 1,468 of 6,027 are flagged.

Flagged records stay in every count by recorded area; they are only hidden on maps (Find care, Map, Access study) and excluded from distance calculations. `data/atlas/flagged-locations.csv` lists each record, its reason, its distance from the recorded district and the district it falls in. `data/atlas/location-quality.json` holds the summary and the flagged IDs that the pages load.

## Levels and boundaries

| Level | Areas | Source |
| --- | --- | --- |
| Division | 8 | dissolved from the BBS districts, so all levels nest |
| District | 64 | geoBoundaries gbOpen BGD ADM2 |
| Upazila / thana | 544 | geoBoundaries ADM3, joined one-to-one to the study's BBS pcodes |
| Union | 5,160 | geoBoundaries ADM4, assigned to the upazila containing its representative point |

All boundaries come from the Bangladesh Bureau of Statistics (BBS) and OCHA ROAP via geoBoundaries (CC BY 3.0 IGO). geoBoundaries tags boundaryYear 2020; the source dataset is HDX "as of 2015". Union IDs are `<upazila pcode>-U<nnn>`, not official BBS codes. Unions are published as TopoJSON (`data/boundaries/bangladesh-unions.topojson`, 2.2 MB, 0.7 MB compressed).

The map can show a reference basemap under the polygons: grey OpenStreetMap (default), standard OpenStreetMap, OpenTopoMap terrain, or none. Basemaps are for orientation only and are not used in any calculation. With a basemap on, fills are drawn at 72% opacity so roads, rivers and relief show through.

The earlier division layer (geoBoundaries ADM1 from Wikimedia Commons) differed from the BBS districts by 5–24% of each division's area and has been replaced.

## Distance method

- **Classes:** government hospitals, non-government hospitals, any hospital, primary care. Hospitals use `HOSPITAL_TYPES` from `scripts/build_statistics.py`; government = government, autonomous or semi-autonomous ownership. Primary care = community clinics, union health centres and sub-centres, UH&FWC, MCWC, urban primary-care centres, urban dispensaries, school health and family-planning clinics.
- **Grid:** 1 km cells over the OpenStreetMap national outline in UTM 46N (167,700 cells). Distance from each cell centre to the nearest usable point (SciPy k-d tree). Each cell belongs to exactly one union, and so to one upazila, district and division.
- **Per area:** median, 90th percentile and maximum distance, and the share of land within 2, 5, 10 and 20 km. Unions store median and the 5 and 10 km shares only.
- **Disparities:** for any measure, the page reports the lowest, median and highest area value, the ratio of the mean of the top 10% of areas to the bottom 10%, and the coefficient of variation, at every level.
- **Low confidence:** areas with fewer than 5 grid cells (246 unions; 82 small urban unions contain none).

## Limits

- Shares of **land area**, not people. Uninhabited land (Sundarbans, chars, rivers) inflates distances.
- **Straight-line** kilometres, not travel time.
- Approved beds are sanctioned or licensed beds, not functional capacity; service fields are reported for few facilities.
- A registry listing does not confirm that a facility is open or offers a service.

## Rebuild

The atlas and audit are a dated snapshot. The daily registry workflow does not rebuild them; when `data/dghs/index.json` changes, `tests/test_atlas.py` skips its snapshot check with a reminder.

```sh
pip install -r scripts/requirements-geospatial.txt
# geoBoundaries gbOpen BGD simplified GeoJSON (Git LFS; download via media.githubusercontent.com):
#   releaseData/gbOpen/BGD/ADM2/geoBoundaries-BGD-ADM2_simplified.geojson  (and ADM3, ADM4)
python3 scripts/build_atlas.py --adm2 ADM2.geojson --adm3 ADM3.geojson --adm4 ADM4.geojson
python3 -m unittest tests.test_atlas
BASE_URL=http://127.0.0.1:8000 node tests/atlas.cjs
```
