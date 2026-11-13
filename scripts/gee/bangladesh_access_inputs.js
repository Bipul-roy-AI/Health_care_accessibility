// ShasthoPath · Earth Engine exports for travel time and flood-disrupted access (Bangladesh, 2000-2025)
// ---------------------------------------------------------------------------------------
// How to run:
//   1. Open https://code.earthengine.google.com, paste this script, press Run.
//   2. Open the Tasks tab and press RUN on all three tasks (they write to Google Drive, folder below).
//   3. When they finish, download the three GeoTIFFs from Drive and attach them in the chat.
//
// Outputs (Google Drive folder "shasthopath_gee"), all in UTM 46N (EPSG:32646):
//   bd_friction_2019_1km.tif  bands: motorized, walking  (minutes needed to cross one metre)
//   bd_floods_years.tif       y2000 ... y2025: each year's maximum flood extent (1 flooded, 0 not,
//                             255 no data); 2000-2018 from the Global Flood Database (MODIS, mapped
//                             flood events of that year), 2019-2025 from Sentinel-1 (any month
//                             April-October flooded); perm_water. 250 m.
//   bd_floods_events.tif      one band per named flood event 2019-2025 (1/0/255) and perm_water. 100 m.
//   If a file is too large to attach, raise EVENT_SCALE or YEAR_SCALE and run again.
//
// Note: the two eras use different sensors (MODIS 250 m, cloud-limited, event windows only; Sentinel-1
// radar 10 m, sees through cloud, whole season), so Sentinel-1 years will show more water. Compare
// years within an era; across eras compare patterns, not exact areas.
//
// Sources:
//   Friction: Malaria Atlas Project friction surface 2019 (Weiss et al., 2020, Nature Medicine), CC BY 4.0.
//   Radar: Copernicus Sentinel-1 GRD (VH). Method adapted from the UN-SPIDER Recommended Practice
//          on Sentinel-1 flood mapping: dry-season median vs flood-time image, ratio threshold,
//          permanent water (JRC GSW seasonality >= 10 months), slope > 5 degrees and isolated pixels removed.
//   2000-2018: Global Flood Database v1 (Tellman et al., 2021, Nature), events listing Bangladesh.
//   Events: dates and areas from NAWG/NDRCC, OCHA/ReliefWeb, UN Bangladesh, BDRCS and national news.

var FOLDER = 'shasthopath_gee';
var CRS = 'EPSG:32646';
var EVENT_SCALE = 100;            // metres, named events
var YEAR_SCALE = 250;             // metres, yearly maps (MODIS era is 250 m)
var RATIO = 1.25;                 // after/before VH in dB (negative): > 1.25 means much darker (water)
var MAX_VH_AFTER = -18;           // dB; flooded pixels must also be dark after the event
var MIN_CONNECTED = 8;            // pixels at 100 m; removes speckle (3 at 250 m)

var bd = ee.FeatureCollection('FAO/GAUL/2015/level0').filter(ee.Filter.eq('ADM0_NAME', 'Bangladesh'));
var region = bd.geometry().bounds().buffer(5000).bounds();

// Flood events (window = when water was at or near its peak). Edit or add rows as needed.
var EVENTS = [
  {id: 'f2019_07', start: '2019-07-10', end: '2019-08-05', note: 'Northern monsoon flood, 28 districts (NAWG, July 2019)'},
  {id: 'f2020_07', start: '2020-06-26', end: '2020-08-20', note: 'Monsoon flood, 21-33 districts, north, north-east, south-east (NAWG/NDRCC 2020)'},
  {id: 'f2022_05', start: '2022-05-12', end: '2022-05-25', note: 'Sylhet first flash flood, 10-22 May 2022'},
  {id: 'f2022_06', start: '2022-06-15', end: '2022-06-30', note: 'Sylhet division flash flood, 9 north-eastern districts (UN Bangladesh, June 2022)'},
  {id: 'f2024_06', start: '2024-06-17', end: '2024-07-05', note: 'Sylhet/haor flood after 18-19 June rain'},
  {id: 'f2024_08', start: '2024-08-20', end: '2024-09-05', note: 'Eastern flash flood, 11 districts incl. Feni, Noakhali, Cumilla (OCHA, Aug 2024)'},
  {id: 'f2024_10', start: '2024-10-03', end: '2024-10-15', note: 'Sherpur, Mymensingh, Netrokona flash flood (Oct 2024)'},
  {id: 'f2025_06', start: '2025-05-28', end: '2025-06-12', note: 'Sylhet division, Netrokona, Noakhali, Bhola, CHT (BDRCS, June 2025)'}
];

// ---------- 1. Travel-speed (friction) surfaces ----------
var friction = ee.Image('Oxford/MAP/friction_surface_2019')
  .select(['friction', 'friction_walking_only'], ['motorized', 'walking']).toFloat();
