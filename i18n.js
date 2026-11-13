/* Site-wide English / Bangla switch.
   - Static text: an element with data-bn="…" swaps its inner HTML with the
     Bangla text; data-bn-title, data-bn-placeholder, data-bn-aria-label and
     data-bn-content (for <meta>) swap those attributes. Put data-bn only on
     elements whose contents are not filled in by a script.
   - The choice is stored and applied on every page.
   - Pages that already have their own #language handler keep it: this
     script listens to the same button, so both flip together.
   - Page scripts can call SiteI18n.t(en, bn), SiteI18n.number(n, digits) and
     listen for the "site-language" event to redraw dynamic content.
   Load this script last, with defer. */
'use strict';
(() => {
  const KEY = 'shasthopath-language';
  const ATTRS = ['title', 'placeholder', 'aria-label', 'content'];
  const original = new WeakMap();
  let language = 'en';

  const stored = () => { try { return localStorage.getItem(KEY) === 'bn' ? 'bn' : 'en'; } catch { return 'en'; } };
  const store = (value) => { try { localStorage.setItem(KEY, value); } catch { /* private mode */ } };

  function apply() {
    const selector = '[data-bn],' + ATTRS.map((a) => `[data-bn-${a}]`).join(',');
    document.querySelectorAll(selector).forEach((el) => {
      if (!original.has(el)) {
        const saved = { html: el.innerHTML };
        ATTRS.forEach((a) => { if (el.hasAttribute(a)) saved[a] = el.getAttribute(a); });
        original.set(el, saved);
      }
      const saved = original.get(el);
      if (el.hasAttribute('data-bn')) el.innerHTML = language === 'bn' ? el.getAttribute('data-bn') : saved.html;
      ATTRS.forEach((a) => {
        const bn = el.getAttribute(`data-bn-${a}`);
        if (bn !== null) el.setAttribute(a, language === 'bn' ? bn : saved[a] ?? '');
      });
    });
    const titleBn = document.querySelector('meta[name="title-bn"]');
    if (titleBn) {
      if (!original.has(document)) original.set(document, document.title);
      document.title = language === 'bn' ? titleBn.content : original.get(document);
    }
    document.documentElement.lang = language;
    const button = document.getElementById('language');
    if (button) {
      button.textContent = language === 'en' ? 'বাংলা' : 'English';
      button.setAttribute('aria-label', language === 'en' ? 'বাংলায় দেখুন (View in Bangla)' : 'View in English');
    }
    document.dispatchEvent(new CustomEvent('site-language', { detail: { language } }));
  }

  window.SiteI18n = {
    get language() { return language; },
    t: (en, bn) => (language === 'bn' && bn ? bn : en),
    locale: () => (language === 'bn' ? 'bn-BD' : 'en-GB'),
    number: (value, digits = 0) => Number.isFinite(value)
      ? value.toLocaleString(language === 'bn' ? 'bn-BD' : 'en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits })
      : '—',
    digits: (text) => (language === 'bn' ? String(text).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]) : String(text))
  };

  function init() {
    const button = document.getElementById('language');
    if (button) {
      button.addEventListener('click', () => {
        language = language === 'en' ? 'bn' : 'en';
        store(language);
        apply();
      });
    }
    if (stored() === 'bn' && button) button.click();
    else apply();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
