# ShasthoPath · স্বাস্থ্যপথ

A responsive, English/Bangla healthcare map for Bangladesh. Plain HTML, CSS,
JavaScript and bundled Leaflet 1.9.4; no build step, backend, paid API key or account
required. Data is queried from OpenStreetMap through the public Overpass service.

## Maps and journeys

- Open the layers button in the map's upper-right corner to switch between the
  OpenStreetMap street basemap and CARTO's light basemap.
- Enable **Road network · OSM** and/or **Building footprints · OSM** for independent
  open-data overlays. Zoom to street level (15 or closer), then select **Update
  roads & buildings**. Geometry is fetched for the current viewport only. Refresh
  after panning. Footprints are 2D OSM building ways, not a complete building census
  or 3D models; unmapped buildings will be absent. Dashed road lines mark mapped
  paths, footways, steps or cycleways, not verified accessible routes.
- In **Plan a journey**, choose a starting point by clicking the map, entering
  latitude/longitude, or selecting the location button. Select a loaded facility
  and press **Show road route**. A facility card's **Route here** button also works.
- The blue route, road distance, estimated driving time and turn instructions
  come from OSRM's public driving service. A and B mark the selected endpoints.
  The straight-line distance is shown separately. This is driving routing only:
  it does not calculate walking, cycling, wheelchair-safe or ambulance routes.
- Origin/destination changes cancel old requests and hide the previous route.
  Network errors and no-route responses display an error; they never substitute
  an invented route or label straight-line distance as road distance.
- OSRM snaps endpoints to routable roads. Facility coordinates may be approximate
  building centres rather than entrances. Check entrances, road access and local
  conditions. ETA excludes live traffic and is not an emergency response estimate.
- **Clear journey** removes the starting point, destination, route and metrics.

## Run locally

```sh
cd /workspace/Health_care_accessibility
python3 -m http.server 8000 --bind 0.0.0.0
```

Open the server in your own browser. Internet access is required for map tiles and
facility queries. Location access requires HTTPS in production (localhost also
works). Existing isolated checkouts are sufficient; do not create a worktree.

## Publish for free on GitHub Pages

1. Keep this repository public for free GitHub Pages on a GitHub Free account.
2. Push these files to `main` in `Bipul-roy-AI/Health_care_accessibility`.
3. In the repository, open **Settings → Pages → Build and deployment → Source**
   and select **GitHub Actions**.
4. Run **Deploy website to GitHub Pages** in the Actions tab, or push another
   commit to `main`. Wait for the deployment to finish successfully.
5. Use the published URL reported by the deployment. The expected project URL is
   `https://bipul-roy-ai.github.io/Health_care_accessibility/`.

If deployment says **Get Pages site failed / Not Found**, Pages has not been
enabled or is configured to use a different publishing source. Complete step 3,
then rerun the workflow. A pushed commit alone does not mean the site is live.

Enabling Pages requires repository administration access. No paid domain is
needed. Alternatively upload `index.html`, `styles.css`, `app.js`, `favicon.svg`
plus `map-tools.js` and the `vendor` folder to a static hosting provider with a
suitable free tier.

## Data and limits

- The default view searches part of Dhaka. Select one of eight division cities,
  use your location, or pan/zoom and select **Search this map area** for other places.
- Search text and type/accessibility filters apply only to the loaded facilities.
- Queries intersect the viewport with Bangladesh's OSM administrative area.
  Zoom out too far and the app asks you to zoom in, avoiding expensive nationwide queries.
- This is **not a complete or official registry**, and records are not clinically
  verified. It includes hospitals, clinics, diagnostics/laboratories, pharmacies,
  and other healthcare types when tagged in OSM. Government ownership is not
  assumed or inferred. Separate OSM objects may describe the same real facility.
- OSM way/relation centres are approximate facility locations, not entrances.
- Opening hours are raw OSM values, not a promise that a facility is open now.
  Accessibility is unknown when unrecorded. Card distances are labelled
  straight-line; the journey panel distinguishes road distance and direct distance.
- The external Directions links open Google Maps with coordinates; no Google
  listing data is copied. In-map routes use OSRM and OSM road data.
- No location is stored by this app. Browsers send the searched bounding box to
  Overpass, tile coordinates to the selected OpenStreetMap/CARTO basemap provider,
  and the chosen origin/destination coordinates to OSRM when requesting a route.
  Destination coordinates go to Google Maps only when an external Directions
  link is opened. Providers receive normal
  request metadata such as IP address. Clicking “Use my location” asks for browser
  permission and uses it to choose a nearby search area and estimate distance.
- Data: © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright).
  Light basemap: © [CARTO](https://carto.com/attributions), subject to its terms
  for public basemaps. Routing: [OSRM](https://project-osrm.org/).
  Leaflet's BSD licence is included in `vendor/leaflet/LICENSE`.
- Follow [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
  and [Overpass usage guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html).
  Public endpoints have no availability guarantee and can rate-limit requests.
  This small prototype does not prefetch tiles or poll. Substantial traffic needs
  a suitable tile provider and data service; perpetual free operation at any scale
  is not guaranteed.

## Verification

The browser smoke test exercises the real app with **synthetic test responses**,
never public facility data. It checks filters, English/Bangla, geolocation,
directions, safe rendering, stale/error states, request cancellation and mobile
layout. It also exercises map-picked/manual origins, OSRM coordinate order,
route geometry, road distance versus direct distance, ETA, turn instructions,
no-route/invalid/server errors, stale-request cancellation, basemap switching,
and OSM road/building overlay loading. A passing fixture test does not establish
live public-service availability.

With Playwright and Chromium installed:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
# in a second terminal
NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules node tests/smoke.cjs
```

`BASE_URL` and `CHROMIUM_PATH` can override the test's local defaults.

Cloud network access for real requests must allow `overpass-api.de`,
`tile.openstreetmap.org`, `basemaps.cartocdn.com`, `router.project-osrm.org`,
and `bipul-roy-ai.github.io` to verify the deployed website. Saved draft settings
must be applied before they affect a running workspace. These cloud-only settings
do not control visitors' browsers on the published website.
