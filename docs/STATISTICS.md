# Healthcare statistics: sources and reproducibility

Open [Statistics](https://bipul-roy-ai.github.io/Health_care_accessibility/statistics.html) from the website navigation. Choose a facility group and division; switch the division chart between counts and rates. Download CSV for all eight divisions in the selected group. Tables and chart labels remain readable without relying on colour.

## Approved sources

- **DGHS public facility registry:** the existing saved `data/dghs/index.json`. The page shows the national report export date, dataset update date and individual record retrieval range. Profile updates do not imply a new national registry export.
- **Bangladesh Bureau of Statistics, Statistical Yearbook 2025**, 45th edition, published June 2026. The official PDF URL, SHA-256 and transcribed values are in [`data/statistics/sources.json`](../data/statistics/sources.json). Table 2.03, printed p. 56 (PDF p. 84), supplies adjusted Census 2022 division populations. Table 13.01, printed pp. 501–502 (PDF pp. 530–531), supplies published 2025 DGHS hospital, bed and staffing indicators.
- **Published research:** two primary publisher articles from 2025 and 2026, with DOI, scope, findings and limitations recorded in the same source file. Research was checked on 4 November 2026; this is a selected recent reading list, not an exhaustive systematic review. A paper's publication year is not necessarily its data year.

No third-party population, basemap, routing or inferred location data enter these statistics.

## Counting rules

Only records with `is_active` equal to `1` enter registry calculations. Unique institution IDs are required; duplicate IDs fail the build. Separate IDs may represent units on one campus. Active registry status does not prove a current licence, opening hours or treatment availability.

Hospital types use the explicit allowlist in `scripts/build_statistics.py`, displayed on the page. Government-owned hospital listings additionally require an explicit public/autonomous ownership value. Missing ownership is retained as “Not reported,” never inferred from a name or missing private flag. Private hospital/clinic, blood bank, diagnostic and community-clinic subsets match exact DGHS type labels. Groups overlap and must not be added together. All institutions includes administrative and training bodies and is not a hospital total.

The published national indicators and calculated registry totals have different dates, scope and definitions. Their difference is not a growth estimate or an estimate of unlicensed institutions. Bed-sector totals and staffing gaps are simple arithmetic from the published table; they are not live capacity or attendance measurements.

## Population comparisons

- Listings per 100,000 = active listings / adjusted Census 2022 population × 100,000.
- People per listing = adjusted Census 2022 population / active listings.
- Relative rate = division listing rate / national listing rate.
- Population/listing shares = division value / corresponding national total × 100.

The national denominator is the sum of the eight official division rows. No 2026 population projection is invented. Calculations use full precision; display rounding does not alter CSV values. A dash means a denominator is zero. District charts show counts only, without district population rates. Unknown division labels fail the build rather than silently dropping records.

These are measures of institution availability and concentration. They do not establish travel-time access, affordability, quality, bed capacity, service readiness, cross-boundary patient flows or the percentage of residents adequately served. Research context is kept separate from directory calculations.

## Updating and verification

```bash
python3 scripts/build_statistics.py
python3 scripts/build_statistics.py --check
python3 -m unittest discover -s tests -p 'test_*.py'
```

The deterministic summary records the source index SHA-256 and reconciles division and district totals. The daily registry updater regenerates it after profile enrichment; deployments reject a stale summary. BBS tables and research citations require a reviewed manual source update, not an automatic claim that they are the latest available.

Browser tests in `tests/statistics.cjs` check real summary counts, all seven groups, division rates, CSV download, research rendering, narrow screens and unavailable-source handling. Run them against a local HTTP server with Playwright installed. Both publishing workflows include the page and its assets.
