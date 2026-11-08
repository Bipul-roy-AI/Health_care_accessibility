'use strict';
(() => {
  const tiers = {
    community: { label: 'Community clinics', types: ['Community Clinic'] },
    union: { label: 'Union-level facilities', types: ['Union Health Sub Center', 'Union Health Center', 'Union Health & Family Welfare Center (UH&FWC)'] },
    upazila: { label: 'Upazila health complexes', types: ['Upazila Health Complex'] },
    urban_primary: { label: 'Urban primary health centres', types: ['Urban Primary Health Care Center'] },
  };
  const validPoint = (row) => row.coordinateStatus === 'published' && row.lat !== null && row.lon !== null && row.lat !== '' && row.lon !== '' && Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lon)) && Math.abs(Number(row.lat)) <= 90 && Math.abs(Number(row.lon)) <= 180;
  function summarize(index, tier) {
    if (index.source !== 'DGHS facility registry' || !Array.isArray(index.records) || index.count !== index.records.length) throw new Error('Invalid DGHS snapshot');
    if (!tiers[tier]) throw new Error('Choose a known DGHS tier');
    if (new Set(index.records.map((r) => String(r.id))).size !== index.records.length) throw new Error('Duplicate DGHS IDs');
    const rows = index.records.filter((r) => String(r.is_active) === '1' && tiers[tier].types.includes(r.facility_type_name));
    const divisions = new Map();
    for (const row of rows) {
      const name = row.division_name || 'Not reported';
      const bucket = divisions.get(name) || { division: name, active: 0, mapped: 0 };
      bucket.active++; bucket.mapped += Number(validPoint(row)); divisions.set(name, bucket);
    }
    const points = rows.filter(validPoint);
    return { rows, points, total: rows.length, mapped: points.length, missing: rows.length - points.length, divisions: [...divisions.values()].sort((a, b) => a.division.localeCompare(b.division)) };
  }
  const api = { tiers, validPoint, summarize };
  if (typeof module !== 'undefined') module.exports = api;
  else window.HealthAccessibility = api;
})();
