/* Light / dark theme. Loaded in <head> so the page never flashes the wrong colours.
   Follows the device setting until the visitor picks a theme with the header button;
   the choice is kept in localStorage. Pages redraw dynamic graphics on "site-theme". */
'use strict';
(() => {
  const KEY = 'shasthopath-theme';
  const root = document.documentElement;
  const read = () => { try { return localStorage.getItem(KEY); } catch (_) { return null; } };
  const write = (v) => { try { localStorage.setItem(KEY, v); } catch (_) { /* storage blocked */ } };
  const query = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const current = () => { const saved = read(); return saved === 'dark' || saved === 'light' ? saved : (query && query.matches ? 'dark' : 'light'); };
  const bn = () => root.lang === 'bn';

  function label() {
    const button = document.getElementById('theme');
    if (!button) return;
    const dark = current() === 'dark';
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', dark ? (bn() ? 'হালকা রঙে দেখুন' : 'Switch to light mode') : (bn() ? 'অন্ধকার মোডে দেখুন' : 'Switch to dark mode'));
    button.title = button.getAttribute('aria-label');
    button.querySelector('.theme-icon').textContent = dark ? '☀' : '☾';
    button.querySelector('.theme-label').textContent = dark ? (bn() ? 'হালকা' : 'Light') : (bn() ? 'অন্ধকার' : 'Dark');
  }
  function apply(notify) {
    const theme = current();
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    label();
    if (notify) document.dispatchEvent(new CustomEvent('site-theme', { detail: { theme } }));
  }
  function set(theme) { write(theme); apply(true); }

  apply(false);
  if (query && query.addEventListener) query.addEventListener('change', () => { if (!read()) apply(true); });

  function addButton() {
    if (document.getElementById('theme')) return;
    const language = document.getElementById('language');
    const host = language ? language.parentElement : document.querySelector('.header nav');
    if (!host) return;
    const button = document.createElement('button');
    button.id = 'theme'; button.type = 'button'; button.className = 'language theme-toggle';
    button.innerHTML = '<span class="theme-icon" aria-hidden="true"></span><span class="theme-label"></span>';
    button.addEventListener('click', () => set(current() === 'dark' ? 'light' : 'dark'));
    host.insertBefore(button, language || null);
    label();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();
  document.addEventListener('site-language', label);
  window.SiteTheme = { get: current, set, isDark: () => current() === 'dark' };
})();
