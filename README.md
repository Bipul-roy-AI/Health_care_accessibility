# ShasthoPath · স্বাস্থ্যপথ

A free map and directory for finding healthcare institutions across Bangladesh.

**[Open the website](https://bipul-roy-ai.github.io/Health_care_accessibility/)** ·
**[Map](https://bipul-roy-ai.github.io/Health_care_accessibility/overview.html)** ·
**[Statistics](https://bipul-roy-ai.github.io/Health_care_accessibility/statistics.html)** ·
**[Availability](https://bipul-roy-ai.github.io/Health_care_accessibility/analysis.html)** ·
**[Distance](https://bipul-roy-ai.github.io/Health_care_accessibility/atlas.html)** ·
**[Access study](https://bipul-roy-ai.github.io/Health_care_accessibility/accessibility.html)** ·
**[Emergency & helplines](https://bipul-roy-ai.github.io/Health_care_accessibility/helplines.html)**

## What you can find

- Search institutions by name, DGHS code, district or other recorded details.
- View map points and institution information: type, ownership, address, contact
  details, beds and services where recorded, with a link to the official profile.
- Explore all eight divisions with administrative boundaries, boundary-checked points,
  a point legend and division-by-division institution counts.
- Choose a starting point and a facility to see a driving route, road distance,
  estimated time and directions.
- Switch between street and free light-style maps, and show open road/building layers.
- Find national emergency and helpline contacts with tap-to-call links and source references.
- Explore hospital, private-clinic and blood-bank statistics; compare eight divisions per 100,000 residents, inspect published beds and staffing, and download CSV. Sources and simple explanations are on the separate Statistics page.
- Use English or Bangla for the directory, overview and helplines; Statistics is currently in English.

## Website screenshots

![Institution search and road routing](docs/images/directory.png)

![National institution distribution by division](docs/images/overview.png)

![Emergency and national helplines](docs/images/helplines.png)

![Healthcare statistics using DGHS and BBS data](docs/images/statistics.png)

Statistics use the adjusted **2022 census population** as a baseline. Facility availability is not the same as travel-time access or quality of care. See [sources, definitions and reproducibility](docs/STATISTICS.md).

## Information and sources

The initial DGHS directory contains **39,442 institutions** and **62 public report
fields** per record. **28,464** records currently pass the Bangladesh national-boundary check.
**915** outside-boundary coordinates are withheld from maps and routes; their
original values and all institution records remain available for review. Another
10,061 records have missing coordinates and 2 have invalid coordinates. Complete detailed-profile
snapshots are being added in daily batches.

Institution records come from the **[DGHS Facility Registry](https://hrm.dghs.gov.bd/index.php/public/facility-registry)**.
Nearby community-mapped facilities, roads, buildings and basemaps use
**[OpenStreetMap](https://www.openstreetmap.org/copyright)**. Division boundaries
come from **geoBoundaries (CC0)**. The national boundary is from
**OpenStreetMap (ODbL)** and includes offshore islands. Driving routes use **OSRM**.

**[All extracted data and source information are in this repository](data/README.md).**
The site shows snapshot dates and distinguishes missing information. Check current
services and entrances with the institution before travelling.

## DGHS accessibility study

The [Access study page](accessibility.html) combines the **BBS Population and Housing Census 2022** (union/ward tables, adjusted to the BBS post-enumeration-check division totals) with the DGHS registry. From division to union it shows the share of people within 2, 5, 10 and 20 km (straight line) of government hospitals, any hospital, primary care, upazila health complexes and blood banks; facilities and beds per person; population-weighted Gini coefficients and Lorenz curves; Moran's I and local cluster (LISA) maps; correlations with census literacy, sanitation, internet use and indigenous population; and community clinics and union centres against the government's planning norms. The map has a basemap switcher, boundary outlines and an optional facility overlay. See [methods](docs/ACCESS_STUDY.md).

The [offline analysis pipeline](docs/ACCESSIBILITY.md) prepares least-cost travel-time surfaces, reachable-facility counts, capacity-constrained population allocation, referral paths, administrative coverage tables/maps and candidate-site optimization. It has synthetic validation; **Bangladesh travel-time coverage has not been computed** because the required approved inputs are not yet supplied. New health inputs must be DGHS-sourced. The approved population source is BBS. Actual spatial population inputs are still needed, and OSM/open transport support is approved, with provenance and speed assumptions recorded; the actual study layers and boundary files are still required. Community clinics and other tiers remain separate, with division/district/upazila filters.

The supplied boundaries now provide 64 districts and 544 ADM3 upazila/thana areas, with country/division derivatives. The archive named `Bd_union.zip` is not a union layer; true ADM4 boundaries are still needed. See [boundary validation](docs/BOUNDARY_INPUTS.md). Aligned BBS target population/travel grids and DGHS persons-per-period capacity are also still needed for the corresponding analyses. Bed counts cannot be substituted. Missing union-level facility coordinates are a major bias risk. See [input templates and limitations](docs/ACCESSIBILITY.md).

## Future work

- Identify potential locations for new healthcare centres using population needs,
  existing services and travel times.
- Highlight underserved settlements and compare access across rural and urban areas.
- Improve missing or inaccurate coordinates and verify facility entrances.
- Add richer capacity, specialty and accessibility information as it becomes available.

Population-based site recommendations are planned; the current website does not
calculate or approve proposed healthcare locations.

[Development, testing and daily data updates](DEVELOPMENT.md)

## Analysis page

The separate [Analysis page](analysis.html) presents the completed DGHS/BBS availability baseline: 10 administrative-area maps, six-tier national figures, area CSV downloads and coordinate-quality findings. It uses saved results without fetching the current registry or external map tiles. Travel-time and population-access results remain pending their required inputs. See [baseline methods](docs/AVAILABILITY_BASELINE.md).

The statistical pages now use responsive SVG figures with labelled axes and SVG downloads. The Analysis page adds care-tier counts, coordinate-completeness comparisons, division/district/ADM3 rankings and a count-versus-completeness scatter plot. Its five advanced-analysis modules expose the actual input-readiness report; no travel, coverage, referral or site-selection result is simulated. The selected motorised scenario reports 30, 60 and 120 minute thresholds. Union/ADM4 remains unavailable because the supplied archive is ADM3.

## Distance and location quality

The [Distance page](atlas.html) measures straight-line distance from a 1 km national grid to the nearest DGHS hospital and primary-care facility, by division, district, upazila and union (5,160 unions), with disparity statistics. Figures are shares of land area, not population, and are not travel times.

The same build audits facility coordinates: a point is used only if it lies within 1 km of its recorded district and is not shared with facilities recorded in other areas. Flagged points (listed in `data/atlas/flagged-locations.csv`) are hidden on every map and excluded from distances, but stay in all counts. See [methods](docs/DISTANCE_ATLAS.md).

## Languages

Every page has an English / বাংলা switch. The choice is remembered across pages (`i18n.js`). Bangla text sits beside the English in `data-bn` attributes; corrections are welcome. DGHS facility, type and upazila/union names stay as published by DGHS and BBS.
