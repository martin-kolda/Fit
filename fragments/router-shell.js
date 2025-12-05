const ROUTE_CONFIG = {
  map: {
    path: './pages/map.html',
    module: './pages/map.js'
  }
};

export function routerShell() {
  return {
    current: 'map',
    viewEl: null,
    init() {
      this.viewEl = this.$refs.view;
      window.addEventListener('hashchange', () => this.onHashChange());
      this.onHashChange();
    },
    onHashChange() {
      const hash = location.hash.replace(/^#\/?/, '') || 'map';
      const route = hash.split('/')[0];
      this.navigate(route);
    },
    async navigate(route) {
      if (!ROUTE_CONFIG[route]) {
        console.warn('Unknown route', route);
        return;
      }
      this.current = route;
      const frag = await fetch(ROUTE_CONFIG[route].path, { cache: 'no-store' }).then(r => r.text());
      this.viewEl.innerHTML = frag;
      if (ROUTE_CONFIG[route].module) {
        await import(ROUTE_CONFIG[route].module);
      }
      history.replaceState(null, '', `#/${route}`);
    }
  };
}

window.routerShell = routerShell;
