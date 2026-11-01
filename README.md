# ShasthoPath · স্বাস্থ্যপথ

A responsive, English/Bangla healthcare map for Bangladesh. Plain HTML, CSS,
JavaScript and bundled Leaflet 1.9.4; no build step, backend, paid API key or account
required. Data is queried from OpenStreetMap through the public Overpass service.

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

Enabling Pages requires repository administration access. No paid domain is
needed. Alternatively upload `index.html`, `styles.css`, `app.js`, `favicon.svg`
and the `vendor` folder to a static hosting provider with a suitable free tier.

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
  Accessibility is unknown when unrecorded. Distances are straight-line, not routes.
- Directions open Google Maps with coordinates; no Google listing data is copied.
- No location is stored by this app. Browsers send the searched bounding box to
  Overpass, tile coordinates to OpenStreetMap, and destination coordinates to
  Google Maps only when a directions link is opened. Providers receive normal
  request metadata such as IP address. Clicking “Use my location” asks for browser
  permission and uses it to choose a nearby search area and estimate distance.
- Data: © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright).
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
layout. A passing fixture test does not establish live Overpass availability.

With Playwright and Chromium installed:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
# in a second terminal
NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules node tests/smoke.cjs
```

`BASE_URL` and `CHROMIUM_PATH` can override the test's local defaults.
