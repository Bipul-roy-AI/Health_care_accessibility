'use strict';
(() => {
  const $ = (s) => document.querySelector(s);
  const en = { source: 'Service source', checked: 'Source checked', reference: 'Reference — official website unavailable at last check', count: 'services', noResults: 'No services match your search.', failed: 'Service contacts could not load. For an immediate emergency, call 999.', updated: 'Directory updated' };
  document.querySelectorAll('[data-i18n]').forEach((e) => { en[e.dataset.i18n] = e.innerText; });
  const bn = { statisticsNav: "পরিসংখ্যান", findCare: 'চিকিৎসা খুঁজুন', overview: 'সারাদেশের চিত্র', helplines: 'হেল্পলাইন', eyebrow: 'বাংলাদেশ · জরুরি সহায়তা', title: 'সঠিক নম্বর।\nপ্রয়োজনের মুহূর্তে।', intro: 'প্রয়োজন অনুযায়ী জাতীয় জরুরি যোগাযোগ ও সহায়তা সেবা।', immediate: 'তাৎক্ষণিক জরুরি প্রয়োজনে', emergencyTitle: 'পুলিশ · ফায়ার সার্ভিস · জরুরি অ্যাম্বুলেন্স সহায়তা', call: 'কল করুন', searchLabel: 'হেল্পলাইন খুঁজুন', category: 'বিভাগ', all: 'সব সেবা', emergency: 'জরুরি সেবা', health: 'স্বাস্থ্য', protection: 'নারী ও শিশু', disaster: 'দুর্যোগের বার্তা', rights: 'অধিকার ও আইনি সহায়তা', public: 'সরকারি সেবা', utilities: 'বিদ্যুৎ ও পরিষেবা', transport: 'পরিবহন', notes: 'সংক্ষিপ্ত নম্বরগুলো বাংলাদেশে কল করার জন্য। সেবার সময়, কলের খরচ ও সাড়া দেওয়ার ব্যবস্থা সংশ্লিষ্ট প্রতিষ্ঠান নির্ধারণ করে। সরকারি ওয়েবসাইট যাচাই করা না গেলে রেফারেন্স হিসেবে চিহ্নিত থাকে।', source: 'সেবার উৎস', checked: 'উৎস যাচাই করা হয়েছে', reference: 'রেফারেন্স — শেষবার সরকারি ওয়েবসাইট পাওয়া যায়নি', count: 'টি সেবা', noResults: 'অনুসন্ধানে কোনো সেবা মেলেনি।', failed: 'যোগাযোগের তথ্য লোড হয়নি। তাৎক্ষণিক জরুরি প্রয়োজনে ৯৯৯ নম্বরে কল করুন।', updated: 'তালিকা হালনাগাদ' };
  let language = 'en', services = [], updated;
  const t = (key) => (language === 'bn' ? bn[key] : en[key]) || en[key] || key;
  const node = (tag, value, className = '') => { const e = document.createElement(tag); e.textContent = value; e.className = className; return e; };
  const digits = (value) => language === 'bn' ? String(value).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]) : String(value);
  function render() {
    const q = $('#helpline-search').value.trim().replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).toLowerCase();
    const category = $('#helpline-category').value;
    const shown = services.filter((s) => (category === 'all' || s.category === category) && [s.number, s.name, s.nameBn, s.description, s.descriptionBn].join(' ').toLowerCase().includes(q));
    const fragment = document.createDocumentFragment();
    for (const service of shown) {
      const article = node('article', '', `helpline-card ${service.category}`); article.dataset.number = service.number;
      article.append(node('span', t(service.category), 'helpline-category'), node('h2', language === 'bn' ? service.nameBn : service.name), node('p', language === 'bn' ? service.descriptionBn : service.description));
      const call = node('a', `${t('call')} ${digits(service.number)}`, 'helpline-call'); call.href = `tel:${service.number}`; article.append(call);
      const source = node('a', `${t('source')} ↗`, 'helpline-source'); source.href = service.sourceURL; source.target = '_blank'; source.rel = 'noopener noreferrer'; article.append(source);
      article.append(node('small', service.sourceStatus === 'checked' ? `${t('checked')}: ${new Date(service.sourceCheckedAt).toLocaleDateString()}` : t('reference'), service.sourceStatus === 'checked' ? 'source-checked' : 'source-reference'));
      fragment.append(article);
    }
    $('#helpline-results').replaceChildren(fragment); $('#helpline-status').textContent = shown.length ? `${digits(shown.length)} ${t('count')}` : t('noResults');
    $('#helpline-updated').textContent = updated ? `${t('updated')}: ${new Date(updated).toLocaleDateString()}` : '';
  }
  $('#helpline-search').addEventListener('input', render); $('#helpline-category').addEventListener('change', render);
  $('#language').addEventListener('click', () => { language = language === 'en' ? 'bn' : 'en'; document.documentElement.lang = language; document.querySelectorAll('[data-i18n]').forEach((e) => { const value = t(e.dataset.i18n); e.replaceChildren(); value.split('\n').forEach((line, i) => { if (i) e.append(document.createElement('br')); e.append(document.createTextNode(line)); }); }); $('#language').textContent = language === 'en' ? 'বাংলা' : 'English'; $('#helpline-search').placeholder = language === 'bn' ? 'সেবা বা নম্বর খুঁজুন…' : 'Search a service or number…'; render(); });
  fetch('./data/helplines.json', { cache: 'no-cache', credentials: 'omit' }).then(async (r) => { if (!r.ok) throw new Error('Unavailable'); const data = await r.json(); if (!Array.isArray(data.services) || !data.services.length || data.services.some((s) => !/^\d{3,5}$/.test(s.number) || !['emergency', 'health', 'protection', 'disaster', 'rights', 'public', 'utilities', 'transport'].includes(s.category) || !s.name || !s.nameBn || !/^https:\/\//.test(s.sourceURL))) throw new Error('Invalid contacts'); services = data.services; updated = data.updatedAt; render(); }).catch(() => { $('#helpline-status').textContent = t('failed'); $('#helpline-status').classList.add('error'); });
})();
