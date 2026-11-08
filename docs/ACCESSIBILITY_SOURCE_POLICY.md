# Approved study source and grouping policy

User clarification in this conversation:

- “DGHS health data and BBS population data.”
- “Seperate by area and community.”

Implementation:

- Facility locations, institution types and health/service-capacity inputs come from DGHS.
- Population comes from BBS. The existing BBS division-level Census 2022 totals remain descriptive denominators; they are not silently disaggregated to a fine grid or relabelled as travel-time coverage.
- Supporting administrative boundaries and transport/friction inputs are still to be supplied or explicitly approved. BBS population approval does not authorize OSM roads or another population product automatically.
- Keep community clinics, union-level facilities, upazila health complexes and urban primary health centres as separate strata. The website can filter each by DGHS division, district and upazila. Union spatial coverage needs supplied boundary IDs and matching BBS population.
- “Community” is implemented as the DGHS community-clinic tier; no social, religious, ethnic, rural/urban or neighbourhood classification is inferred. If a different community geography is intended, it needs an explicit definition/input.

The configuration key is `DGHS_health_BBS_population_approved_support`. Its validator rejects other population publishers. A provenance approval flag remains false for an absent spatial population file: this distinguishes approving BBS as a publisher from reviewing an actual submitted raster, reference year and population definition.
