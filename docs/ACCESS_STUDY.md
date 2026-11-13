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
| Government hospitals | 510 | 11.8% | 40.1% | 81.9% | 98.8% | 6.65 |
| Any hospital | 4,559 | 31.8% | 68.2% | 95.1% | 99.6% | 4.07 |
| Primary care | 11,880 | 65.7% | 94.5% | 98.9% | 99.7% | 2.07 |
| Upazila health complexes | 387 | 5.1% | 24.5% | 68.9% | 98.4% | 8.33 |
| Blood banks | 143 | 8.0% | 15.4% | 22.8% | 37.7% | 31.17 |

- **Inequality:** the upazila Gini is 0.36 for government hospitals per person, 0.40 for all hospitals, 0.26 for primary care and 0.58 for government beds. District Gini values are lower (0.18–0.30), so district averages hide much of the inequality.
- **Clustering:** Moran's I is 0.53 for people within 5 km of a government hospital and 0.69 for primary care per person. Low–low clusters for hospital access appear in the Chittagong Hill Tracts, the Sylhet–Netrokona haor belt and the north-west.
- **Primary care:** there are 9,004 union residents per listed community clinic nationally. 207 of 483 upazilas with unions have more than 9,000 per clinic.

## People versus land

The page also keeps the area-based view of the former Distance page (*Basis → Land*; data in `data/atlas/`). The *People versus land* chart plots, for each class, the share of people and the share of land within 0.5–40 km. People sit nearer to facilities than land does: the median person is 6.0 km from a government hospital, the median square kilometre of land 8.5 km, because forests, rivers, chars and hills hold land but few people. Land figures answer a geographic question (how evenly is the network spread over the territory); people figures answer the access question.

## Limitations

- **Not travel time:** distances are straight lines, not roads, rivers, ferries or seasonal flooding.
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

Runfola, D., et al. (2020). geoBoundaries: A global database of political administrative boundaries. *PLOS ONE, 15*(4), e0231866. https://doi.org/10.1371/journal.pone.0231866

World Health Organization. (2021, October 25). *Bangladesh: Community health workers at the heart of a stronger health system and the fight against COVID-19*. https://extranet.who.int/uhcpartnership/story/bangladesh-community-health-workers-heart-stronger-health-system-and-fight-against-covid-19
