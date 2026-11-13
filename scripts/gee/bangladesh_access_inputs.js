// ShasthoPath · Earth Engine exports for travel time and flood-disrupted access (Bangladesh)
// ---------------------------------------------------------------------------------------
// How to run:
//   1. Open https://code.earthengine.google.com, paste this script, press Run.
//   2. Open the Tasks tab and press RUN on both tasks (they write to Google Drive, folder below).
//   3. When both finish, download the two GeoTIFFs from Drive and attach them in the chat.
//
// Outputs (Google Drive folder "shasthopath_gee"), both in UTM 46N (EPSG:32646):
//   bd_friction_2019_1km.tif  bands: motorized, walking  (minutes needed to cross one metre)
//   bd_floods.tif             one band per flood event: 1 = flooded, 0 = not flooded,
//                             255 = no radar image in that window;
//                             gfd_events_2000_2018 = number of mapped floods 2000-2018 (MODIS);
//                             perm_water = 1 for permanent rivers and lakes (excluded from floods)
//   If bd_floods.tif is too large to attach, set FLOOD_SCALE to 200 and run again.
//
// Sources:
//   Friction: Malaria Atlas Project friction surface 2019 (Weiss et al., 2020, Nature Medicine), CC BY 4.0.
//   Radar: Copernicus Sentinel-1 GRD (VH). Method adapted from the UN-SPIDER Recommended Practice
//          on Sentinel-1 flood mapping: dry-season median vs event-window minimum, ratio threshold,
//          permanent water (JRC GSW seasonality >= 10 months), slope > 5 degrees and isolated pixels removed.
//   History: Global Flood Database v1, 2000-2018 (Tellman et al., 2021, Nature).
//   Events: dates and areas from NAWG/NDRCC, OCHA/ReliefWeb, UN Bangladesh and national news reports.

var FOLDER = 'shasthopath_gee';
var CRS = 'EPSG:32646';
var FLOOD_SCALE = 100;            // metres; 200 makes a file about 4 times smaller
var RATIO = 1.25;                 // after/before VH in dB (negative): > 1.25 means much darker (water)
var MAX_VH_AFTER = -18;           // dB; flooded pixels must also be dark after the event
var MIN_CONNECTED = 8;            // pixels; removes speckle

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
  {id: 'f2025_06', start: '2025-05-28', end: '2025-06-12', note: 'Sylhet division, Netrokona, Noakhali, Bhola, CHT (BDRCS, June 2025)'},
  {id: 'f2026_07', start: '2026-07-05', end: '2026-07-25', note: 'Chattogram division and CHT flash floods, then north-east (NAWG/ICCG, July 2026)'}
];

// ---------- 1. Travel-speed (friction) surfaces ----------
var friction = ee.Image('Oxford/MAP/friction_surface_2019')
  .select(['friction', 'friction_walking_only'], ['motorized', 'walking']).toFloat();
Export.image.toDrive({image: friction.clip(region), description: 'bd_friction_2019_1km', folder: FOLDER,
  fileNamePrefix: 'bd_friction_2019_1km', region: region, crs: CRS, scale: 1000, maxPixels: 1e10});

// ---------- 2. Flood extents per event (Sentinel-1) ----------
var perm = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('seasonality').gte(10).unmask(0);
var slope = ee.Terrain.slope(ee.Image('WWF/HydroSHEDS/03VFDEM'));

function s1(start, end) {
  return ee.ImageCollection('COPERNICUS/S1_GRD')
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    .filterBounds(region).filterDate(start, end).select('VH');
}

function floodMap(e) {
  var year = e.start.slice(0, 4);
  var beforeCol = s1(year + '-01-01', year + '-04-01');      // same year's dry season
  var afterCol = s1(e.start, ee.Date(e.end).advance(1, 'day'));
  var before = beforeCol.median().focal_mean(50, 'circle', 'meters');
  var after = afterCol.min().focal_mean(50, 'circle', 'meters');   // darkest = widest water
  var flood = after.divide(before).gt(RATIO).and(after.lt(MAX_VH_AFTER)).unmask(0)
    .where(perm, 0).where(slope.gt(5), 0);
  var connected = flood.selfMask().connectedPixelCount(MIN_CONNECTED, true).unmask(0);
  flood = flood.and(connected.gte(MIN_CONNECTED));
  var covered = afterCol.count().unmask(0).gt(0).and(beforeCol.count().unmask(0).gt(0));
  print(e.id, e.note, 'radar scenes in event window:', afterCol.size());
  return ee.Image(255).where(covered, flood).rename(e.id).toByte();
}

var events = ee.Image.cat(EVENTS.map(floodMap));

// ---------- 3. Historical floods 2000-2018 (Global Flood Database) ----------
var gfd = ee.ImageCollection('GLOBAL_FLOOD_DB/MODIS_EVENTS/V1').filterBounds(bd);
print('Global Flood Database events touching Bangladesh:', gfd.size());
var gfdCount = gfd.select('flooded').sum().unmask(0).where(perm, 0).rename('gfd_events_2000_2018').toByte();

var floods = events.addBands(gfdCount).addBands(perm.rename('perm_water').toByte());
Export.image.toDrive({image: floods.clip(region), description: 'bd_floods', folder: FOLDER,
  fileNamePrefix: 'bd_floods', region: region, crs: CRS, scale: FLOOD_SCALE, maxPixels: 1e11,
  formatOptions: {cloudOptimized: true}});

// ---------- Quick look ----------
Map.centerObject(bd, 7);
Map.addLayer(gfdCount.selfMask(), {min: 1, max: 10, palette: ['c6dbef', '08306b']}, 'Floods 2000-2018 (count)', false);
EVENTS.forEach(function (e) {
  Map.addLayer(events.select(e.id).eq(1).selfMask(), {palette: ['d7301f']}, e.id, e.id === 'f2024_08');
});
Map.addLayer(perm.selfMask(), {palette: ['2b8cbe']}, 'Permanent water');
