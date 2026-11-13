# Access study: methods

Page: `accessibility.html`. Data: `data/access/`. Build: `scripts/build_atlas.py --census` → `scripts/build_access.py`, with matching in `scripts/population.py`.

## Question

How many people live within a given straight-line distance of DGHS-listed care, how evenly facilities are spread relative to people, where under-served areas cluster, and how access relates to census social indicators, from division to union.

## Data

| Input | Source | Notes |
|---|---|---|
| Population, households, under-5, 60+ | BBS Population and Housing Census 2022, Community Series (tables C-01, C-02, C-18), 8 divisions, 64 districts, 600 upazilas/thanas, 8,198 unions/wards | Extracted from the UNICEF Bangladesh census dashboard (`scripts/extract_census.py`). Enumerated total 165,158,616 at every level. |
| Literacy, sanitation, internet, mobile ownership, indigenous population | Same census, upazila tables | Population-weighted when several 2022 units join one 2015 upazila. |
| Adjusted division totals | BBS post-enumeration check (PEC), as used on the Statistics page | National 169,828,911. |
| Facilities | DGHS facility registry snapshot (same as the rest of the site) | Hospital and public-hospital rules match the Statistics page. |
| Boundaries | geoBoundaries gbOpen BGD ADM2–ADM4 (BBS/OCHA, 2015; CC BY 3.0 IGO) | 64 districts, 544 upazilas, 5,160 unions/urban units. |

Spot checks: district (Thakurgaon 1,533,895) and all five Thakurgaon upazilas match citypopulation.de, which compiles BBS tables. Division counts of hospitals, public hospitals, blood banks and community clinics equal the Statistics page.

## Method

1. **PEC adjustment.** BBS publishes adjusted totals by division only. Each area's enumerated count is multiplied by its division's factor (1.022–1.035), so division totals equal the adjusted figures. Relative differences inside a division are unchanged.
2. **Census to 2015 boundaries.** Upazilas and thanas are matched by name within their district: 451 exactly, 90 by spelling, and 59 through an explicit crosswalk. Units created or renamed after 2015 are assigned to the unit they came from (e.g. Taltali → Amtali). 14 metropolitan thanas created after 2015 are assigned approximately to an adjacent 2015 thana. Every census unit lands in one 2015 upazila inside its own district, so district and upazila totals are exact. Crosswalk: `data/access/census-upazila-crosswalk.csv`.
3. **Unions.** Rural unions are matched by name within the upazila, first by exact and spelling-tolerant keys, then by best-similarity pairing (score ≥ 0.75). Paurashava polygons receive their paurashava's census wards. The remaining upazila population is spread over the remaining polygons by area and flagged `estimated`; these are mostly city-corporation wards, whose 2022 numbering differs from the 2015 polygons. Population share by source:
   - **Census:** 66.8%
   - **Census plus absorbed small units:** 7.7%
   - **Paurashava:** 9.6%
   - **Estimated:** 15.9%
4. **People on the grid.** Each union's population is spread evenly over the 1 km UTM 46N cells whose centres fall in it. Unions too small to contain a cell centre get one point at their representative point. Grid totals equal the area totals (checked in the build).
5. **Distance.** For each cell, the straight-line distance to the nearest usable DGHS coordinate is computed for government hospitals, any hospital, primary care, upazila health complexes and blood banks. Points failing the location audit (outside their recorded district, or sharing a coordinate across areas) are excluded, as on the Distance page.
6. **Counts per person.** At division, district and upazila level, counts use every active listing by its recorded DGHS area label; coordinates are not needed. Only 5 listings carry an upazila label that matches no upazila in their district. Union counts use mapped points only.
7. **Inequality.** The population-weighted Gini coefficient and Lorenz curve of facilities per person are computed across districts and across upazilas. Q5/Q1 is the mean rate of the best-served 20% of people divided by that of the worst-served 20%.
8. **Spatial clustering.** Global Moran's I and local Moran (LISA) are computed for upazilas. Neighbours are areas that touch or lie within about 50 m; isolated islands get their nearest area. Weights are row-standardised. Inference uses 999 permutations (conditional permutation for local values) with a fixed seed and p < 0.05, without multiple-testing correction.
9. **Social conditions.** Spearman rank correlation between upazila access measures and census indicators (n = 544).
10. **Primary-care norms.** Community clinics are compared with the planning norm of about one per 6,000 rural people (Islam, 2017; World Health Organization, 2021). Union-level centres are compared with the number of census unions. "Union residents" are people outside paurashavas and city corporations, which is slightly more than BBS "rural".