Export.image.toDrive({image: friction.clip(region), description: 'bd_friction_2019_1km', folder: FOLDER,
  fileNamePrefix: 'bd_friction_2019_1km', region: region, crs: CRS, scale: 1000, maxPixels: 1e10});

// ---------- 2. Flood extents (Sentinel-1) ----------
var perm = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('seasonality').gte(10).unmask(0);
var slope = ee.Terrain.slope(ee.Image('WWF/HydroSHEDS/03VFDEM'));

function s1(start, end) {
  return ee.ImageCollection('COPERNICUS/S1_GRD')
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    .filterBounds(region).filterDate(start, end).select('VH');
}
function dryReference(year) {           // same year's dry season, January-March
  var col = s1(ee.Date.fromYMD(year, 1, 1), ee.Date.fromYMD(year, 4, 1));
  return {image: col.median().focal_mean(50, 'circle', 'meters'), count: col.count().unmask(0)};
}
function water(flooded, before) {       // change rule + masks; returns 0/1, unmasked
  return flooded.divide(before).gt(RATIO).and(flooded.lt(MAX_VH_AFTER)).unmask(0)
    .where(perm, 0).where(slope.gt(5), 0);
}
function despeckle(flood, minPixels) {
  var connected = flood.selfMask().connectedPixelCount(minPixels, true).unmask(0);
  return flood.and(connected.gte(minPixels));
}

// Named events: darkest image in the event window.
function eventMap(e) {
  var ref = dryReference(Number(e.start.slice(0, 4)));
  var afterCol = s1(e.start, ee.Date(e.end).advance(1, 'day'));
  var flood = despeckle(water(afterCol.min().focal_mean(50, 'circle', 'meters'), ref.image), MIN_CONNECTED);
  var covered = afterCol.count().unmask(0).gt(0).and(ref.count.gt(0));
  print(e.id, e.note, 'radar scenes in window:', afterCol.size());
  return ee.Image(255).where(covered, flood).rename(e.id).toByte();
}

// Years 2019-2025: monthly medians April-October; flooded if any month is flooded.
function sentinelYear(year) {
  var ref = dryReference(year);
  var months = ee.ImageCollection(ee.List.sequence(4, 10).map(function (m) {
    var start = ee.Date.fromYMD(year, m, 1);
    var col = s1(start, start.advance(1, 'month'));
    return water(col.median().focal_mean(50, 'circle', 'meters'), ref.image).updateMask(col.count().gt(0)).rename('f');
  }));
  var flood = despeckle(months.max().unmask(0), 3);
  var covered = months.count().unmask(0).gt(0).and(ref.count.gt(0));
  return ee.Image(255).where(covered, flood).rename('y' + year).toByte();
}

// ---------- 3. Years 2000-2018 (Global Flood Database) ----------
var gfd = ee.ImageCollection('GLOBAL_FLOOD_DB/MODIS_EVENTS/V1').filter(ee.Filter.stringContains('cc', 'BGD'));
function gfdYear(year) {
  var col = gfd.filterDate(ee.Date.fromYMD(year, 1, 1), ee.Date.fromYMD(year + 1, 1, 1));
  print('y' + year, 'Global Flood Database events listing Bangladesh:', col.size());
  var none = ee.ImageCollection([ee.Image(0).rename('flooded').toByte()]);   // years with no mapped event
  return col.select('flooded').merge(none).max().unmask(0).where(perm, 0).rename('y' + year).toByte();
}

var years = [];
for (var y = 2000; y <= 2025; y++) years.push(y <= 2018 ? gfdYear(y) : sentinelYear(y));
var yearImage = ee.Image.cat(years).addBands(perm.rename('perm_water').toByte());
var eventImage = ee.Image.cat(EVENTS.map(eventMap)).addBands(perm.rename('perm_water').toByte());

Export.image.toDrive({image: yearImage.clip(region), description: 'bd_floods_years', folder: FOLDER,
  fileNamePrefix: 'bd_floods_years', region: region, crs: CRS, scale: YEAR_SCALE, maxPixels: 1e11,
  formatOptions: {cloudOptimized: true}});
Export.image.toDrive({image: eventImage.clip(region), description: 'bd_floods_events', folder: FOLDER,
  fileNamePrefix: 'bd_floods_events', region: region, crs: CRS, scale: EVENT_SCALE, maxPixels: 1e11,
  formatOptions: {cloudOptimized: true}});

// ---------- Quick look ----------
Map.centerObject(bd, 7);
var frequency = yearImage.select('y.*').eq(1).reduce(ee.Reducer.sum());
Map.addLayer(frequency.selfMask(), {min: 1, max: 15, palette: ['c6dbef', '6baed6', '2171b5', '08306b']}, 'Years flooded 2000-2025', true);
EVENTS.forEach(function (e) {
  Map.addLayer(eventImage.select(e.id).eq(1).selfMask(), {palette: ['d7301f']}, e.id, false);
});
Map.addLayer(perm.selfMask(), {palette: ['2b8cbe']}, 'Permanent water');
