# Approved open transport inputs

The user approved **“Open source or OSM data”** for travel modelling. DGHS remains the only health-facility/capacity source and BBS remains the only population source. No OSM hospital/clinic inventory is merged into the study.

## Data separation and provenance

The initial transport source is the OpenStreetMap Bangladesh extract distributed by Geofabrik. Its URLs, ODbL attribution and current retrieval status are in [`supporting-sources.json`](../data/accessibility/supporting-sources.json). Raw PBF contains many kinds of OSM objects; the extractor writes **highway ways and selected transport tags only**, never OSM amenities as health facilities.

Do not label the DGHS or BBS data as OSM-derived. Retain OSM attribution/licence information with transport outputs. Record snapshot and processing dates separately; a download timestamp is not necessarily the source-data timestamp. Review the data licence and derivation requirements when distributing results.

Open elevation and water/barrier inputs are approved categories, but no particular terrain/water product has yet been selected or downloaded. Choose appropriate source vintage, resolution, season and coverage once the study boundaries/grid are available. An old permanent-water product is not a current flood or ferry-access observation.

## Obtain an extract

Install the geospatial requirements in the analysis environment:

```bash
python -m pip install -r scripts/requirements-geospatial.txt
```

Inspect endpoints/provenance without downloading:

```bash
python scripts/download_osm_transport.py
```

Explicitly acquire the national extract:

```bash
python scripts/download_osm_transport.py --download
```

The downloader uses official HTTPS URLs and the published MD5 companion file. It rejects malformed checksum responses, empty/oversized downloads and checksum mismatches, then writes a local SHA-256 provenance record. It stages downloads atomically and never replaces an existing destination. Use a new output path for a deliberate new snapshot. The default cap is 2 GiB; check available disk/network resources before changing it with `--max-gib`. If a source snapshot changes between checksum and extract retrieval, a mismatch fails rather than accepting unverifiable bytes.

**Cloud status:** a request to `download.geofabrik.de` was denied by the managed proxy (HTTP 403). No country extract has been downloaded here and current endpoint contents have not been verified. Enable that domain in cloud environment settings, or run acquisition from the user's local PC and supply the verified files. Do not bypass TLS or proxy verification. This network blocker does not require a paid account or a DGHS/Google API token.

## Extract only the selected transport mode

Walking source layer:

```bash
python scripts/extract_osm_transport.py --input analysis-inputs/osm/bangladesh-latest.osm.pbf --mode walk --output analysis-inputs/osm/walking_roads.geojson
```

Driving source layer:

```bash
python scripts/extract_osm_transport.py --input analysis-inputs/osm/bangladesh-latest.osm.pbf --mode drive --output analysis-inputs/osm/driving_roads.geojson
```

For a large national extract, `--location-cache analysis-inputs/osm/walk_nodes.idx` uses a disk-backed node-location cache. Choose a new cache path; an existing file is not overwritten. Without that option, the adaptive in-memory cache may require substantial RAM. Keep a buffer around the target population when later clipping; administrative borders are not travel barriers.

The extractor filters unusable/construction/proposed ways and uses conservative mode/access rules. Foot-forbidden/private routes and walking motorways are excluded. Driving excludes pedestrian-only classes unless explicitly motor-vehicle-permitted. These are preprocessing rules, not a complete interpretation of all local laws, conditional access, destination-only restrictions or opening times. Conditional tags are retained for review.

Each output retains OSM way IDs, node IDs, layer, bridge/tunnel/ford, one-way and access tags. Missing node locations fail extraction rather than silently dropping geometry. Coordinates are WGS84. No speeds, travel-time estimates, facility coverage or clinical access are calculated by this step.

## Before creating a travel-cost surface

- Select mode and season explicitly. Document assumed speeds and sensitivity ranges; road class and `maxspeed` are not measured average speeds.
- Verify grade-separated crossings and node topology. Lines crossing on a map are not automatically connected; a rasterized road network can create false intersections.
- Model water barriers, bridges, viable ferries and seasonal access explicitly. A river is not traversable because two road pixels touch, and an OSM ferry tag is not a current timetable.
- Use an appropriate projected metre CRS and reviewed resolution. BBS population counts must align without unreviewed interpolation or a fabricated fine-scale distribution.
- Review DGHS access points and missing coordinates; a road trace does not establish a facility entrance.
- Build and validate an approved friction grid for the current raster model. Its isotropic/symmetric limitations still apply; the road extractor is **not** a drop-in one-way network-routing backend.

Synthetic tests cover transport-only extraction, conservative access filters, preserved topology tags and atomic checksum handling. No Bangladesh road download, topology validation, speed calibration or travel-time result is claimed yet.