## Results at build time (snapshot)

| Facility class | Mapped points | People ≤ 2 km | ≤ 5 km | ≤ 10 km | ≤ 20 km | Mean km |
|---|---:|---:|---:|---:|---:|---:|
| Government hospitals | 510 | 12.0% | 40.7% | 82.5% | 99.2% | 6.51 |
| Any hospital | 4,559 | 32.3% | 69.0% | 95.8% | 99.9% | 3.92 |
| Primary care | 11,880 | 66.4% | 95.4% | 99.7% | 100.0% | 1.92 |
| Upazila health complexes | 387 | 5.2% | 24.9% | 69.7% | 98.8% | 8.18 |
| Blood banks | 143 | 8.2% | 15.8% | 23.3% | 37.9% | 31.06 |

*Grid correction (November 2026):* the OSM country outline used for the 1 km grid includes territorial sea. Cells outside every union polygon were previously assigned to the nearest union and given population, which put about 2% of people at sea (91% of Patenga's). Those cells are now dropped (167,700 → 139,750 cells). People-based shares rose by up to 0.9 points; land-based shares rose more (government hospital within 10 km of land: 60.7% → 70.9%).

- **Inequality:** the upazila Gini is 0.36 for government hospitals per person, 0.40 for all hospitals, 0.26 for primary care and 0.58 for government beds. District Gini values are lower (0.18–0.30), so district averages hide much of the inequality.
- **Clustering:** Moran's I is 0.54 for people within 5 km of a government hospital and 0.69 for primary care per person. Low–low clusters for hospital access appear in the Chittagong Hill Tracts, the Sylhet–Netrokona haor belt and the north-west.
- **Primary care:** there are 9,004 union residents per listed community clinic nationally. 207 of 483 upazilas with unions have more than 9,000 per clinic.

## People versus land

The page also keeps the area-based view of the former Distance page (*Basis → Land*; data in `data/atlas/`). The *People versus land* chart plots, for each class, the share of people and the share of land within 0.5–40 km. People sit nearer to facilities than land does: the median person is 5.9 km from a government hospital, the median square kilometre of land 7.6 km, because forests, rivers, chars and hills hold land but few people. Land figures answer a geographic question (how evenly is the network spread over the territory); people figures answer the access question.

## Travel time

Inputs come from `scripts/gee/bangladesh_access_inputs.js`, run in Google Earth Engine and exported at 1 km in EPSG:32646. All exports are clipped to the geoBoundaries v6 ADM0 outline of Bangladesh (outside = no data), so routes cannot pass through India or Myanmar.

1. **Friction.** Malaria Atlas Project 2019 friction surfaces, motorized and walking-only, in minutes per metre (Weiss et al., 2020), read from the MAP catalogue in Earth Engine. The older `Oxford/MAP/friction_surface_2019` copy is deprecated and would not export.
2. **Water.** The surface has no value on the widest river reaches and the sea, which would cut off Sandwip, Hatiya and the Meghna chars. No-data cells inside Bangladesh, and estuary sea within 10 km of land (89.6–92.0° E, 21.0–23.3° N, away from Tripura), take 0.006 min/m (about 10 km/h by boat) with no waiting time.
3. **Routes.** Least-time accumulation from every usable facility of a class (scikit-image `MCP_Geometric`, 8 neighbours). Points on no-data cells snap to the nearest valid cell within 2 km. Motorized for hospitals, UHCs and blood banks; walking for primary care. The population grid is sampled at the result.

| Facilities | Travel | Median min | ≤ 30 min | ≤ 60 min | ≤ 120 min |
|---|---|---:|---:|---:|---:|
| Any hospital | motorized | 7.2 | 94.2% | 98.9% | 99.8% |
| Government hospitals | motorized | 12.5 | 89.0% | 98.4% | 99.8% |
| Upazila health complexes | motorized | 16.1 | 87.0% | 98.4% | 99.8% |
| Blood banks | motorized | 49.6 | 33.2% | 58.6% | 90.8% |
| Primary care | walking | 17.0 | 74.5% | 92.9% | 99.3% |

About 9,000 people remain on cells with no route. The least-served upazilas within 60 minutes of any hospital are Barkal, Belai Chhari, Baghai Chhari, Langadu and Jurai Chhari (Rangamati), Thanchi and Ruma (Bandarban), and Mithamain and Itna (haor basin).

**Limits.** The friction surface describes 2019 roads, so later roads and bridges (including the Padma Bridge, 2022) are missing. Ferry waits are ignored, so island times are optimistic. At 1 km a walk across one cell takes about 12 minutes, so walking times under about 15 minutes are coarse.

## Flood-disrupted access

Flooding differs by place and year, so the study uses floods observed from satellites rather than one design flood.

- **2000–2018:** Global Flood Database (`GLOBAL_FLOOD_DB/MODIS_EVENTS/V1`; Tellman et al., 2021). The maximum extent of all events that the database mapped over Bangladesh in each year, at 250 m.
- **2019–2025:** Sentinel-1 VH (Torres et al., 2012) change detection, following the UN-SPIDER recommended practice: after/before ratio > 1.25 against a January–March reference, VH after < −18 dB, permanent water (JRC GSW seasonality ≥ 10 months; Pekel et al., 2016) and HydroSHEDS slopes > 5° removed, small isolated patches dropped. Yearly bands combine monthly medians from April to October (250 m). The eight named events use the minimum composite within each event window (100 m).
- **Named events:** July–August 2019, June–August 2020, May 2022, June 2022, June 2024, August 2024, October 2024 and May–June 2025, with dates from ReliefWeb, UN Bangladesh, the Dartmouth Flood Observatory and news reports (links in `scripts/build_travel.py`).
- **Normal monsoon water.** Compared only with the dry season, every event map was dominated by the haor basin, which is under water every monsoon. For example, the August 2024 eastern flash flood ranked Sunamganj and Kishoreganj above Feni. For the named events, pixels flooded in at least 4 of the other 6 Sentinel-1 years are therefore removed. The count is leave-one-out, so a flood cannot hide itself. After this step the events fall where they were reported: Feni and Cumilla in August 2024, Sherpur and Netrokona in October 2024, Jamalpur and Gaibandha in 2019, Sylhet division in 2022. `surface_water_km2` keeps the area before removal. The yearly maps keep all water.

**Scenario.** A 1 km cell counts as flooded when at least half of it is flooded. A facility whose own flood pixel is flooded is closed. Flooded cells take max(friction, 0.04 min/m), about 1.5 km/h of wading. Travel time is recomputed, and a person "loses access" when they were within the limit before the flood (60 min for hospitals, 60 min walking for primary care) but not during it.

| Flood | Flooded beyond normal monsoon (km²) | People in flooded cells | Hospitals flooded | Lose hospital ≤ 60 min |
|---|---:|---:|---:|---:|
| Jul–Aug 2019 | 12,485 | 13.7 M | 110 | 3.0 M |
| Jun–Aug 2020 | 26,010 | 28.4 M | 197 | 8.4 M |
| May 2022 | 1,185 | 1.1 M | 23 | 0.2 M |
| Jun 2022 | 6,297 | 7.0 M | 47 | 2.0 M |
| Jun 2024 | 5,097 | 4.7 M | 42 | 1.3 M |
| Aug 2024 | 3,941 | 4.0 M | 77 | 0.4 M |
| Oct 2024 | 1,162 | 1.1 M | 17 | 0.1 M |
| May–Jun 2025 | 1,095 | 1.1 M | 19 | 0.1 M |

**Flood layers on the map.** The Floods section has its own map, and the satellite flood maps can be drawn on it as layers: the selected flood or year, or how often each pixel flooded in 2000–2025. `scripts/build_flood_overlays.py` converts the exports into palette PNGs in Web Mercator (`data/floods/overlays/`, about 4.4 MB for 35 layers, loaded one at a time) with bounds in `data/floods/overlays.json`. Named floods are at 200 m and show flooding beyond normal monsoon water separately from normal monsoon water; years and frequency are at 250 m. Downsampling keeps the modal class, and permanent rivers are left out. The layers show every flooded pixel, while the tables count only 1 km cells that are at least half flooded, so the layers show more area. Scattered single specks are most likely wet rice fields or radar noise.

    python3 scripts/build_flood_overlays.py --years bd_floods_years.tif --events bd_floods_events.tif

Across the 26 yearly maps, 34.7% of people live in a 1 km cell flooded at least once, 12.8% in five or more years and 6.7% in ten or more.

**Limits.**
- **Eras differ.** The two eras are not comparable: MODIS years include only database events at 250 m, while Sentinel-1 years map every month.
- **Revisit gaps.** Sentinel-1 revisits every 6–12 days (12 days after Sentinel-1B failed in December 2021), so short flash floods can be missed.
- **Rice fields.** Some flooded rice fields remain in the maps.
- **Wading assumption.** The scenario ignores boats, raised roads and embankments, so losses are a stress test of where the network is fragile, not a count of people cut off.
- **Upper bounds.** Yearly losses are upper bounds, because a whole year's floods are applied at once.

## Limitations

- **Straight lines unless stated:** the distance measures are straight lines; travel time and floods are modelled as described above.
- **Shares are lower bounds:** excluded or missing coordinates remove some real facilities, so the shares within a distance are underestimated.
- **Population spread:** people are assumed evenly spread within each union, and city-corporation ward populations are estimated by area.
- **Boundary mismatch:** 2022 census units are placed on 2015 boundaries. The 14 approximate metropolitan thanas affect only within-city detail.
- **What a listing measures:** a registry listing is not service availability, staffing or quality. Most UH&FWCs are run by DGFP and may be missing from the DGHS registry.
- **Ecological inference:** results describe areas, not individuals.
- **Exploratory statistics:** LISA p-values are not corrected for multiple tests, and correlation p-values are optimistic because of spatial autocorrelation.

## References

Bangladesh Bureau of Statistics. (2023). *Population and housing census 2022: Post enumeration check (PEC) adjusted population*. Statistics and Informatics Division.

Bangladesh Bureau of Statistics. (2024–2025). *Population and housing census 2022: Community report* [District series]. Statistics and Informatics Division. Tables accessed via UNICEF Bangladesh, https://github.com/unicefbd/bangladesh-population-housing-census-2022

Islam, K. (2017). Community clinic: Combining care and empowering community: A story to share from Bangladesh. *International Journal of Integrated Care, 17*(5), A311. https://doi.org/10.5334/ijic.3693

Pekel, J.-F., Cottam, A., Gorelick, N., & Belward, A. S. (2016). High-resolution mapping of global surface water and its long-term changes. *Nature, 540*(7633), 418–422. https://doi.org/10.1038/nature20584

Runfola, D., et al. (2020). geoBoundaries: A global database of political administrative boundaries. *PLOS ONE, 15*(4), e0231866. https://doi.org/10.1371/journal.pone.0231866

Tellman, B., Sullivan, J. A., Kuhn, C., Kettner, A. J., Doyle, C. S., Brakenridge, G. R., Erickson, T. A., & Slayback, D. A. (2021). Satellite imaging reveals increased proportion of population exposed to floods. *Nature, 596*(7870), 80–86. https://doi.org/10.1038/s41586-021-03695-w

Torres, R., Snoeij, P., Geudtner, D., Bibby, D., Davidson, M., Attema, E., Potin, P., Rommen, B., Floury, N., Brown, M., Navas Traver, I., Deghaye, P., Duesmann, B., Rosich, B., Miranda, N., Bruno, C., L'Abbate, M., Croci, R., Pietropaolo, A., Huchler, M., & Rostan, F. (2012). GMES Sentinel-1 mission. *Remote Sensing of Environment, 120*, 9–24. https://doi.org/10.1016/j.rse.2011.05.028

Weiss, D. J., Nelson, A., Vargas-Ruiz, C. A., Gligorić, K., Bavadekar, S., Gabrilovich, E., Bertozzi-Villa, A., Rozier, J., Gibson, H. S., Shekel, T., Kamath, C., Lieber, A., Schulman, K., Shao, Y., Qarkaxhija, V., Nandi, A. K., Keddie, S. H., Rumisha, S., Amratia, P., … Gething, P. W. (2020). Global maps of travel time to healthcare facilities. *Nature Medicine, 26*(12), 1835–1838. https://doi.org/10.1038/s41591-020-1059-1

World Health Organization. (2021, October 25). *Bangladesh: Community health workers at the heart of a stronger health system and the fight against COVID-19*. https://extranet.who.int/uhcpartnership/story/bangladesh-community-health-workers-heart-stronger-health-system-and-fight-against-covid-19
