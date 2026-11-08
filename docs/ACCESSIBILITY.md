# DGHS geospatial accessibility study

## Prepared capabilities versus study results

The new `accessibility.html` page maps **only saved DGHS institution coordinates**, separated into community, union, upazila and urban-primary types. It computes active/mapped counts by DGHS-recorded division and exports CSV. It makes no routing call and loads no population source, outside facility dataset, basemap tiles or new administrative geometry. The existing `coordinateStatus=published` eligibility flags were produced by the repository's earlier national-boundary QA; they are retained, not represented as fresh DGHS entrance verification.

The offline Python pipeline implements the requested travel-time, facility-option counts, capacity allocation, referral routing, zonal coverage and candidate-location analyses. It is a **pilot-scale isotropic raster model with synthetic validation**, not a claim of complete AccessMod parity or a calibrated Bangladesh travel model. No national travel/population/capacity results have been computed: the required study inputs and source approval are missing.

The user approved **DGHS health data and BBS population data**. Community clinics remain separate from the other tiers, with administrative-area comparisons. Division/district/upazila filters use recorded DGHS labels; union-level spatial results await supplied boundaries and matching population. This addition does **not** import the existing BBS population tables or use the site's OSM facilities/routing for any new study calculation. The existing site statistics remain a separate descriptive module. The study template now fixes the population publisher to BBS. Particular boundary and travel inputs still require approval. The template remains non-runnable until actual aligned BBS population and travel inputs are supplied and reviewed.

## Actual input audit

The inspected DGHS report was exported 1 November 2026 and its saved snapshot updated 7 November 2026. There are 39,442 institution records. Only active records enter the new tier calculations.

| Exact DGHS tier | Active listings | Usable published coordinates |
|---|---:|---:|
| Community Clinic | 14,393 | 12,224 |
| Union Health Sub Center, Union Health Center, Union Health & Family Welfare Center (UH&FWC) | 5,245 | 1,044 |
| Upazila Health Complex | 434 | 420 |
| Urban Primary Health Care Center | 15 | 4 |
| District/General Hospital | 60 | 59 |
| Medical College Hospital, Specialized Hospital, Postgraduate Institute & Hospital | 59 | 38 |

These are **type-based study strata**, not a confirmed combined definition of primary care. Administrative/upazila offices, training institutes and inactive entries are excluded. Different DGHS IDs can be on one campus. Registry active status does not establish current services, hours, staffing or appropriate referral capabilities.

Coordinate absence is particularly large for union-level facilities. Any coverage result based on the mapped subset is liable to underestimate access and distort new-site selection. The run manifest retains active, eligible, in-grid and excluded counts. Coordinates are never invented, swapped or relocated to district centroids. Bed fields exist, but the audited registry schema contains no ready-to-use gridded population or persons-per-period primary-care capacity field. Only 2,752 detailed-profile snapshots were available in this inspection; a detailed profile is not automatically a valid capacity measurement.

Recompute current counts without new inputs or geospatial dependencies:

```bash
python scripts/run_accessibility.py audit --output outputs/dghs_input_audit.json
```

## Required input handoff

1. **Division, district and union polygons:** ZIP each complete Shapefile set (`.shp`, `.shx`, `.dbf`, `.prj`; `.cpg` when present), or provide GeoPackage/GeoJSON. Include source, vintage, stable administrative ID column and CRS. Names alone are not unique union IDs. One complete non-overlapping administrative level is processed at a time, with a separate table/map for each level.
2. **Target population counts:** persons per raster cell for a declared year/population. The raster must match the travel grid's CRS, affine transform, extent and dimensions. Point/settlement counts need a reviewed count-preserving preparation step first. Division totals alone cannot establish fine-scale travel-time coverage; no uniform population spread or WorldPop substitution is applied.
3. **Approved friction raster:** positive minutes per metre on a projected, north-up metre grid. Missing, zero and negative values are impassable. Supply the mode/season, road/land-cover/water/barrier assumptions, speed calibration and source. There is no guessed walking/driving speed, automatic OSM download, straight-line-to-travel-time conversion, live traffic, slope anisotropy, ferry timetable or one-way road model.
4. **DGHS service capacity, if capacity coverage is required:** use [service-capacity.csv](templates/service-capacity.csv). One selected facility ID per row; `unit=persons_per_period`; `period` must match the declared service period. Retain the original DGHS service-capacity field and official DGHS source URL. A bed count cannot become annual outpatient capacity. Unknown capacity is an error, not zero. Target population/capacity must refer to the same service package and period; resident totals do not predict attendance by themselves.
5. **Candidate sites, if scaling up is required:** use [candidate-sites.csv](templates/candidate-sites.csv). Explicit approved/feasible coordinates, scenario capacity in the same persons-per-period unit, service period and site budget. The code does not declare land feasible merely because it is undeveloped or populated.

Include a travel buffer around the target population: facilities outside an administrative study area can serve residents inside it. The code keeps cross-zone travel within the supplied friction extent, but cannot route beyond that extent. Population outside polygons remains visible in QA rather than disappearing from denominators.

The selected study policy is `DGHS_health_BBS_population_approved_support`: health facilities and capacity must be DGHS; population must be BBS; boundaries, transport and candidate-site inputs require separate explicit approval. WorldPop or another population publisher is rejected under this policy. Legacy strict-DGHS configurations remain supported by the general validator but are not the selected study configuration. Provenance declarations and hashes support auditability; they are not independent authentication of a submitted source.

## Running a validated input set

Install optional analysis dependencies separately from static website development:

```bash
python -m pip install -r scripts/requirements-geospatial.txt
```

Copy and complete `analysis-config.example.json`, keep care tiers separate or select `primary_tiers` explicitly for a declared comparison, review each input file and review the thresholds (15/30/60 minutes are examples, not adopted service standards). Paths are relative to the configuration file. To add zones:

