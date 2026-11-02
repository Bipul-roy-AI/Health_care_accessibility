# Development and data updates

This is a static website. Leaflet is bundled
with their licences. No production package installation, database or paid API key
is needed. Use the existing checkout; do not create a worktree unless requested.

## Local development

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

The default view loads the committed nationwide DGHS snapshot. Use `?source=osm`
for nearby OpenStreetMap searches. `?institution=2` opens a DGHS institution by ID.
Real map tiles, nearby OSM searches and routing require Internet access.

## Data

The initial complete directory comes from the official public organization-report
Excel exports, partitioned by district to stay within the source server's limits.
The import validates export headings, geographic filter coverage, every institution
ID, duplicate records and coordinates. Inactive records are retained and labelled.

```sh
python3 -m pip install -r scripts/requirements.txt
python3 scripts/sync_dghs.py
python3 scripts/validate_dghs.py
```

The raw public XLSX cache stays outside the checkout in `/tmp/shasthopath-dghs-cache`.
All extracted record fields, source metadata and progress are committed under
`data/`. Nothing is fetched from DGHS by visitors' browsers.

The **Update DGHS detailed profiles** GitHub Actions workflow resumes a daily
batch of up to 500 profiles, paced at one request at a time with a one-second
pause and a 20-minute time budget. Smaller or larger manual batches (up to 1000)
can be run through Actions. Failed profiles retain their previous information and
are queued for retry. The next offset and progress are saved in the dataset.

```sh
python3 scripts/update_profile_batch.py --limit 500 --delay 1
python3 scripts/validate_dghs.py
```

Profile batches cover the public `detailed-information` tab, including its visible
fields and readable text. They do not import HRM employee tables or source scripts.
A report snapshot is complete for its recorded source IDs; detailed-profile
snapshots are progressively added and individually dated.

## Verification and publication

```sh
node --check app.js
node --check map-tools.js
node --check facility-details.js
node --check registry-directory.js
node --check overview.js
node --check country-boundary.js
node --check helplines.js
python3 scripts/validate_dghs.py
NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules node tests/smoke.cjs
NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules node tests/directory.cjs
NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules node tests/helplines.cjs
```

Browser checks require Playwright and Chromium, and a running local HTTP server.
In the managed environment these are preinstalled. The Pages workflow installs
its own pinned test tools outside the checkout. `BASE_URL` and `CHROMIUM_PATH`
can override the browser test defaults. Browser fixture tests distinguish mocked
external services from actual committed DGHS data.

Push to `main` to run validation/browser checks and deploy GitHub Pages. Pages must
use **GitHub Actions** as its source. The daily data workflow validates, commits
and deploys its own data update because GITHUB_TOKEN-generated pushes do not
trigger the separate Pages workflow. If automatic commits are denied, check the
repository's Actions policy permits the workflow's `contents: write` permission.
Generated HTML includes content-hash versions on CSS/JavaScript references so
returning visitors receive the latest map code and styles after deployment.

Street and light basemaps use OpenStreetMap tiles; light is a local colour style.
CARTO was removed after its tile service returned API-key-required images.
The light style affects raster tiles only, preserving coloured facility markers,
road overlays and routes. Follow OpenStreetMap's tile usage policy. Public Overpass
and OSRM services have usage limits and no uptime guarantee; high traffic needs
suitable providers. Coordinates may be building centres rather than entrances.
The driving estimate excludes live traffic and wheelchair-safety certification.

Relevant cloud network hosts: `hrm.dghs.gov.bd`, `tile.openstreetmap.org`,
`overpass-api.de`, `router.project-osrm.org`, and `bipul-roy-ai.github.io`.
Cloud network changes must be applied before live checks can use them.

## Geographic quality

The country outline uses complete outer member ways of OpenStreetMap relation
184640. The national geometry is pinned by SHA-256 in both country-boundary.js and
scripts/country_boundary.py. Latitude-band edge indexing keeps point-in-polygon
checks fast without simplifying the stored boundary. Holes and multiple polygons
are handled. A border geometry change requires source verification, revalidation
of the index and review file, refreshed screenshots, and the full test suite.

Every import and profile batch preserves source coordinates and writes the
excluded-coordinate review. Neither records nor coordinates are silently moved to
a nearby district centre. The browser independently checks all plotted DGHS points
and withholds routes to rejected points. Canvas dots retain actual point locations;
no averaged cluster centres are displayed.
