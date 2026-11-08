# Accessibility implementation validation

Validated in the cloud workspace on 8 November 2026, using the committed DGHS snapshot and fictional model fixtures.

## Passed

- **14 geospatial tests:** travel-time/distance units, impassable barriers/corner cutting, multiple/co-located facilities, sparse-graph limits, capacity conservation and non-double-counting, missing capacity, exact candidate selection, population-weighted zonal percentages, overlapping-zone refusal and provenance/type rules. Includes an end-to-end temporary fictional pilot producing raster/PNG/CSV/GeoJSON outputs, capacity results, referrals and site optimization.
- **13 existing Python tests** passed.
- Existing DGHS validation passed: 39,442 unique institutions, 62 report fields, 28,464 usable points and 2,752 detailed-profile snapshots; no DGHS source files were changed.
- Existing statistics rebuild check passed with its original DGHS/BBS scope. Those BBS figures are not inputs to the new accessibility calculations.
- New browser checks passed for real DGHS counts, tier changes, CSV download, mobile layout, unavailable data handling and **no external data requests**.
- New JavaScript rule tests passed for exact facility types, active status, coordinate flags and division reconciliation.
- Python compilation and JavaScript syntax checks passed.

Existing directory/overview, helpline and routing/map smoke browser suites passed after adding the navigation link. The statistics suite also passed after explicitly selecting the installed Chromium executable. Mocked basemap/routing tests verify application behavior, not real OSRM/OSM service access.

## Not executed / unavailable

- No Bangladesh-wide travel-time, population coverage, unmet service capacity, referral or new-site result has been computed. There is no approved aligned population/friction input set or DGHS service-capacity dataset in the checkout.
- Division/district/union study Shapefiles have not been supplied. New zonal outputs do not use existing third-party boundaries automatically.
- Clinical service appropriateness, current opening hours, facility entrances and transport speeds are not validated by registry active/type flags.
- Esri and AccessMod reference-page requests were blocked by managed-network HTTP 403; their current contents were not reviewed.
- National-scale performance and Windows execution have not been tested. The pilot backend has explicit size limits and does not silently change resolution or drop inputs.

The fictional integration test's numbers are verification fixtures only. They are not Bangladesh findings, not deployed study layers, and not a substitute for input validation or ground-truth comparison.
