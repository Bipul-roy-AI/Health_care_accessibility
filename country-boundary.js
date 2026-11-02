'use strict';
(() => {
  class CountryBoundary {
    static version = '3b912c05ccbfd16bfe3e9ea6d1db76d63cdb3a590d4045e0fead1329aa362fb9';
    static promise;
    constructor(geometry) {
      const geometries = geometry.type === 'FeatureCollection' ? geometry.features.map((f) => f.geometry) : [geometry.type === 'Feature' ? geometry.geometry : geometry];
      this.polygons = [];
      for (const item of geometries) {
        if (!['Polygon', 'MultiPolygon'].includes(item.type)) throw new Error('Country boundary requires polygons');
        for (const rings of item.type === 'Polygon' ? [item.coordinates] : item.coordinates) {
          const xs = rings[0].map((p) => p[0]), ys = rings[0].map((p) => p[1]);
          this.polygons.push({ rings: rings.map(CountryBoundary.compileRing), bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
        }
      }
      this.geometry = geometry;
    }
    static compileRing(ring) {
      const ys = ring.map((p) => p[1]), south = Math.min(...ys), north = Math.max(...ys), height = (north - south) / 128 || 1;
      const bands = Array.from({ length: 128 }, () => []);
      for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length], first = Math.max(0, Math.min(127, Math.floor((Math.min(a[1], b[1]) - south) / height))), last = Math.max(0, Math.min(127, Math.floor((Math.max(a[1], b[1]) - south) / height))); for (let band = first; band <= last; band++) bands[band].push([a, b]); }
      return { south, north, height, bands };
    }
    static ringState(x, y, ring) {
      let inside = false;
      let edges;
      if (ring.bands) { if (y < ring.south || y > ring.north) return -1; edges = ring.bands[Math.max(0, Math.min(127, Math.floor((y - ring.south) / ring.height)))]; }
      else edges = ring.map((a, i) => [a, ring[(i + 1) % ring.length]]);
      for (const [[ax, ay], [bx, by]] of edges) {
        if (Math.min(ay, by) <= y && y <= Math.max(ay, by) && Math.min(ax, bx) <= x && x <= Math.max(ax, bx) && Math.abs((x - ax) * (by - ay) - (y - ay) * (bx - ax)) < 1e-11) return 0;
        if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
      }
      return inside ? 1 : -1;
    }
    contains(latitude, longitude) {
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
      for (const { rings, bounds: [west, south, east, north] } of this.polygons) {
        if (longitude < west || longitude > east || latitude < south || latitude > north) continue;
        const state = CountryBoundary.ringState(longitude, latitude, rings[0]);
        if (state === 0 || (state === 1 && rings.slice(1).every((hole) => CountryBoundary.ringState(longitude, latitude, hole) === -1))) return true;
      }
      return false;
    }
    static load() {
      if (!this.promise) this.promise = fetch(`./data/boundaries/bangladesh-country.geojson?v=${this.version}`, { credentials: 'omit' }).then(async (r) => { if (!r.ok) throw new Error('Country boundary unavailable'); const bytes = await r.arrayBuffer(); const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join(''); if (digest !== this.version) throw new Error('Country boundary checksum mismatch'); return new CountryBoundary(JSON.parse(new TextDecoder().decode(bytes))); }).catch((e) => { this.promise = null; throw e; });
      return this.promise;
    }
  }
  window.CountryBoundary = CountryBoundary;
})();
