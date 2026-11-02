'use strict';
(() => {
  class RegistryDirectory {
    static translations = {
      en: { dataSource: 'Facility data source', dghsOption: 'DGHS registry · nationwide', osmOption: 'OpenStreetMap · nearby', directoryLoading: 'Loading the DGHS directory snapshot…', directoryError: 'The DGHS directory could not load. Try Refresh, or switch to OpenStreetMap.', directoryScope: 'DGHS search covers the imported nationwide directory, including institutions without usable coordinates.', withinMap: 'Only institutions inside this map area', directorySearch: 'Search name, institution code or district…', directorySource: 'Institution records: DGHS · map: OpenStreetMap', sourceOSM: 'Community mapped · OpenStreetMap', directoryCount: 'institutions', mapped: 'with map points', unmapped: 'without usable coordinates', snapshot: 'Directory snapshot', nextPage: 'Next', previousPage: 'Previous', page: 'Page', of: 'of', registryCoordinateQuality: 'Coordinates published by DGHS, not independently verified. Some institutions may share a point. Check the entrance before travelling.', fullDetailsLoading: 'Loading detailed DGHS fields…', fullDetailsError: 'Detailed fields could not load. Summary information remains available; try again or open the original DGHS profile.', profileFields: 'Imported DGHS profile fields', moreOfficialDetails: 'The original DGHS profile may contain additional sections or newer information.', sourceUnavailable: 'No imported institutions match these filters.', directoryRefresh: 'Refresh reloads the published snapshot, not the live DGHS database.' },
      bn: { dataSource: 'প্রতিষ্ঠানের তথ্যের উৎস', dghsOption: 'DGHS রেজিস্ট্রি · সারাদেশ', osmOption: 'OpenStreetMap · কাছাকাছি', directoryLoading: 'DGHS-এর প্রকাশিত তালিকা লোড হচ্ছে…', directoryError: 'DGHS তালিকা লোড হয়নি। রিফ্রেশ করুন বা OpenStreetMap বেছে নিন।', directoryScope: 'DGHS অনুসন্ধান আমদানি করা সারাদেশের তালিকায় চলে; ব্যবহারযোগ্য স্থানাঙ্ক নেই এমন প্রতিষ্ঠানও এতে থাকে।', withinMap: 'শুধু মানচিত্রের এই এলাকার প্রতিষ্ঠান', directorySearch: 'নাম, প্রতিষ্ঠানের কোড বা জেলা খুঁজুন…', directorySource: 'প্রতিষ্ঠানের তথ্য: DGHS · মানচিত্র: OpenStreetMap', sourceOSM: 'কমিউনিটির তথ্য · OpenStreetMap', directoryCount: 'টি প্রতিষ্ঠান', mapped: 'টির মানচিত্রে স্থান আছে', unmapped: 'টির ব্যবহারযোগ্য স্থানাঙ্ক নেই', snapshot: 'তালিকার তথ্য আনার সময়', nextPage: 'পরবর্তী', previousPage: 'আগের', page: 'পৃষ্ঠা', of: 'এর মধ্যে', registryCoordinateQuality: 'স্থানাঙ্ক DGHS-এর প্রকাশিত, স্বাধীনভাবে যাচাই করা নয়। একাধিক প্রতিষ্ঠানের একই স্থানাঙ্ক থাকতে পারে। যাত্রার আগে প্রবেশপথ নিশ্চিত করুন।', fullDetailsLoading: 'DGHS-এর বিস্তারিত তথ্য লোড হচ্ছে…', fullDetailsError: 'বিস্তারিত তথ্য লোড হয়নি। সংক্ষিপ্ত তথ্য আছে; আবার চেষ্টা করুন বা মূল DGHS প্রোফাইল খুলুন।', profileFields: 'আমদানি করা DGHS প্রোফাইলের তথ্য', moreOfficialDetails: 'মূল DGHS প্রোফাইলে আরও বিভাগ বা নতুন তথ্য থাকতে পারে।', sourceUnavailable: 'এই ফিল্টারে কোনো আমদানি করা প্রতিষ্ঠান পাওয়া যায়নি।', directoryRefresh: 'রিফ্রেশ প্রকাশিত তালিকা আবার আনে, সরাসরি DGHS ডেটাবেস নয়।' }
    };
    static extraTranslations = { en: { helplinesNav: 'Helplines', nationalOverview: 'National overview', profileTextLabel: 'Original detailed-information text snapshot', profileSnapshot: 'Detailed profile retrieved', profileProgressLabel: 'Detailed profiles enriched', inactiveRegistry: 'Inactive in DGHS registry' }, bn: { helplinesNav: 'হেল্পলাইন', nationalOverview: 'সারাদেশের চিত্র', profileTextLabel: 'মূল বিস্তারিত তথ্যের পাঠ্য সংস্করণ', profileSnapshot: 'বিস্তারিত প্রোফাইল আনার সময়', profileProgressLabel: 'বিস্তারিত প্রোফাইল যুক্ত হয়েছে', inactiveRegistry: 'DGHS রেজিস্ট্রিতে নিষ্ক্রিয়' } };
    static boundaryTranslations = { en: { outsideBoundaryDetails: 'Reported coordinates are outside the Bangladesh boundary. The institution remains searchable, but its point and routing are withheld pending review.', coordinateReview: 'Coordinate review', reportedCoordinates: 'Original reported coordinates (not plotted)', boundaryExcluded: 'outside-boundary points withheld' }, bn: { outsideBoundaryDetails: 'প্রকাশিত স্থানাঙ্ক বাংলাদেশের সীমানার বাইরে। প্রতিষ্ঠান খুঁজে পাওয়া যাবে; যাচাই না হওয়া পর্যন্ত মানচিত্রের স্থান ও পথনির্দেশ দেখানো হচ্ছে না।', coordinateReview: 'স্থানাঙ্ক যাচাই', reportedCoordinates: 'মূল প্রকাশিত স্থানাঙ্ক (মানচিত্রে দেখানো হয়নি)', boundaryExcluded: 'টি সীমানার বাইরের স্থান দেখানো হয়নি' } };
    constructor() { this.metadata = null; this.facilities = []; this.chunks = new Map(); }
    static profileURL(id) { if (!/^[1-9]\d*$/.test(String(id))) return null; return `https://hrm.dghs.gov.bd/index.php/public/facility-registry/facilities/${id}/profile?tab=detailed-information`; }
    static category(type = '') {
      const value = type.toLowerCase();
      if (/diagnostic|laborator/.test(value)) return 'diagnostic';
      if (/hospital|health complex/.test(value)) return 'hospital';
      if (/pharmacy/.test(value)) return 'pharmacy';
      if (/clinic|health cent(re|er)|family welfare|dispensary|maternity|sub.?cent(re|er)/.test(value)) return 'clinic';
      return 'other';
    }
    async load() {
      const [response, country] = await Promise.all([fetch('./data/dghs/index.json', { cache: 'no-cache', credentials: 'omit' }), CountryBoundary.load()]);
      if (!response.ok) throw new Error('Registry index unavailable');
      const data = await response.json();
      if (data.schemaVersion !== 1 || !Array.isArray(data.records) || data.count !== data.records.length || !data.fields || data.chunkSize !== 250 || typeof data.generatedAt !== 'string' || !Number.isFinite(Date.parse(data.generatedAt))) throw new Error('Invalid registry snapshot');
      const seen = new Set();
      const facilities = data.records.map((record) => {
        const id = String(record.id);
        if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || seen.has(id) || typeof record.name !== 'string' || !record.name.trim()) throw new Error('Invalid institution record');
        seen.add(id);
        const tags = {};
        const mapping = { name: 'name', name_bn: 'name:bn', facility_ownership_name: 'ownership', facility_agency_name: 'operator', mailing_address: 'addr:full', district_name: 'addr:district', upazila_name: 'addr:city', email_1: 'email', website_url: 'website', code: 'ref:DGHS' };
        for (const [field, tag] of Object.entries(mapping)) if (record[field] != null && record[field] !== '') tags[tag] = String(record[field]);
        const phone = [record.mobile_1, record.land_phone_1].filter(Boolean).map(String); if (phone.length) tags.phone = [...new Set(phone)].join(' / ');
        const hasPoint = record.coordinateStatus === 'published' && country.contains(record.lat, record.lon);
        const fields = {};
        for (const [key, value] of Object.entries(record)) if (data.fields[key]) fields[data.fields[key]] = value;
        const outside = record.coordinateStatus === 'outside' || (record.coordinateStatus === 'published' && Number.isFinite(record.lat) && Number.isFinite(record.lon) && !hasPoint);
        return { id: `dghs/${id}`, lat: hasPoint ? record.lat : null, lon: hasPoint ? record.lon : null, tags, category: RegistryDirectory.category(record.facility_type_name), retrievedAt: record.retrievedAt || data.generatedAt, registry: { id, code: String(record.code || ''), type: String(record.facility_type_name || ''), division: String(record.division_name || ''), active: !['0', 'no'].includes(String(record.is_active).toLowerCase()), url: RegistryDirectory.profileURL(id), fields, detailsLoaded: false, boundaryValidated: hasPoint, reportedPoint: outside ? [Number(record.reportedLatitude ?? record.lat), Number(record.reportedLongitude ?? record.lon)] : null, coordinateStatus: hasPoint ? 'published' : outside ? 'outside' : record.coordinateStatus === 'missing' ? 'missing' : 'invalid' } };
      });
      const computedCoverage = { published: 0, missing: 0, invalid: 0, outside: 0 };
      facilities.forEach((f) => computedCoverage[f.registry.coordinateStatus]++);
      data.coordinateCoverage = computedCoverage;
      this.country = country; this.metadata = data; this.facilities = facilities; this.chunks.clear(); return facilities;
    }
    async enrich(facility) {
      if (!facility.registry || facility.registry.detailsLoaded) return facility;
      const chunkID = Math.floor(Number(facility.registry.id) / 250);
      if (!this.chunks.has(chunkID)) {
        const promise = fetch(`./data/dghs/profiles/${chunkID}.json?v=${encodeURIComponent(this.metadata.generatedAt)}`, { credentials: 'omit' }).then(async (response) => { if (!response.ok) throw new Error('Profile details unavailable'); const data = await response.json(); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid profile chunk'); return data; }).catch((error) => { this.chunks.delete(chunkID); throw error; });
        this.chunks.set(chunkID, promise);
      }
      const chunk = await this.chunks.get(chunkID), row = chunk[facility.registry.id];
      if (!row || String(row.id) !== facility.registry.id) throw new Error('Mismatched DGHS profile');
      const fields = {};
      for (const [key, label] of Object.entries(this.metadata.fields)) fields[label] = row[key] == null ? '' : String(row[key]);
      if (row._profile?.fields && row._profile.facilityId === facility.registry.id) {
        const profileIsNewer = Date.parse(row._profile.retrievedAt) >= Date.parse(facility.retrievedAt);
        for (const [label, value] of Object.entries(row._profile.fields)) if (profileIsNewer || !(label in fields)) fields[label] = value == null ? '' : String(value);
        facility.registry.profileRetrievedAt = row._profile.retrievedAt;
        facility.registry.profileText = row._profile.text || '';
        facility.registry.fullProfile = true;
      }
      facility.registry.fields = fields; facility.registry.detailsLoaded = true;
      const mapping = { email_1: 'email', website_url: 'website', mailing_address: 'addr:full', facility_ownership_name: 'ownership', facility_healthcare_level_name: 'healthcare:level', latest_bed_count: 'beds' };
      for (const [key, tag] of Object.entries(mapping)) if (row[key] != null && row[key] !== '') facility.tags[tag] = String(row[key]);
      if (['1', '0', 'Yes', 'No'].includes(String(row.has_emergency))) facility.tags.emergency = ['1', 'Yes'].includes(String(row.has_emergency)) ? 'yes' : 'no';
      return facility;
    }
  }
  Object.assign(RegistryDirectory.translations.en, RegistryDirectory.extraTranslations.en);
  Object.assign(RegistryDirectory.translations.bn, RegistryDirectory.extraTranslations.bn);
  Object.assign(RegistryDirectory.translations.en, RegistryDirectory.boundaryTranslations.en);
  Object.assign(RegistryDirectory.translations.bn, RegistryDirectory.boundaryTranslations.bn);
  window.RegistryDirectory = RegistryDirectory;
})();
