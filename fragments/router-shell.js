const ROUTE_CONFIG = {
  map: {
    path: './fragments/map-view.html',
    module: './fragments/map-view.js'
  }
};

function createRouter() {
  const viewEl = document.querySelector('[data-router-view]');
  return {
    current: null,
    async navigate(route) {
      if (!ROUTE_CONFIG[route] || !viewEl) return;
      this.current = route;
      const frag = await fetch(ROUTE_CONFIG[route].path, { cache: 'no-store' }).then(r => r.text());
      viewEl.innerHTML = frag;
      if (ROUTE_CONFIG[route].module) {
        await import(ROUTE_CONFIG[route].module);
      }
      history.replaceState(null, '', `#/${route}`);
    },
    init() {
      const hash = location.hash.replace(/^#\/?/, '') || 'map';
      const route = hash.split('/')[0];
      this.navigate(route);
      window.addEventListener('hashchange', () => {
        const h = location.hash.replace(/^#\/?/, '') || 'map';
        this.navigate(h.split('/')[0]);
      });
    }
  };
}

window.appRouter = createRouter();
window.appRouter.init();