```json
"zones": [
  {"name": "division", "path": "analysis-inputs/divisions.shp", "id_field": "DIV_CODE"},
  {"name": "district", "path": "analysis-inputs/districts.shp", "id_field": "DIST_CODE"},
  {"name": "union", "path": "analysis-inputs/unions.shp", "id_field": "UNION_CODE"}
]
```

Use the **actual** ID column names. Set `capacity_csv`/`service_period` and `candidate_csv`/`new_site_budget` only when those inputs are available. Each required provenance record needs publisher, date, source URL and `approved=true`.

```bash
python scripts/run_accessibility.py run --config analysis-config.json --output outputs/pilot_v1
```

The output directory must be empty. A failed run writes `run_manifest.json` with `status=FAILED`; partial files are not a completed study. The website never automatically loads/publishes local model outputs. Inputs under ignored `analysis-inputs/` and results under ignored `outputs/` are not pushed by default.

## Methods and output definitions

### Physical accessibility and number of options

Each traversable raster cell is a graph node. Eight-neighbour edge time is mean endpoint friction × centre-to-centre distance in metres. Diagonals are forbidden across impassable corners. Multi-source Dijkstra finds the least-time distance to the selected DGHS facilities. This is symmetric/isotropic; direction-dependent or mixed-mode routing needs an extended/validated backend.

Outputs:

- `nearest_primary_minutes.tif`: modelled minutes; `-1` means unreachable, `-9999` is missing/impassable friction.
- `nearest_primary_owner.tif` and `owner_lookup.json`: facility seed ownership; same-cell facilities are explicitly listed as ties. Equal-time ties between different seed cells may be arbitrarily resolved by the graph solver.
- `primary_count_<threshold>min.tif`: number of distinct selected DGHS institution IDs reachable within that threshold. Co-located IDs count separately, not as independent campuses or proven service alternatives.
- PNG maps plus national coverage counts in `run_manifest.json`.

Population coverage = sum of target population in reachable cells / sum of known target population × 100. Missing population remains unknown and is counted in QA. Positive population on impassable cells remains in the denominator and is unserved, not dropped. Multiple coverage measures residents with at least two reachable facility IDs, without claiming those facilities meet their needs.

### Capacity-constrained geographic coverage

A sparse allocation model maximizes people served subject to each cell's population, each facility's declared persons-per-period capacity, and the maximum travel-time threshold. A second optimization minimizes total person-minutes while preserving maximum coverage. Population can split between reachable facilities; aggregate persons are divisible, and no person is counted more than once. This is a potential allocation scenario, not observed attendance, appointment availability, affordability or quality of care.

Outputs: `capacity_served_population.tif`, `accessible_capacity_unserved.tif`, `facility_capacity_allocation.csv`, and `capacity_flows.csv`. Capacity shortfall is calculated only for physically accessible people. Missing service capacity does not produce a fake zero-coverage map.

### Referral

Choose explicit `from_tiers` and `to_tiers`. Dijkstra finds the least-time target tier on the same raster. `referrals.csv` contains minutes and kilometres **along the fastest modelled path**; this is not necessarily the shortest-distance route. `referral_modelled_paths.geojson` traces raster cell centres; same-cell endpoints have zero modelled grid distance. It does not assert an actual clinical referral arrangement, road entrance, vehicle suitability or service readiness. Unreachable origins are labelled, and out-of-grid/impassable facilities remain in QA.

### Zonal statistics

Cell centres assign population to each non-overlapping administrative polygon on the unchanged population grid. CSV and GeoJSON export total population, physical coverage, multiple options and (when supplied) capacity coverage. No rate is a facility count divided by population and relabelled as access. Boundary cells are quantized at grid resolution; run a resolution sensitivity check. IDs must be unique. Overlap, invalid polygons and absent CRS fail validation. Population outside the polygons is reported separately.

### Scaling up

A mixed-integer model selects at most the declared number of new sites from the **provided feasible candidate list**, jointly reallocating existing and candidate capacities to maximize total people served. Output: `site_selection.json` and `selected_new_sites.geojson`, including additional people served and solver status/gap. Only `optimality_proven=true` means the solver certifies the mathematical maximum **within this supplied candidate/model set**. A feasible time-limited result is not described as optimum. Optimal sets may not be unique. No construction approval or unrestricted national optimum is claimed.

## Validation and limits

```bash
python -m unittest discover -s tests/geospatial -v
node tests/accessibility-model.cjs
```

Tests use known synthetic grids for minutes/metres, barriers, multi-source ties, same-cell counts, capacity conservation, overlapping catchments, exact candidate selection and population-weighted zonal percentages. An end-to-end fictional pilot writes raster/PNG/CSV/GeoJSON outputs, capacity allocation, referrals and optimal-site results. Those fixtures are temporary and never deployed as Bangladesh results. The website tests use the real committed DGHS snapshot and mock no population access values.

The Python backend deliberately guards cell/edge/candidate counts. A high-resolution Bangladesh-wide all-facility matrix may exceed these pilot limits. Increase limits only after checking memory/time, or select a national-scale tiled/network backend with equivalent tested semantics; the program never silently coarsens population or drops facilities to fit. Validate travel times against appropriate observations and investigate missing DGHS coordinates before using results for policy.

Method examples supplied by the user: [Esri healthcare accessibility article](https://www.esri.com/en-us/industries/blog/articles/trends-in-health-gis-mapping-healthcare-accessibility) and [AccessMod](https://www.accessmod.org/). Both pages were inaccessible here due to managed-network HTTP 403, so their current contents were not verified. They are methodological references, not additional health-data sources or a claim of validated software equivalence.
