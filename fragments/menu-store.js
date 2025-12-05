// HAMBURGER MENU  
  Alpine.store('menu', {
    // state
    open: false,
    menus: [],
    current: null,     // active menu object
    stack: [],         // for back navigation
    slideDir: 1,       // 1 forward, -1 back (animation)
    viewKey: 0,        // bump to retrigger pane animation
    loading: false,
    error: null,
    chevronsAlwaysOn: true,
    _chevronListener: null,

    _currentLocale: null,
    async load(url = 'data/menus.json') {
      const locale = (Alpine.store('i18n')?.locale) || window.__fitI18n.defaultLocale;
      if (this._currentLocale && this._currentLocale !== locale) {
        this.menus = [];
      }
      if (this.menus.length) return;
      this.loading = true; this.error = null;
      try {
        const raw = await window.__fitI18n.loadData(url, { locale });
        this.menus = Array.isArray(raw) ? this.normalize(raw) : [];
        this._currentLocale = locale;
        window.dispatchEvent(new CustomEvent('fit:menu-loaded', { detail: { locale } }));
      } catch (e) {
        console.error('menu load failed', e);
        this.error = 'Nepodařilo se načíst menu.';
      } finally {
        this.loading = false;
      }
    },

    refreshForLocale() {
      this.menus = [];
      this.load();
    },
    setupChevronConfig() {
      this.applyChevronConfig();
      if (this._chevronListener) {
        window.removeEventListener('fit:config-change', this._chevronListener);
      }
      this._chevronListener = (event) => {
        if (!event || event.detail?.key !== 'showMenuChevrons') return;
        this.applyChevronConfig(event.detail.value);
      };
      window.addEventListener('fit:config-change', this._chevronListener);
    },
    applyChevronConfig(value) {
      let raw = value;
      if (raw == null) {
        const cfg = Alpine.store('appConfig');
        raw = cfg?.get ? cfg.get('showMenuChevrons') : cfg?.showMenuChevrons;
      }
      if (raw == null) raw = true;
      const normalized = !!raw;
      this.chevronsAlwaysOn = normalized;
    },

    // Accepts either my camelCase schema or your snake_case + single-string icon
    normalize(arr){
      const normItem = (it = {}) => {
        const out = { ...it };

        // snake_case -> camelCase
        if (out.link_to_menu_id != null) out.linkMenuId = out.link_to_menu_id;
        if (out.router_link) out.route = out.router_link;
        if (out.row_type) out.rowType = out.row_type;

        // icon: "fa-regular capsules" -> { iconSet:'fa-regular', icon:'capsules' }
        if (!out.iconSet && typeof out.icon === 'string' && out.icon.includes(' ')) {
          const [set, name] = out.icon.split(/\s+/, 2);
          out.iconSet = set;
          out.icon = name;
        }

        return out;
      };

      return (arr || []).map(m => ({
        id: m.id,
        parentId: m.parentId ?? m.parent ?? null,
        name: m.name,
        banner: !!m.banner,
        bannerProductId: (m.bannerProductId != null && !Number.isNaN(Number(m.bannerProductId)))
          ? Number(m.bannerProductId)
          : null,
        footer_position: (m.footer_position != null && !Number.isNaN(Number(m.footer_position)))
          ? Number(m.footer_position)
          : null,
        // some menus have root items, some only sections – handle both
        items: Array.isArray(m.items) ? m.items.map(normItem) : [],
        sections: Array.isArray(m.sections)
          ? m.sections.map(s => ({
              name: s.name ?? null,
              tag: s.tag ?? null,
              type: s.type ?? null,     // 'language' / 'loyalty' / undefined
              items: Array.isArray(s.items) ? s.items.map(normItem) : []
            }))
          : []
      }));
    },

    // helpers
    byId(id){ return this.menus.find(m => Number(m.id) === Number(id)); },
    canGoBack(){ return this.stack.length > 0 || (this.current && this.current.parentId != null); },

    // open from anywhere; default id by screen (lg desktop -> 2, mobile -> 1)
    async openAt(id = null) {
      await this.load();
      if (id == null) {
        id = window.matchMedia('(min-width: 1024px)').matches ? 2 : 1;
      }
      this.stack = [];
      this.slideDir = 1;
      this.current = this.byId(id) || null;
      this.viewKey++;
      this.open = true;
      document.documentElement.style.overflow = 'hidden'; // lock scroll
    },

    close() {
      this.open = false;
      this.stack = [];
      this.current = null;
      document.documentElement.style.overflow = '';
    },

    goToMenu(id) {
      if (!id) return;
      if (!this.current || Number(this.current.id) !== Number(id)) {
        if (this.current) this.stack.push(this.current.id);
        this.slideDir = 1;
        this.current = this.byId(id) || this.current;
        this.viewKey++;
      }
    },

    back() {
      if (!this.canGoBack()) { this.close(); return; }
      const prevId = this.stack.pop() ?? this.current?.parentId;
      if (prevId != null) {
        this.slideDir = -1;
        this.current = this.byId(prevId) || this.current;
        this.viewKey++;
      }
    },
    shouldShowChevron(item) {
      if (this.chevronsAlwaysOn) return true;
      return item?.linkMenuId != null;
    },

    // click handlers
    triggerAction(item) {
      const raw = item?.action;
      const action = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
      if (!action) return false;

      if (['account', 'auth', 'auth-modal', 'open-auth', 'login'].includes(action)) {
        const authStore = Alpine.store('auth');
        // close menu before showing modal / navigating
        this.close();
        if (authStore?.handleAccountClick) {
          requestAnimationFrame(() => authStore.handleAccountClick());
        }
        return true;
      }

      if (['contact', 'contacts', 'support', 'phone'].includes(action)) {
        const contactsStore = Alpine.store('contacts');
        if (!contactsStore) return false;
        this.close();
        const open = () => contactsStore.openModal?.();
        const ensure = contactsStore.ensureLoaded?.();
        if (ensure && typeof ensure.then === 'function') {
          ensure.finally(() => requestAnimationFrame(open));
        } else {
          requestAnimationFrame(open);
        }
        return true;
      }

      return false;
    },
    onItemClick(item) {
      if (item.linkMenuId != null) {
        this.goToMenu(item.linkMenuId);
        return;
      }
      if (this.triggerAction(item)) {
        return;
      }
      if (item.route) {
        window.routerShell ? routerShell().navigate('' + String(item.route).replace(/^#?\/?/, '');
        this.close();
        return;
      }
      // no link/route: no-op
    }
  }),
Alpine.store('menu')?.setupChevronConfig?.();
