# Approved study source and grouping policy

User clarification in this conversation:

- “DGHS health data and BBS population data.”
- “Seperate by area and community.”
- Supporting transport inputs: “Open source or OSM data.”

Implementation:

- Facility locations, institution types and health/service-capacity inputs come from DGHS.
- Population comes from BBS. The existing BBS division-level Census 2022 totals remain descriptive denominators; they are not silently disaggregated to a fine grid or relabelled as travel-time coverage.
- Open-source/OSM roads and documented open terrain/water/barrier data are approved supporting travel inputs. Actual snapshots, licences, processing and mode/season assumptions must be recorded. This does not authorize OSM health facilities or a different population publisher. The district and ADM3 boundary uploads are validated; country/division layers can be derived from the districts. True union/ADM4 boundaries are still needed.
- Keep community clinics, union-level facilities, upazila health complexes and urban primary health centres as separate strata. The website can filter each by DGHS division, district and upazila. Union spatial coverage needs supplied boundary IDs and matching BBS population.
- “Community” is implemented as the DGHS community-clinic tier; no social, religious, ethnic, rural/urban or neighbourhood classification is inferred. If a different community geography is intended, it needs an explicit definition/input.

The configuration key is `DGHS_health_BBS_population_approved_support`. Its validator rejects other population publishers. A provenance approval flag remains false for an absent spatial population file: this distinguishes approving BBS as a publisher from reviewing an actual submitted raster, reference year and population definition.

Boundary handoff: `Bd_District.zip` contains 64 ADM2 districts. Despite its name, `Bd_union.zip` contains 544 ADM3 upazila/thana areas, not unions. See [BOUNDARY_INPUTS.md](BOUNDARY_INPUTS.md). Do not relabel ADM3 coverage as union coverage.
