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

The initial DGHS import covers all **39,442 IDs** in the public registry, including
four inactive entries. Initially **29,379** had usable published coordinates,
**10,061** had blank coordinates and **2** had invalid coordinates. Missing and
invalid points are not guessed, swapped or replaced with district centres.
Subsequent dated profile batches may improve these fields; current counts are in
`dghs/index.json` and on the site.

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
