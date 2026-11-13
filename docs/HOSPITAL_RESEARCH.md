# Hospital research explorer

Implemented 12 November 2026 in `research.html`. This is an addition to the existing static GitHub Pages website, not a replacement of the facility directory or an AccessMod result.

## Included

- District choropleth: active listings or coordinate completeness; clickable districts, hospital points and explicit source links.
- Linked universe, division, district and exact hospital-type filters. URL query parameters preserve the filter selection.
- Three clearly distinguished universes: DGHS-agency listings (default), all hospital listings in the DGHS registry, and explicitly government/autonomous-owned hospital listings.
- Eight charts: district rankings, hospital types, ownership, coordinate completeness, population-normalized division rates, population/hospital shares, cumulative radius counts and non-overlapping distance bands.
- Coordinate entry and map-click origins, five nearest eligible hospital listings nationwide, and 1/5/10 km display rings. A district filter never removes a closer hospital across its border.
- Exact-value tables, chart PNG and CSV downloads, selected-record CSV and mapped-point GeoJSON. Missing coordinates remain in hospital counts. Pharmacies are excluded.
- Source dates, hashes, definitions, public data links and explicit uncomputed analyses.

## Data and reproducibility

The committed hospital snapshot is derived from the existing DGHS index and explicit `HOSPITAL_TYPES` in `scripts/build_statistics.py`. No name-keyword hospital inference is performed. Default agency selection is not government ownership: the agency field can include NGO hospital/clinic records.

BBS adjusted Census 2022 division totals come from the existing audited `data/statistics/sources.json`, Table 2.03. They are not treated as 2026 population estimates. DGHS profiles are incrementally enriched; the snapshot date is not the observation date of every facility.

New public display polygons come from geoBoundaries gbOpen BGD ADM2, with original BBS/OCHA ROAP attribution and per-file metadata in `data/research/boundary-source.json`. That metadata records boundary year 2020, a December 2023 build and CC BY 3.0 IGO source licensing. Boundaries are joined to the existing audited district list. Historical spelling aliases are explicit; parent division must match. No fuzzy join or relocation is used. District colours use registry labels; they are not spatial counts. The existing pinned national boundary independently validates eligible points.

```sh
python3 scripts/build_research.py
python3 scripts/build_research.py --check
node tests/research-model.cjs
node --check research.js
python3 -m unittest discover -s tests -p 'test_*.py'
```

The daily data workflow regenerates the compact research snapshot after updating DGHS profiles. Both deployment workflows copy the new assets and `data/research`; asset fingerprinting includes the new HTML page. No additional runtime package, external basemap, paid API or browser geolocation permission is required.

## Calculation limits

Haversine distances use a 6,371.0088 km mean Earth radius. They are straight-line distances, not walking/driving times. Radius and ring counts concern facility listings, not residents. Distinct IDs at identical coordinates remain distinct records. An eligible coordinate is inside Bangladesh, but its precise hospital location can still be wrong. The browser rejects origins outside the pinned national boundary.

The district ranking displays the leading 20 and exports the full comparison. Type/ownership charts use the full local selection. District/coordinate comparisons use the division filter, while population comparisons use all eight divisions. A zero hospital-listing denominator gives missing coordinate completeness, not 0%. Missing hospital-share denominators are null.

## Remaining research modules

1. Urban/rural inequity: obtain BBS small-area counts with stable codes, a documented urban/rural classification and matching geography. Do not classify rural populations by distance from hospitals.
2. Road access: prepare the public Bangladesh OSM transport extract (Geofabrik), verify road continuity, bridge and ferry connections, speeds and travel scenarios. Report route-validation error and threshold sensitivity before publishing 30/60/120 minute results.
3. Population coverage: use BBS demand where available. A WorldPop scenario must specify product/version, year, units, projection and constrained/unconstrained modelling; label it separately rather than representing it as BBS observations. Avoid distributing population using hospitals as settlement proxies when evaluating hospital access, because it can introduce circularity.
4. Referral analysis: declare origin and destination hospital tiers and whether candidate destinations need independently verified services.
5. Capacity and siting: obtain service capacity per time period, feasible sites, exclusions and budget. Validate travel/demand first; label heuristic siting as exploratory rather than optimal.
6. Union analysis: source actual ADM4 boundaries; the existing 544-feature layer is ADM3, not union geography.

Public entry points: DGHS facility registry, BBS source URL in the snapshot, https://www.geoboundaries.org/, https://download.geofabrik.de/asia/bangladesh.html and https://www.worldpop.org/datacatalog/.

Al Jubaer's supplied map-series links are credited in the page. Their numerical results, pharmacy data and source code were not copied. References for days 14 and 15 were accessible but carried future dates relative to this work; they were treated as methodological examples, not independently verified current findings.

## Validation in this session

Passed: 17 existing Python unit tests; new Node checks for great-circle distance, filtering, cross-border destination search, null denominators, CSV escaping and snapshot reconciliation; deterministic rebuild check; JavaScript syntax checks; static publication asset fingerprinting.

Desktop browser checks: initial load, DGHS/all scopes, Chattogram and Barishal district menus, an empty hospital-type selection, national distance search while filtering another division, rejection of an outside-country origin, and selected-hospital CSV download. Charts were visually inspected and long bar charts expanded to retain all category labels. PNG download confirmation timed out in the automation browser, so end-to-end PNG delivery remains unverified. Mobile browser testing and the full existing browser regression suite were not run here.

Not published: the connected GitHub account reports read-only access (`push: false`).
