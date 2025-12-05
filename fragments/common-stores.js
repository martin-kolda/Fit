document.addEventListener('alpine:init', () => {
  // Basic i18n/loadData utilities
  if (!window.__fitI18n) {
    window.__fitI18n = {
      defaultLocale: 'cs-CZ',
      fallbackLocale: 'cs-CZ',
      defaultCurrency: 'CZK',
      async loadData(url) {
        const res = await fetch(url, { cache: 'no-store' });
        return res.json();
      },
      resolveConfig() { return null; }
    };
  }

  if (!Alpine.store('i18n')) {
    Alpine.store('i18n', {
      locale: 'cs-CZ',
      resolveConfig(key, { fallback = null } = {}) { return fallback; }
    });
  }

  if (!Alpine.store('appConfig')) {
    Alpine.store('appConfig', {
      showMenuChevrons: true,
      get(key) { return this[key]; }
    });
  }

  // helper used by fragments
  window.is = (route) => route === 'map';
});
