/* Access study: population-based access (BBS Census 2022 x DGHS registry), division to union.
   Data: data/access/*.json, built by scripts/build_atlas.py --census (scripts/build_access.py). */
'use strict';
(() => {
  const $ = (s) => document.querySelector(s);
  const T = (en, bn) => (window.SiteI18n ? window.SiteI18n.t(en, bn) : en);
  const N = (v, d = 0) => (window.SiteI18n ? window.SiteI18n.number(v, d) : (Number.isFinite(v) ? v.toFixed(d) : '—'));
  const pct = (v) => (Number.isFinite(v) ? N(v, 1) + '%' : '—');
  const place = (name) => (window.NamesBn ? window.NamesBn.name(name) : name);
  const get = (path) => fetch(path, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(path); return r.json(); });

  // Validated categorical order (dataviz palette check): government, any hospital, non-government, primary care.
  const COLOURS = { public_hospital: '#077a53', any_hospital: '#2563eb', blood_bank: '#c2611e', primary_care: '#8b5cf6',
                    uhc: '#077a53', community_clinic: '#8b5cf6', union_facility: '#8b5cf6' };
  const CLASS = {
    public_hospital: ['Government hospitals', 'সরকারি হাসপাতাল'], any_hospital: ['Any hospital', 'যেকোনো হাসপাতাল'],
    primary_care: ['Primary care', 'প্রাথমিক স্বাস্থ্যসেবা'], uhc: ['Upazila health complexes', 'উপজেলা স্বাস্থ্য কমপ্লেক্স'],
    blood_bank: ['Blood banks', 'ব্লাড ব্যাংক'], community_clinic: ['Community clinics', 'কমিউনিটি ক্লিনিক'],
    union_facility: ['Union-level centres', 'ইউনিয়ন-স্তরের কেন্দ্র'], private_ngo_hospital: ['Non-government hospitals', 'বেসরকারি হাসপাতাল']
  };
  const cls = (k) => T(...CLASS[k]);
  const LEVELS = {
    division: { en: 'Division', bn: 'বিভাগ', geo: { url: './data/boundaries/bangladesh-divisions.geojson' } },
    district: { en: 'District', bn: 'জেলা', geo: { url: './data/boundaries/bangladesh-districts.geojson' } },
    upazila: { en: 'Upazila / thana', bn: 'উপজেলা / থানা', geo: { url: './data/boundaries/bangladesh-upazilas.geojson' } },
    union: { en: 'Union', bn: 'ইউনিয়ন', geo: { url: './data/boundaries/bangladesh-unions.topojson', topology: 'unions' } }
  };
  const lvl = (k) => T(LEVELS[k].en, LEVELS[k].bn);
  const ALL = ['division', 'district', 'upazila', 'union'], NO_UNION = ['division', 'district', 'upazila'];
  const LISA = [
    { key: 'HH', color: '#0c6a49', en: 'High–high cluster', bn: 'উচ্চ-উচ্চ গুচ্ছ' },
    { key: 'LL', color: '#c56f22', en: 'Low–low cluster', bn: 'নিম্ন-নিম্ন গুচ্ছ' },
    { key: 'HL', color: '#92caac', en: 'High among low', bn: 'নিম্নের মধ্যে উচ্চ' },
    { key: 'LH', color: '#f6d9ab', en: 'Low among high', bn: 'উচ্চের মধ্যে নিম্ন' },
    { key: 'ns', color: '#e6e4dc', en: 'Not significant', bn: 'তাৎপর্যপূর্ণ নয়' }
  ];
  const SOCIO = {
    literacy7: ['Literacy, age 7+ (%)', 'সাক্ষরতা, ৭+ বছর (%)'], female_literacy7: ['Female literacy, age 7+ (%)', 'নারী সাক্ষরতা, ৭+ বছর (%)'],
    basic_sanitation: ['Households with basic sanitation (%)', 'মৌলিক স্যানিটেশনসহ খানা (%)'], internet5: ['Internet use, age 5+ (%)', 'ইন্টারনেট ব্যবহার, ৫+ বছর (%)'],
    mobile15_female: ['Women 15+ owning a mobile phone (%)', 'মোবাইল ফোনের মালিক ১৫+ নারী (%)'], ethnic_pct: ['Indigenous (ethnic) population (%)', 'ক্ষুদ্র নৃগোষ্ঠীর জনসংখ্যা (%)']
  };
  const ACCESS_Y = {
    within5_public_hospital: { en: 'Within 5 km of a government hospital (%)', bn: 'সরকারি হাসপাতাল থেকে ৫ কিমির মধ্যে (%)', value: (a) => a.within.public_hospital['5'] },
    within5_any_hospital: { en: 'Within 5 km of any hospital (%)', bn: 'যেকোনো হাসপাতাল থেকে ৫ কিমির মধ্যে (%)', value: (a) => a.within.any_hospital['5'] },
    rate_any_hospital: { en: 'Hospitals per 100,000 people', bn: 'প্রতি ১,০০,০০০ জনে হাসপাতাল', value: (a) => a.rates.any_hospital },
    rate_primary_care: { en: 'Primary-care facilities per 100,000 people', bn: 'প্রতি ১,০০,০০০ জনে প্রাথমিক সেবা', value: (a) => a.rates.primary_care }
  };

  const LISA_NAMES = Object.fromEntries(Object.entries(ACCESS_Y).map(([k, v]) => [k, [v.en, v.bn]]));
  const within = (k, t) => (a, level) => (level === 'union' ? a[`within${t}_${k}`] : a.within?.[k]?.[t]);
  const MEASURES = [
    { id: 'within5_public', klass: 'public_hospital', levels: ALL, digits: 1, ramp: 'green', worse: 'low', value: within('public_hospital', '5'),
      en: 'People within 5 km of a government hospital (%)', bn: 'সরকারি হাসপাতাল থেকে ৫ কিমির মধ্যে মানুষ (%)',
      note: ['Government-owned hospitals, including upazila health complexes.', 'সরকারি মালিকানার হাসপাতাল, উপজেলা স্বাস্থ্য কমপ্লেক্সসহ।'] },
    { id: 'within5_any', klass: 'any_hospital', levels: ALL, digits: 1, ramp: 'green', worse: 'low', value: within('any_hospital', '5'),
      en: 'People within 5 km of any hospital (%)', bn: 'যেকোনো হাসপাতাল থেকে ৫ কিমির মধ্যে মানুষ (%)',
      note: ['Government, private and NGO hospitals and clinics with beds.', 'সরকারি, বেসরকারি ও এনজিও হাসপাতাল ও ক্লিনিক।'] },
    { id: 'within5_primary', klass: 'primary_care', levels: ALL, digits: 1, ramp: 'green', worse: 'low', value: within('primary_care', '5'),
      en: 'People within 5 km of primary care (%)', bn: 'প্রাথমিক স্বাস্থ্যসেবা থেকে ৫ কিমির মধ্যে মানুষ (%)',
      note: ['Community clinics, union centres, UH&FWC, MCWC and urban primary-care centres.', 'কমিউনিটি ক্লিনিক, ইউনিয়ন কেন্দ্র, UH&FWC, MCWC ও নগর প্রাথমিক স্বাস্থ্যকেন্দ্র।'] },
    { id: 'within2_primary', klass: 'primary_care', levels: NO_UNION, digits: 1, ramp: 'green', worse: 'low', value: within('primary_care', '2'),
      en: 'People within 2 km of primary care (%)', bn: 'প্রাথমিক স্বাস্থ্যসেবা থেকে ২ কিমির মধ্যে মানুষ (%)',
      note: ['2 km is roughly a 30-minute walk, the community-clinic design target.', '২ কিমি মোটামুটি ৩০ মিনিটের হাঁটা পথ, কমিউনিটি ক্লিনিকের নকশাগত লক্ষ্য।'] },
    { id: 'within10_uhc', klass: 'uhc', levels: NO_UNION, digits: 1, ramp: 'green', worse: 'low', value: within('uhc', '10'),
      en: 'People within 10 km of an upazila health complex (%)', bn: 'উপজেলা স্বাস্থ্য কমপ্লেক্স থেকে ১০ কিমির মধ্যে মানুষ (%)',
      note: ['The first referral level for rural primary care.', 'গ্রামীণ প্রাথমিক সেবার প্রথম রেফারেল স্তর।'] },
    { id: 'within20_blood', klass: 'blood_bank', levels: NO_UNION, digits: 1, ramp: 'green', worse: 'low', value: within('blood_bank', '20'),
      en: 'People within 20 km of a listed blood bank (%)', bn: 'তালিকাভুক্ত ব্লাড ব্যাংক থেকে ২০ কিমির মধ্যে মানুষ (%)',
      note: ['DGHS "Blood Bank" listings only; hospital transfusion services are not included.', 'শুধু DGHS-এর "ব্লাড ব্যাংক" তালিকা; হাসপাতালের রক্তসঞ্চালন সেবা অন্তর্ভুক্ত নয়।'] },
    { id: 'mean_any', klass: 'any_hospital', levels: NO_UNION, digits: 1, ramp: 'amber', worse: 'high', value: (a) => a.mean_km?.any_hospital,
      en: 'Average distance to the nearest hospital (km)', bn: 'নিকটতম হাসপাতালের গড় দূরত্ব (কিমি)',
      note: ['Population-weighted mean straight-line distance.', 'জনসংখ্যা-ভারিত গড় সরলরৈখিক দূরত্ব।'] },
    { id: 'rate_any', klass: 'any_hospital', levels: NO_UNION, digits: 2, ramp: 'green', worse: 'low', value: (a) => a.rates?.any_hospital,
      en: 'Hospitals per 100,000 people', bn: 'প্রতি ১,০০,০০০ জনে হাসপাতাল',
      note: ['All active DGHS hospital listings recorded in the area, with or without coordinates.', 'এলাকায় নথিভুক্ত সব সক্রিয় DGHS হাসপাতাল, স্থানাঙ্কসহ বা ছাড়া।'] },
    { id: 'rate_public', klass: 'public_hospital', levels: NO_UNION, digits: 2, ramp: 'green', worse: 'low', value: (a) => a.rates?.public_hospital,
      en: 'Government hospitals per 100,000 people', bn: 'প্রতি ১,০০,০০০ জনে সরকারি হাসপাতাল',
      note: ['Same definition as the Statistics page.', 'পরিসংখ্যান পৃষ্ঠার একই সংজ্ঞা।'] },
    { id: 'rate_primary', klass: 'primary_care', levels: NO_UNION, digits: 1, ramp: 'green', worse: 'low', value: (a) => a.rates?.primary_care,
      en: 'Primary-care facilities per 100,000 people', bn: 'প্রতি ১,০০,০০০ জনে প্রাথমিক স্বাস্থ্যসেবা প্রতিষ্ঠান',
      note: ['Primary care is mainly rural; city thanas score low by design.', 'প্রাথমিক সেবা মূলত গ্রামীণ; সিটির থানাগুলোতে স্বভাবতই কম।'] },
    { id: 'beds_public', klass: 'public_hospital', levels: NO_UNION, digits: 1, ramp: 'green', worse: 'low', value: (a) => a.beds_per10k?.public,
      en: 'Government hospital beds per 10,000 people', bn: 'প্রতি ১০,০০০ জনে সরকারি হাসপাতালের শয্যা',
      note: ['Approved beds from DGHS profiles; not staffed or available beds.', 'DGHS প্রোফাইলের অনুমোদিত শয্যা; চালু বা খালি শয্যা নয়।'] },
    { id: 'cc_per', klass: 'community_clinic', levels: ['division', 'district', 'upazila'], digits: 0, ramp: 'amber', worse: 'high', value: (a) => a.union_people_per_cc ?? NaN,
      en: 'Union residents per community clinic', bn: 'প্রতি কমিউনিটি ক্লিনিকে ইউনিয়নবাসী',
      note: ['Planning norm about 6,000. City thanas without unions are grey.', 'পরিকল্পনার মান প্রায় ৬,০০০। ইউনিয়নহীন সিটি থানা ধূসর।'] },
    { id: 'density', klass: null, levels: NO_UNION, digits: 0, ramp: 'amber', worse: null, value: (a) => a.density,
      en: 'People per km²', bn: 'প্রতি বর্গকিমিতে মানুষ', note: ['Census 2022, adjusted.', 'জনশুমারি ২০২২, সমন্বিত।'] },
    { id: 'union_cc', klass: 'community_clinic', levels: ['union'], digits: 0, ramp: 'green', worse: 'low', value: (a) => a.community_clinic,
      en: 'Community clinics mapped in the union', bn: 'ইউনিয়নে মানচিত্রে থাকা কমিউনিটি ক্লিনিক',
      note: ['Mapped points only: clinics without usable coordinates are missing here.', 'শুধু মানচিত্রের বিন্দু: ব্যবহারযোগ্য স্থানাঙ্কহীন ক্লিনিক এখানে নেই।'] },
    ...['within5_public_hospital', 'within5_any_hospital', 'rate_any_hospital', 'rate_primary_care'].map((key) => ({
      id: 'lisa:' + key, lisa: key, klass: key.includes('primary') ? 'primary_care' : key.includes('public') ? 'public_hospital' : 'any_hospital',
      levels: ['upazila'], en: 'Clusters: ' + LISA_NAMES[key][0], bn: 'গুচ্ছ: ' + LISA_NAMES[key][1],
      note: ['Local Moran (LISA), 999 permutations, p < 0.05.', 'স্থানীয় মোরান (LISA), ৯৯৯ বিন্যাস, p < ০.০৫।'] }))
  ];
  // Land (area) basis: the former Distance page measures, from data/atlas/ (shares of 1 km cells, not people).
  const LOW_CELLS = 5;
  const land = (klass, key, sub) => (a) => { const d = a.distance?.[klass]; if (!d || !d.cells) return NaN; return sub ? d.within_km?.[sub] ?? NaN : d[key]; };
  const landPoints = (a, k) => (a.points && a.points[k]) || 0;
  MEASURES.push(
    { id: 'land_public_median', basis: 'land', grid: true, klass: 'public_hospital', levels: ALL, digits: 1, ramp: 'amber', worse: 'high', value: land('public_hospital', 'median_km'),
      en: 'Median km to a government hospital (land)', bn: 'সরকারি হাসপাতালের মধ্যমা দূরত্ব (ভূমি, কিমি)',
      note: ["Half of the area's land is closer than this to a government hospital.", 'এলাকার অর্ধেক ভূমি সরকারি হাসপাতাল থেকে এর চেয়ে কম দূরত্বে।'] },
    { id: 'land_any_median', basis: 'land', grid: true, klass: 'any_hospital', levels: ALL, digits: 1, ramp: 'amber', worse: 'high', value: land('any_hospital', 'median_km'),
      en: 'Median km to any hospital (land)', bn: 'যেকোনো হাসপাতালের মধ্যমা দূরত্ব (ভূমি, কিমি)', note: ['Government and non-government hospitals together.', 'সরকারি ও বেসরকারি হাসপাতাল একসাথে।'] },
    { id: 'land_primary_median', basis: 'land', grid: true, klass: 'primary_care', levels: ALL, digits: 1, ramp: 'amber', worse: 'high', value: land('primary_care', 'median_km'),
      en: 'Median km to primary care (land)', bn: 'প্রাথমিক স্বাস্থ্যসেবার মধ্যমা দূরত্ব (ভূমি, কিমি)', note: ['Community clinics, union centres, UH&FWC, MCWC and urban primary-care centres.', 'কমিউনিটি ক্লিনিক, ইউনিয়ন কেন্দ্র, UH&FWC, MCWC ও নগর প্রাথমিক স্বাস্থ্যকেন্দ্র।'] },
    { id: 'land_public_w10', basis: 'land', grid: true, klass: 'public_hospital', levels: ALL, digits: 1, ramp: 'green', worse: 'low', value: land('public_hospital', null, '10'),
      en: 'Land within 10 km of a government hospital (%)', bn: 'সরকারি হাসপাতাল থেকে ১০ কিমির মধ্যে ভূমি (%)', note: ["Share of the area's land within 10 km in a straight line.", 'সরলরেখায় ১০ কিমির মধ্যে থাকা ভূমির অংশ।'] },
    { id: 'land_primary_w5', basis: 'land', grid: true, klass: 'primary_care', levels: ALL, digits: 1, ramp: 'green', worse: 'low', value: land('primary_care', null, '5'),
      en: 'Land within 5 km of primary care (%)', bn: 'প্রাথমিক স্বাস্থ্যসেবা থেকে ৫ কিমির মধ্যে ভূমি (%)', note: ["Share of the area's land within 5 km in a straight line.", 'সরলরেখায় ৫ কিমির মধ্যে থাকা ভূমির অংশ।'] },
    { id: 'land_hospital_density', basis: 'land', klass: 'any_hospital', levels: ALL, digits: 1, ramp: 'green', worse: 'low',
      value: (a) => (a.area_km2 > 0 ? (landPoints(a, 'public_hospital') + landPoints(a, 'private_ngo_hospital')) / a.area_km2 * 1000 : NaN),
      en: 'Hospital locations per 1,000 km²', bn: 'প্রতি ১,০০০ বর্গকিমিতে হাসপাতাল', note: ['Usable hospital locations inside the area, per land area.', 'এলাকার ভেতরে ব্যবহারযোগ্য হাসপাতালের অবস্থান, ভূমির আয়তন অনুযায়ী।'] },
    { id: 'land_primary_density', basis: 'land', klass: 'primary_care', levels: ALL, digits: 1, ramp: 'green', worse: 'low',
      value: (a) => (a.area_km2 > 0 ? landPoints(a, 'primary_care') / a.area_km2 * 100 : NaN),
      en: 'Primary-care locations per 100 km²', bn: 'প্রতি ১০০ বর্গকিমিতে প্রাথমিক স্বাস্থ্যসেবা', note: ['Usable primary-care locations inside the area, per land area.', 'এলাকার ভেতরে ব্যবহারযোগ্য প্রাথমিক স্বাস্থ্যসেবার অবস্থান, ভূমির আয়তন অনুযায়ী।'] }
  );
  // Travel time (Malaria Atlas Project friction, least-time routes) and floods (satellite flood maps 2000-2025): data/access/travel*.json, floods*.json.
  const num = (v) => (v === null || v === undefined ? NaN : Number(v));
  const tv = (level, pcode, k, field, t) => {
    const d = state.data.travelLv[level], i = d?.idx.get(pcode);
    if (i === undefined) return NaN;
    return num(field === 'mean' ? d.travel[k].mean_min[i] : d.travel[k].within[t][i]);
  };
  const fv = (level, pcode, key) => { const d = state.data.floodLv[level], i = d?.idx.get(pcode); return i === undefined || !d[key] ? NaN : num(d[key][i]); };
  const fe = (level, pcode, field, id = state.flood) => { const d = state.data.floodLv[level], i = d?.idx.get(pcode), e = d?.[id]; return i === undefined || !e || !e[field] ? NaN : num(e[field][i]); };
  const MODE = { motorized: ['motorized', 'যান্ত্রিক যানবাহনে'], walking: ['walking', 'হেঁটে'] };
  const tWithin = (k, t) => (a, level) => tv(level, a.pcode, k, 'within', t);
  const TRAVEL_NOTE = ['Modelled minutes over the 2019 friction surface; people shares.', '২০১৯ সালের ঘর্ষণ পৃষ্ঠে আনুমানিক মিনিট; মানুষের অংশ।'];
  MEASURES.push(
    { id: 'tmean_any', basis: 'travel', klass: 'any_hospital', levels: ALL, digits: 1, ramp: 'amber', worse: 'high', value: (a, level) => tv(level, a.pcode, 'any_hospital', 'mean'),
      en: 'Average minutes to the nearest hospital, motorized', bn: 'যান্ত্রিক যানবাহনে নিকটতম হাসপাতালের গড় সময় (মিনিট)', note: ['Population-weighted mean; people with no route are left out.', 'জনসংখ্যা-ভারিত গড়; যাদের পথ নেই তারা বাদ।'] },
    { id: 'tmean_primary', basis: 'travel', klass: 'primary_care', levels: ALL, digits: 1, ramp: 'amber', worse: 'high', value: (a, level) => tv(level, a.pcode, 'primary_care', 'mean'),
      en: 'Average walking minutes to primary care', bn: 'প্রাথমিক স্বাস্থ্যসেবায় হেঁটে যাওয়ার গড় সময় (মিনিট)', note: ['Population-weighted mean; people with no route are left out.', 'জনসংখ্যা-ভারিত গড়; যাদের পথ নেই তারা বাদ।'] },
    { id: 't60_any', basis: 'travel', klass: 'any_hospital', levels: ALL, digits: 1, ramp: 'green', worse: 'low', value: tWithin('any_hospital', '60'),
      en: 'People within 60 minutes of any hospital, motorized (%)', bn: 'যান্ত্রিক যানবাহনে যেকোনো হাসপাতাল থেকে ৬০ মিনিটের মধ্যে মানুষ (%)', note: TRAVEL_NOTE },
    { id: 't60_public', basis: 'travel', klass: 'public_hospital', levels: ALL, digits: 1, ramp: 'green', worse: 'low', value: tWithin('public_hospital', '60'),
      en: 'People within 60 minutes of a government hospital, motorized (%)', bn: 'যান্ত্রিক যানবাহনে সরকারি হাসপাতাল থেকে ৬০ মিনিটের মধ্যে মানুষ (%)', note: TRAVEL_NOTE },
    { id: 't30_uhc', basis: 'travel', klass: 'uhc', levels: ALL, digits: 1, ramp: 'green', worse: 'low', value: tWithin('uhc', '30'),
      en: 'People within 30 minutes of an upazila health complex, motorized (%)', bn: 'যান্ত্রিক যানবাহনে উপজেলা স্বাস্থ্য কমপ্লেক্স থেকে ৩০ মিনিটের মধ্যে মানুষ (%)', note: TRAVEL_NOTE },
    { id: 't120_blood', basis: 'travel', klass: 'blood_bank', levels: ALL, digits: 1, ramp: 'green', worse: 'low', value: tWithin('blood_bank', '120'),
      en: 'People within 2 hours of a listed blood bank, motorized (%)', bn: 'যান্ত্রিক যানবাহনে তালিকাভুক্ত ব্লাড ব্যাংক থেকে ২ ঘণ্টার মধ্যে মানুষ (%)', note: TRAVEL_NOTE },
    { id: 't30_primary', basis: 'travel', klass: 'primary_care', levels: ALL, digits: 1, ramp: 'green', worse: 'low', value: tWithin('primary_care', '30'),
      en: 'People within a 30-minute walk of primary care (%)', bn: 'প্রাথমিক স্বাস্থ্যসেবা থেকে ৩০ মিনিট হাঁটা দূরত্বে মানুষ (%)', note: TRAVEL_NOTE },
    { id: 't60_primary', basis: 'travel', klass: 'primary_care', levels: ALL, digits: 1, ramp: 'green', worse: 'low', value: tWithin('primary_care', '60'),
      en: 'People within a 60-minute walk of primary care (%)', bn: 'প্রাথমিক স্বাস্থ্যসেবা থেকে ৬০ মিনিট হাঁটা দূরত্বে মানুষ (%)', note: TRAVEL_NOTE },
    { id: 'f_years', basis: 'floods', klass: null, levels: ALL, digits: 1, ramp: 'blue', worse: 'high', rank: ['Most often flooded', 'সবচেয়ে বেশিবার প্লাবিত'], value: (a, level) => fv(level, a.pcode, 'years_flooded_mean'),
      en: 'Years flooded, 2000–2025 (average per person, of 26)', bn: 'প্লাবিত বছর, ২০০০–২০২৫ (জনপ্রতি গড়, ২৬টির মধ্যে)',
      note: ['How many of the 26 yearly flood maps cover each person\'s 1 km cell (at least half flooded). Mixes MODIS (2000–2018) and Sentinel-1 (2019–2025).', '২৬টি বার্ষিক বন্যার মানচিত্রের কতটিতে প্রত্যেকের ১ কিমি ঘর (অন্তত অর্ধেক) প্লাবিত। MODIS (২০০০–২০১৮) ও সেন্টিনেল-১ (২০১৯–২০২৫) মিশ্রিত।'] },
    { id: 'f_ge5', basis: 'floods', klass: null, levels: ALL, digits: 1, ramp: 'blue', worse: 'high', rank: ['Most often flooded', 'সবচেয়ে বেশিবার প্লাবিত'], value: (a, level) => fv(level, a.pcode, 'flooded_ge5_pct'),
      en: 'People flooded in 5 or more of the 26 years (%)', bn: '২৬ বছরের মধ্যে ৫ বা বেশি বছর প্লাবিত মানুষ (%)',
      note: ['Share of people whose 1 km cell was at least half flooded in five or more yearly maps.', 'যাদের ১ কিমি ঘর অন্তত ৫টি বার্ষিক মানচিত্রে অর্ধেক বা বেশি প্লাবিত, সেই মানুষের অংশ।'] },
    { id: 'f_flooded', basis: 'floods', event: true, klass: null, levels: ALL, digits: 1, ramp: 'blue', worse: 'high', rank: ['Most affected', 'সবচেয়ে বেশি আক্রান্ত'], value: (a, level, flood) => fe(level, a.pcode, 'flooded_pct', flood),
      en: 'People in flooded cells, selected flood (%)', bn: 'প্লাবিত ঘরে মানুষ, বাছাই করা বন্যা (%)',
      note: ['Share of people whose 1 km cell is at least half flooded.', 'যাদের ১ কিমি ঘর অন্তত অর্ধেক প্লাবিত, সেই মানুষের অংশ।'] },
    { id: 'f_lost_hosp', basis: 'floods', event: true, klass: 'any_hospital', levels: ALL, digits: 1, ramp: 'blue', worse: 'high', rank: ['Most affected', 'সবচেয়ে বেশি আক্রান্ত'],
      value: (a, level, flood) => { const v = fe(level, a.pcode, 'lost_hospital', flood); return a.population > 0 ? v / a.population * 100 : NaN; },
      en: 'People losing hospital access within 60 minutes, selected flood (%)', bn: 'বাছাই করা বন্যায় ৬০ মিনিটে হাসপাতালে পৌঁছানোর সুযোগ হারানো মানুষ (%)',
      note: ['Within 60 minutes of any hospital normally, but not during the flood (flooded facilities closed, wading speed in flooded cells). A stress test, not a count.', 'স্বাভাবিক সময়ে যেকোনো হাসপাতাল ৬০ মিনিটের মধ্যে, কিন্তু বন্যায় নয় (প্লাবিত প্রতিষ্ঠান বন্ধ, প্লাবিত ঘরে হেঁটে পানি পেরোনোর গতি)। চাপ-পরীক্ষা, প্রকৃত গণনা নয়।'] },
    { id: 'f_lost_primary', basis: 'floods', event: true, klass: 'primary_care', levels: ALL, digits: 1, ramp: 'blue', worse: 'high', rank: ['Most affected', 'সবচেয়ে বেশি আক্রান্ত'],
      value: (a, level, flood) => { const v = fe(level, a.pcode, 'lost_primary', flood); return a.population > 0 ? v / a.population * 100 : NaN; },
      en: 'People losing primary care within a 60-minute walk, selected flood (%)', bn: 'বাছাই করা বন্যায় ৬০ মিনিট হাঁটা দূরত্বে প্রাথমিক সেবা হারানো মানুষ (%)',
      note: ['Within a 60-minute walk normally, but not during the flood.', 'স্বাভাবিক সময়ে ৬০ মিনিট হাঁটা দূরত্বে, কিন্তু বন্যায় নয়।'] }
  );
  const EVENT_BN = {
    f2019_07: ['জুলাই–আগস্ট ২০১৯', 'উত্তরাঞ্চলের বর্ষার বন্যা, ২৮ জেলা'], f2020_07: ['জুন–আগস্ট ২০২০', 'বর্ষার বন্যা: উত্তর, উত্তর-পূর্ব ও দক্ষিণ-পূর্ব'],
    f2022_05: ['মে ২০২২', 'সিলেটে প্রথম আকস্মিক বন্যা'], f2022_06: ['জুন ২০২২', 'সিলেট বিভাগের আকস্মিক বন্যা, ৯ জেলা'],
    f2024_06: ['জুন ২০২৪', 'সিলেট ও হাওর অঞ্চলের বন্যা'], f2024_08: ['আগস্ট ২০২৪', 'পূর্বাঞ্চলের আকস্মিক বন্যা, ১১ জেলা'],
    f2024_10: ['অক্টোবর ২০২৪', 'শেরপুর, ময়মনসিংহ ও নেত্রকোনায় আকস্মিক বন্যা'], f2025_06: ['মে–জুন ২০২৫', 'সিলেট বিভাগ, নেত্রকোনা, নোয়াখালী, ভোলা ও পার্বত্য চট্টগ্রাম']
  };
  const ERA = { MODIS: ['#2563eb', 'Global Flood Database (MODIS)', 'গ্লোবাল ফ্লাড ডেটাবেস (MODIS)'], 'Sentinel-1': ['#c2611e', 'Sentinel-1 radar', 'সেন্টিনেল-১ রাডার'] };
  const floodRecord = (id) => [...(state.data.floods?.events || []), ...(state.data.floods?.years || [])].find((e) => e.id === id);
  const floodLabel = (e) => (e.id.startsWith('y')
    ? `${N(e.year).replace(/[,٬]/g, '')} · ${T('whole year', 'পুরো বছর')} · ${T(ERA[e.sensor][1], ERA[e.sensor][2])}`
    : `${T(e.when, EVENT_BN[e.id]?.[0] || e.when)} · ${T(e.note, EVENT_BN[e.id]?.[1] || e.note)}`);
  const basisOf = (m) => m.basis || 'people';

  const state = { level: 'district', measure: 'within5_public', basis: 'people', data: null, map: null, points: null, pointsLayer: null, lisaKey: 'within5_any_hospital', flood: 'f2020_07' };
  const areasOf = (level) => state.data.areas[level] || [];
  const byPcode = (level) => state.data.index[level] || new Map();
  const landOf = (level) => state.data.land[level] || [];
  const listFor = (level) => (state.basis === 'land' ? landOf(level) : areasOf(level));
  async function ensureTravel(level) {
    if (!state.data.travel) return;
    if (!state.data.travelLv[level]) {
      const d = level === 'union' ? await get('./data/access/travel-union.json') : state.data.travel.per_area[level];
      state.data.travelLv[level] = { idx: new Map(d.pcodes.map((p, i) => [p, i])), travel: d.travel };
    }
    if (state.data.floods && !state.data.floodLv[level]) {
      const d = level === 'union' ? await get('./data/access/floods-union.json') : state.data.floods.per_area[level];
      state.data.floodLv[level] = { ...d, idx: new Map(d.pcodes.map((p, i) => [p, i])) };
    }
  }
  const indexFor = (level) => (state.basis === 'land' ? state.data.landIndex[level] : state.data.index[level]) || new Map();
  async function ensureLand(level) {
    if (state.data.land[level]) return;
    const file = await get(`./data/atlas/areas-${level}.json`);
    state.data.land[level] = file.areas;
    state.data.landIndex[level] = new Map(file.areas.map((a) => [a.pcode, a]));
  }
  const measure = () => MEASURES.find((m) => m.id === state.measure) || MEASURES[0];
  const areaLabel = (a, level) => (level === 'union' ? `${a.name} · ${a.upazila || a.parent_name || ''}` : level === 'upazila' ? `${a.name} · ${place(a.parent_name)}` : place(a.name));
  const TRAVEL_SOURCE = () => T('Source: Malaria Atlas Project friction surface 2019 (Weiss et al., 2020); DGHS facility registry; BBS Census 2022. Least-time routes; boats at 10 km/h on water.',
    'উৎস: ম্যালেরিয়া অ্যাটলাস প্রজেক্টের ঘর্ষণ পৃষ্ঠ ২০১৯ (Weiss et al., 2020); DGHS প্রতিষ্ঠান রেজিস্ট্রি; বিবিএস জনশুমারি ২০২২। সবচেয়ে কম সময়ের পথ; পানিতে নৌকা ঘণ্টায় ১০ কিমি।');
  const FLOOD_SOURCE = () => T('Source: Global Flood Database (Tellman et al., 2021) 2000–2018; Sentinel-1 radar 2019–2025, processed in Google Earth Engine; travel time as above.',
    'উৎস: গ্লোবাল ফ্লাড ডেটাবেস (Tellman et al., 2021) ২০০০–২০১৮; সেন্টিনেল-১ রাডার ২০১৯–২০২৫, গুগল আর্থ ইঞ্জিনে প্রক্রিয়াকৃত; যাতায়াতের সময় ওপরের মতো।');
  const SOURCE = () => T('Source: BBS Census 2022 (PEC-adjusted by division); DGHS facility registry; geoBoundaries. Straight-line distance.',
    'উৎস: বিবিএস জনশুমারি ২০২২ (বিভাগভিত্তিক PEC সমন্বয়); DGHS প্রতিষ্ঠান রেজিস্ট্রি; geoBoundaries। সরলরৈখিক দূরত্ব।');

  function option(value, label) { const o = document.createElement('option'); o.value = value; o.textContent = label; return o; }
  function rows(target, data) {
    const body = $(target);
    body.replaceChildren(...data.map((cells) => {
      const tr = document.createElement('tr');
      cells.forEach((cell, i) => {
        const td = document.createElement(i === 0 ? 'th' : 'td');
        if (i === 0) td.scope = 'row';
        if (cell instanceof Node) td.append(cell); else td.textContent = cell;
        tr.append(td);
      });
      return tr;
    }));
  }
  function csv(name, header, data) {
    const safe = (v) => { const s = String(v ?? ''); return /[",\n]|^[=+@-]/.test(s) ? '"' + s.replace(/^([=+@-])/, "'$1").replaceAll('"', '""') + '"' : s; };
    const text = [header, ...data].map((r) => r.map(safe).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- Map ----------
  function fillSelects() {
    const level = state.level;
    $('#a-level').replaceChildren(...ALL.map((k) => option(k, lvl(k))));
    $('#a-level').value = level;
    $('#a-basis').value = state.basis;
    $('#a-basis option[value="travel"]').disabled = !state.data.travel;
    $('#a-basis option[value="floods"]').disabled = !state.data.floods;
    const list = MEASURES.filter((m) => m.levels.includes(level) && basisOf(m) === state.basis);
    if (!list.some((m) => m.id === state.measure)) state.measure = list[0].id;
    $('#a-metric').replaceChildren(...list.map((m) => option(m.id, T(m.en, m.bn))));
    $('#a-metric').value = state.measure;
    $('#a-names').replaceChildren(...listFor(level).map((a) => option(areaLabel(a, level), '')));
    const fl = state.data.floods;
    $('#a-flood-wrap').hidden = !(measure().event && fl);
    if (fl) {
      const group = (label, list) => { const g = document.createElement('optgroup'); g.label = label; g.append(...list.map((e) => option(e.id, floodLabel(e)))); return g; };
      $('#a-flood').replaceChildren(group(T('Named floods (Sentinel-1)', 'নামকৃত বন্যা (সেন্টিনেল-১)'), fl.events),
        group(T('Whole years, 2000–2025', 'পুরো বছর, ২০০০–২০২৫'), [...fl.years].reverse()));
      $('#a-flood').value = state.flood;
    }
    $('#a-export').textContent = T(`Download ${LEVELS[level].en.toLowerCase()} table (CSV) ↓`, `${LEVELS[level].bn} সারণি ডাউনলোড (CSV) ↓`);
  }

  function paint() {
    const m = measure(), level = state.level, list = listFor(level), isLand = basisOf(m) === 'land';
    const fr = m.event ? floodRecord(state.flood) : null;
    $('#a-metric-note').textContent = (fr ? floodLabel(fr) + '. ' : '') + T(...m.note) + (fr && fr.id.startsWith('y') && level === 'union' && m.id !== 'f_flooded' ? ' ' + T('Access losses for whole years are published down to upazila.', 'পুরো বছরের প্রবেশগম্যতা হারানোর হিসাব উপজেলা পর্যন্ত প্রকাশিত।') : '') + (isLand ? ' ' + T('Land basis: shares of 1 km grid cells, not of people.', 'ভূমি ভিত্তি: ১ কিমি গ্রিড ঘরের অংশ, মানুষের নয়।') : '') + (level === 'union' && !isLand
      ? ' ' + T('Union populations: matched by name to the census where possible, otherwise estimated from the upazila total by area (city wards).', 'ইউনিয়নের জনসংখ্যা: সম্ভব হলে নামে জনশুমারির সাথে মেলানো, নইলে উপজেলার মোট থেকে আয়তন অনুযায়ী অনুমান (সিটি ওয়ার্ড)।') : '');
    if (m.lisa) {
      state.map.setMetric({ legendTitle: T(m.en, m.bn), categories: LISA.map((c) => ({ key: c.key, color: c.color, label: T(c.en, c.bn) })),
                            values: new Map(list.map((a) => [a.pcode, a.lisa?.[m.lisa]])) });
      $('#c-rank-title').textContent = T('Low–low cluster upazilas', 'নিম্ন-নিম্ন গুচ্ছের উপজেলা');
      const low = list.filter((a) => a.lisa?.[m.lisa] === 'LL');
      const val = ACCESS_Y[m.lisa].value;
      window.HealthCharts.bars($('#c-rank'), low.sort((a, b) => val(a) - val(b)).slice(0, 25).map((a) => ({ label: areaLabel(a, level), value: val(a), display: N(val(a), 1) })),
        { title: T(ACCESS_Y[m.lisa].en, ACCESS_Y[m.lisa].bn), axisLabel: T(ACCESS_Y[m.lisa].en, ACCESS_Y[m.lisa].bn), digits: 1, source: SOURCE(),
          emptyMessage: T('No low–low cluster for this measure.', 'এই পরিমাপে নিম্ন-নিম্ন গুচ্ছ নেই।') });
    } else {
      state.map.setMetric({ legendTitle: T(m.en, m.bn), ramp: m.ramp, digits: m.digits,
        values: new Map(list.map((a) => [a.pcode, Number(m.value(a, level))])),
        extra: (pcode) => { const a = byPcode(level).get(pcode); return a && level === 'union' && a.source === 'estimated' ? `<br><em>${T('population estimated', 'জনসংখ্যা অনুমিত')}</em>` : ''; } });
      const usable = list.filter((a) => Number.isFinite(Number(m.value(a, level))) && (isLand
        ? !(m.grid && (a.distance?.public_hospital?.cells || 0) < LOW_CELLS)
        : (level !== 'union' || a.source !== 'estimated') && (a.population || 0) > 0));
      if (m.worse) usable.sort((a, b) => (m.worse === 'high' ? m.value(b, level) - m.value(a, level) : m.value(a, level) - m.value(b, level)));
      else usable.sort((a, b) => m.value(b, level) - m.value(a, level));
      $('#c-rank-title').textContent = m.rank ? T(`${m.rank[0]}: 20 ${LEVELS[level].en.toLowerCase()} areas · ${m.en}`, `${m.rank[1]}: ২০টি ${LEVELS[level].bn} · ${m.bn}`) : m.worse
        ? T(`Least served: 20 ${LEVELS[level].en.toLowerCase()} areas · ${m.en}`, `সবচেয়ে কম সেবাপ্রাপ্ত ২০টি ${LEVELS[level].bn} · ${m.bn}`)
        : T(`Highest 20 ${LEVELS[level].en.toLowerCase()} areas · ${m.en}`, `সর্বোচ্চ ২০টি ${LEVELS[level].bn} · ${m.bn}`);
      window.HealthCharts.bars($('#c-rank'), usable.slice(0, 20).map((a) => ({ label: areaLabel(a, level), value: Number(m.value(a, level)), display: N(Number(m.value(a, level)), m.digits),
        detail: isLand ? N(a.area_km2) + T(' km²', ' বর্গকিমি') : T('population ', 'জনসংখ্যা ') + N(a.population) })),
        { title: T(m.en, m.bn) + (fr ? ' · ' + floodLabel(fr) : ''), axisLabel: T(m.en, m.bn), digits: m.digits, source: basisOf(m) === 'travel' ? TRAVEL_SOURCE() : basisOf(m) === 'floods' ? FLOOD_SOURCE() : SOURCE() });
    }
    drawPoints();
  }

  function detail(pcode) {
    const level = state.level, a = pcode ? byPcode(level).get(pcode) : null, box = $('#a-detail');
    const ground = pcode ? (state.data.landIndex[level] || new Map()).get(pcode) : null;
    if (!a && ground) {
      const h = document.createElement('h3'); h.textContent = areaLabel(ground, level);
      const code = document.createElement('p'); code.className = 'atlas-code'; code.textContent = `${level === 'union' ? T('ID', 'আইডি') : 'BBS pcode'}: ${ground.pcode}`;
      box.replaceChildren(h, code, ...landBlock(ground));
      return;
    }
    if (!a) {
      const h = document.createElement('h3'); h.textContent = T('Select an area', 'একটি এলাকা বাছুন');
      const p = document.createElement('p'); p.textContent = T('Click the map or search by name.', 'মানচিত্রে ক্লিক করুন বা নাম খুঁজুন।');
      box.replaceChildren(h, p); return;
    }
    const items = [[T('Level', 'স্তর'), lvl(level)], [T('Population 2022', 'জনসংখ্যা ২০২২'), N(a.population)]];
    if (level === 'union') {
      const source = { census: T('census, matched by name', 'জনশুমারি, নামে মেলানো'), 'census+': T('census + share of unmatched units', 'জনশুমারি + অমিলিত অংশ'),
                       paurashava: T('census wards of the paurashava', 'পৌরসভার ওয়ার্ডের জনশুমারি'), estimated: T('estimated from upazila by area', 'উপজেলা থেকে আয়তনভিত্তিক অনুমান') }[a.source] || '—';
      items.push([T('Population source', 'জনসংখ্যার উৎস'), source], [T('Under 5', '৫ বছরের কম'), N(a.u5)],
        [cls('community_clinic'), N(a.community_clinic)], [cls('union_facility'), N(a.union_facility)], [cls('uhc'), N(a.uhc)], [cls('any_hospital'), N(a.any_hospital)],
        [`${cls('public_hospital')} ≤ 5 ${T('km', 'কিমি')}`, pct(a.within5_public_hospital)], [`${cls('any_hospital')} ≤ 5 ${T('km', 'কিমি')}`, pct(a.within5_any_hospital)],
        [`${cls('primary_care')} ≤ 5 ${T('km', 'কিমি')}`, pct(a.within5_primary_care)], [`${cls('primary_care')} · ${T('mean km', 'গড় কিমি')}`, N(a.mean_km_primary_care, 2)]);
      items.push([T('Note', 'টীকা'), T('Union facility counts are mapped points only.', 'ইউনিয়নের সংখ্যা শুধু মানচিত্রের বিন্দু।')]);
    } else {
      items.push([T('Under 5', '৫ বছরের কম'), N(a.u5)], [T('Aged 60+', '৬০+ বছর'), N(a.age60)], [T('People per km²', 'প্রতি বর্গকিমিতে মানুষ'), N(a.density)]);
      for (const k of ['public_hospital', 'any_hospital', 'primary_care', 'community_clinic', 'union_facility', 'uhc', 'blood_bank']) items.push([cls(k), N(a.counts[k])]);
      items.push([T('Hospitals per 100,000', 'প্রতি ১,০০,০০০ জনে হাসপাতাল'), N(a.rates.any_hospital, 2)],
        [T('Government beds per 10,000', 'প্রতি ১০,০০০ জনে সরকারি শয্যা'), N(a.beds_per10k.public, 1)]);
      if (a.union_people_per_cc) items.push([T('Union residents per clinic', 'প্রতি ক্লিনিকে ইউনিয়নবাসী'), N(a.union_people_per_cc)]);
    }
    const dl = document.createElement('dl');
    items.forEach(([t, v]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = t; dd.textContent = v; dl.append(dt, dd); });
    const h = document.createElement('h3'); h.textContent = areaLabel(a, level);
    const code = document.createElement('p'); code.className = 'atlas-code'; code.textContent = `${level === 'union' ? T('ID', 'আইডি') : 'BBS pcode'}: ${a.pcode}`;
    const nodes = [h, code, dl];
    if (level !== 'union') {
      const table = document.createElement('table'); table.className = 'access-within';
      const head = document.createElement('tr');
      [T('People within', 'যত মানুষ মধ্যে'), '2', '5', '10', '20'].forEach((t, i) => { const th = document.createElement('th'); th.textContent = i ? N(Number(t)) + T(' km', ' কিমি') : t; head.append(th); });
      table.append(head);
      for (const k of ['public_hospital', 'any_hospital', 'primary_care', 'uhc', 'blood_bank']) {
        const tr = document.createElement('tr'); const th = document.createElement('th'); th.textContent = cls(k); tr.append(th);
        ['2', '5', '10', '20'].forEach((t) => { const td = document.createElement('td'); td.textContent = pct(a.within[k][t]); tr.append(td); });
        table.append(tr);
      }
      nodes.push(table);
    }
    nodes.push(...travelBlock(level, a.pcode));
    nodes.push(...landBlock(ground));
    box.replaceChildren(...nodes);
  }

  function travelBlock(level, pcode) {
    if (!state.data.travelLv[level]) return [];
    const head = document.createElement('h4'); head.textContent = T('Travel time (people)', 'যাতায়াতের সময় (মানুষ)');
    const table = document.createElement('table'); table.className = 'access-within';
    const top = document.createElement('tr');
    [T('Within', 'মধ্যে'), '30', '60', '120'].forEach((t, i) => { const th = document.createElement('th'); th.textContent = i ? N(Number(t)) + T(' min', ' মিনিট') : t; top.append(th); });
    table.append(top);
    for (const k of ['any_hospital', 'public_hospital', 'uhc', 'blood_bank', 'primary_care']) {
      const tr = document.createElement('tr'), th = document.createElement('th');
      th.textContent = cls(k) + (k === 'primary_care' ? T(' (walk)', ' (হেঁটে)') : ''); tr.append(th);
      ['30', '60', '120'].forEach((t) => { const td = document.createElement('td'); td.textContent = pct(tv(level, pcode, k, 'within', t)); tr.append(td); });
      table.append(tr);
    }
    const out = [head, table];
    if (state.data.floodLv[level]) {
      const fhead = document.createElement('h4'); fhead.textContent = T('Floods 2000–2025', 'বন্যা ২০০০–২০২৫');
      const items = [[T('Years flooded (average, of 26)', 'প্লাবিত বছর (গড়, ২৬টির মধ্যে)'), N(fv(level, pcode, 'years_flooded_mean'), 1)],
        [T('People flooded in 1+ years', '১ বা বেশি বছর প্লাবিত মানুষ'), pct(fv(level, pcode, 'flooded_ge1_pct'))],
        [T('People flooded in 5+ years', '৫ বা বেশি বছর প্লাবিত মানুষ'), pct(fv(level, pcode, 'flooded_ge5_pct'))]];
      const fr = floodRecord(state.flood);
      if (fr) items.push([`${floodLabel(fr)} · ${T('people in flooded cells', 'প্লাবিত ঘরে মানুষ')}`, pct(fe(level, pcode, 'flooded_pct'))]);
      const dl = document.createElement('dl');
      items.forEach(([t, v]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = t; dd.textContent = v; dl.append(dt, dd); });
      out.push(fhead, dl);
    }
    return out;
  }

  function landBlock(g) {
    if (!g) return [];
    const head = document.createElement('h4'); head.textContent = T('Land (area basis)', 'ভূমি (আয়তন ভিত্তি)');
    const items = [[T('Area', 'আয়তন'), N(g.area_km2) + T(' km²', ' বর্গকিমি')], [T('Grid cells (1 km)', 'গ্রিড ঘর (১ কিমি)'), N(g.distance?.public_hospital?.cells || 0)]];
    for (const k of ['public_hospital', 'any_hospital', 'primary_care']) {
      const d = g.distance?.[k];
      if (d && d.cells) items.push([`${cls(k)} · ${T('median km of land', 'ভূমির মধ্যমা কিমি')}`, N(d.median_km, 1)]);
    }
    if ((g.distance?.public_hospital?.cells || 0) < LOW_CELLS) items.push([T('Note', 'টীকা'), T('Fewer than 5 grid cells: land figures are rough.', '৫টির কম গ্রিড ঘর: ভূমির হিসাব মোটামুটি।')]);
    const dl = document.createElement('dl');
    items.forEach(([t, v]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = t; dd.textContent = v; dl.append(dt, dd); });
    return [head, dl];
  }

  async function ensurePeopleUnion() {
    if (state.data.areas.union) return;
    const file = await get('./data/access/areas-union.json');
    const cols = file.columns;
    state.data.areas.union = file.rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
    state.data.index.union = new Map(state.data.areas.union.map((a) => [a.pcode, a]));
  }

  async function showLevel(level) {
    state.level = level;
    if (state.basis === 'land' && !state.data.land[level]) {
      $('#access-map').classList.add('loading');
      await ensureLand(level);
    }
    if (state.basis !== 'land' && level === 'union' && !state.data.areas.union) {
      $('#access-map').classList.add('loading');
      await ensurePeopleUnion();
    }
    if (state.basis === 'travel' || state.basis === 'floods') { $('#access-map').classList.add('loading'); await ensureTravel(level); }
    fillSelects();
    detail(null);
    $('#access-map').classList.add('loading');
    await state.map.setLayer(LEVELS[level].geo);
    $('#access-map').classList.remove('loading');
    paint();
  }

  async function drawPoints() {
    if (state.pointsLayer) { state.map.map.removeLayer(state.pointsLayer); state.pointsLayer = null; }
    const klass = measure().klass || 'any_hospital';
    if (!$('#a-points').checked) return;
    if (!state.points) state.points = await get('./data/access/points.json');
    const bit = state.points.bits[klass], colour = COLOURS[klass] || '#2563eb';
    const map = state.map.map;
    if (!map.getPane('facility-points')) { map.createPane('facility-points').style.zIndex = 460; }
    const renderer = L.canvas({ pane: 'facility-points', padding: 0.3 });
    const group = L.layerGroup();
    const radius = map.getZoom() <= 7 ? 1.6 : map.getZoom() <= 9 ? 2.4 : 3.5;
    for (const [lon, lat, mask] of state.points.rows) {
      if (mask & bit) L.circleMarker([lat, lon], { renderer, pane: 'facility-points', radius, weight: 0.5, color: '#fff', fillColor: colour, fillOpacity: 0.9, interactive: false }).addTo(group);
    }
    state.pointsLayer = group.addTo(map);
    $('#a-points').setAttribute('data-count', String(group.getLayers().length));
  }

  // ---------- Inequality ----------
  const GINI = [
    ['rate_public_hospital', ['Government hospitals per person', 'জনপ্রতি সরকারি হাসপাতাল'], '#077a53'],
    ['rate_any_hospital', ['Hospitals per person', 'জনপ্রতি হাসপাতাল'], '#2563eb'],
    ['rate_primary_care', ['Primary care per person', 'জনপ্রতি প্রাথমিক সেবা'], '#8b5cf6'],
    ['beds_public', ['Government beds per person', 'জনপ্রতি সরকারি শয্যা'], '#c2611e'],
    ['rate_community_clinic', ['Community clinics per person', 'জনপ্রতি কমিউনিটি ক্লিনিক'], null]
  ];
  function inequality() {
    const s = state.data.summary.inequality, level = $('#g-level').value;
    const lines = [{ label: T('Equal', 'সমান'), color: '#9aa9a3', points: [[0, 0], [100, 100]] },
      ...GINI.filter(([, , c]) => c).map(([k, name, color]) => ({ label: `${T(...name)} · ${N(s[level][k].gini, 2)}`, color, points: s[level][k].lorenz }))];
    window.HealthCharts.lines($('#c-lorenz'), lines, { title: T(`Lorenz curves · ${LEVELS[level].en}`, `লরেঞ্জ বক্ররেখা · ${LEVELS[level].bn}`),
      xmax: 100, ymax: 100, axisLabel: T('Cumulative share of people (%), worst-served areas first', 'মানুষের ক্রমযোজিত অংশ (%), সবচেয়ে কম সেবাপ্রাপ্ত এলাকা আগে'),
      yLabel: T('Cumulative share of facilities (%)', 'প্রতিষ্ঠানের ক্রমযোজিত অংশ (%)'), xUnit: '%', digits: 1, endLabels: false, source: SOURCE() });
    rows('#t-gini', GINI.map(([k, name]) => [T(...name), N(s.district[k].gini, 3), s.district[k].q5_q1 ? N(s.district[k].q5_q1, 1) + '×' : '—',
      N(s.upazila[k].gini, 3), s.upazila[k].q5_q1 ? N(s.upazila[k].q5_q1, 1) + '×' : '—']));
  }

  // ---------- Clusters ----------
  function clusters() {
    const moran = state.data.summary.moran;
    rows('#t-moran', Object.entries(moran).map(([key, v]) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = T('Show on map', 'মানচিত্রে দেখুন');
      button.addEventListener('click', async () => {
        state.lisaKey = key; state.measure = 'lisa:' + key;
        if (state.level !== 'upazila') await showLevel('upazila'); else { fillSelects(); paint(); }
        lisaList();
        $('#map-section').scrollIntoView({ behavior: 'smooth' });
      });
      return [T(ACCESS_Y[key].en, ACCESS_Y[key].bn), N(v.I, 3), v.p <= 0.001 ? '≤ ' + N(0.001, 3) : N(v.p, 3), N(v.counts.HH || 0), N(v.counts.LL || 0), N(v.counts.HL || 0), N(v.counts.LH || 0), button];
    }));
    lisaList();
  }
  function lisaList() {
    const key = state.lisaKey, low = areasOf('upazila').filter((a) => a.lisa?.[key] === 'LL');
    const byDistrict = new Map();
    low.forEach((a) => { const d = place(a.parent_name); byDistrict.set(d, [...(byDistrict.get(d) || []), place(a.name)]); });
    const text = [...byDistrict.entries()].sort((a, b) => b[1].length - a[1].length).map(([d, names]) => `${d}: ${names.join(', ')}`).join(' · ');
    $('#lisa-low').textContent = T(`Low–low clusters (${ACCESS_Y[key].en.replace(' (%)', '').toLowerCase()}), ${low.length} upazilas: `, `নিম্ন-নিম্ন গুচ্ছ (${ACCESS_Y[key].bn.replace(' (%)', '')}), ${N(low.length)}টি উপজেলা: `) + (text || '—');
  }

  // ---------- Social conditions ----------
  function social() {
    const x = $('#s-x').value, y = $('#s-y').value, list = areasOf('upazila');
    const rowsXY = list.filter((a) => a.socio[x] !== null && a.socio[x] !== undefined).map((a) => ({ label: areaLabel(a, 'upazila'), x: a.socio[x], y: ACCESS_Y[y].value(a) }));
    window.HealthCharts.xy($('#c-social'), rowsXY, { title: `${T(...SOCIO[x])} × ${T(ACCESS_Y[y].en, ACCESS_Y[y].bn)}`, xLabel: T(...SOCIO[x]), yLabel: T(ACCESS_Y[y].en, ACCESS_Y[y].bn),
      ymax: y.startsWith('within') ? 100 : undefined, xmax: 100,
      xmin: x === 'ethnic_pct' ? 0 : Math.max(0, Math.floor(Math.min(...rowsXY.map((r) => r.x)) / 10) * 10), source: SOURCE() });
    const c = state.data.summary.correlations[y][x];
    $('#s-rho').textContent = T(`Spearman ρ = ${N(c.rho, 2)} (n = ${N(c.n)}). Correlation across areas, not proof of cause, and not about individuals.`,
      `স্পিয়ারম্যান ρ = ${N(c.rho, 2)} (n = ${N(c.n)})। এলাকার মধ্যে সম্পর্ক, কারণ প্রমাণ নয়, এবং ব্যক্তির সম্পর্কে নয়।`);
    const head = document.createElement('tr');
    [T('Access measure', 'প্রবেশগম্যতার পরিমাপ'), ...Object.values(SOCIO).map((v) => T(...v))].forEach((t, i) => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = t; head.append(th); });
    $('#t-corr-head').replaceChildren(head);
    const corr = state.data.summary.correlations;
    rows('#t-corr', Object.keys(ACCESS_Y).map((k) => [T(ACCESS_Y[k].en, ACCESS_Y[k].bn), ...Object.keys(SOCIO).map((s) => N(corr[k][s].rho, 2))]));
  }

  // ---------- Primary care ----------
  function primary() {
    const div = areasOf('division'), nat = state.data.summary.national;
    window.HealthCharts.bars($('#c-cc'), [...div].sort((a, b) => b.union_people_per_cc - a.union_people_per_cc).map((d) => ({ label: place(d.name), value: d.union_people_per_cc, display: N(d.union_people_per_cc) })),
      { title: T('Union residents per community clinic (norm about 6,000)', 'প্রতি কমিউনিটি ক্লিনিকে ইউনিয়নবাসী (মান প্রায় ৬,০০০)'), axisLabel: T('People per clinic', 'প্রতি ক্লিনিকে মানুষ'), source: SOURCE() });
    const ups = areasOf('upazila').filter((a) => a.union_people_per_cc);
    window.HealthCharts.xy($('#c-cc-scatter'), ups.map((a) => ({ label: areaLabel(a, 'upazila'), x: a.union_people_per_cc, y: a.within.primary_care['2'] })),
      { title: T('Upazilas: people per clinic × within 2 km of primary care', 'উপজেলা: প্রতি ক্লিনিকে মানুষ × প্রাথমিক সেবা থেকে ২ কিমির মধ্যে'), xLabel: T('Union residents per community clinic', 'প্রতি কমিউনিটি ক্লিনিকে ইউনিয়নবাসী'),
        yLabel: T('People within 2 km of primary care (%)', 'প্রাথমিক সেবা থেকে ২ কিমির মধ্যে মানুষ (%)'), ymax: 100, xmax: 30000, xDigits: 0,
        refX: { value: 6000, label: T('norm 6,000', 'মান ৬,০০০') }, source: SOURCE() });
    rows('#t-tiers', [...div.map((d) => [place(d.name), N(sumUnions(d)), N(d.counts.union_facility), N(d.counts.uhc), N(d.counts.community_clinic), N(d.union_population), N(d.union_people_per_cc)]),
      [T('Bangladesh', 'বাংলাদেশ'), N(nat.unions_census), N(nat.union_facilities), N(div.reduce((s, d) => s + d.counts.uhc, 0)), N(nat.community_clinics), N(nat.union_population), N(nat.union_people_per_cc)]]);
    const over = ups.filter((a) => a.union_people_per_cc > 9000);
    const fewer = areasOf('upazila').filter((a) => a.unions_census > 0 && a.counts.union_facility < a.unions_census);
    $('#cc-note').textContent = T(
      `${over.length} of ${ups.length} upazilas with unions have more than 9,000 union residents per community clinic (1.5 × the norm). ${fewer.length} upazilas list fewer union-level centres than they have unions. Caution: most union health and family welfare centres are run by the Directorate General of Family Planning (DGFP), so the DGHS registry may not list all of them; "fewer centres than unions" can mean missing listings, not missing centres.`,
      `ইউনিয়নযুক্ত ${N(ups.length)}টি উপজেলার মধ্যে ${N(over.length)}টিতে প্রতি কমিউনিটি ক্লিনিকে ৯,০০০-এর বেশি ইউনিয়নবাসী (মানের ১.৫ গুণ)। ${N(fewer.length)}টি উপজেলায় ইউনিয়নের চেয়ে কম ইউনিয়ন-স্তরের কেন্দ্র তালিকাভুক্ত। সতর্কতা: বেশিরভাগ ইউনিয়ন স্বাস্থ্য ও পরিবার কল্যাণ কেন্দ্র পরিবার পরিকল্পনা অধিদপ্তর (DGFP) পরিচালনা করে, তাই DGHS রেজিস্ট্রিতে সবগুলো নাও থাকতে পারে; "ইউনিয়নের চেয়ে কম কেন্দ্র" মানে তালিকার ঘাটতিও হতে পারে।`);
  }
  function sumUnions(division) {
    const districts = new Set(areasOf('district').filter((d) => d.parent === division.pcode).map((d) => d.pcode));
    return areasOf('upazila').filter((u) => districts.has(u.parent)).reduce((s, u) => s + u.unions_census, 0);
  }

  // ---------- KPIs, methods ----------
  function kpis() {
    const n = state.data.summary.national, a = n.access, people = (v) => T(`${N(v / 1e6, 1)} million people`, `${N(v / 1e6, 1)} মিলিয়ন মানুষ`);
    $('#k-public5').textContent = pct(a.public_hospital.within['5']); $('#k-public5-n').textContent = people(a.public_hospital.people_within['5']);
    $('#k-any5').textContent = pct(a.any_hospital.within['5']); $('#k-any5-n').textContent = people(a.any_hospital.people_within['5']);
    $('#k-primary2').textContent = pct(a.primary_care.within['2']); $('#k-primary2-n').textContent = people(a.primary_care.people_within['2']);
    $('#k-blood20').textContent = pct(a.blood_bank.within['20']); $('#k-blood20-n').textContent = T(`${N(a.blood_bank.points)} mapped blood banks`, `${N(a.blood_bank.points)}টি মানচিত্রে থাকা ব্লাড ব্যাংক`);
    $('#k-cc').textContent = N(n.union_people_per_cc); $('#k-cc-n').textContent = T(`${N(n.community_clinics)} clinics listed`, `${N(n.community_clinics)}টি ক্লিনিক তালিকাভুক্ত`);
  }
  function methods() {
    const s = state.data.summary, m = s.matching, f = s.adjustment.division_factors;
    const items = [
      [`Population: ${s.population_source}. ${s.population_basis}; each area is scaled by its division's post-enumeration-check factor (${N(Math.min(...Object.values(f)), 3)}–${N(Math.max(...Object.values(f)), 3)}), so division totals match the BBS adjusted figures used on the Statistics page (national ${N(s.national.population)}).`,
       `জনসংখ্যা: বিবিএস জনশুমারি ও গৃহগণনা ২০২২, কমিউনিটি সিরিজ। গণনাকৃত সংখ্যা; প্রতিটি এলাকা তার বিভাগের PEC গুণক (${N(Math.min(...Object.values(f)), 3)}–${N(Math.max(...Object.values(f)), 3)}) দিয়ে সমন্বিত, তাই বিভাগের মোট পরিসংখ্যান পৃষ্ঠার সমন্বিত সংখ্যার সাথে মেলে (জাতীয় ${N(s.national.population)})।`],
      [`Census areas follow 2022 units; the map uses 2015 boundaries. ${N(m.census_upazilas.exact)} upazilas/thanas matched exactly, ${N(m.census_upazilas.spelling)} by spelling, and ${N((m.census_upazilas.parent || 0) + (m.census_upazilas.rename || 0) + (m.census_upazilas.approximate || 0))} newer or renamed units were assigned to the 2015 unit they came from (${N(m.census_upazilas.approximate || 0)} metropolitan thanas approximately). District and upazila totals are exact.`,
       `জনশুমারির এলাকা ২০২২ সালের; মানচিত্রের সীমানা ২০১৫ সালের। ${N(m.census_upazilas.exact)}টি উপজেলা/থানা হুবহু, ${N(m.census_upazilas.spelling)}টি বানান মিলিয়ে, এবং ${N((m.census_upazilas.parent || 0) + (m.census_upazilas.rename || 0) + (m.census_upazilas.approximate || 0))}টি নতুন বা নাম-বদলানো এককের জনসংখ্যা যে ২০১৫ এককের অংশ ছিল সেখানে যোগ করা হয়েছে (${N(m.census_upazilas.approximate || 0)}টি মহানগর থানা আনুমানিক)। জেলা ও উপজেলার মোট নির্ভুল।`],
      [`Unions: ${N(m.union_population_share.census)}% of people are in unions matched to the census by name, ${N(m.union_population_share['census+'])}% in matched unions that also absorb small unmatched units, ${N(m.union_population_share.paurashava)}% in paurashavas, and ${N(m.union_population_share.estimated)}% (mostly city-corporation wards) estimated from the upazila total by area.`,
       `ইউনিয়ন: ${N(m.union_population_share.census)}% মানুষ নামে মেলানো ইউনিয়নে, ${N(m.union_population_share['census+'])}% মেলানো ইউনিয়নে যেখানে ছোট অমিলিত অংশ যোগ হয়েছে, ${N(m.union_population_share.paurashava)}% পৌরসভায়, এবং ${N(m.union_population_share.estimated)}% (মূলত সিটি কর্পোরেশনের ওয়ার্ড) উপজেলার মোট থেকে আয়তন অনুযায়ী অনুমিত।`],
      ['Distances: the population of each union is spread evenly over the 1 km grid cells in that union, and each cell is measured to the nearest usable DGHS coordinate in a straight line. Points outside their recorded district or sharing a coordinate across areas are excluded (see Location data quality below). Because excluded or missing coordinates remove some real facilities, the shares within a distance are lower bounds. Real travel by road, river or ferry is longer and slower.',
       'দূরত্ব: প্রতিটি ইউনিয়নের জনসংখ্যা ইউনিয়নের ১ কিমি গ্রিড ঘরগুলোতে সমানভাবে ছড়ানো, এবং প্রতিটি ঘর থেকে নিকটতম ব্যবহারযোগ্য DGHS স্থানাঙ্কের সরলরৈখিক দূরত্ব মাপা হয়েছে। নিজের জেলার বাইরে থাকা বা একাধিক এলাকায় একই স্থানাঙ্কের বিন্দু বাদ (নিচে অবস্থানের মান দেখুন)। বাদ পড়া বা অনুপস্থিত স্থানাঙ্কের কারণে কিছু প্রকৃত প্রতিষ্ঠান বাদ যায়, তাই নির্দিষ্ট দূরত্বের মধ্যে মানুষের অংশ ন্যূনতম হিসাব। সড়ক, নদী বা ফেরিতে প্রকৃত যাত্রা দীর্ঘতর ও ধীর।'],
      [`Facility counts per person use every active DGHS listing recorded in the area (coordinates not needed); ${N(m.dghs_unmatched_listings)} listings have an upazila label that matches no upazila in its district. Union counts use mapped points only.`,
       `জনপ্রতি প্রতিষ্ঠানের হিসাবে এলাকায় নথিভুক্ত প্রতিটি সক্রিয় DGHS তালিকা ব্যবহৃত (স্থানাঙ্ক লাগে না); ${N(m.dghs_unmatched_listings)}টি তালিকার উপজেলার নাম তার জেলার কোনো উপজেলার সাথে মেলে না। ইউনিয়নের সংখ্যা শুধু মানচিত্রের বিন্দু থেকে।`],
      ['Travel time: least-time routes (scikit-image minimum-cost path, 8 neighbours) from every usable facility over the Malaria Atlas Project 2019 friction surface at 1 km, masked to Bangladesh so no route crosses India or Myanmar. People on a cell without a friction value are moved to the nearest valid cell within 2 km. Wide rivers and estuary sea have no friction value and are crossed at 10 km/h by boat, with no waiting time.',
       'যাতায়াতের সময়: প্রতিটি ব্যবহারযোগ্য প্রতিষ্ঠান থেকে ম্যালেরিয়া অ্যাটলাস প্রজেক্টের ২০১৯ সালের ১ কিমি ঘর্ষণ পৃষ্ঠে সবচেয়ে কম সময়ের পথ (scikit-image, ৮ প্রতিবেশী), বাংলাদেশের সীমানায় সীমিত, তাই কোনো পথ ভারত বা মিয়ানমার দিয়ে যায় না। ঘর্ষণের মান নেই এমন ঘরের মানুষকে ২ কিমির মধ্যে নিকটতম বৈধ ঘরে সরানো হয়েছে। চওড়া নদী ও মোহনার সমুদ্রে মান নেই; সেগুলো নৌকায় ঘণ্টায় ১০ কিমি গতিতে, অপেক্ষা ছাড়া, পার হওয়া ধরা হয়েছে।'],
      ['Floods: 2000–2018 from the Global Flood Database (MODIS, events that the database mapped over Bangladesh); 2019–2025 from Sentinel-1 VH radar, change detection against a January–March reference (ratio above 1.25 and backscatter below −18 dB), with permanent water (JRC Global Surface Water, 10+ months a year) and slopes above 5° removed and small patches dropped. For the named floods, pixels flooded in at least 4 of the other 6 Sentinel-1 years are treated as normal monsoon water and removed (leave-one-out, so a flood does not hide itself). All layers were clipped to the geoBoundaries outline of Bangladesh in Google Earth Engine. A 1 km cell counts as flooded when at least half of it is flooded.',
       'বন্যা: ২০০০–২০১৮ গ্লোবাল ফ্লাড ডেটাবেস থেকে (MODIS, ডেটাবেসে বাংলাদেশের মানচিত্রিত ঘটনা); ২০১৯–২০২৫ সেন্টিনেল-১ VH রাডার থেকে, জানুয়ারি–মার্চের সাথে পরিবর্তন শনাক্তকরণ (অনুপাত ১.২৫-এর বেশি এবং ব্যাকস্ক্যাটার −১৮ dB-এর কম), স্থায়ী পানি (JRC গ্লোবাল সারফেস ওয়াটার, বছরে ১০+ মাস) ও ৫°-এর বেশি ঢাল বাদ, ছোট টুকরো বাদ। নামকৃত বন্যায়, অন্য ৬টি সেন্টিনেল-১ বছরের অন্তত ৪টিতে প্লাবিত পিক্সেল স্বাভাবিক বর্ষার পানি হিসেবে বাদ (নিজের বছর বাদ দিয়ে গণনা, তাই কোনো বন্যা নিজেকে লুকায় না)। সব স্তর গুগল আর্থ ইঞ্জিনে geoBoundaries-এর বাংলাদেশ সীমানায় কাটা। কোনো ১ কিমি ঘরের অন্তত অর্ধেক প্লাবিত হলে ঘরটি প্লাবিত ধরা হয়েছে।'],
      ['Not measured: opening hours, staff, medicines, cost, quality, ferry waiting times, flood depth and duration, and private or NGO facilities missing from the DGHS registry. Results describe areas, not individuals (ecological fallacy).',
       'যা মাপা হয়নি: খোলার সময়, জনবল, ওষুধ, খরচ, মান, ফেরির অপেক্ষা, বন্যার গভীরতা ও স্থায়িত্ব, এবং DGHS রেজিস্ট্রিতে না থাকা বেসরকারি বা এনজিও প্রতিষ্ঠান। ফলাফল এলাকার, ব্যক্তির নয় (ইকোলজিক্যাল ফ্যালাসি)।']
    ];
    $('#m-list').replaceChildren(...items.map(([en, bn]) => { const li = document.createElement('li'); li.textContent = T(en, bn); return li; }));
    const sources = [
      ['Bangladesh Bureau of Statistics (2023–2025). Population and Housing Census 2022, Community Series. Tables extracted from the UNICEF Bangladesh census dashboard', 'বিবিএস, জনশুমারি ও গৃহগণনা ২০২২, কমিউনিটি সিরিজ; ইউনিসেফ বাংলাদেশ ড্যাশবোর্ড থেকে সংগৃহীত', 'https://github.com/unicefbd/bangladesh-population-housing-census-2022'],
      ['Bangladesh Bureau of Statistics (2023). Population and Housing Census 2022: post-enumeration-check adjusted population (division totals)', 'বিবিএস (২০২৩), জনশুমারি ২০২২: PEC-সমন্বিত জনসংখ্যা (বিভাগ)', state.data.sourcesUrl],
      ['Directorate General of Health Services. Facility registry (snapshot used across this site)', 'স্বাস্থ্য অধিদপ্তর, প্রতিষ্ঠান রেজিস্ট্রি (এই সাইটের স্ন্যাপশট)', 'https://facilityregistry.dghs.gov.bd/'],
      ['geoBoundaries gbOpen BGD ADM2–ADM4 (BBS/OCHA; CC BY 3.0 IGO)', 'geoBoundaries gbOpen BGD ADM2–ADM4 (BBS/OCHA; CC BY 3.0 IGO)', 'https://www.geoboundaries.org/'],
      ['World Health Organization (2021). Bangladesh: community health workers at the heart of a stronger health system (one community clinic per 6,000 people)', 'বিশ্ব স্বাস্থ্য সংস্থা (২০২১), প্রতি ৬,০০০ জনে একটি কমিউনিটি ক্লিনিক', 'https://extranet.who.int/uhcpartnership/story/bangladesh-community-health-workers-heart-stronger-health-system-and-fight-against-covid-19'],
      ['Islam, K. (2017). Community clinic: combining care and empowering community. International Journal of Integrated Care, 17(5), A311', 'ইসলাম, খ. (২০১৭), ইন্টারন্যাশনাল জার্নাল অফ ইন্টিগ্রেটেড কেয়ার', 'https://doi.org/10.5334/ijic.3693'],
      ['Weiss, D. J., Nelson, A., Vargas-Ruiz, C. A., et al. (2020). Global maps of travel time to healthcare facilities. Nature Medicine, 26(12), 1835–1838 (friction surfaces, CC BY 4.0)', 'Weiss ও সহকর্মী (২০২০), নেচার মেডিসিন: ঘর্ষণ পৃষ্ঠ, CC BY 4.0', 'https://doi.org/10.1038/s41591-020-1059-1'],
      ['Tellman, B., Sullivan, J. A., Kuhn, C., et al. (2021). Satellite imaging reveals increased proportion of population exposed to floods. Nature, 596(7870), 80–86 (Global Flood Database)', 'Tellman ও সহকর্মী (২০২১), নেচার: গ্লোবাল ফ্লাড ডেটাবেস', 'https://doi.org/10.1038/s41586-021-03695-w'],
      ['Torres, R., Snoeij, P., Geudtner, D., et al. (2012). GMES Sentinel-1 mission. Remote Sensing of Environment, 120, 9–24 (Copernicus Sentinel-1 data 2019–2025)', 'Torres ও সহকর্মী (২০১২), সেন্টিনেল-১ মিশন; কোপার্নিকাস সেন্টিনেল-১ তথ্য ২০১৯–২০২৫', 'https://doi.org/10.1016/j.rse.2011.05.028'],
      ['Pekel, J.-F., Cottam, A., Gorelick, N., & Belward, A. S. (2016). High-resolution mapping of global surface water and its long-term changes. Nature, 540(7633), 418–422 (permanent-water mask)', 'Pekel ও সহকর্মী (২০১৬), নেচার: স্থায়ী পানির মাস্ক', 'https://doi.org/10.1038/nature20584'],
      ['Flood event dates and areas: ReliefWeb, UN Bangladesh, Dartmouth Flood Observatory and news reports, linked in the flood table', 'বন্যার তারিখ ও এলাকা: রিলিফওয়েব, জাতিসংঘ বাংলাদেশ, ডার্টমাউথ ফ্লাড অবজারভেটরি ও সংবাদ, বন্যার সারণিতে লিংক', null],
      ['Basemap © OpenStreetMap contributors; terrain © OpenTopoMap (CC-BY-SA)', 'বেসম্যাপ © OpenStreetMap; ভূপ্রকৃতি © OpenTopoMap (CC-BY-SA)', 'https://www.openstreetmap.org/copyright']
    ];
    $('#m-sources').replaceChildren(...sources.map(([en, bn, url]) => {
      const li = document.createElement('li'); li.append(document.createTextNode(T(en, bn) + '. '));
      if (url) { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = url.replace(/^https?:\/\//, '').slice(0, 70); li.append(a); }
      return li;
    }));
  }

  function exportLevel(level) {
    const go = () => {
      const list = areasOf(level);
      if (level === 'union') {
        const cols = Object.keys(list[0]);
        csv('bangladesh-health-access-union.csv', cols, list.map((a) => cols.map((c) => a[c])));
        return;
      }
      const header = ['pcode', 'name', 'parent', 'population_2022_adjusted', 'population_2022_enumerated', 'under5', 'age60plus', 'people_per_km2',
        ...['public_hospital', 'any_hospital', 'primary_care', 'community_clinic', 'union_facility', 'uhc', 'blood_bank'].map((k) => 'listings_' + k),
        'hospitals_per100k', 'government_hospitals_per100k', 'primary_care_per100k', 'government_beds_per10k', 'union_residents_per_community_clinic',
        ...['public_hospital', 'any_hospital', 'primary_care', 'uhc', 'blood_bank'].flatMap((k) => ['2', '5', '10', '20'].map((t) => `pct_people_within_${t}km_${k}`)),
        ...['public_hospital', 'any_hospital', 'primary_care', 'uhc', 'blood_bank'].map((k) => `mean_km_${k}`)];
      csv(`bangladesh-health-access-${level}.csv`, header, list.map((a) => [a.pcode, a.name, a.parent_name || '', a.population, a.population_enumerated, a.u5, a.age60, a.density,
        ...['public_hospital', 'any_hospital', 'primary_care', 'community_clinic', 'union_facility', 'uhc', 'blood_bank'].map((k) => a.counts[k]),
        a.rates.any_hospital, a.rates.public_hospital, a.rates.primary_care, a.beds_per10k.public, a.union_people_per_cc ?? '',
        ...['public_hospital', 'any_hospital', 'primary_care', 'uhc', 'blood_bank'].flatMap((k) => ['2', '5', '10', '20'].map((t) => a.within[k][t])),
        ...['public_hospital', 'any_hospital', 'primary_care', 'uhc', 'blood_bank'].map((k) => a.mean_km[k])]));
    };
    if (level === 'union' && !state.data.areas.union) {
      get('./data/access/areas-union.json').then((file) => {
        state.data.areas.union = file.rows.map((r) => Object.fromEntries(file.columns.map((c, i) => [c, r[i]])));
        state.data.index.union = new Map(state.data.areas.union.map((a) => [a.pcode, a]));
        go();
      });
    } else go();
  }

  function selects() {
    const x = $('#s-x').value || 'literacy7', y = $('#s-y').value || 'within5_any_hospital';
    $('#s-x').replaceChildren(...Object.entries(SOCIO).map(([k, v]) => option(k, T(...v)))); $('#s-x').value = x;
    $('#s-y').replaceChildren(...Object.entries(ACCESS_Y).map(([k, v]) => option(k, T(v.en, v.bn)))); $('#s-y').value = y;
  }
  // ---------- Travel time ----------
  function travelSection() {
    const t = state.data.travel;
    if (!t) { $('#travel').hidden = true; return; }
    const order = [['any_hospital', '#2563eb'], ['public_hospital', '#077a53'], ['blood_bank', '#c2611e'], ['primary_care', '#8b5cf6']];
    const label = (k) => `${cls(k)} · ${T(...MODE[t.national[k].mode])}`;
    window.HealthCharts.lines($('#c-travel'), order.map(([k, color]) => ({ label: label(k), color, points: [[0, 0], ...t.national[k].curve.filter((p) => p[0] <= 120)] })), {
      title: T('Share of people within each travel time of the nearest facility', 'নিকটতম প্রতিষ্ঠান থেকে নির্দিষ্ট যাতায়াতের সময়ের মধ্যে মানুষের অংশ'),
      axisLabel: T('Travel time (minutes)', 'যাতায়াতের সময় (মিনিট)'), yLabel: T('% of people', 'মানুষের %'), xmax: 120, ymax: 100, xTicks: 4,
      xUnit: T('min', 'মিনিট'), digits: 1, endLabels: false, legendWidth: 260, source: TRAVEL_SOURCE() });
    rows('#t-travel', ['any_hospital', 'public_hospital', 'uhc', 'blood_bank', 'primary_care'].map((k) => {
      const n = t.national[k];
      return [cls(k), T(...MODE[n.mode]), N(n.median_min, 1), pct(n.within['30']), pct(n.within['60']), pct(n.within['120']), N(n.unreachable_people)];
    }));
    const w = t.water || {};
    $('#travel-note').textContent = T(
      `Water: the friction surface has no value on the widest river reaches and on the sea, which would cut off Sandwip, Hatiya and the Meghna chars. Those cells, and estuary sea within 10 km of land, are crossed at about ${N(w.kmh || 10)} km/h with no waiting for a boat or ferry, so island times are optimistic. The surface describes roads in 2019: later roads and bridges, including the Padma Bridge (2022), are not in it. "No route" counts people on cells with no connection to any facility of that kind. At 1 km resolution one cell takes about 12 minutes to walk across, so walking times under about 15 minutes are coarse.`,
      `পানি: সবচেয়ে চওড়া নদী ও সমুদ্রে ঘর্ষণ পৃষ্ঠের কোনো মান নেই, ফলে সন্দ্বীপ, হাতিয়া ও মেঘনার চর বিচ্ছিন্ন হয়ে যেত। ওই ঘরগুলো এবং স্থল থেকে ১০ কিমির মধ্যের মোহনার সমুদ্র ঘণ্টায় প্রায় ${N(w.kmh || 10)} কিমি গতিতে পার হওয়া ধরা হয়েছে, নৌকা বা ফেরির অপেক্ষা ছাড়া; তাই দ্বীপের সময় আশাবাদী। পৃষ্ঠটি ২০১৯ সালের সড়ক অনুযায়ী: পরের সড়ক ও সেতু, পদ্মা সেতুসহ (২০২২), এতে নেই। "পৌঁছানো যায় না" মানে যাদের ঘর থেকে ওই ধরনের কোনো প্রতিষ্ঠানে পথ নেই। ১ কিমি রেজোলিউশনে একটি ঘর হেঁটে পার হতে প্রায় ১২ মিনিট লাগে, তাই ১৫ মিনিটের কম হাঁটার সময় মোটা দাগের।`);
  }

  // ---------- Floods ----------
  function floodSection() {
    const f = state.data.floods;
    if (!f) { $('#floods').hidden = true; return; }
    $('#flood-caveat').textContent = T(
      'Read with care. (1) The two satellite eras are not comparable: MODIS years count only the large events in the Global Flood Database, at 250 m, while Sentinel-1 years map every month from April to October at 10–20 m (exported at 250 m). (2) Normal monsoon water: for the eight named floods, water that also appears in at least 4 of the other 6 Sentinel-1 years (haors, beels, regularly flooded floodplain) is removed, so the events show water beyond the usual monsoon extent. The yearly maps keep all flood water, so the haor basin counts as flooded almost every year. Some flooded rice fields can remain in both. (3) The access losses assume everyone in a flooded cell wades at about 1.5 km/h; boats, raised roads and embankments are not modelled. Treat losses as a stress test of where the network is fragile, not as a count of people cut off. Yearly maps put a whole year\'s floods on the map at once, so yearly losses are an upper bound.',
      'সাবধানে পড়ুন। (১) দুই উপগ্রহ যুগ তুলনীয় নয়: MODIS বছরগুলোতে শুধু গ্লোবাল ফ্লাড ডেটাবেসের বড় ঘটনাগুলো, ২৫০ মি-তে; সেন্টিনেল-১ বছরগুলোতে এপ্রিল থেকে অক্টোবরের প্রতি মাস, ১০–২০ মি-তে (২৫০ মি-তে রপ্তানি)। (২) স্বাভাবিক বর্ষার পানি: ৮টি নামকৃত বন্যায়, যে পানি অন্য ৬টি সেন্টিনেল-১ বছরের অন্তত ৪টিতেও দেখা যায় (হাওর, বিল, নিয়মিত প্লাবিত প্লাবনভূমি) তা বাদ দেওয়া হয়েছে, তাই ঘটনাগুলো স্বাভাবিক বর্ষার বাইরের পানি দেখায়। বার্ষিক মানচিত্রে সব বন্যার পানি থাকে, তাই হাওর অঞ্চল প্রায় প্রতি বছর প্লাবিত গণ্য হয়। দুই ক্ষেত্রেই কিছু পানিতে ডোবা ধানক্ষেত থেকে যেতে পারে। (৩) প্রবেশগম্যতা হারানোর হিসাবে ধরা হয়েছে প্লাবিত ঘরে সবাই ঘণ্টায় প্রায় ১.৫ কিমি গতিতে পানি পেরোয়; নৌকা, উঁচু সড়ক ও বাঁধ হিসাবে নেই। এটিকে নেটওয়ার্ক কোথায় ভঙ্গুর তার চাপ-পরীক্ষা হিসেবে দেখুন, বিচ্ছিন্ন মানুষের গণনা হিসেবে নয়। বার্ষিক মানচিত্রে পুরো বছরের বন্যা একসাথে থাকে, তাই বার্ষিক ক্ষতি ঊর্ধ্বসীমা।');
    const legend = Object.values(ERA).map(([color, en, bn]) => ({ color, label: T(en, bn) }));
    const yr = (e) => String(e.year);
    window.HealthCharts.columns($('#c-flood-years'), f.years.map((e) => ({ label: yr(e), value: e.flooded_km2, color: ERA[e.sensor][0], display: N(e.flooded_km2) + T(' km²', ' বর্গকিমি'),
      detail: T(`${N(e.people_in_flooded_cells / 1e6, 1)} million people in flooded cells`, `প্লাবিত ঘরে ${N(e.people_in_flooded_cells / 1e6, 1)} মিলিয়ন মানুষ`) })), {
      title: T('Flooded land by year, 2000–2025 (1 km cells at least half flooded)', 'বছর অনুযায়ী প্লাবিত ভূমি, ২০০০–২০২৫ (অন্তত অর্ধেক প্লাবিত ১ কিমি ঘর)'),
      yLabel: T('km²', 'বর্গকিমি'), axisLabel: T('Year', 'বছর'), legend, labelEvery: 5, source: FLOOD_SOURCE() });
    window.HealthCharts.columns($('#c-flood-lost'), f.years.map((e) => ({ label: yr(e), value: e.people_losing_access.any_hospital / 1e6, color: ERA[e.sensor][0],
      display: T(`${N(e.people_losing_access.any_hospital / 1e6, 2)} million`, `${N(e.people_losing_access.any_hospital / 1e6, 2)} মিলিয়ন`),
      detail: T(`${N(e.facilities_flooded.any_hospital)} hospitals flooded`, `${N(e.facilities_flooded.any_hospital)}টি হাসপাতাল প্লাবিত`) })), {
      title: T('People who lose a hospital within 60 minutes, by year (upper bound)', 'বছর অনুযায়ী ৬০ মিনিটের মধ্যে হাসপাতাল হারানো মানুষ (ঊর্ধ্বসীমা)'),
      yLabel: T('Million people', 'মিলিয়ন মানুষ'), axisLabel: T('Year', 'বছর'), legend, labelEvery: 5, digits: 1, source: FLOOD_SOURCE() });
    rows('#t-events', f.events.map((e) => {
      const cell = document.createElement('span');
      const link = document.createElement('a'); link.href = e.source; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = floodLabel(e);
      cell.append(link);
      const go = document.createElement('button'); go.type = 'button'; go.className = 'flood-map-btn'; go.textContent = T('Show', 'দেখুন');
      go.setAttribute('aria-label', T(`Show ${e.when} on the map`, `${EVENT_BN[e.id]?.[0] || e.when} মানচিত্রে দেখুন`));
      go.addEventListener('click', () => showFlood(e.id));
      const lost = (k) => `${N(e.people_losing_access[k] / 1e6, 1)} ${T('M', 'মি.')}`;
      const area = document.createElement('span'); area.textContent = N(e.flooded_km2);
      if (e.surface_water_km2) area.title = T(`${N(e.surface_water_km2)} km² of surface water before removing normal monsoon water`, `স্বাভাবিক বর্ষার পানি বাদের আগে ${N(e.surface_water_km2)} বর্গকিমি পানি`);
      return [cell, area, `${N(e.people_in_flooded_cells / 1e6, 1)} ${T('M', 'মি.')}`, N(e.facilities_flooded.any_hospital), N(e.facilities_flooded.primary_care), lost('any_hospital'), lost('primary_care'), go];
    }));
    const fq = f.frequency;
    if (fq) window.HealthCharts.columns($('#c-flood-freq'), fq.histogram.map((v, i) => ({ label: String(i), value: v, color: '#2f74b5', display: pct(v) })), {
      title: T(`How often people's homes flooded: share of people by number of flooded years, 2000–2025 (${N(fq.people_flooded_ge['1'], 1)}% at least once, ${N(fq.people_flooded_ge['5'], 1)}% in 5+ years)`,
               `মানুষের বাসস্থান কতবার প্লাবিত: প্লাবিত বছরের সংখ্যা অনুযায়ী মানুষের অংশ, ২০০০–২০২৫ (${N(fq.people_flooded_ge['1'], 1)}% অন্তত একবার, ${N(fq.people_flooded_ge['5'], 1)}% ৫ বা বেশি বছর)`),
      yLabel: T('% of people', 'মানুষের %'), axisLabel: T(`Years flooded (of ${fq.years_mapped})`, `প্লাবিত বছর (${N(fq.years_mapped)}টির মধ্যে)`), labelEvery: 2, digits: 0, source: FLOOD_SOURCE() });
  }
  // ---------- Flood map (its own map in the Floods section) ----------
  const fstate = { level: 'district', measure: 'f_lost_hosp', flood: 'f2020_07', map: null, overlay: 'flood', raster: null, legend: null };
  // Satellite flood layers (data/floods/overlays.json, scripts/build_flood_overlays.py): Web Mercator PNGs over the area map.
  function drawRaster() {
    const ov = state.data.overlays, map = fstate.map?.map;
    if (!map) return;
    if (fstate.raster) { map.removeLayer(fstate.raster); fstate.raster = null; }
    const id = fstate.overlay === 'frequency' ? 'frequency' : fstate.flood, entry = fstate.overlay !== 'none' && ov ? ov.layers[id] : null;
    if (entry) {
      if (!map.getPane('flood-raster')) map.createPane('flood-raster').style.zIndex = 420;
      fstate.raster = L.imageOverlay(`./data/floods/${entry.file}?v=${encodeURIComponent(ov.generatedAt)}`, entry.bounds,
        { pane: 'flood-raster', opacity: 0.9, interactive: false, className: 'flood-raster', alt: T('Satellite flood map', 'উপগ্রহের বন্যার মানচিত্র') }).addTo(map);
    }
    if (!fstate.legend) {
      fstate.legend = L.control({ position: 'bottomleft' });
      fstate.legend.onAdd = () => { const d = L.DomUtil.create('div', 'flood-legend'); L.DomEvent.disableClickPropagation(d); return d; };
      fstate.legend.addTo(map);
    }
    const box = fstate.legend.getContainer();
    box.hidden = !entry;
    if (!entry) return;
    const title = entry.kind === 'frequency' ? T(`Years flooded, 2000–2025 (of ${entry.years_mapped})`, `প্লাবিত বছর, ২০০০–২০২৫ (${N(entry.years_mapped)}টির মধ্যে)`)
      : `${T('Satellite flood map', 'উপগ্রহের বন্যার মানচিত্র')} · ${floodLabel(floodRecord(id))}`;
    const strong = document.createElement('strong'); strong.textContent = title;
    const items = ov.legend[entry.kind].map((l) => { const span = document.createElement('span'), i = document.createElement('i'); i.style.background = l.color; span.append(i, T(l.en, l.bn)); return span; });
    const note = document.createElement('small');
    note.textContent = T(`Every flooded pixel (${entry.res_m} m); the tables count 1 km cells at least half flooded, so they show less area. Permanent rivers are left out.`,
      `প্রতিটি প্লাবিত পিক্সেল (${N(entry.res_m)} মি); সারণিতে শুধু অন্তত অর্ধেক প্লাবিত ১ কিমি ঘর গোনা হয়, তাই কম এলাকা দেখায়। স্থায়ী নদী বাদ।`);
    if (entry.kind === 'event') note.textContent += ' ' + T('Scattered single specks across the country are most likely wet rice fields or radar noise rather than flooding.',
      'সারা দেশে ছড়ানো একক বিন্দুগুলো সম্ভবত পানিতে ভেজা ধানক্ষেত বা রাডারের নয়েজ, বন্যা নয়।');
    box.replaceChildren(strong, ...items, note);
  }
  const floodMeasure = () => MEASURES.find((m) => m.id === fstate.measure);
  function floodSelects() {
    const level = fstate.level, f = state.data.floods;
    $('#f-level').replaceChildren(...ALL.map((k) => option(k, lvl(k)))); $('#f-level').value = level;
    $('#f-metric').replaceChildren(...MEASURES.filter((m) => basisOf(m) === 'floods' && m.levels.includes(level)).map((m) => option(m.id, T(m.en, m.bn))));
    $('#f-metric').value = fstate.measure;
    const group = (label, list) => { const g = document.createElement('optgroup'); g.label = label; g.append(...list.map((e) => option(e.id, floodLabel(e)))); return g; };
    $('#f-flood').replaceChildren(group(T('Named floods (Sentinel-1)', 'নামকৃত বন্যা (সেন্টিনেল-১)'), f.events), group(T('Whole years, 2000–2025', 'পুরো বছর, ২০০০–২০২৫'), [...f.years].reverse()));
    $('#f-flood').value = fstate.flood;
    $('#f-flood-wrap').hidden = !(floodMeasure().event || fstate.overlay === 'flood');
    $('#f-names').replaceChildren(...areasOf(level).map((a) => option(areaLabel(a, level), '')));
  }
  function floodPaint() {
    const m = floodMeasure(), level = fstate.level, list = areasOf(level), fr = m.event ? floodRecord(fstate.flood) : null;
    const val = (a) => Number(m.value(a, level, fstate.flood));
    $('#f-metric-note').textContent = (fr ? floodLabel(fr) + '. ' : '') + T(...m.note) + (fr && fr.id.startsWith('y') && level === 'union' && m.id !== 'f_flooded'
      ? ' ' + T('Access losses for whole years are published down to upazila.', 'পুরো বছরের প্রবেশগম্যতা হারানোর হিসাব উপজেলা পর্যন্ত প্রকাশিত।') : '');
    const rasterOn = fstate.overlay !== 'none' && state.data.overlays;
    fstate.map.setMetric({ legendTitle: T(m.en, m.bn), ramp: m.ramp, digits: m.digits, values: new Map(list.map((a) => [a.pcode, val(a)])), fillOpacity: rasterOn ? 0.35 : undefined });
    drawRaster();
    const usable = list.filter((a) => Number.isFinite(val(a)) && (a.population || 0) > 0 && (level !== 'union' || a.source !== 'estimated')).sort((a, b) => val(b) - val(a));
    $('#f-rank-title').textContent = T(`${m.rank[0]}: 20 ${LEVELS[level].en.toLowerCase()} areas · ${m.en}`, `${m.rank[1]}: ২০টি ${LEVELS[level].bn} · ${m.bn}`);
    window.HealthCharts.bars($('#c-flood-rank'), usable.slice(0, 20).map((a) => ({ label: areaLabel(a, level), value: val(a), display: N(val(a), m.digits),
      detail: T('population ', 'জনসংখ্যা ') + N(a.population) })), { title: T(m.en, m.bn) + (fr ? ' · ' + floodLabel(fr) : ''), axisLabel: T(m.en, m.bn), digits: m.digits, source: FLOOD_SOURCE() });
  }
  function floodDetail(pcode) {
    const level = fstate.level, a = pcode ? byPcode(level).get(pcode) : null, box = $('#f-detail');
    const h = document.createElement('h3');
    if (!a) { h.textContent = T('Select an area', 'একটি এলাকা বাছুন'); const p = document.createElement('p'); p.textContent = T('Click the map or search by name.', 'মানচিত্রে ক্লিক করুন বা নাম খুঁজুন।'); box.replaceChildren(h, p); return; }
    h.textContent = areaLabel(a, level);
    const fr = floodRecord(fstate.flood), share = (v) => (a.population > 0 && Number.isFinite(v) ? pct(v / a.population * 100) : '—');
    const items = [[T('Population 2022', 'জনসংখ্যা ২০২২'), N(a.population)],
      [T('Years flooded (average, of 26)', 'প্লাবিত বছর (গড়, ২৬টির মধ্যে)'), N(fv(level, a.pcode, 'years_flooded_mean'), 1)],
      [T('People flooded in 1+ years', '১ বা বেশি বছর প্লাবিত মানুষ'), pct(fv(level, a.pcode, 'flooded_ge1_pct'))],
      [T('People flooded in 5+ years', '৫ বা বেশি বছর প্লাবিত মানুষ'), pct(fv(level, a.pcode, 'flooded_ge5_pct'))],
      [T('People flooded in 10+ years', '১০ বা বেশি বছর প্লাবিত মানুষ'), pct(fv(level, a.pcode, 'flooded_ge10_pct'))]];
    const dl = (rows) => { const d = document.createElement('dl'); rows.forEach(([t, v]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = t; dd.textContent = v; d.append(dt, dd); }); return d; };
    const nodes = [h, dl(items)];
    if (fr) {
      const sub = document.createElement('h4'); sub.textContent = floodLabel(fr);
      const lostH = fe(level, a.pcode, 'lost_hospital', fstate.flood), lostP = fe(level, a.pcode, 'lost_primary', fstate.flood);
      nodes.push(sub, dl([[T('People in flooded cells', 'প্লাবিত ঘরে মানুষ'), pct(fe(level, a.pcode, 'flooded_pct', fstate.flood))],
        [T('Lose hospital ≤ 60 min', '৬০ মিনিটে হাসপাতাল হারায়'), Number.isFinite(lostH) ? `${N(lostH)} (${share(lostH)})` : '—'],
        [T('Lose primary care ≤ 60 min walk', '৬০ মিনিট হাঁটায় প্রাথমিক সেবা হারায়'), Number.isFinite(lostP) ? `${N(lostP)} (${share(lostP)})` : '—']]));
    }
    box.replaceChildren(...nodes);
  }
  async function floodLevel(level) {
    fstate.level = level;
    $('#flood-map').classList.add('loading');
    if (level === 'union') await ensurePeopleUnion();
    await ensureTravel(level);
    if (!floodMeasure().levels.includes(level)) fstate.measure = 'f_lost_hosp';
    floodSelects(); floodDetail(null);
    await fstate.map.setLayer(LEVELS[level].geo);
    $('#flood-map').classList.remove('loading');
    floodPaint();
  }
  function initFloodMap() {
    if (!state.data.floods) return;
    fstate.map = window.AtlasChoropleth.create('flood-map', {
      label: (p) => { const a = byPcode(fstate.level).get(p.pcode); return a ? areaLabel(a, fstate.level) : p.name || p.shapeName; },
      onSelect: (pcode) => floodDetail(pcode), boundaries: true, defaultBoundaries: ['division'], storageKey: 'shasthopath-flood-basemap'
    });
    $('#f-level').addEventListener('change', (e) => floodLevel(e.target.value));
    $('#f-metric').addEventListener('change', (e) => { fstate.measure = e.target.value; $('#f-flood-wrap').hidden = !(floodMeasure().event || fstate.overlay === 'flood'); floodPaint(); });
    $('#f-flood').addEventListener('change', (e) => { fstate.flood = e.target.value; floodPaint(); floodDetail(null); });
    $('#f-overlay').addEventListener('change', (e) => { fstate.overlay = e.target.value; $('#f-flood-wrap').hidden = !(floodMeasure().event || fstate.overlay === 'flood'); floodPaint(); });
    if (!state.data.overlays) $('#f-overlay').closest('label').hidden = true;
    $('#f-search').addEventListener('change', (e) => {
      const q = e.target.value.trim().toLowerCase(), name = q.split(' · ')[0], list = areasOf(fstate.level);
      const hit = list.find((a) => areaLabel(a, fstate.level).toLowerCase() === q) || list.find((a) => a.name.toLowerCase() === name) || list.find((a) => a.name.toLowerCase().includes(name));
      if (hit) fstate.map.select(hit.pcode, true);
    });
    return floodLevel(fstate.level);
  }
  function showFlood(id) {
    fstate.flood = id;
    if (!floodMeasure().event) fstate.measure = 'f_lost_hosp';
    $('#flood-map').scrollIntoView({ behavior: 'smooth', block: 'center' });
    floodSelects(); floodPaint(); floodDetail(null);
  }

  function staticSections() { kpis(); curves(); travelSection(); floodSection(); inequality(); clusters(); selects(); social(); primary(); quality(); methods(); }

  // ---------- People versus land ----------
  function curves() {
    const people = state.data.summary.national.access, ground = state.data.distance.national;
    const order = [['public_hospital', '#077a53'], ['any_hospital', '#2563eb'], ['primary_care', '#8b5cf6']];
    // Legend: people row first, land row second (three per row), so each colour lines up with its pair.
    const lines = [...order.map(([k, color]) => ({ label: `${cls(k)} · ${T('people', 'মানুষ')}`, color, points: people[k].curve })),
      ...order.map(([k, color]) => ({ label: `${cls(k)} · ${T('land', 'ভূমি')}`, color, dash: '6 4', points: ground[k].curve }))];
    window.HealthCharts.lines($('#c-curve'), lines, { title: T('Share within a straight-line distance of the nearest facility: people (solid) and land (dashed)', 'নিকটতম প্রতিষ্ঠান থেকে নির্দিষ্ট দূরত্বের মধ্যে অংশ: মানুষ (কঠিন) ও ভূমি (ড্যাশ)'),
      axisLabel: T('Straight-line distance (km)', 'সরলরৈখিক দূরত্ব (কিমি)'), yLabel: T('% of people or land', 'মানুষ বা ভূমির %'), xmax: 40, ymax: 100,
      xUnit: T('km', 'কিমি'), digits: 1, endLabels: false, legendWidth: 380, source: SOURCE() });
    const both = (k, t) => `${pct(people[k].within[t])} / ${pct(ground[k].within_km[t])}`;
    rows('#t-national', order.map(([k]) => [cls(k), N(people[k].points), N(people[k].median_km, 1), N(ground[k].median_km, 1), both(k, '2'), both(k, '5'), both(k, '10'), both(k, '20')]));
  }

  // ---------- Location quality ----------
  function quality() {
    const q = state.data.quality, r = q.flag_reasons;
    $('#q-summary').textContent = T(
      `Of ${N(q.published)} published DGHS coordinates, ${N(q.flagged)} (${pct(q.flagged / q.published * 100)}) are flagged and left out of every map and distance: ${N(r['outside recorded district'] || 0)} lie more than 1 km outside the district recorded for the facility, and ${N(r['coordinate shared with facilities in other areas'] || 0)} share one coordinate with facilities recorded in other districts or upazilas (some have both problems). Flagged facilities still count in all listing totals and per-person rates.`,
      `${N(q.published)}টি প্রকাশিত DGHS স্থানাঙ্কের মধ্যে ${N(q.flagged)}টি (${pct(q.flagged / q.published * 100)}) চিহ্নিত এবং সব মানচিত্র ও দূরত্ব থেকে বাদ: ${N(r['outside recorded district'] || 0)}টি প্রতিষ্ঠানের নথিভুক্ত জেলার ১ কিমির বেশি বাইরে, এবং ${N(r['coordinate shared with facilities in other areas'] || 0)}টি অন্য জেলা বা উপজেলার প্রতিষ্ঠানের সাথে একই স্থানাঙ্ক ভাগ করে (কিছুতে দুটো সমস্যাই আছে)। চিহ্নিত প্রতিষ্ঠান তালিকার মোট ও জনপ্রতি হারে গণনায় থাকে।`);
    const flagged = landOf('district').filter((d) => d.registry?.published >= 20)
      .map((d) => ({ d, share: d.registry.flagged / d.registry.published * 100 })).sort((a, b) => b.share - a.share).slice(0, 20);
    window.HealthCharts.bars($('#c-flagged'), flagged.map(({ d, share }) => ({ label: place(d.name), value: share, display: pct(share),
      detail: T(`${d.registry.flagged} of ${d.registry.published}`, `${N(d.registry.published)}টির মধ্যে ${N(d.registry.flagged)}টি`) })),
      { title: T('Flagged share of published locations', 'প্রকাশিত অবস্থানের চিহ্নিত অংশ'), axisLabel: T('% flagged', '% চিহ্নিত'), maximum: 100, digits: 1,
        source: T('Districts with at least 20 published locations, by recorded district.', 'অন্তত ২০টি প্রকাশিত অবস্থানসহ জেলা, নথিভুক্ত জেলা অনুযায়ী।') });
    const status = q.coordinate_status;
    window.HealthCharts.bars($('#c-status'), [
      [T('Usable', 'ব্যবহারযোগ্য'), q.usable], [T('Flagged (misplaced or shared)', 'চিহ্নিত (ভুল স্থানে বা ভাগ করা)'), q.flagged],
      [T('No coordinates', 'স্থানাঙ্ক নেই'), status.missing || 0], [T('Outside Bangladesh', 'বাংলাদেশের বাইরে'), status.outside || 0], [T('Invalid', 'অবৈধ'), status.invalid || 0]
    ].map(([label, value]) => ({ label, value })), { title: T('Active records by location status', 'অবস্থানের অবস্থা অনুযায়ী সক্রিয় রেকর্ড'), axisLabel: T('Records', 'রেকর্ড'),
      source: T('DGHS registry snapshot; location audit.', 'DGHS রেজিস্ট্রি স্ন্যাপশট; অবস্থান যাচাই।') });
  }

  function exportTravel(level) {
    ensureTravel(level).then(() => {
      const list = areasOf(level), classes = ['any_hospital', 'public_hospital', 'uhc', 'blood_bank', 'primary_care'];
      const fl = state.data.floodLv[level], ids = state.data.floods ? [...state.data.floods.events, ...state.data.floods.years].map((e) => e.id) : [];
      const header = ['pcode', 'name', 'population',
        ...classes.flatMap((k) => [...['30', '60', '120'].map((t) => `pct_people_within_${t}min_${k}`), `mean_min_${k}`]),
        ...(fl ? ['years_flooded_mean_2000_2025', 'pct_people_flooded_ge1', 'pct_people_flooded_ge5', 'pct_people_flooded_ge10'] : []),
        ...ids.flatMap((id) => [`${id}_pct_people_flooded`, `${id}_people_lose_hospital_60min`, `${id}_people_lose_primary_60min_walk`])];
      csv(`bangladesh-health-travel-floods-${level}.csv`, header, list.map((a) => {
        const i = fl?.idx.get(a.pcode), at = (key) => (fl && i !== undefined && fl[key] ? fl[key][i] ?? '' : '');
        const ev = (id, key) => (fl && i !== undefined && fl[id]?.[key] ? fl[id][key][i] ?? '' : '');
        return [a.pcode, a.name, a.population,
          ...classes.flatMap((k) => [...['30', '60', '120'].map((t) => tv(level, a.pcode, k, 'within', t)), tv(level, a.pcode, k, 'mean')].map((v) => (Number.isFinite(v) ? v : ''))),
          ...(fl ? [at('years_flooded_mean'), at('flooded_ge1_pct'), at('flooded_ge5_pct'), at('flooded_ge10_pct')] : []),
          ...ids.flatMap((id) => [ev(id, 'flooded_pct'), ev(id, 'lost_hospital'), ev(id, 'lost_primary')])];
      }));
    });
  }

  function exportLand(level) {
    ensureLand(level).then(() => {
      const classes = ['public_hospital', 'any_hospital', 'private_ngo_hospital', 'primary_care'];
      const keys = [...new Set(landOf(level).flatMap((a) => classes.flatMap((k) => Object.keys(a.distance?.[k]?.within_km || {}))))].sort((a, b) => a - b);
      const header = ['pcode', 'name', 'parent', 'area_km2', ...classes.map((k) => 'mapped_' + k), 'approved_beds_mapped',
        ...classes.flatMap((k) => ['cells', 'median_km', ...keys.map((t) => `pct_land_within_${t}km`)].map((f) => `${k}_${f}`))];
      csv(`bangladesh-health-access-land-${level}.csv`, header, landOf(level).map((a) => [a.pcode, a.name, a.parent_name || '', a.area_km2,
        ...classes.map((k) => landPoints(a, k)), a.beds || 0,
        ...classes.flatMap((k) => { const d = a.distance?.[k] || {}; return [d.cells ?? '', d.median_km ?? '', ...keys.map((t) => d.within_km?.[t] ?? '')]; })]));
    });
  }

  async function init() {
    try {
      const levels = ['division', 'district', 'upazila'];
      const [summary, sources, distance, quality, landDistrict, ...files] = await Promise.all([get('./data/access/summary.json'), get('./data/statistics/sources.json'),
        get('./data/atlas/distance.json'), get('./data/atlas/location-quality.json'), get('./data/atlas/areas-district.json'),
        ...levels.map((k) => get(`./data/access/areas-${k}.json`))]);
      if (!summary.national?.access?.blood_bank?.curve || !summary.moran || !distance.national?.primary_care?.curve) throw new Error(T('the data files are an older version; please reload the page (Ctrl+F5)', 'তথ্যের ফাইল পুরোনো সংস্করণের; পৃষ্ঠাটি আবার লোড করুন (Ctrl+F5)'));
      const [travel, floods, overlays] = await Promise.all([get('./data/access/travel.json').catch(() => null), get('./data/access/floods.json').catch(() => null),
        get('./data/floods/overlays.json').catch(() => null)]);
      state.data = { summary, sourcesUrl: sources.url, distance, quality, areas: {}, index: {}, travel, floods, overlays, travelLv: {}, floodLv: {},
                     land: { district: landDistrict.areas }, landIndex: { district: new Map(landDistrict.areas.map((a) => [a.pcode, a])) } };
      levels.forEach((k, i) => { state.data.areas[k] = files[i].areas; state.data.index[k] = new Map(files[i].areas.map((a) => [a.pcode, a])); });
    } catch (error) {
      $('#atlas-status').textContent = T('The access data could not be loaded: ', 'প্রবেশগম্যতার তথ্য লোড হয়নি: ') + error.message;
      $('#atlas-status').classList.add('atlas-error');
      return;
    }
    $('#atlas-status').hidden = true;
    $('#atlas-content').hidden = false;
    state.map = window.AtlasChoropleth.create('access-map', {
      label: (p) => { const a = byPcode(state.level).get(p.pcode); return a ? areaLabel(a, state.level) : p.name || p.shapeName; },
      onSelect: (pcode) => detail(pcode), boundaries: true, defaultBoundaries: ['division'], storageKey: 'shasthopath-access-basemap'
    });
    $('#a-level').addEventListener('change', (e) => showLevel(e.target.value));
    $('#a-basis').addEventListener('change', (e) => { state.basis = e.target.value; showLevel(state.level); });
    $('#a-flood').addEventListener('change', (e) => { state.flood = e.target.value; paint(); });
    $('#a-metric').addEventListener('change', (e) => { state.measure = e.target.value; if (measure().lisa) { state.lisaKey = measure().lisa; lisaList(); } $('#a-flood-wrap').hidden = !(measure().event && state.data.floods); paint(); });
    $('#a-points').addEventListener('change', drawPoints);
    state.map.map.on('zoomend', () => { if ($('#a-points').checked) drawPoints(); });
    $('#a-search').addEventListener('change', (e) => {
      const q = e.target.value.trim().toLowerCase(), name = q.split(' · ')[0], list = listFor(state.level);
      const hit = list.find((a) => areaLabel(a, state.level).toLowerCase() === q) || list.find((a) => a.name.toLowerCase() === name) || list.find((a) => a.name.toLowerCase().includes(name));
      if (hit) state.map.select(hit.pcode, true);
    });
    $('#a-export').addEventListener('click', () => (state.basis === 'land' ? exportLand(state.level) : state.basis === 'travel' || state.basis === 'floods' ? exportTravel(state.level) : exportLevel(state.level)));
    ALL.forEach((k) => $('#d-' + k).addEventListener('click', () => exportLevel(k)));
    $('#g-level').addEventListener('change', inequality);
    $('#s-x').addEventListener('change', social); $('#s-y').addEventListener('change', social);
    staticSections();
    await showLevel(state.level);
    await initFloodMap();
    document.addEventListener('site-language', () => { fillSelects(); paint(); staticSections(); detail(null); if (fstate.map) { floodSelects(); floodPaint(); floodDetail(null); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
