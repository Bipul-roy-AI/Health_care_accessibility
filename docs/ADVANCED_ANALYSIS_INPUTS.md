# Advanced Bangladesh healthcare analyses: current handoff

The completed website figures describe **facility availability**, not the five AccessMod-style analyses requested. **AccessMod 5 has not been executed.** The Python engine is a synthetically tested isotropic raster pilot, not a validated national motorised road-network model or an AccessMod 5 equivalent. There are no Bangladesh travel-time, population-coverage, capacity-allocation, referral-route or new-site results to plot yet.

The user selected **motorised travel only** and **30, 60 and 120 minute** thresholds. The study configuration and published input-readiness report record those choices. They do not approve invented speeds, capacity or population distributions.

## Actual readiness and dependencies

| Requested analysis | Required before computing it | Outputs to publish after validation |
|---|---|---|
| Travel-time accessibility | DGHS locations and a prepared, validated motorised travel model | Nearest-facility time surface; time-threshold maps; facility-option counts; distributions and tables |
| Capacity-constrained geographic coverage | Travel model + spatial BBS target population + DGHS service capacity for the same service/period | Physically accessible versus allocated population; accessible but unserved map; allocation charts/tables |
| Referral | Travel model + explicit origin and destination DGHS tiers | Origin–destination time/distance table; routes; time/distance distributions |
| Zonal population coverage | Travel model + spatial BBS population + administrative polygons | Population covered and percentage within 30/60/120 minutes; administrative choropleths and comparison charts |
| Scaling up | Travel model + BBS population + DGHS capacities + feasible candidate sites and site budget | Selected locations; additional population served; scenario comparisons and solver status |

Travel time and referral routing do **not** require a population denominator. The current combined pilot runner expects population, so that requirement must not be confused with the underlying methods' requirements. A production travel/referral stage can run first once the transport model is ready. Population-weighted coverage follows only when BBS demand is ready. Capacity coverage and capacity-aware site optimisation follow the additional inputs. None of these advanced stages is currently running in the cloud or the user's PC.

## Union geography

The uploaded `Bd_union.zip` has **544 ADM3 upazila/thana polygons**, with `ADM3_EN` and `ADM3_PCODE`. Its embedded description also says administrative level 3. A second upload was byte-identical. It cannot be treated as union geometry. The currently supported levels are country, eight derived divisions, 64 districts and 544 ADM3 areas.

Provide a true union layer as a GeoPackage or complete Shapefile ZIP (`.shp`, `.shx`, `.dbf`, `.prj`, preferably `.cpg`), retaining source/year and unique union codes. An ADM4 schema is expected for this hierarchy; another documented union-code schema can be reviewed. Split a large archive by division into complete layers if the upload size limit requires it. Please do not split individual sidecars away from their Shapefile set. Urban wards and union coverage must have documented boundaries rather than an assumed one-to-one correspondence.

## Population handoff

Use **BBS only**: small-area Census population counts with stable administrative codes, year and population definition, or a documented population-count grid. Matching small-area polygons are needed when counts are tabular. Division totals already in the repository cannot show where people live inside a division.

Fine-scale travel coverage requires a reviewed spatial demand representation. Small-area totals alone still require a documented within-area population method or an appropriately bounded aggregate analysis. No uniform distribution, WorldPop substitution or centroid population placement is silently introduced. Retain count totals during any preparation/resampling and quantify model resolution limitations.

## DGHS capacity and candidate handoff

Capacity needs `facility_id`, capacity in **persons per declared period**, service package, period and the original DGHS source URL/field. Unknown capacity remains unknown. Hospital beds are not outpatient capacity, and recorded utilisation does not automatically establish maximum service capacity. Population demand and capacity must use compatible service and period definitions. Templates: [service capacity](templates/service-capacity.csv) and [candidate sites](templates/candidate-sites.csv).

For new sites, define the feasible candidate locations, proposed service capacity, maximum number of new facilities or a documented budget, and construction/exclusion constraints. Optimality is conditional on the supplied candidates, travel model and capacities; a feasible solver result is not automatically an optimum.

## Motorised transport handoff

Open/OSM transport support is already authorised. The available transport tools perform checksum-verified acquisition and driving-road extraction, not speed calibration or a finished travel surface. The managed cloud proxy currently denies `download.geofabrik.de`; no Bangladesh road extract is present here. The cloud configuration-draft read could not be verified, so no environment network policy was changed.

Either allow `download.geofabrik.de` in the cloud environment settings or acquire/process locally using [OPEN_TRANSPORT.md](OPEN_TRANSPORT.md). The selected extraction mode is `drive`; walking is not part of the selected scenario. For a local run from the repository root:

```powershell
.\.venv\Scripts\python.exe scripts\download_osm_transport.py --download
.\.venv\Scripts\python.exe scripts\extract_osm_transport.py --input analysis-inputs\osm\bangladesh-latest.osm.pbf --mode drive --output analysis-inputs\osm\driving_roads.geojson --location-cache analysis-inputs\osm\drive_nodes.idx
```

Use a fresh node-cache filename. A road extract still needs reviewed vehicle access, directed connectivity, grade-separated crossings, average speed scenarios, water/bridge/ferry handling and facility access points. Posted speed limits are not observed journey speeds. Validate the resulting model against suitable motorised journey observations and report sensitivity to assumptions. The symmetric isotropic pilot does not preserve one-way network restrictions and cannot automatically stand in for this validation.

## Recompute the input report

```powershell
.\.venv\Scripts\python.exe scripts\prepare_study_status.py --output data\accessibility\study-status.json
```

This checks local input-file presence and source approvals, including capacity period and candidate budget. Presence/approval is necessary, not a check of raster alignment, data validity, clinical service readiness or a successful analysis execution. Every advanced module remains `NOT_RUN` until real results are produced, validated and explicitly published. The website shows missing inputs instead of drawing invented coverage charts.

The descriptive maps and tables remain valid as a saved baseline with their stated limitations. Before treating facilities as travel destinations, investigate missing DGHS coordinates and the exported name–point disagreements. Missing facilities can bias both accessibility and suggested new locations.
