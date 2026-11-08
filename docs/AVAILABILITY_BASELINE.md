# Bangladesh facility availability baseline

The first real-data outputs are **10 maps and CSV exports** for eight divisions, 64 districts and 544 upazila/thana areas, with six DGHS facility tiers kept separate. The saved baseline is available in the accessibility page and [`data/accessibility/baseline/`](../data/accessibility/baseline/). It does not estimate travel time, population with access, unmet service capacity or new-site benefits.

## Sources and definitions

- Health facilities: saved **DGHS Facility Registry** report exported 1 November 2026, snapshot updated 7 November 2026. Only `is_active=1` and the exact type allowlists in the manifest enter this study. Facility IDs are retained; different IDs at the same coordinates are different listings.
- Population: **BBS adjusted Census 2022 division totals**, Statistical Yearbook 2025, table 2.03, printed p. 56 / PDF p. 84. The eight rows sum to **169,828,911**. No population is distributed across a district, upazila or grid cell.
- Geography: user-supplied BBS/OCHA district and ADM3 boundaries, geometry date 2015, `validOn` 13 November 2020. Division geometry is derived by dissolving districts. The 544 ADM3 features include upazilas and urban thanas. They are **not unions**. Raw geometries remain in the ignored preparation directory; these exports publish maps and tabular counts.

The national baseline contains 14,393 active community clinics, 5,245 union-level facilities, 434 upazila health complexes, 15 urban primary care centres, 60 district/general hospitals and 59 tertiary facilities. These are registry strata, not a verified inventory of current service packages, operating hours, staff or referral readiness. In particular, the union-level facility category does not establish the availability of union polygons.

## Read the three counts separately

`active_listings_by_registry_name` counts listings matched to supplied polygons using **DGHS administrative labels**, regardless of whether coordinates are available. Matching requires all parent names as well as the area's name. Unicode/case/punctuation/whitespace normalization and the manifest's explicit historical district/division aliases are used. Upazila names are not fuzzy matched or silently renamed; ambiguous or unmatched records remain unallocated in this count.

`eligible_coordinates_by_registry_name` is the subset of those name-matched listings with usable `coordinateStatus=published` coordinates. `coordinate_availability_pct` divides that subset by name-matched active listings. It is a **location-data completeness measure**. An area with no name-matched listings has a blank percentage, drawn grey, rather than a zero-percent population-access result.

`spatial_points_inside` counts eligible DGHS points falling inside exactly one supplied polygon, independently of the recorded administrative name. A point on a shared border is flagged ambiguous and omitted from spatial counts instead of counted twice. Points outside the supplied footprint are retained in QA. No coordinates are snapped, geocoded, exchanged or moved to centroids. Existing published-coordinate flags came from the repository's earlier country-boundary QA; point-in-polygon assignment does not establish a correct building or entrance.

Zero in either count means zero **matched listings or eligible points under that method**. It does not prove an absence of facilities. Missing coordinates, missing names, spelling differences, newly created administrative units and historical boundaries can affect these counts. A registry-name assignment and a point assignment may disagree; neither automatically corrects the other.

`active_listings_per_100000_bbs_residents` divides name-matched division listings by the respective BBS division total, multiplied by 100,000. It combines 2026 listings and 2022 population. These are **facility availability rates**, not the percentage of people within a travel-time threshold. District/upazila population and rate cells are blank because matching BBS denominators have not been provided.

## Exported validation findings

| Geography | Active listings joined by names | Unmatched names | Eligible points uniquely assigned | Name–point area disagreements |
|---|---:|---:|---:|---:|
| Division | 20,206 | 0 | 13,714 | 738 |
| District | 20,205 | 1 | 13,714 | 1,498 |
| Upazila/thana | 18,465 | 1,741 | 13,714 | 2,054 |

Across all six tiers, **6,417 listings lack eligible coordinates**, and another **75 eligible points fall outside the supplied footprint**. No shared-border ambiguities occurred in this snapshot. Disagreement totals count only records with both a unique name assignment and a unique point assignment; they do not diagnose which source is wrong.

The unmatched district record has no DGHS district label. ADM3 joins deliberately leave unresolved spelling/vintage differences visible, including newer/changed administrative labels. Review the exported IDs and original DGHS records before approving a further crosswalk. The approximately 80% coordinate gap among union-level listings is a major constraint on a later travel-time or site-selection model.

## Files and reproduction

Each geography exports:

- `*_availability.csv`: one row per polygon and tier, including stable PCodes and all count definitions.
- `*_facility_assignments.csv`: every selected facility ID, its original DGHS area labels, name join, point assignment and disagreement flag.
- `*_unmatched_names.csv`: unresolved name combinations and their active listing counts.
- Three six-panel PNGs: registry-name counts, coordinate completeness and spatial point counts. Divisions additionally have a BBS-normalized availability map, giving **10 figures** in total. Count/rate colour scales vary by tier; compare areas within a panel. Completeness uses a common 0–100% scale.

`national_availability.csv` gives national tier totals and mixed-vintage rates. `manifest.json` records source hashes, population table/pages, DGHS timestamps, tier allowlists, explicit aliases, software versions, GeoPackage hashes, output hashes, QA and limitations. CSVs use UTF-8 with BOM for Excel. These exports preserve original public DGHS administrative labels and IDs; source geometries are not redistributed as vectors. Map geometry is simplified by 100 metres for rendering only; spatial assignment uses full geometry.

After preparing the user-supplied boundary archives as described in [BOUNDARY_INPUTS.md](BOUNDARY_INPUTS.md), run from the repository root:

```powershell
.\.venv\Scripts\python.exe -m pip install -r scripts\requirements-geospatial.txt
.\.venv\Scripts\python.exe scripts\build_availability_baseline.py --output outputs\availability_baseline
```

Use a fresh output directory for each run; the program refuses to overwrite earlier results and records a failed manifest if processing fails after output begins. A new DGHS snapshot changes the results; the committed baseline stays frozen and separately dated rather than silently following daily directory updates. GeoPackage file hashes can change when regenerating containers; the boundary audit includes the original source archive hashes.

Verify calculations and published artifacts:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests\geospatial -v
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"
```

## Next analysis inputs

Fine-scale population coverage needs **BBS small-area population counts with geographic codes/year or an approved BBS population-count grid**. Division totals cannot identify where residents live within each division. Transport modelling additionally needs the approved open/OSM snapshot and documented mode, season, speeds and barriers; road geometry alone is not a travel-time surface. Capacity-constrained coverage needs DGHS service capacity in persons per defined period, and site selection needs feasible candidates and a site budget. These later analyses remain uncomputed until their inputs are supplied and validated. Union polygons are needed only when adding union-level reporting, not for the baseline above.
