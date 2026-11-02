# Extracted Bangladesh institution data

All extracted institutional values used by the site are committed here.

- `dghs/index.json`: the nationwide search index, source/coverage metadata and
  detailed-profile import progress.
- `dghs/profiles/`: chunks of up to 250 institution IDs. Every record retains all
  62 verified public report fields. The `_profile` property adds a dated snapshot
  of the original detailed-information fields and readable text as batches finish.
- `boundaries/bangladesh-divisions.geojson`: eight simplified administrative
  division geometries, from geoBoundaries gbOpen BGD ADM1.
- `boundaries/source-metadata.json`: the boundary source and CC0 licence metadata.

The complete DGHS import covers all **39,442 IDs** in the public registry, including
four inactive entries. Currently **28,464** coordinates pass the national polygon
check, **915** are outside that boundary, **10,061** are missing and **2** are invalid.
All institution records and original source fields are retained. No coordinates
are guessed, swapped or replaced with district centres. Current counts and dated
profile-batch progress are recorded in `dghs/index.json`.

DGHS source: <https://hrm.dghs.gov.bd/index.php/public/facility-registry>.
Each record links to its own detailed-information profile. The report source URL
and requested fields are recorded in the index. Public source facts retain their
source attribution; DGHS records are not labelled as OpenStreetMap/ODbL data.
No source HTML, debugging metadata, browser sessions or credentials are stored.

Division boundaries: <https://github.com/wmgeolab/geoBoundaries/tree/main/releaseData/gbOpen/BGD/ADM1>.
The source year is **2015**, build **2023**, with a **CC0 1.0** public-domain
dedication. The simplified geometry was verified against its Git LFS SHA-256
`bb91b74c7a7d8a690122b916f5e2f99606d2ce2f18ff938f49d80f15b4ba6aea`.
Display aliases normalize Chittagong→Chattogram, Barisal→Barishal and the source
label Rajshani→Rajshahi. The original source labels remain in the GeoJSON.
These are orientation boundaries, not cadastral survey geometry.

See [development and data updates](../DEVELOPMENT.md) for import/validation commands.

## National boundary checks

Country geometry is stored in `boundaries/bangladesh-country.geojson` with its
source, timestamp, licence and checksum in `country-source-metadata.json`. It is
derived from OpenStreetMap Bangladesh relation 184640, includes offshore islands,
and is licensed under ODbL. This is separate from the CC0 division outlines.

A polygon test (not a bounding rectangle) is applied during imports, daily updates
and browser loading. Currently 28,464 points pass; 915 reported coordinates lie
outside the stored national boundary and are withheld from maps and routing.
Their original coordinates and institution details are preserved in profile chunks
and `dghs/coordinate-review.json`. Missing/invalid coordinates are also retained
without inventing replacement points. Individual points are drawn directly, so
cluster averages cannot appear across the border. Boundary checks do not establish
that a point identifies the correct building or entrance.

## Emergency and helpline contacts

`helplines.json` contains 16 national service contacts, categories, source URLs and
source-check status. Fourteen numbers were checked against government or official
service publications. Child and legal-aid entries are labelled as references
because their agency websites were unavailable during this update. Call charges,
opening hours and response availability are controlled by the service provider.
