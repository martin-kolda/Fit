const storeAppDefinition = () => ({

// persisted prefs
locale: Alpine.$persist('cs-CZ').as('locale'),

// state
products: [],
categories: [],
forms: [],
consumersList: [],
navCategories: [],   
infoLinks: [],       
categoriesGrid: [],
productLists: [],
productListMap: {},
defaultProductListKey: null,
activeProductListKey: null,
activeProductListMeta: null,
searchProducts: [],
_searchListCache: {},
_searchListPromises: {},
_listDataCache: {},
_listDataPromises: {},

search: '',
selectedCategory: '',
selectedForm: '',
selectedConsumers: [],            // multi
onlyInStock: false,
availabilityFilter: 'all',
benefitOnly: false,
onlyDiscounted: false,
priceBounds: { min: 0, max: 0 },
priceMin: null,
priceMax: null,
priceQuickRanges: [],
activePriceRangeIndex: null,

sortOrder: '',
isLoading: true,
_filterTimer: null,
page: 1,
pageSize: 8,
showCount: 8,
skeletonBaseCount: 8,
_initialDataLoaded: false,

// router
route: 'products',
params: {},
topCats: [],
topBrands: [],
benefits: [],

// product detail state
detail: null,
brands: [],
blogPosts: [],

// checkout form state
contactFormSchema: [],
contactFormSections: [],
contactFormFieldMap: {},
contactFormValues: {},
contactFormErrors: {},
contactFormTouched: {},
contactFormGroups: {},
contactFormGroupToggles: {},
contactFormGroupMembers: {},
addressAutocompleteOptions: [],
addressAutocompleteLoaded: false,
addressFormLoaded: false,
addressFormLoading: false,
addressFormSubmitAttempted: false,
addressFormMessage: '',
checkoutFormData: null,
checkoutDeliveryMeta: { ours: null, partner: null },
checkoutPaymentMeta: { ours: null, partner: null },
checkoutReview: null,
checkoutConsents: {
  terms: false,
  privacy: false,
  marketing: false
},
reviewValidationErrors: [],
suppressCartRedirect: false,
addressPrefilledFromAccount: false,
paygateModal: {
  open: false,
  step: 'intro',
  amount: 0,
  timer: null,
  variant: 'online'
},



// ---- lifecycle ----
init() {
  // 1) Router: support BOTH hash routes & path (no-hash) homepage
  window.addEventListener('hashchange', () => this._onRoute());
  window.addEventListener('popstate',   () => this._onRoute()); // for back/forward when at "/"
  this._onRoute();

  // 2) Watchers -> reset paging + loader delay when anything changes
  const trigger = () => {
    this.page = 1;
    this.showCount = this.pageSize;
    this.scheduleDisplayDelay();
  };
  this.$watch('search', trigger);
  this.$watch('selectedCategory', trigger);
  this.$watch('selectedForm', trigger);
  this.$watch('selectedConsumers', trigger);
  this.$watch('onlyInStock', trigger);
  this.$watch('availabilityFilter', trigger);
  this.$watch('benefitOnly', trigger);
  this.$watch('onlyDiscounted', trigger);
  this.$watch('sortOrder', trigger);
  this.$watch('priceMin', trigger);
  this.$watch('priceMax', trigger);

  // keep page in range if results shrink
  this.$watch(() => this.filteredProducts().length, () => {
    this.page = Math.min(this.page, this.totalPages());
  });

  this.$watch(() => Alpine.store('cart')?.distinctCount?.(), (count) => {
    const hasItems = Number(count) > 0;
    if (!this.suppressCartRedirect && !hasItems && ['delivery-payment', 'addresses', 'purchase-review'].includes(this.route)) {
      this.redirectToCartIfEmpty();
    }
  });

  if (typeof window !== 'undefined') {
    window.__fitAppStore = this;
  }

  this._onLocaleChange = () => {
    this.reloadLocalizedContent();
  };
  window.addEventListener('fit:locale-change', this._onLocaleChange);
  this._onResize = () => this.updateResponsivePagination();
  window.addEventListener('resize', this._onResize);
  this.updateResponsivePagination(true);
  if (this.$el) {
    this.$el.addEventListener('alpine:destroy', () => {
      if (this._onLocaleChange) {
        window.removeEventListener('fit:locale-change', this._onLocaleChange);
        this._onLocaleChange = null;
      }
      if (this._onResize) {
        window.removeEventListener('resize', this._onResize);
        this._onResize = null;
      }
    });
  }

  // 3) Load data
  const initialListSlug = this.params?.listSlug ?? null;
  this.loadData(initialListSlug).then(() => {
    // set initial catalog once data exists
    Alpine.store('precart').setCatalog(this.pagedProducts());
  });

  this.$watch(
    () => (this.route === 'products')
      ? (this.params?.listSlug || '__default__')
      : '__other__',
    (next, prev) => {
      if (!this._initialDataLoaded) return;
      if (this.route !== 'products') return;
      if (next === prev) return;
      this.loadData(this.params?.listSlug ?? null);
    }
  );

  Alpine.store('cart').init?.();
  Alpine.store('legal').init();

  const refreshCatalog = () => Alpine.store('precart').setCatalog(this.pagedProducts());
  this.$watch('page', refreshCatalog);
  this.$watch('showCount', refreshCatalog);
  this.$watch(() => this.filteredProducts().length, refreshCatalog);
  this.$watch('search', refreshCatalog);
  this.$watch('selectedCategory', refreshCatalog);
  this.$watch('selectedForm', refreshCatalog);
  this.$watch('selectedConsumers', refreshCatalog);
  this.$watch('onlyInStock', refreshCatalog);
  this.$watch('availabilityFilter', refreshCatalog);
  this.$watch('benefitOnly', refreshCatalog);
  this.$watch('onlyDiscounted', refreshCatalog);
  this.$watch('sortOrder', refreshCatalog);
  this.$watch('priceMin', refreshCatalog);
  this.$watch('priceMax', refreshCatalog);

},
// Load brands.json (call from loadData or once on home)
async loadBrands() {
  try {
    const r = await fetch('data/brands.json');
    const arr = await r.json();
    this.brands = Array.isArray(arr) ? arr.filter(b => b?.name && b?.logo) : [];
  } catch (e) {
    console.warn('brands.json failed', e);
    this.brands = [];
  }
},

slugify(str = '') {
  return String(str || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || '';
},
normalizeGridTile(tile = {}) {
  const label = String(tile.label || '').trim();
  const slug = String(tile.slug || '').trim() || this.slugify(label || tile.image || '');
  return {
    image: String(tile.image || '').trim(),
    label,
    background: String(tile.background || 'bg-base-200').trim(),
    slug
  };
},
setCategoriesGridFrom(source) {
  if (!Array.isArray(source)) {
    this.categoriesGrid = [];
    return;
  }
  const slugCount = new Map();
  this.categoriesGrid = source
    .map(tile => this.normalizeGridTile(tile))
    .filter(item => item.image && item.label)
    .map(item => {
      let slug = item.slug || this.slugify(item.label || item.image);
      if (!slug) slug = Math.random().toString(36).slice(2, 8);
      if (slugCount.has(slug)) {
        const next = slugCount.get(slug) + 1;
        slugCount.set(slug, next);
        slug = `${slug}-${next}`;
      } else {
        slugCount.set(slug, 1);
      }
      return { ...item, slug };
    });
},
async reloadLocalizedContent() {
  try {
    const [categoriesData, linksData, gridData] = await Promise.all([
      window.__fitI18n.loadData('data/categories.json'),
      window.__fitI18n.loadData('data/links.json'),
      window.__fitI18n.loadData('data/categories-grid.json')
    ]);
    this.navCategories = Array.isArray(categoriesData) ? categoriesData : [];
    this.infoLinks = Array.isArray(linksData) ? linksData : [];
    this.setCategoriesGridFrom(Array.isArray(gridData) ? gridData : []);
  } catch (err) {
    console.warn('reloadLocalizedContent failed', err);
  }
  await this.loadBlog();
},

async loadBlog() {
  try {
    const arr = await window.__fitI18n.loadData('data/blog.json');
    this.blogPosts = Array.isArray(arr)
      ? arr.filter(post => post?.title && post?.image)
      : [];
  } catch (e) {
    console.warn('blog.json failed', e);
    this.blogPosts = [];
  }
  return this.blogPosts;
},

blogFeatured(count = 6) {
  return Array.isArray(this.blogPosts) ? this.blogPosts.slice(0, count) : [];
},
blogLink(post) {
  const url = String(post?.link || '').trim();
  return url || '#';
},
readingTimeLabel(post) {
  const minutes = Number(post?.minutes_to_read);
  if (!Number.isFinite(minutes) || minutes <= 0) return 'Čtení';
  const abs = Math.round(minutes);
  const forms = ['minuta', 'minuty', 'minut'];
  const form = abs === 1 ? forms[0] : (abs >= 2 && abs <= 4 ? forms[1] : forms[2]);
  return `${abs} ${form} čtení`;
},
blogExcerpt(post, limit = 220) {
  const text = String(post?.perex || '').trim();
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
},

// Optional: call in loadData() after products/aux files load:
/// await this.loadBrands();

// Brand link (adapt later if you add brand filtering in router)
brandHref(b) { return this.link('products'); },

// Badge helpers (supports e.g. "Až -31%" or "3za2")
badgeText(b) {
  const t = String(b?.badge || '').trim();
  if (!t) return '';
  if (t.toLowerCase() === '3za2') return '3 za 2';
  return t;
},
badgeClass(b) {
  const t = String(b?.badge || '').toLowerCase();
  if (t === '3za2') return 'badge-warning';
  // default discount style
  return 'badge-error text-white';
},

// Per-key shuffle cache for brands
_brandCacheMap: {},   // { [key]: shuffledArray }
brandsShuffledFor(key, count = 18) {
  if (!key) return [];
  if (!Array.isArray(this._brandCacheMap[key])) {
    const src = Array.isArray(this.brands) ? this.brands : [];
    if (src.length === 0) return [];
    const arr = src.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    this._brandCacheMap[key] = arr;
  }
  return this._brandCacheMap[key].slice(0, count);
},
async loadData(listSlug = null) {
  this.isLoading = true;
  try {
    await this.ensureProductLists();
    const list = this.resolveProductList(listSlug);
    const listChanged = this.activeProductListKey !== list?.key;
    if (listChanged) {
      this.clearFilters();
      this.page = 1;
      this.showCount = this.pageSize;
    }

    const res = await fetch(list.dataSource, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load ${list.dataSource}: ${res.status}`);
    const payload = await res.json();
    this.products = Array.isArray(payload) ? payload : [];
    this.activeProductListKey = list.key;
    this.activeProductListMeta = this.buildProductListMeta(list);
    this._searchListCache[list.key] = this.products.slice();

    // facets (unchanged)
    this.categories = [...new Set(this.products.map(p => p.category).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'cs'));
    this.forms = [...new Set(this.products.map(p => (p.form || '').trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'cs'));
    const cons = new Set();
    this.products.forEach(p => (Array.isArray(p.consumers) ? p.consumers : []).forEach(c => cons.add(c)));
    this.consumersList = [...cons].sort((a,b)=>a.localeCompare(b,'cs'));

    const priceValues = this.products
      .map(p => Number(p.discounted_price ?? p.price ?? 0))
      .filter(v => Number.isFinite(v) && v >= 0);
    if (priceValues.length) {
      const rawMin = Math.min(...priceValues);
      const rawMax = Math.max(...priceValues);
      const normalizedMax = Math.ceil(rawMax / 10) * 10;
      this.priceBounds = { min: 0, max: normalizedMax };
      this.priceMin = 0;
      this.priceMax = normalizedMax;
      this.priceQuickRanges = this.buildPriceQuickRanges(rawMin, rawMax, normalizedMax);
    } else {
      this.priceBounds = { min: 0, max: 0 };
      this.priceMin = 0;
      this.priceMax = 0;
      this.priceQuickRanges = [];
    }

    // 👉 optional data
    const categoriesJson = await window.__fitI18n.loadData('data/categories.json');
    this.navCategories = Array.isArray(categoriesJson) ? categoriesJson : [];
    const [linksData, gridData] = await Promise.all([
      window.__fitI18n.loadData('data/links.json'),
      window.__fitI18n.loadData('data/categories-grid.json')
    ]);
    this.infoLinks = Array.isArray(linksData) ? linksData : [];
    this.setCategoriesGridFrom(Array.isArray(gridData) ? gridData : []);

    // ---- HOMEPAGE derived data (lightweight heuristics) ----
    // pick top categories by product count
    const counts = {};
    this.products.forEach(p => { if (p.category) counts[p.category] = (counts[p.category] || 0) + 1; });
    this.topCats = Object.entries(counts)
      .sort((a,b)=>b[1]-a[1])
      .slice(0, 6)
      .map(([name]) => ({ name, image: this.categoryImage(name) }));

    // Top brands (from product.brand if present)
    const brandSet = new Set(this.products.map(p => (p.brand || '').trim()).filter(Boolean));
    this.topBrands = Array.from(brandSet).slice(0, 10).map(name => ({ name, logo: this.brandLogo(name) }));
    await this.loadBrands();
    await this.loadBlog();
    this.refreshSearchProducts();
    this.preloadSearchLists(list.key);

  } catch (e) {
    console.error('Failed to load product list', e);
    try {
      const categoriesJson = await window.__fitI18n.loadData('data/categories.json');
      this.navCategories = Array.isArray(categoriesJson) ? categoriesJson : [];
      const [linksData, gridData] = await Promise.all([
        window.__fitI18n.loadData('data/links.json'),
        window.__fitI18n.loadData('data/categories-grid.json')
      ]);
      this.infoLinks = Array.isArray(linksData) ? linksData : [];
      this.setCategoriesGridFrom(Array.isArray(gridData) ? gridData : []);
      await this.loadBlog();
    } catch {}
  } finally {
    this._initialDataLoaded = true;
    this.isLoading = false;
    this.refreshSearchProducts();
  }
},

updateResponsivePagination(force = false) {
  const nextSize = this._responsivePageSize();
  const prevSize = this.pageSize;
  if (!force && nextSize === prevSize) return;
  this.pageSize = nextSize;
  this.skeletonBaseCount = nextSize;
  if (force || this.page === 1) {
    this.showCount = nextSize;
  } else if (this.showCount < nextSize) {
    this.showCount = nextSize;
  } else if (prevSize !== nextSize && prevSize > 0) {
    const pagesCovered = Math.ceil(this.showCount / prevSize);
    this.showCount = pagesCovered * nextSize;
  }
},
_responsivePageSize() {
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  if (width >= 1536) return 10;      // 5 cols * 2 rows
  if (width >= 1280) return 8;       // 4 cols * 2 rows
  if (width >= 1024) return 6;       // 3 cols * 2 rows
  if (width >= 640)  return 4;       // 2 cols * 2 rows
  return 10;                         // mobile: show 10 items per page
},
skeletonPlaceholderCount() {
  return Math.max(this.skeletonBaseCount || this.pageSize || 4, 4);
},
_isCompactPagination() {
  if (typeof window === 'undefined') return false;
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  return width < 640;
},

// ---- scroll manager ----
_scrollStore: { home: 0, products: 0 },
_saveScroll(key = this.route) {
  this._scrollStore[key] = window.scrollY || window.pageYOffset || 0;
},
_restoreScroll(key = this.route) {
  const y = this._scrollStore[key] ?? 0;
  const restore = () => {
    if (this.isLoading) { requestAnimationFrame(restore); return; }
    setTimeout(() => { window.scrollTo({ top: y, left: 0, behavior: 'auto' }); }, 0);
  };
  requestAnimationFrame(restore);
},
_scrollToTopSoon() {
  requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
},

// ---- misc helpers ----
isDrMaxWomanEnabled() {
  const configStore = Alpine.store('appConfig');
  return !!configStore?.drMaxWomanPromo;
},
maxGradientClass() {
  return this.isDrMaxWomanEnabled()
    ? 'max-gradient max-gradient-woman'
    : 'max-gradient';
},
maxGradientVClass() {
  return this.isDrMaxWomanEnabled()
    ? 'max-gradient-v max-gradient-v-woman'
    : 'max-gradient-v';
},
truncate(str, max = 34) {
  const s = String(str || '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
},
consumersLabel() {
  if (!this.selectedConsumers.length) {
    return window.t('routes.products.filters.sections.consumers.title', 'Vhodné pro');
  }
  return this.truncate(this.selectedConsumers.join(', '));
},
optionsLabel() {
  const on = [];
  if (this.onlyInStock)     on.push(window.t('routes.products.quickFilters.inStock', 'Pouze skladem'));
  if (this.isAvailabilityFiltered()) {
    const label = this.availabilityFilterLabel();
    if (label) on.push(label);
  }
  if (this.benefitOnly)     on.push(window.t('routes.products.quickFilters.benefit', 'Lze platit benefity'));
  if (this.onlyDiscounted)  on.push(window.t('routes.products.quickFilters.discounted', 'Produkty v akci'));
  if (!on.length) {
    return window.t('routes.products.quickFilters.summary.default', 'Možnosti');
  }
  return this.truncate(on.join(', '));
},
buildPriceQuickRanges(_rawMin, rawMax, normalizedMax) {
  const maxBound = Math.ceil(Number(normalizedMax) || 0);
  if (!Number.isFinite(maxBound) || maxBound <= 0) return [];
  const segments = 4;
  const step = Math.max(10, Math.ceil(maxBound / segments / 10) * 10);
  const values = [];
  for (let i = 1; i <= segments; i++) {
    const candidate = Math.min(maxBound, step * i);
    if (!Number.isFinite(candidate) || candidate <= 0) continue;
    if (!values.includes(candidate)) values.push(candidate);
    if (candidate >= maxBound) break;
  }
  return values;
},
_formatPriceRangeLabel(minValue, maxValue) {
  if (!this.priceBounds) return '';
  const minBound = Number(this.priceBounds.min ?? 0);
  const maxBound = Number(this.priceBounds.max ?? 0);
  if (!Number.isFinite(minBound) || !Number.isFinite(maxBound)) return '';
  const min = Number.isFinite(Number(minValue)) ? Number(minValue) : minBound;
  const max = Number.isFinite(Number(maxValue)) ? Number(maxValue) : maxBound;
  const fmt = v => this._formatCurrencyValue(Math.max(0, v));
  const hasMin = min > minBound;
  const hasMax = max < maxBound;
  if (hasMin && hasMax) {
    return window.t('routes.products.filters.sections.price.range.between', '{min} – {max}', {
      min: fmt(min),
      max: fmt(max)
    });
  }
  if (hasMin) {
    return window.t('routes.products.filters.sections.price.range.from', 'Od {value}', {
      value: fmt(min)
    });
  }
  if (hasMax) {
    return window.t('routes.products.filters.sections.price.range.to', 'Do {value}', {
      value: fmt(max)
    });
  }
  return window.t('routes.products.filters.sections.price.range.full', '{min} – {max}', {
    min: fmt(minBound),
    max: fmt(maxBound)
  });
},
partnerTimeline(currentStepId = 'order_forwarded_to_partner') {
  const flowId = 'partner_home_delivery_pay_online';
  const steps = this.flowSteps(flowId);
  if (!steps.length) return [];
  const vars = { ...(this.order?.vars || {}) };
  const baseMeta = this.order?.stepMeta || {};
  const currentIdx = Math.max(steps.indexOf(currentStepId), 0);
  const refTs = baseMeta.order_acceptation?.timestamp || this.order?.createdAt || new Date().toISOString();
  const refDate = refTs ? new Date(refTs).getTime() : Date.now();
  return steps.map((stepId, index) => {
    const template = this.steps[stepId] || {};
    let state = 'future';
    if (index < currentIdx) state = 'past';
    else if (index === currentIdx) state = 'now';
    const headlineTpl = this.templateForState(template, state, 'headline')
      || this.templateForState(template, 'past', 'headline')
      || this.templateForState(template, 'now', 'headline')
      || this.templateForState(template, 'future', 'headline');
    const descriptionTpl = this.templateForState(template, state, 'description') || '';
    let timestampValue = baseMeta[stepId]?.timestamp || null;
    if (!timestampValue && state !== 'future') {
      const offset = (currentIdx - index) * 45 * 60 * 1000;
      timestampValue = new Date(refDate - offset).toISOString();
    }
    return {
      id: stepId,
      state,
      headline: this.plainText(headlineTpl, vars),
      description: this.richText(descriptionTpl, vars),
      timestamp: this.formatTimestamp(timestampValue)
    };
  });
},
priceUpToLabel(maxValue) {
  if (!Number.isFinite(Number(maxValue))) return '';
  return window.t('routes.products.filters.sections.price.range.to', 'Do {value}', {
    value: this._formatCurrencyValue(Math.max(0, Number(maxValue)))
  });
},
priceFilterChipLabel() {
  if (this.activePriceRangeIndex !== null) {
    const maxVal = this.priceQuickRanges?.[this.activePriceRangeIndex];
    if (Number.isFinite(Number(maxVal))) return this.priceUpToLabel(maxVal);
  }
  if (!this._priceRangeActive()) return '';
  return this._formatPriceRangeLabel(this.priceMin, this.priceMax);
},
_formatCurrencyValue(value) {
  const num = Number(value ?? 0);
  return window.__fitMoney.format(num, { fromCurrency: 'CZK' });
},

// ---- homepage helpers (images/logos; adapt paths as needed) ----
categoryImage(name) {
  // prefer categories.json image if present
  const c = (this.navCategories || []).find(c => (c.name || c.title) === name);
  return c?.image || `./images/categories/${encodeURIComponent(name)}.webp`;
},
brandLogo(name) {
  // try local logo by brand name
  return `./images/brands/${encodeURIComponent(name)}.svg`;
},

// ---- product picks for home ----
topProducts(limit = 12) {
  // naive "featured": in stock & discounted first
  const list = [...this.products];
  list.sort((a,b)=>{
    const ad = (b.discount || 0) - (a.discount || 0);
    if (ad !== 0) return ad;
    return (b.inStock ? 1:0) - (a.inStock ? 1:0);
  });
  return list.slice(0, limit);
},
productsByCategory(cat, limit = 10) {
  return this.products.filter(p => p.category === cat).slice(0, limit);
},

// link helper router
link(name, params = {}) {
  if (name === 'home')    return '/';
  if (name === 'products') {
    const target = params?.listSlug ?? params?.slug ?? params?.key ?? null;
    return target ? this.productListRoute(target) : this.defaultProductListHash();
  }
  if (name === 'product') return `#/product/${params.id}${params.tab ? '/' + params.tab : ''}`;
  if (name === 'cart')    return '#/cart';
  if (name === 'config')  return '#/config';
  if (name === 'delivery-payment') return '#/delivery-payment';
  if (name === 'addresses') return '#/addresses';
  if (name === 'purchase-review') return '#/purchase-review';
  if (name === 'active-order') return '#/active-order';
  if (name === 'map')     return '#/map';
  if (name === 'my-account')     return '#/my-account';
  if (name === 'my-saved')     return '#/my-saved';
  return '#/products';
},

// --- Scroll indicators (no nested x-data) ---
tpShowLeft: false,
tpShowRight: false,
tpScrolled: false,
initStripe(el, leftKey = 'tpShowLeft', rightKey = 'tpShowRight') {
  const update = () => {
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    this[leftKey]  = scrollLeft > 4;
    this[rightKey] = scrollLeft + clientWidth < scrollWidth - 4;
  };
  this.$nextTick(() => {
    update();
    el?.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    el && ro.observe(el);
    window.addEventListener('orientationchange', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
  });
},

async ensureProductLists() {
  if (Array.isArray(this.productLists) && this.productLists.length) {
    return this.productLists;
  }
  try {
    const res = await fetch('data/product-lists.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = await res.json();
    const lists = Array.isArray(arr) && arr.length
      ? arr.map((item, idx) => this.normalizeProductList(item, idx))
      : [this.normalizeProductList(this.fallbackProductList(), 0)];
    this.setProductLists(lists);
  } catch (e) {
    console.warn('product-lists.json load failed', e);
    const fallback = this.normalizeProductList(this.fallbackProductList(), 0);
    this.setProductLists([fallback]);
  }
  return this.productLists;
},
setProductLists(lists = []) {
  this.productLists = lists;
  this.productListMap = {};
  const assign = (key, list) => {
    if (!key) return;
    this.productListMap[String(key).toLowerCase()] = list;
  };
  lists.forEach(list => {
    assign(list.key, list);
    assign(list.routeParam, list);
    (list.routeKeys || []).forEach(k => assign(k, list));
  });
  const def = lists.find(l => l.default) || lists[0] || null;
  this.defaultProductListKey = def?.key || null;
},
fallbackProductList() {
  return {
    id: 3,
    slug: 'zdravi-a-leky',
    title: 'Zdraví a léky',
    dataSource: 'data/products.json',
    breadcrumbs: [
      { label: this.homeBreadcrumbLabel(), route: 'home' },
      { label: 'Zdraví a léky' }
    ],
    categoryHeading: 'Inspirace',
    descriptionHeading: 'Zdraví a léky',
    description: 'V kategorii Zdraví a léky naleznete volně prodejné léčivé přípravky, které pomáhají při různých obtížích. Jsou to například léky proti bolesti, při rýmě či kašli, na zvýšenou teplotu nebo při chřipce a nachlazení. Léčbu těmito přípravky zvládnete sami doma. V případě opakujících se nebo déle přetrvávajících obtíží je vždy na místě vyhledat pomoc lékaře. O vhodném léku se nejprve poraďte s lékárníkem.',
    search: { include: true, label: 'Zdraví a léky', preload: false },
    default: true
  };
},
normalizeProductList(raw = {}, idx = 0) {
  const title = String(raw.title || raw.name || 'Produkty').trim() || 'Produkty';
  const slugSeed = raw.slug || title;
  const slug = this.slugify(slugSeed);
  const idStr = raw.id != null ? String(raw.id) : '';
  const key = slug || (idStr ? `id-${idStr}` : `list-${idx}`);
  const aliasValues = Array.isArray(raw.aliases) ? raw.aliases : [];
  const routeKeys = Array.from(new Set(
    [slug, idStr, ...aliasValues]
      .map(val => String(val || '').trim().toLowerCase())
      .filter(Boolean)
  ));
  if (!routeKeys.length) routeKeys.push(key.toLowerCase());
  const breadcrumbs = this.normalizeBreadcrumbArray(raw.breadcrumbs, title);
  return {
    id: raw.id ?? null,
    key,
    slug,
    routeParam: slug || idStr || key,
    routeKeys,
    dataSource: String(raw.dataSource || 'data/products.json').trim(),
    title,
    breadcrumbs,
    categoryHeading: String(raw.categoryHeading || '').trim(),
    descriptionHeading: String(raw.descriptionHeading || '').trim(),
    description: String(raw.description || '').trim(),
    default: !!raw.default,
    search: {
      include: !!(raw.search && raw.search.include),
      label: String(raw.search?.label || title).trim(),
      preload: !!(raw.search && raw.search.preload)
    }
  };
},
normalizeBreadcrumbArray(items, fallbackTitle) {
  const base = Array.isArray(items) && items.length
    ? items
    : [
        { label: this.homeBreadcrumbLabel(), route: 'home' },
        { label: fallbackTitle }
      ];
  return base
    .map(entry => this.normalizeBreadcrumbEntry(entry))
    .filter(Boolean);
},
normalizeBreadcrumbEntry(entry) {
  if (!entry) return null;
  const label = String(entry.label || '').trim();
  if (!label) return null;
  let href = entry.href ? String(entry.href).trim() : '';
  const route = entry.route ? String(entry.route).trim() : '';
  if (!href && route) {
    if (route === 'home' || route === '/' || route === '' || route === '#/' || route === 'root') {
      href = '/';
    } else if (route.startsWith('#/')) {
      href = route;
    } else if (route.startsWith('/')) {
      href = `#${route}`;
    } else {
      href = `#/${route.replace(/^#?\/?/, '')}`;
    }
  }
  return { label, href: href || null };
},
homeBreadcrumbLabel() {
  try {
    return window.t ? window.t('routes.products.breadcrumbs.home', 'Domů') : 'Domů';
  } catch (_) {
    return 'Domů';
  }
},
resolveProductList(param = null) {
  if (!Array.isArray(this.productLists) || !this.productLists.length) {
    const fallback = this.normalizeProductList(this.fallbackProductList(), 0);
    this.setProductLists([fallback]);
  }
  const key = String(param || '').trim().toLowerCase();
  if (key && this.productListMap[key]) return this.productListMap[key];

  const defKey = String(this.defaultProductListKey || '').toLowerCase();
  if (!key && defKey && this.productListMap[defKey]) {
    return this.productListMap[defKey];
  }

  const activeKey = String(this.activeProductListKey || '').toLowerCase();
  if (activeKey && this.productListMap[activeKey]) {
    return this.productListMap[activeKey];
  }
  if (defKey && this.productListMap[defKey]) return this.productListMap[defKey];
  return this.productLists[0];
},
buildProductListMeta(list) {
  if (!list) return null;
  return {
    title: list.title,
    breadcrumbs: Array.isArray(list.breadcrumbs) && list.breadcrumbs.length
      ? list.breadcrumbs
      : this.normalizeBreadcrumbArray(null, list.title),
    categoryHeading: list.categoryHeading || 'Inspirace',
    descriptionHeading: list.descriptionHeading || list.title,
    description: list.description || ''
  };
},
productListRoute(target = null) {
  let list = null;
  if (target && typeof target === 'object' && target.key) {
    list = target;
  } else if (typeof target === 'string') {
    list = this.productListMap[String(target).toLowerCase()] || null;
  } else {
    list = this.resolveProductList(target);
  }
  if (!list) return '#/products';
  if (list.key === this.defaultProductListKey || !list.routeParam) return '#/products';
  return `#/products/${list.routeParam}`;
},
defaultProductListHash() {
  const key = String(this.defaultProductListKey || '').toLowerCase();
  if (key && this.productListMap[key]) {
    return this.productListRoute(this.productListMap[key]);
  }
  return '#/products';
},
productTitle() {
  if (this.activeProductListMeta?.title) return this.activeProductListMeta.title;
  try {
    return window.t ? window.t('routes.products.title', 'Zdraví a léky') : 'Zdraví a léky';
  } catch (_) {
    return 'Zdraví a léky';
  }
},
productCategoriesHeading() {
  return this.activeProductListMeta?.categoryHeading || 'Inspirace';
},
productDescriptionHeading() {
  return this.activeProductListMeta?.descriptionHeading || this.productTitle();
},
defaultProductDescriptionText() {
  return 'V kategorii Zdraví a léky naleznete volně prodejné léčivé přípravky, které pomáhají při různých obtížích. Jsou to například léky proti bolesti, při rýmě či kašli, na zvýšenou teplotu nebo při chřipce a nachlazení. Léčbu těmito přípravky zvládnete sami doma. V případě opakujících se nebo déle přetrvávajících obtíží je vždy na místě vyhledat pomoc lékaře. O vhodném léku se nejprve poraďte s lékárníkem.';
},
productDescriptionText() {
  return this.activeProductListMeta?.description || this.defaultProductDescriptionText();
},
productBreadcrumbs() {
  if (this.activeProductListMeta?.breadcrumbs?.length) {
    return this.activeProductListMeta.breadcrumbs;
  }
  return this.normalizeBreadcrumbArray(null, this.productTitle());
},
refreshSearchProducts() {
  if (!Array.isArray(this.productLists) || !this.productLists.length) {
    this.searchProducts = this.products.slice();
    return;
  }
  const dedup = new Map();
  const listsForSearch = this.productLists
    .filter(list => list.search?.include)
    .sort((a, b) => {
      if (a.key === this.activeProductListKey) return -1;
      if (b.key === this.activeProductListKey) return 1;
      return 0;
    });
  listsForSearch.forEach(list => {
      const key = list.key;
      const data = key === this.activeProductListKey
        ? this.products
        : this._searchListCache[key];
      if (!Array.isArray(data)) return;
      data.forEach(item => {
        if (!item || item.id == null) return;
        const idKey = String(item.id);
        if (dedup.has(idKey)) return;
        const clone = { ...item, __listKey: key, __listLabel: list.search?.label || list.title };
        dedup.set(idKey, clone);
      });
    });
  this.searchProducts = Array.from(dedup.values());
},
async preloadSearchLists(activeKey = null) {
  if (!Array.isArray(this.productLists)) return;
  const promises = this.productLists
    .filter(list => list.search?.include && list.search?.preload && list.key !== activeKey)
    .map(list => this.ensureSearchCacheFor(list));
  await Promise.all(promises);
},
async ensureSearchCacheFor(list) {
  if (!list || !list.search?.include) return;
  const key = list.key;
  if (key === this.activeProductListKey) {
    this._searchListCache[key] = this.products.slice();
    this.refreshSearchProducts();
    return;
  }
  if (this._searchListCache[key]) return;
  if (this._searchListPromises[key]) return this._searchListPromises[key];
  this._searchListPromises[key] = fetch(list.dataSource, { cache: 'no-store' })
    .then(res => res.ok ? res.json() : [])
    .then(arr => {
      this._searchListCache[key] = Array.isArray(arr) ? arr : [];
      this.refreshSearchProducts();
    })
    .catch(e => console.warn('search preload failed', list.dataSource, e))
    .finally(() => { delete this._searchListPromises[key]; });
  return this._searchListPromises[key];
},
async ensureListData(list) {
  if (!list || !list.key) return [];
  const key = list.key;
  if (key === this.activeProductListKey) {
    return Array.isArray(this.products) ? this.products : [];
  }
  if (this._listDataCache[key]) return this._listDataCache[key];
  if (this._searchListCache[key]) {
    this._listDataCache[key] = this._searchListCache[key].slice();
    return this._listDataCache[key];
  }
  if (this._listDataPromises[key]) return this._listDataPromises[key];
  this._listDataPromises[key] = fetch(list.dataSource, { cache: 'no-store' })
    .then(res => (res.ok ? res.json() : []))
    .then(arr => {
      const normalized = Array.isArray(arr) ? arr : [];
      this._listDataCache[key] = normalized;
      return normalized;
    })
    .catch(err => {
      console.warn('ensureListData failed', list?.dataSource, err);
      this._listDataCache[key] = [];
      return [];
    })
    .finally(() => { delete this._listDataPromises[key]; });
  return this._listDataPromises[key];
},

// --- Pricing helpers (supports discounted_price from your feed) ---
formatPrice(v) {
  return window.__fitMoney.format(v, { fromCurrency: 'CZK' });
},
currentPrice(p) {
  return (p?.discounted_price != null) ? Number(p.discounted_price) : Number(p?.price || 0);
},
crossedPrice(p) {
  if (p?.discounted_price != null) return Number(p?.price || 0);
  if (p?.oldPrice != null) return Number(p.oldPrice);
  return null;
},
discountPct(p) {
  const now = this.currentPrice(p);
  const was = this.crossedPrice(p);
  if (!was || !now || !(was > now)) return null;
  return Math.round(100 - (now / was) * 100);
},
isInStock(p) {
  // your schema: p.stock like "Skladem"
  return String(p?.stock || '').toLowerCase().includes('sklad');
},

// --- One-time shuffle per page load ---
_topProdCache: null,
// Source + per-key shuffle (unchanged logic, accepts any key)
_topSource() {
  const hasTopProducts = typeof this.topProducts === 'function';
  const hasTopPorudcts = typeof this.topPorudcts === 'function';
  if (hasTopProducts)  return this.topProducts(200);
  if (hasTopPorudcts)  return this.topPorudcts(200);
  return Array.isArray(this.products) ? this.products : [];
},
topProductsShuffledFor(key, count = 12) {
  if (!key) return [];
  if (!Array.isArray(this._topProdCacheMap[key])) {
    const src = this._topSource();
    if (!Array.isArray(src) || src.length === 0) return [];
    const arr = src.slice();
    // shuffle
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    // ensure unique IDs first
    const seen = new Set();
    const unique = [];
    arr.forEach(item => {
      const id = item?.id;
      if (id != null) {
        if (seen.has(id)) return;
        seen.add(id);
      }
      unique.push(item);
    });
    this._topProdCacheMap[key] = unique;
  }
  return this._topProdCacheMap[key].slice(0, count);
},
// ---- per-strip state (reactive) ----
_tpId: 0,
tpStates: {},            // { [key]: {left,right,scrolled} }
_topProdCacheMap: {},    // { [key]: shuffledArray }

// Register scroller with an explicit key (string) or auto-assigned if missing
registerTopStrip(el, key = null) {
  if (!el) return;
  const id = key || el.dataset.tpId || ('tp' + (++this._tpId));
  el.dataset.tpId = id;

  if (!this.tpStates[id]) this.tpStates[id] = { left: false, right: false, scrolled: false };

  const update = () => {
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const st = this.tpStates[id];
    st.left  = scrollLeft > 4;
    st.right = scrollLeft + clientWidth < scrollWidth - 4;
    if (!st.scrolled && scrollLeft > 2) st.scrolled = true;
  };

  this.$nextTick(() => {
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('orientationchange', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
  });
},


go(to) {
  // special case: go to homepage WITHOUT hash
  if (to === 'home' || to === '/' || to === '') {
    // save scroll position of leaving route
    if (this.route === 'products') this._saveScroll('products');
    if (this.route !== 'home') this._saveScroll(this.route);
    window.history.pushState({}, '', window.location.pathname); // no hash
    this._onRoute(); // manually trigger since no 'hashchange'
    return;
  }

  const newHash = to.startsWith('#') ? to : ('#' + to.replace(/^#/, ''));
  if (location.hash === newHash) { this._onRoute(); return; }
  location.hash = newHash;
},

is(nameOrArr) {
  return Array.isArray(nameOrArr)
    ? nameOrArr.includes(this.route)
    : this.route === nameOrArr;
},

// ---- router ----
_onRoute() {
  const prevRoute = this.route;
  if (this.paygateModal?.open) {
    this.closePaygate(false);
  }

  // if there's no hash (or just "#") -> HOME
  const emptyOrHome = !location.hash || location.hash === '#';

  // Keep existing hash router when present
  const raw = emptyOrHome ? '' : (location.hash).replace(/^#\/?/, '');
  const [pathPart] = (raw || '').split('?');
  const seg = (pathPart || '').split('/').map(s => decodeURIComponent(s || ''));
  const [path, id, sub] = seg;

  if (emptyOrHome || path === '') {
    // default + fallback = HOME
    if (prevRoute === 'products') this._saveScroll('products');
    this.route = 'home';
    this.params = {};
    this._restoreScroll('home');
    return;
  }

  switch (path) {
    case 'products': {
      const listSlug = id || null;
      this.route = 'products';
      this.params = { listSlug };
      this._restoreScroll('products');
      break;
    }

    case 'cart':
      if (prevRoute === 'products') this._saveScroll('products');
      this.route = 'cart';
      this.params = {};
      this._scrollToTopSoon();
      break;

    case 'config':
      if (prevRoute === 'products') this._saveScroll('products');
      this.route = 'config';
      this.params = {};
      this._scrollToTopSoon();
      break;

    case 'delivery-payment':
      if (this.redirectToCartIfEmpty()) return;
      if (prevRoute === 'products') this._saveScroll('products');
      this.route = 'delivery-payment';
      this.params = {};
      this._scrollToTopSoon();
      break;

    case 'addresses':
      if (this.redirectToCartIfEmpty()) return;
      if (prevRoute === 'products') this._saveScroll('products');
      this.route = 'addresses';
      this.params = {};
      this._scrollToTopSoon();
      this.loadCheckoutMeta();
      if (this.addressFormLoaded) {
        this.hydrateAddressFormValues();
      } else {
        Promise.resolve(this.ensureAddressForm()).then(() => this.hydrateAddressFormValues());
      }
      break;

    case 'purchase-review':
      if (this.redirectToCartIfEmpty()) return;
      if (prevRoute === 'products') this._saveScroll('products');
      this.route = 'purchase-review';
      this.params = {};
      this._scrollToTopSoon();
      this.loadCheckoutMeta();
      this.loadCheckoutReviewFromStorage();
      const ensure = this.addressFormLoaded ? Promise.resolve() : this.ensureAddressForm();
      ensure.then(() => this.refreshCheckoutReview());
      this.resetCheckoutConsents();
      break;

    case 'active-order':
      if (prevRoute === 'products') this._saveScroll('products');
      this.route = 'active-order';
      this.params = {};
      this._scrollToTopSoon();
      this.closePaygate(false);
      const cartStore = Alpine.store('cart');
      if (cartStore?.distinctCount?.() > 0) {
        this.suppressCartRedirect = true;
        cartStore.clear();
      }
      this.checkoutReview = null;
      try { localStorage.removeItem('checkout.review'); } catch (_) {}
      this.suppressCartRedirect = false;
      break;
      
      case 'my-account':
      if (prevRoute === 'products') this._saveScroll('products');
      this.route = 'my-account';
      this.params = {};
      this._scrollToTopSoon();
      break;

      case 'my-saved':
      if (prevRoute === 'products') this._saveScroll('products');
      this.route = 'my-saved';
      this.params = {};
      this._scrollToTopSoon();
      break;

    case 'map':
      if (prevRoute === 'products') this._saveScroll('products');
      this.route = 'map';
      this.params = {};
      this._scrollToTopSoon();
      break;

    case 'product':
      if (prevRoute === 'products') this._saveScroll('products');
      if (id) {
        this.route = 'product';
        this.params = { id, tab: sub || 'desc' };
        this._scrollToTopSoon();
        this.loadDetail(id);
      } else {
        this.route = 'product';
        this.params = {};
        this._scrollToTopSoon();
      }
      break;

    default:
      // 🌟 Fallback to HOME (no hash)
      if (prevRoute === 'products') this._saveScroll('products');
      window.history.replaceState({}, '', window.location.pathname);
      this.route = 'home';
      this.params = {};
      this._restoreScroll('home');
  }
},


// ---- detail loading with single source of truth for price ----
async getDetailById(id) {
  const res = await fetch(`data/product-details/${id}.json`);
  if (!res.ok) throw new Error(`detail ${id} ${res.status}`);
  return await res.json();
},
async getFallbackDetailById(id) {
  const normalizedId = String(id ?? '').trim();
  if (!normalizedId) return null;
  await this.ensureProductLists();
  const lists = Array.isArray(this.productLists) ? this.productLists : [];
  const matchFrom = (items) => {
    if (!Array.isArray(items)) return null;
    return items.find(item => String(item?.id ?? '') === normalizedId);
  };
  const activeKey = String(this.activeProductListKey || '').toLowerCase();
  const activeList = activeKey ? (this.productListMap?.[activeKey] || null) : null;
  const buildPayload = (product, listMeta = null) => {
    if (!product) return null;
    const clone = { ...product };
    if (!Array.isArray(clone.parameters)) clone.parameters = [];
    if (!Array.isArray(clone.images)) {
      const single = clone.image ? [clone.image] : [];
      clone.images = single;
    }
    if (!clone.perex && clone.description) clone.perex = clone.description;
    if (!clone.description && clone.perex) clone.description = clone.perex;
    clone.__fallback = true;
    clone.__fallbackListKey = listMeta?.key || null;
    clone.__fallbackListTitle = listMeta?.title || null;
    return clone;
  };
  const seen = new Set();
  let found = matchFrom(this.products);
  if (found) return buildPayload(found, activeList);
  for (const list of lists) {
    const key = list?.key;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const dataset = key === this.activeProductListKey
      ? this.products
      : await this.ensureListData(list);
    found = matchFrom(dataset);
    if (found) return buildPayload(found, list);
  }
  return null;
},

_mergeDetailPrice(detailObj, id) {
  const gridItem = this.products.find(p => String(p.id) === String(id));
  if (gridItem) {
    detailObj.price = gridItem.price ?? detailObj.price;
    detailObj.discounted_price = gridItem.discounted_price ?? detailObj.discounted_price;
    // keep variant price aligned with grid, if single default variant
    if (Array.isArray(detailObj.variants) && detailObj.variants.length) {
      detailObj.variants = detailObj.variants.map(v => ({
        ...v,
        price: gridItem.price ?? v.price,
        discounted_price: gridItem.discounted_price ?? v.discounted_price
      }));
    }
  }
  return detailObj;
},

// add near your state
_detailReq: 0,           // request counter
currentDetailId: null,    // last successfully shown id

async loadDetail(id) {
  const myReq = ++this._detailReq;        // mark this request as the latest
  try {
    console.log('loadDetail ->', id);
    const d = await this.getDetailById(id);

    // if a newer request started meanwhile, ignore this response
    if (myReq !== this._detailReq) return;

    this.detail = this._mergeDetailPrice(d, id);
    this.currentDetailId = id;
  } catch (e) {
    if (myReq === this._detailReq) this.detail = null;
    console.error('Failed to load product detail', id, e);
  }
},

// ---- filter helpers ----
_priceRangeActive() {
  if (this.activePriceRangeIndex !== null) return true;
  if (!this.priceBounds) return false;
  const minBound = Number(this.priceBounds.min ?? 0);
  const maxBound = Number(this.priceBounds.max ?? 0);
  if (!Number.isFinite(minBound) || !Number.isFinite(maxBound)) return false;
  const currentMin = Number(this.priceMin ?? minBound);
  const currentMax = Number(this.priceMax ?? maxBound);
  return (Number.isFinite(currentMin) && currentMin > minBound) ||
         (Number.isFinite(currentMax) && currentMax < maxBound);
},
clampPrice(value, which = 'min') {
  if (!this.priceBounds) return;
  const minBound = Number(this.priceBounds.min ?? 0);
  const maxBound = Number(this.priceBounds.max ?? 0);
  if (!Number.isFinite(minBound) || !Number.isFinite(maxBound)) return;
  let num = Number(value);
  if (!Number.isFinite(num)) num = which === 'min' ? minBound : maxBound;
  this.activePriceRangeIndex = null;
  if (which === 'min') {
    const currentMax = Number(this.priceMax);
    const upper = Number.isFinite(currentMax) ? currentMax : maxBound;
    const next = Math.min(Math.max(num, minBound), upper);
    if (next !== this.priceMin) this.priceMin = next;
  } else {
    const lower = minBound;
    const next = Math.max(Math.min(num, maxBound), lower);
    if (next !== this.priceMax) this.priceMax = next;
    if (this.priceMin !== lower) this.priceMin = lower;
  }
},
resetPriceFilter() {
  this.activePriceRangeIndex = null;
  if (!this.priceBounds) return;
  const minBound = Number(this.priceBounds.min ?? 0);
  const maxBound = Number(this.priceBounds.max ?? minBound);
  if (Number.isFinite(minBound)) this.priceMin = minBound;
  if (Number.isFinite(maxBound)) this.priceMax = maxBound;
},
filteredCount() { return this.filteredProducts().length; },

sortOptions() {
  const label = (key, fallback) => window.t(`routes.products.sorting.options.${key}`, fallback);
  return [
    { value: 'priceAsc', label: label('priceAsc', 'Od nejlevnějšího') },
    { value: 'priceDesc', label: label('priceDesc', 'Od nejdražšího') },
    { value: 'alphaAsc', label: label('alphaAsc', 'Abecedně A–Z') },
    { value: 'alphaDesc', label: label('alphaDesc', 'Abecedně Z–A') }
  ];
},
sortOptionLabel(value) {
  const entry = this.sortOptions().find(opt => opt.value === value);
  return entry ? entry.label : window.t('routes.products.sorting.label', 'Řadit dle');
},
sortButtonLabel() {
  return this.sortOrder
    ? this.sortOptionLabel(this.sortOrder)
    : window.t('routes.products.sorting.label', 'Řadit dle');
},
sortLabel() {
  const base = window.t('routes.products.sorting.label', 'Řadit dle');
  return this.sortOrder
    ? `${base}: ${this.sortOptionLabel(this.sortOrder)}`
    : `${base}: ${window.t('routes.products.sorting.options.default', 'Doporučeno')}`;
},
toggleConsumer(val) {
  const i = this.selectedConsumers.indexOf(val);
  if (i >= 0) this.selectedConsumers.splice(i, 1);
  else this.selectedConsumers.push(val);
  this.selectedConsumers = [...this.selectedConsumers]; // normalize
},
availabilityFilterOptions() {
  const label = (key, fallback) => window.t(`routes.products.filters.sections.stock.options.${key}`, fallback);
  return [
    { value: 'all', label: label('all', 'Vše') },
    { value: 'drmax', label: label('drmax', 'U Dr. Max') },
    { value: 'supplier', label: label('supplier', 'U dodavatele') }
  ];
},
availabilityFilterLabel(value = this.availabilityFilter) {
  const match = this.availabilityFilterOptions().find(opt => opt.value === value);
  return match ? match.label : '';
},
isAvailabilityFiltered() { return this.availabilityFilter !== 'all'; },
_matchesAvailabilityFilter(product) {
  const raw = String(product?.stock || '').trim();
  if (!raw) return false;
  const normalized = raw.toLowerCase();
  switch (this.availabilityFilter) {
    case 'drmax':
      return normalized === 'skladem';
    case 'supplier':
      return normalized === 'skladem u dodavatele';
    default:
      return true;
  }
},
applyPriceQuickRange(idx) {
  if (idx === null || typeof idx === 'undefined') {
    this.resetPriceFilter();
    return;
  }
  const index = Number(idx);
  if (!Number.isFinite(index) || index < 0) {
    this.resetPriceFilter();
    return;
  }
  const maxVal = Number(this.priceQuickRanges?.[index]);
  if (!Number.isFinite(maxVal) || !this.priceBounds) {
    this.resetPriceFilter();
    return;
  }
  const minBound = Number(this.priceBounds.min ?? 0);
  const maxBound = Number(this.priceBounds.max ?? maxVal);
  this.activePriceRangeIndex = index;
  this.priceMin = Number.isFinite(minBound) ? minBound : 0;
  this.priceMax = Math.min(maxVal, Number.isFinite(maxBound) ? maxBound : maxVal);
},

hasActiveFilters() {
  return !!(
    this.search ||
    this.selectedCategory ||
    this.selectedForm ||
    this.selectedConsumers.length ||
    this.onlyInStock ||
    this.isAvailabilityFiltered() ||
    this.benefitOnly ||
    this.onlyDiscounted ||
    this._priceRangeActive()
  );
},
activeFiltersCount() {
  let n = 0;
  if (this.search) n++;
  if (this.selectedCategory) n++;
  if (this.selectedForm) n++;
  n += this.selectedConsumers.length;
  if (this.onlyInStock) n++;
  if (this.isAvailabilityFiltered()) n++;
  if (this.benefitOnly) n++;
  if (this.onlyDiscounted) n++;
  if (this._priceRangeActive()) n++;
  return n;
},
clearFilters() {
  this.search = '';
  this.selectedCategory = '';
  this.selectedForm = '';
  this.selectedConsumers = [];
  this.onlyInStock = false;
  this.availabilityFilter = 'all';
  this.benefitOnly = false;
  this.onlyDiscounted = false;
  this.sortOrder = '';
  this.resetPriceFilter();
},

// ---- loader delay ----
scheduleDisplayDelay() {
  clearTimeout(this._filterTimer);
  this.isLoading = true;
  const delay = this._initialDataLoaded ? 1000 : 1000;
  this._filterTimer = setTimeout(() => {
    this.isLoading = false;
  }, delay);
},

// ---- filtering/sorting ----
filteredProducts() {
  let items = this.products;

  if (this.search) {
    const s = this.search.toLowerCase();
    items = items.filter(p =>
      (p.name || '').toLowerCase().includes(s) ||
      (p.description || '').toLowerCase().includes(s)
    );
  }
  if (this.selectedCategory) {
    items = items.filter(p => p.category === this.selectedCategory);
  }
  if (this.selectedForm) {
    items = items.filter(p => (p.form || '').trim() === this.selectedForm);
  }
  if (this.selectedConsumers.length) {
    items = items.filter(p => {
      const arr = Array.isArray(p.consumers) ? p.consumers : [];
      return this.selectedConsumers.some(c => arr.includes(c)); // ANY match
    });
  }
  if (this.onlyInStock) {
    items = items.filter(p => String(p.stock || '').toLowerCase().includes('sklad'));
  }
  if (this.isAvailabilityFiltered()) {
    items = items.filter(p => this._matchesAvailabilityFilter(p));
  }
  if (this.benefitOnly) {
    items = items.filter(p => !!p.benefitPayment);
  }
  if (this.onlyDiscounted) {
    items = items.filter(p => {
      const d = Number(p.discounted_price || 0);
      const pr = Number(p.price || 0);
      return d > 0 && d < pr;
    });
  }
  if (this.priceBounds) {
    const minBound = Number(this.priceBounds.min ?? 0);
    const maxBound = Number(this.priceBounds.max ?? 0);
    const min = Number.isFinite(Number(this.priceMin)) ? Number(this.priceMin) : minBound;
    const max = Number.isFinite(Number(this.priceMax)) ? Number(this.priceMax) : maxBound;
    items = items.filter(p => {
      const price = Number(p.discounted_price ?? p.price ?? 0);
      if (!Number.isFinite(price)) return false;
      return price >= min && price <= max;
    });
  }

  if (this.sortOrder === 'priceAsc') {
    items = items.slice().sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  } else if (this.sortOrder === 'priceDesc') {
    items = items.slice().sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  } else if (this.sortOrder === 'alphaAsc') {
    items = items.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'cs', {sensitivity:'base'}));
  } else if (this.sortOrder === 'alphaDesc') {
    items = items.slice().sort((a, b) => String(b.name).localeCompare(String(a.name), 'cs', {sensitivity:'base'}));
  }

  return items;
},

// ---- pagination (unchanged) ----
canLoadMoreFirstPage() {
  return this.page === 1 && this.showCount < this.filteredProducts().length;
},
loadMore() {
  const total = this.filteredProducts().length;
  this.showCount = Math.min(this.showCount + this.pageSize, total);
},
loadMoreLabel() {
  const remaining = this.filteredProducts().length - this.showCount;
  const n = Math.min(this.pageSize, Math.max(0, remaining));
  return n
    ? window.t('routes.products.results.loadMore', 'Načíst dalších {count} produktů', { count: n })
    : window.t('routes.products.results.loaded', 'Vše načteno');
},
totalPages() {
  const total = this.filteredProducts().length;
  if (total <= this.showCount) return 1;
  return 1 + Math.ceil((total - this.showCount) / this.pageSize);
},
pagedProducts() {
  const items = this.filteredProducts();
  if (this.page === 1) return items.slice(0, this.showCount);
  const start = this.showCount + (this.page - 2) * this.pageSize;
  return items.slice(start, start + this.pageSize);
},
pagesToShow() {
  const p = this.page, t = this.totalPages();
  if (this._isCompactPagination()) {
    if (t <= 5) return Array.from({ length: t }, (_, i) => i + 1);
    if (p <= 3) return [1, 2, 3, '…', t];
    if (p >= t - 2) return [1, '…', t - 2, t - 1, t];
    return [1, '…', p - 1, p, p + 1, '…', t];
  }
  if (t <= 7) return Array.from({ length: t }, (_, i) => i + 1);
  if (p <= 4) return [1, 2, 3, 4, 5, '…', t];
  if (p >= t - 3) return [1, '…', t - 4, t - 3, t - 2, t - 1, t];
  return [1, '…', p - 1, p, p + 1, '…', t];
},
// ---- checkout form helpers ----
async ensureAddressForm() {
  if (this.addressFormLoaded || this.addressFormLoading) return;
  this.addressFormLoading = true;
  try {
    const [contactSchema, courierSchema] = await Promise.all([
      fetch('data/forms/contacts-delivery.json', { cache: 'no-store' })
        .then(res => res.json())
        .catch(() => []),
      this.loadCourierOptionalSchema()
    ]);
    const base = Array.isArray(contactSchema) ? contactSchema : [];
    const courier = Array.isArray(courierSchema) ? courierSchema : [];
    const combined = [...base, ...courier];
    this.contactFormSchema = combined;
    this.initAddressForm(combined);
  } catch (e) {
    console.warn('contacts-delivery.json load failed', e);
    this.contactFormSchema = [];
    this.initAddressForm([]);
  } finally {
    this.addressFormLoading = false;
  }
},

async loadAddressSuggestions() {
  if (this.addressAutocompleteLoaded) {
    return this.addressAutocompleteOptions;
  }
  try {
    const res = await fetch('data/addresses/prague.json', { cache: 'no-store' });
    const list = await res.json();
    const normalized = Array.isArray(list) ? list : [];
    this.addressAutocompleteOptions = normalized.map((item) => {
      const street = String(item.street ?? '').trim();
      const extra = String(item.extra ?? '').trim();
      const city = String(item.city ?? '').trim();
      const zip = String(item.zip ?? '').replace(/\s+/g, '');
      const label = String(item.label ?? `${street}, ${city}`).trim();
      const cityLine = [zip, city].filter(Boolean).join(' ');
      const district = String(item.district ?? '').trim();
      const search = [label, street, extra, city, zip, district].filter(Boolean).join(' ').toLowerCase();
      const fallbackId = `${street || 'addr'}-${zip || Math.random().toString(36).slice(2)}`;
      return {
        id: String(item.id ?? fallbackId),
        label: label || street,
        street,
        extra,
        city,
        zip,
        district,
        cityLine,
        search
      };
    });
  } catch (e) {
    console.warn('Failed to load address suggestions', e);
    this.addressAutocompleteOptions = [];
  } finally {
    this.addressAutocompleteLoaded = true;
  }
  return this.addressAutocompleteOptions;
},

async loadCourierOptionalSchema() {
  try {
    const res = await fetch('data/forms/courier-delivery.json', { cache: 'no-store' });
    const schema = await res.json();
    return Array.isArray(schema) ? schema : [];
  } catch (e) {
    console.warn('courier-delivery.json load failed', e);
    return [];
  }
},

normalizeCheckoutMetaValue(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ours: null, partner: null, hasPartner: false };
  }
  if ('ours' in raw || 'partner' in raw) {
    return {
      ours: raw.ours || null,
      partner: raw.partner || null,
      hasPartner: !!(raw.partner || raw.hasPartner)
    };
  }
  return { ours: raw, partner: null, hasPartner: false };
},
deliveryMetaFor(context = 'ours') {
  return this.checkoutDeliveryMeta?.[context] || null;
},
paymentMetaFor(context = 'ours') {
  return this.checkoutPaymentMeta?.[context] || null;
},
    partnerDeliveryRequired() {
      if (this.deliveryMetaFor('partner')) return true;
      const cart = Alpine.store('cart');
      return !!(cart?.hasPartnerItems?.());
    },
    hasPrimaryCartItems() {
      const cart = Alpine.store('cart');
      if (!cart || typeof cart.groupedTotals !== 'function') return true;
      const totals = cart.groupedTotals();
      const ours = totals?.ours?.items || [];
      return Array.isArray(ours) ? ours.length > 0 : false;
    },
hasPrimaryPickup() {
  const meta = this.deliveryMetaFor('ours');
  const type = String(meta?.type || '').toLowerCase();
  if (type === 'pickup') return true;
  if (!type && meta?.pickup) return true;
  return false;
},
isPickupMeta(meta) {
  if (!meta) return false;
  const type = String(meta.type || '').toLowerCase();
  if (type === 'pickup') return true;
  if (!type && meta.pickup) return true;
  return false;
},
isPharmacyPickupMeta(meta) {
  if (!meta) return false;
  if (!this.isPickupMeta(meta)) return false;
  const mapType = String(meta.mapType || meta.map_type || meta.pickup?.mapType || '').toLowerCase();
  if (mapType === 'pharmacy') return true;
  const pickupType = String(meta.pickup?.type || '').toLowerCase();
  if (pickupType === 'pharmacy') return true;
  const name = String(meta.name || meta.pickup?.name || '').toLowerCase();
  return name.includes('lékárn');
},
isPharmacyPickup(context = 'ours') {
  const meta = this.deliveryMetaFor(context);
  return this.isPharmacyPickupMeta(meta);
},
addressSummaryPrefersPickup(context = 'ours') {
  return this.isPharmacyPickup(context);
},
addressSummaryIsBilling(field) {
  return this.isBillingAddressField(field);
},
addressSummaryLabel(field) {
  if (!field) return '';
  if (this.addressSummaryIsBilling(field)) return 'Fakturační adresa';
  return field.summaryEyebrow || '';
},
shippingAddressHeading() {
  const meta = this.deliveryMetaFor('ours');
  return this.isPickupMeta(meta) ? 'Výdejní místo' : 'Doručovací adresa';
},
orderShippingHeading(order) {
  if (!order) return 'Doručovací adresa';
  if (this.isPickupMeta(order.delivery)) return 'Výdejní místo';
  if (order.key === 'partner') return 'Doručovací adresa';
  return this.shippingAddressHeading();
},
orderDeliverySummary(order, info) {
  if (!order || !info) return '';
  if (order.delivery?.pickup) {
    return this.isPharmacyPickupMeta(order.delivery) ? (info.pickup || '') : (info.delivery || '');
  }
  return info.delivery || '';
},
addressLineParts(value = '') {
  const lines = String(value ?? '').split('\n');
  const firstLine = lines.shift() || '';
  return {
    firstLine,
    remainingLines: lines,
    remainingText: lines.join('\n')
  };
},
couponValueFor(coupon, subtotal = 0) {
  if (!coupon) return 0;
  const base = Number(subtotal) || 0;
  const value = Number(coupon.value) || 0;
  if (coupon.type === 'percent') {
    return Math.floor(base * (value / 100));
  }
  if (coupon.type === 'amount') {
    return value;
  }
  return 0;
},
giftCardValueFor(card) {
  if (!card) return 0;
  if (card.type === 'amount') {
    return Number(card.value) || 0;
  }
  return 0;
},
orderCouponEntries(order) {
  if (!order || order.key !== 'ours') return [];
  return Array.isArray(this.checkoutReview?.cart?.coupons)
    ? this.checkoutReview.cart.coupons
    : [];
},
orderGiftCardEntries(order) {
  if (!order || order.key !== 'ours') return [];
  return Array.isArray(this.checkoutReview?.cart?.giftCards)
    ? this.checkoutReview.cart.giftCards
    : [];
},
shouldShowCourierDetails() {
  if (this.hasPrimaryPickup()) return false;
  return this.addressFormSections('courier').length > 0;
},
requiresHomeAddress() {
  const partnerMeta = this.deliveryMetaFor('partner');
  // Partner-only pickup should not force a home address
  if (partnerMeta && this.isPickupMeta(partnerMeta) && !this.hasPrimaryCartItems()) {
    return false;
  }
  if (this.partnerDeliveryRequired()) return true;
  return !this.hasPrimaryPickup();
},
hasPartnerCartItems() {
  const cart = Alpine.store('cart');
  return !!(cart?.hasPartnerItems?.());
},
homeAddressContext() {
  // If we have only partner items, render the form in partner context
  if (!this.hasPrimaryCartItems()) {
    return this.partnerDeliveryRequired() ? 'partner' : null;
  }
  if (!this.hasPrimaryPickup()) return 'ours';
  if (this.partnerDeliveryRequired()) return 'partner';
  return null;
},
renderHomeFormIn(context = 'ours') {
  return this.homeAddressContext() === context;
},
addressFormSections(kind = 'all') {
  const sections = Array.isArray(this.contactFormSections) ? this.contactFormSections : [];
  if (kind === 'contact') {
    return sections.filter(sec => this.isContactSection(sec.name));
  }
  if (kind === 'delivery') {
    return sections.filter(sec => !this.isContactSection(sec.name) && !this.isCourierSection(sec.name));
  }
  if (kind === 'courier') {
    return sections.filter(sec => this.isCourierSection(sec.name));
  }
  return sections;
},
isContactSection(name) {
  return String(name || '').trim().toLowerCase() === 'kontaktní údaje';
},
isCourierSection(name) {
  return String(name || '').trim().toLowerCase() === 'podrobnosti pro kurýra';
},
pickupSummary(context = 'ours') {
  const meta = this.deliveryMetaFor(context);
  return meta?.pickup || null;
},

loadCheckoutMeta() {
  const parse = (key) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn(`Failed to parse ${key}`, e);
      return null;
    }
  };
  this.checkoutDeliveryMeta = this.normalizeCheckoutMetaValue(parse('checkout.delivery'));
  this.checkoutPaymentMeta = this.normalizeCheckoutMetaValue(parse('checkout.payment'));
},

cartHasItems() {
  const cart = Alpine.store('cart');
  if (!cart || typeof cart.distinctCount !== 'function') return false;
  return cart.distinctCount() > 0;
},

redirectToCartIfEmpty() {
  if (this.cartHasItems()) return false;
  if (location.hash !== '#/cart' && location.hash !== '/cart') {
    location.hash = '/cart';
  } else {
    this.route = 'cart';
    this.params = {};
    this._scrollToTopSoon();
  }
  return true;
},

initAddressForm(schema = []) {
  const existingKeys = new Set();
  this.contactFormSections = [];
  this.contactFormFieldMap = {};
  this.contactFormValues = {};
  this.contactFormErrors = {};
  this.contactFormTouched = {};
  this.contactFormGroups = {};
  this.contactFormGroupToggles = {};
  this.contactFormGroupMembers = {};
  this.addressFormMessage = '';
  this.addressFormSubmitAttempted = false;

  schema.forEach((raw, idx) => {
    const sectionName = raw?.form_section || 'Ostatní';
    let section = this.contactFormSections.find(sec => sec.name === sectionName);
    if (!section) {
      section = { name: sectionName, fields: [] };
      this.contactFormSections.push(section);
    }
    const key = this.normalizeFieldKey(raw?.label || raw?.type || `field-${idx}`, idx, existingKeys);
    existingKeys.add(key);
    const field = {
      key,
      type: raw?.type || 'text',
      label: raw?.label || '',
      placeholder: raw?.placeholder || '',
      prefix: raw?.prefix || null,
      note: raw?.note || null,
      validations: Array.isArray(raw?.validations) ? raw.validations : [],
      section: sectionName,
      groupKey: raw?.fieldset_group || null,
      isToggle: raw?.type === 'checkbox_toggle_fieldset'
    };
    section.fields.push(field);
    this.contactFormFieldMap[key] = field;
    this.contactFormErrors[key] = [];
    this.contactFormTouched[key] = false;
    if (field.isToggle && field.groupKey) {
      this.contactFormGroupToggles[field.groupKey] = key;
      this.contactFormGroups[field.groupKey] = false;
    } else if (field.groupKey) {
      if (!this.contactFormGroupMembers[field.groupKey]) this.contactFormGroupMembers[field.groupKey] = [];
      this.contactFormGroupMembers[field.groupKey].push(key);
    }
    this.contactFormValues[key] = this.defaultFieldValue(field);
  });

  const saved = this.loadSavedAddressForm();
  this.checkoutFormData = saved;
  const savedValues = saved.values || {};
  const savedGroups = saved.groups || {};

  Object.entries(this.contactFormFieldMap).forEach(([key, field]) => {
    if (field.isToggle && field.groupKey) {
      const boolVal = typeof savedGroups[field.groupKey] === 'boolean'
        ? savedGroups[field.groupKey]
        : !!savedValues[key];
      this.contactFormGroups[field.groupKey] = boolVal;
      this.contactFormValues[key] = boolVal;
    } else if (field.groupKey && !(field.groupKey in this.contactFormGroups)) {
      this.contactFormGroups[field.groupKey] = false;
    }

    if (this.isAddressField(field)) {
      this.contactFormValues[key] = this.normalizeAddressValue(savedValues[key] ?? this.contactFormValues[key]);
    } else if (!field.isToggle && Object.prototype.hasOwnProperty.call(savedValues, key)) {
      this.contactFormValues[key] = savedValues[key];
    }
  });

  this.addressFormLoaded = true;
},

normalizeFieldKey(label, idx, existingSet = new Set()) {
  const base = String(label || `field-${idx}`)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const seed = base || `field-${idx}`;
  let key = seed;
  let counter = 1;
  while (existingSet.has(key)) {
    key = `${seed}-${counter++}`;
  }
  return key;
},

defaultFieldValue(field) {
  if (!field) return '';
  switch (field.type) {
    case 'checkbox_toggle_fieldset':
    case 'checkbox':
      return false;
    case 'textarea':
    case 'text':
    case 'email':
    case 'tel':
      return '';
    case 'address':
    case 'billing_address':
      return { street: '', extra: '', city: '', zip: '', district: '' };
    default:
      return '';
  }
},

fieldTypeValue(field) {
  if (field && typeof field === 'object') {
    return String(field.type || '').toLowerCase();
  }
  return String(field || '').toLowerCase();
},
isAddressType(value) {
  const t = this.fieldTypeValue(value);
  return t === 'address' || t === 'billing_address';
},
isAddressField(field) {
  return !!field && this.isAddressType(field);
},
isBillingAddressField(field) {
  if (!field) return false;
  if (this.fieldTypeValue(field) === 'billing_address') return true;
  const key = String(field.key || '').toLowerCase();
  const label = String(field.label || '').toLowerCase();
  const name = String(field.name || '').toLowerCase();
  return key.includes('billing') || label.includes('faktura') || label.includes('billing') || name.includes('faktura') || name.includes('billing');
},

normalizeAddressValue(val) {
  if (val && typeof val === 'object') {
    return {
      street: String(val.street ?? val.line1 ?? '').trim(),
      extra: String(val.extra ?? val.line2 ?? '').trim(),
      city: String(val.city ?? '').trim(),
      zip: String(val.zip ?? '').trim(),
      district: String(val.district ?? '').trim()
    };
  }
  if (typeof val === 'string') {
    return { street: val.trim(), extra: '', city: '', zip: '', district: '' };
  }
  return { street: '', extra: '', city: '', zip: '', district: '' };
},

addressAutocomplete(fieldKey) {
  const store = this;
  return {
    fieldKey,
    query: '',
    open: false,
    highlighted: -1,
    isCommitted: false,
    get addressPrefilledFromAccount() {
      return !!store.addressPrefilledFromAccount;
    },
    init() {
      store.loadAddressSuggestions().then(() => {
        this.syncFromValue(store.contactFormValues[this.fieldKey]);
      });
      this.$watch(
        () => store.contactFormValues[this.fieldKey],
        (value) => this.syncFromValue(value)
      );
    },
    get filteredOptions() {
      const options = store.addressAutocompleteOptions || [];
      const q = this.query.trim().toLowerCase();
      if (!q) return options.slice(0, 8);
      return options.filter(opt => opt.search.includes(q)).slice(0, 8);
    },
    get hasValue() {
      const value = store.normalizeAddressValue(store.contactFormValues[this.fieldKey]);
      return !!(value.street || value.extra || value.city || value.zip || value.district);
    },
    get hasSelection() {
      return this.isCommitted && !!this.summaryBody;
    },
    get shouldShowLabel() {
      if (this.hasSelection) return false;
      return !((this.query || '').trim().length);
    },
    get summaryBody() {
      return store.formatAddressSummary(store.contactFormValues[this.fieldKey]);
    },
    get summaryHeading() {
      return store.formatAddressStreet(store.contactFormValues[this.fieldKey]);
    },
    openSuggestions() {
      if (this.hasSelection) return;
      this.open = true;
      if (this.highlighted === -1 && this.filteredOptions.length) {
        this.highlighted = 0;
      }
    },
    closeSuggestions() {
      this.open = false;
      this.highlighted = -1;
    },
    onInput(event) {
      this.query = event.target.value;
      this.isCommitted = false;
      const next = store.normalizeAddressValue(store.contactFormValues[this.fieldKey]);
      const updated = { ...next, street: this.query };
      store.contactFormValues[this.fieldKey] = updated;
      store.handleFieldInput(this.fieldKey);
      this.openSuggestions();
    },
    onBlur() {
      setTimeout(() => this.closeSuggestions(), 120);
      store.handleFieldBlur(this.fieldKey);
    },
    highlightNext() {
      if (!this.filteredOptions.length) return;
      this.openSuggestions();
      this.highlighted = (this.highlighted + 1) % this.filteredOptions.length;
    },
    highlightPrev() {
      if (!this.filteredOptions.length) return;
      this.openSuggestions();
      this.highlighted = this.highlighted <= 0 ? this.filteredOptions.length - 1 : this.highlighted - 1;
    },
    selectHighlighted() {
      if (this.highlighted < 0 || this.highlighted >= this.filteredOptions.length) return;
      this.selectOption(this.filteredOptions[this.highlighted]);
    },
    selectOption(opt) {
      const value = store.normalizeAddressValue(opt);
      store.contactFormValues[this.fieldKey] = value;
      store.handleFieldInput(this.fieldKey);
      store.handleFieldBlur(this.fieldKey);
      this.isCommitted = this.hasCompleteValue(value);
      this.query = this.isCommitted ? '' : store.formatAddressLine(value);
      this.closeSuggestions();
    },
    clearSelection(focusAfter = false) {
      store.contactFormValues[this.fieldKey] = store.normalizeAddressValue({});
      this.query = '';
      this.isCommitted = false;
      store.handleFieldInput(this.fieldKey);
      store.handleFieldBlur(this.fieldKey);
      this.closeSuggestions();
      if (focusAfter) {
        this.focusInputSoon();
        this.openSuggestions();
      }
    },
    syncFromValue(value) {
      const normalized = store.normalizeAddressValue(value);
      const current = store.normalizeAddressValue(store.contactFormValues[this.fieldKey]);
      if (!this.addressesEqual(normalized, current)) {
        store.contactFormValues[this.fieldKey] = normalized;
      }
      this.isCommitted = this.hasCompleteValue(normalized);
      this.query = this.isCommitted ? '' : store.formatAddressLine(normalized);
      if (this.hasSelection) {
        this.closeSuggestions();
      }
    },
    addressesEqual(a, b) {
      if (!a && !b) return true;
      const keys = ['street', 'extra', 'city', 'zip', 'district'];
      return keys.every(k => String(a?.[k] ?? '') === String(b?.[k] ?? ''));
    },
    hasCompleteValue(addr) {
      const normalized = store.normalizeAddressValue(addr);
      return !!(normalized.street && (normalized.city || normalized.zip));
    },
    focusInputSoon() {
      this.$nextTick(() => {
        requestAnimationFrame(() => {
          if (this.$refs?.input && typeof this.$refs.input.focus === 'function') {
            this.$refs.input.focus();
          }
        });
      });
    }
  };
},

addressPlaceholder(field, part) {
  if (!this.isAddressField(field)) return undefined;
  const ph = field.placeholder;
  if (ph && typeof ph === 'object') {
    const val = ph?.[part];
    return val ? String(val) : undefined;
  }
  if (typeof ph === 'string') {
    return ph;
  }
  return undefined;
},

loadSavedAddressForm() {
  try {
    const raw = localStorage.getItem('checkout.addressForm');
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return { values: {}, groups: {} };
    return {
      values: parsed.values && typeof parsed.values === 'object' ? parsed.values : {},
      groups: parsed.groups && typeof parsed.groups === 'object' ? parsed.groups : {},
      timestamp: parsed.timestamp || null
    };
  } catch (e) {
    console.warn('Failed to load saved address form', e);
    return { values: {}, groups: {} };
  }
},

hydrateAddressFormValues() {
  if (!this.addressFormLoaded) return;
  const saved = this.loadSavedAddressForm();
  this.checkoutFormData = saved;
  this.addressFormSubmitAttempted = false;
  this.addressFormMessage = '';
  const values = saved.values || {};
  const groups = saved.groups || {};
  const auth = Alpine.store('auth');
  const account = (auth?.isAuthenticated && auth?.account) ? auth.account : null;
  const accountId = String(account?.id || '').toLowerCase();
  const isDemoAccount = accountId.includes('demo') || String(account?.email || '').includes('demo@fit.test');
  const allowAccountPrefill = !!(account && auth?.isAuthenticated && auth?.lastLoginAt && !isDemoAccount);
  let prefilledFromAccount = false;
  Object.entries(this.contactFormFieldMap).forEach(([key, field]) => {
    if (field.isToggle && field.groupKey) {
      const boolVal = typeof groups[field.groupKey] === 'boolean'
        ? groups[field.groupKey]
        : !!values[key];
      this.contactFormGroups[field.groupKey] = boolVal;
      this.contactFormValues[key] = boolVal;
    } else if (this.isAddressField(field)) {
      if (values[key]) {
        this.contactFormValues[key] = this.normalizeAddressValue(values[key]);
      } else if (allowAccountPrefill && !this.addressSummaryIsBilling(field)) {
        const pref = this.prefillValueFromAccount(field, account);
        if (pref) {
          this.contactFormValues[key] = pref;
          prefilledFromAccount = true;
        }
      } else {
        this.contactFormValues[key] = this.normalizeAddressValue(this.contactFormValues[key]);
      }
    } else if (!field.isToggle && Object.prototype.hasOwnProperty.call(values, key)) {
      this.contactFormValues[key] = values[key];
    } else if (allowAccountPrefill) {
      const incoming = this.prefillValueFromAccount(field, account);
      if (incoming) {
        this.contactFormValues[key] = incoming;
        prefilledFromAccount = true;
      }
    }
    this.contactFormErrors[key] = [];
    this.contactFormTouched[key] = false;
  });
  this.addressPrefilledFromAccount = prefilledFromAccount;
},

persistAddressForm() {
  const cloneValues = JSON.parse(JSON.stringify(this.contactFormValues));
  const payload = {
    values: cloneValues,
    groups: { ...this.contactFormGroups },
    timestamp: Date.now()
  };
  try {
    localStorage.setItem('checkout.addressForm', JSON.stringify(payload));
  } catch (e) {
    console.warn('Failed to persist address form', e);
  }
  this.checkoutFormData = payload;
},

isPickupDelivery() {
  return this.hasPrimaryPickup();
},

shouldShowSection(name) {
  if (!name) return true;
  const normalized = String(name).trim().toLowerCase();
  if (normalized === 'doručovací adresa') {
    return this.requiresHomeAddress();
  }
  if (this.isCourierSection(name)) {
    return this.shouldShowCourierDetails();
  }
  return true;
},

isFieldVisible(field) {
  if (!field) return false;
  if (!this.shouldShowSection(field.section)) return false;
  if (field.isToggle) return true;
  if (!field.groupKey) return true;
  return !!this.contactFormGroups[field.groupKey];
},

isPhoneField(field) {
  if (!field) return false;
  if (field.type === 'tel') return true;
  const validations = Array.isArray(field.validations) ? field.validations : [];
  return validations.some(v => (v?.type || '').toLowerCase() === 'phone');
},

isFieldActive(field) {
  if (!field || field.isToggle) return false;
  if (!this.shouldShowSection(field.section)) return false;
  if (!field.groupKey) return true;
  return !!this.contactFormGroups[field.groupKey];
},

handleGroupToggle(fieldKey) {
  const field = this.contactFormFieldMap[fieldKey];
  if (!field || !field.groupKey) return;
  const value = !!this.contactFormValues[fieldKey];
  this.contactFormGroups[field.groupKey] = value;
  if (!value) {
    (this.contactFormGroupMembers[field.groupKey] || []).forEach(memberKey => {
      this.contactFormErrors[memberKey] = [];
      if (!this.addressFormSubmitAttempted) this.contactFormTouched[memberKey] = false;
    });
  } else if (this.addressFormSubmitAttempted) {
    (this.contactFormGroupMembers[field.groupKey] || []).forEach(memberKey => this.validateFieldByKey(memberKey));
  }
},

handleFieldBlur(fieldKey) {
  this.contactFormTouched[fieldKey] = true;
  this.validateFieldByKey(fieldKey);
},

handleFieldInput(fieldKey) {
  if (this.addressFormMessage) this.addressFormMessage = '';
  if (this.addressFormSubmitAttempted || this.contactFormTouched[fieldKey]) {
    this.validateFieldByKey(fieldKey);
  }
},

computeFieldErrors(field) {
  if (!this.isFieldActive(field)) return [];
  const value = this.contactFormValues[field.key];
  const errors = [];
  const rules = Array.isArray(field.validations) ? field.validations : [];
  const textValue = typeof value === 'string' ? value.trim() : value;

  for (const rule of rules) {
    const msg = rule?.fails || 'Zkontrolujte hodnotu';
    switch (rule?.type) {
      case 'required': {
        let ok = true;
        if (this.isAddressField(field)) {
          const addr = this.normalizeAddressValue(value);
          ok = !!(addr.street && addr.city && addr.zip);
        } else if (typeof value === 'boolean') {
          ok = value;
        } else if (Array.isArray(value)) {
          ok = value.length > 0;
        } else {
          ok = String(textValue || '').length > 0;
        }
        if (!ok) errors.push(msg);
        break;
      }
      case 'email': {
        const v = String(value || '').trim();
        if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
          errors.push(msg);
        }
        break;
      }
      case 'phone': {
        const digits = String(value || '').replace(/\D+/g, '');
        if (digits && digits.length !== 9) {
          errors.push(msg);
        }
        break;
      }
      case 'address': {
        const addr = this.normalizeAddressValue(value);
        const zipPlain = addr.zip.replace(/\s+/g, '');
        if (!(addr.street && addr.city && /^\d{5}$/.test(zipPlain))) {
          errors.push(msg);
        }
        break;
      }
      default:
        break;
    }
  }
  return Array.from(new Set(errors));
},

validateFieldByKey(fieldKey) {
  const field = this.contactFormFieldMap[fieldKey];
  if (!field) return [];
  const errs = this.computeFieldErrors(field);
  this.contactFormErrors[fieldKey] = errs;
  return errs;
},

validateAllFields() {
  let ok = true;
  this.contactFormSections.forEach(section => {
    if (!this.shouldShowSection(section.name)) return;
    section.fields.forEach(field => {
      if (field.isToggle) return;
      const errs = this.validateFieldByKey(field.key);
      if (errs.length) ok = false;
    });
  });
  return ok;
},

submitAddressForm() {
  if (!this.addressFormLoaded) return;
  this.addressFormSubmitAttempted = true;
  Object.keys(this.contactFormTouched).forEach(key => { this.contactFormTouched[key] = true; });
  const valid = this.validateAllFields();
  if (!valid) {
    this.addressFormMessage = 'Zkontrolujte zvýrazněné údaje ve formuláři.';
    return;
  }
  this.addressFormMessage = '';
  this.persistAddressForm();
  this.refreshCheckoutReview();
  this.resetCheckoutConsents();
  location.hash = '/purchase-review';
},

formatPhoneDisplay(val) {
  const digits = String(val || '').replace(/\D+/g, '');
  if (!digits) return '';
  return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
},

formatAddressLine(val) {
  const addr = this.normalizeAddressValue(val);
  const parts = [];
  if (addr.street) parts.push(addr.street);
  const cityLine = [addr.zip, addr.city].filter(Boolean).join(' ');
  if (cityLine) parts.push(cityLine);
  return parts.join(', ');
},

formatAddressStreet(val) {
  return this.normalizeAddressValue(val).street || '';
},

formatAddressSummary(val) {
  const addr = this.normalizeAddressValue(val);
  const parts = [];
  if (addr.extra) parts.push(addr.extra);
  const cityLine = [addr.zip, addr.city].filter(Boolean).join(' ');
  if (cityLine) parts.push(cityLine);
  if (addr.district) parts.push(addr.district);
  return parts.join('\n');
},

formatAddressDisplay(val) {
  const addr = this.normalizeAddressValue(val);
  const parts = [];
  if (addr.street) parts.push(addr.street);
  if (addr.extra) parts.push(addr.extra);
  const cityLine = [addr.zip, addr.city].filter(Boolean).join(' ');
  if (cityLine) parts.push(cityLine);
  return parts.join('\n');
},

formatFieldValue(field, value) {
  if (!field) return '';
  if (this.isAddressField(field)) {
    return this.formatAddressDisplay(value);
  }
  if (this.isPhoneField(field)) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    const formatted = this.formatPhoneDisplay(trimmed);
    return field.prefix ? `${field.prefix} ${formatted}` : formatted;
  }
  return String(value ?? '').trim();
},
prefillValueFromAccount(field, account) {
  if (!field || !account) return '';
  if (this.isAddressField(field)) {
    if (this.addressSummaryIsBilling(field)) return '';
    const addr = account.address || account.deliveryAddress || null;
    if (!addr) return '';
    return this.normalizeAddressValue(addr);
  }
  const label = String(field.label || '').toLowerCase();
  const type = String(field.type || '').toLowerCase();
  const phone = account.phone || account.tel || account.phoneNumber || '';
  const stripPrefix = (value, prefix) => {
    if (!value) return '';
    let next = String(value).trim();
    const esc = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (prefix) {
      const regex = new RegExp('^' + esc(prefix.trim()) + '\\s*', 'i');
      next = next.replace(regex, '');
    }
    const defaultRegex = new RegExp('^\\+?420\\s*', 'i');
    next = next.replace(defaultRegex, '');
    return next.trim();
  };
  if (type === 'email' || label.includes('e-mail') || label.includes('email')) {
    return account.email || '';
  }
  if (this.isPhoneField(field) || label.includes('telefon')) {
    return stripPrefix(phone, field.prefix);
  }
  if (label.includes('jméno a příjmení')) {
    return [account.firstName, account.lastName].filter(Boolean).join(' ').trim();
  }
  if (label.includes('jméno')) return account.firstName || '';
  if (label.includes('příjmení')) return account.lastName || '';
  return '';
},

sectionSummary(sectionName, saved = null) {
  const data = saved || this.checkoutFormData || this.loadSavedAddressForm();
  const section = this.contactFormSections.find(sec => sec.name === sectionName);
  if (!section) return [];
  const values = data.values || {};
  const groups = data.groups || {};

  return section.fields
    .filter(field => {
      if (field.isToggle) return false;
      if (field.groupKey && !groups[field.groupKey]) return false;
      const formatted = this.formatFieldValue(field, values[field.key]);
      return formatted.length > 0;
    })
    .map(field => ({
      label: field.label,
      value: this.formatFieldValue(field, values[field.key])
    }));
},
shippingAddressSummary(saved = null) {
  const data = saved || this.checkoutFormData || this.loadSavedAddressForm();
  const section = this.contactFormSections.find(sec => sec.name === 'Doručovací adresa');
  if (!section) return [];
  const values = data.values || {};
  const groups = data.groups || {};
  return section.fields
    .filter(field => {
      if (field.isToggle) return false;
      if (field.groupKey && !groups[field.groupKey]) return false;
      if (this.addressSummaryIsBilling(field)) return false;
      const formatted = this.formatFieldValue(field, values[field.key]);
      return formatted.length > 0;
    })
    .map(field => ({
      label: field.label,
      value: this.formatFieldValue(field, values[field.key])
    }));
},
liveSectionSummary(sectionName) {
  const payload = {
    values: this.contactFormValues,
    groups: this.contactFormGroups
  };
  return this.sectionSummary(sectionName, payload);
},
homeAddressSummary() {
  return this.liveSectionSummary('Doručovací adresa');
},

groupSummary(groupName, saved = null) {
  const data = saved || this.checkoutFormData || this.loadSavedAddressForm();
  const groups = data.groups || {};
  if (!groups[groupName]) return [];
  const values = data.values || {};
  const keys = this.contactFormGroupMembers[groupName] || [];
  return keys
    .map(key => this.contactFormFieldMap[key])
    .filter(Boolean)
    .map(field => ({
      label: field.label,
      value: this.formatFieldValue(field, values[field.key])
    }))
    .filter(entry => entry.value.length > 0);
},

checkoutCartSummary() {
  const cart = Alpine.store('cart');
  if (!cart) {
    return {
      items: [],
      totals: { subtotal: 0, productDiscount: 0, couponDiscount: 0, giftCardDiscount: 0, discounts: 0, toPay: 0 },
      coupons: [],
      giftCards: []
    };
  }
  const items = cart.list().map(it => ({
    id: it.id,
    name: it.product?.name || it.name || '',
    qty: it.qty,
    price: cart._linePrice(it),
    unitPrice: it.price,
    image: it.image
  }));
  const subtotal = typeof cart.subtotal === 'function' ? cart.subtotal() : 0;
  const productDiscount = typeof cart.totalDiscountsRaw === 'function' ? cart.totalDiscountsRaw() : 0;
  const coupons = typeof cart.listCoupons === 'function' ? cart.listCoupons() : (cart.coupons || []);
  const couponBreakdown = coupons.map(coupon => ({
    ...coupon,
    amount: this.couponValueFor(coupon, subtotal)
  })).filter(entry => entry.amount > 0);
  const couponDiscount = couponBreakdown.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  const giftCards = typeof cart.listGiftCards === 'function' ? cart.listGiftCards() : (cart.giftCards || []);
  const giftCardBreakdown = giftCards.map(card => ({
    ...card,
    amount: this.giftCardValueFor(card)
  })).filter(entry => entry.amount > 0);
  const giftCardDiscount = giftCardBreakdown.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  return {
    items,
    coupons: couponBreakdown,
    giftCards: giftCardBreakdown,
    totals: {
      subtotal,
      productDiscount,
      couponDiscount,
      giftCardDiscount,
      discounts: typeof cart.promoDiscount === 'function' ? cart.promoDiscount() : couponDiscount + giftCardDiscount,
      toPay: typeof cart.totalToPay === 'function' ? cart.totalToPay() : Math.max(0, subtotal - (couponDiscount + giftCardDiscount))
    }
  };
},

cartFreeShippingActive() {
  const cart = Alpine.store('cart');
  if (!cart) return false;
  if (typeof cart.hasFreeShipping === 'function') return !!cart.hasFreeShipping();
  const threshold = Number(cart.freeShipThreshold || 0);
  if (threshold <= 0) return false;
  return Number(cart.totalToPay?.() || 0) >= threshold;
},
effectiveDeliveryPrice(order) {
  if (!order || !order.delivery) return 0;
  if (order.key === 'ours' && this.cartFreeShippingActive()) return 0;
  return Number(order.delivery.finalPrice || 0);
},

deliveryFeeTotal() {
  const orders = this.checkoutReview?.orders || [];
  return orders.reduce((sum, order) => sum + this.effectiveDeliveryPrice(order), 0);
},
paymentFeeTotal() {
  const orders = this.checkoutReview?.orders || [];
  return orders.reduce((sum, order) => sum + Number(order.payment?.finalPrice || 0), 0);
},
isOnlinePaymentMeta(meta) {
  if (!meta) return false;
  const name = String(meta.name || '').toLowerCase();
  const patterns = ['kartou online', 'benefitní kartou online', 'online platba'];
  return patterns.some(label => name.includes(label));
},

isSelectedPaymentOnline() {
  const orders = this.checkoutReview?.orders || this.buildCheckoutOrders();
  const hasPartnerOrder = orders.some(order => order.key === 'partner');
  if (hasPartnerOrder) return true;
  const oursOrder = orders.find(order => order.key === 'ours');
  const paymentMeta = oursOrder?.payment || this.paymentMetaFor('ours');
  return this.isOnlinePaymentMeta(paymentMeta);
},

paygateTotal() {
  const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };
  const orders = this.checkoutReview?.orders || this.buildCheckoutOrders();
  const total = orders.reduce((sum, order) => {
    const requiresOnline = order.key === 'partner' || this.isOnlinePaymentMeta(order.payment);
    if (!requiresOnline) return sum;
    const items = toNumber(order.totals?.total || 0);
    const delivery = toNumber(this.effectiveDeliveryPrice(order));
    const payment = toNumber(order.payment?.finalPrice || 0);
    return sum + items + delivery + payment;
  }, 0);
  return total > 0 ? total : 0;
},
paygateVariant() {
  const orders = this.checkoutReview?.orders || this.buildCheckoutOrders();
  const hasBenefit = orders.some(order => this.isOnlinePaymentMeta(order.payment) && order.payment?.benefit);
  return hasBenefit ? 'benefit' : 'online';
},

buildCheckoutOrders() {
  const cart = Alpine.store('cart');
  const grouped = cart?.groupedTotals?.() || {};
  const orders = [];
  const pushOrder = (key) => {
    const delivery = this.deliveryMetaFor(key);
    const payment = this.paymentMetaFor(key);
    const rawItems = grouped?.[key]?.items || [];
    const items = rawItems.map(item => {
      const image = item.image || cart?.imgFor?.(item.product) || item.product?.image || '';
      const qty = Number(item.qty || 1);
      const unitPrice = Number(item.price || 0);
      const unitPriceBefore = Number(item.priceBefore ?? item.product?.price ?? unitPrice);
      const linePrice = typeof cart?._linePrice === 'function'
        ? cart._linePrice(item)
        : unitPrice * qty;
      const lineDiscount = Math.max(0, (unitPriceBefore - unitPrice) * qty);
      return {
        id: item.id,
        name: item.product?.name || item.name || '',
        qty: item.qty,
        price: linePrice,
        unitPrice,
        unitPriceBefore,
        lineDiscount,
        image
      };
    });
    if (!delivery && !payment && !items.length) return;
    const label = key === 'partner' ? 'Dodavatel' : 'Naše sklady';
    const title = key === 'partner'
      ? 'Doručení od dodavatele'
      : (this.isPickupMeta(delivery) ? 'Vyzvednutí' : 'Doručení');
    orders.push({
      key,
      title,
      label,
      delivery,
      payment,
      items,
      totals: grouped?.[key]
        ? {
            subtotal: grouped[key].subtotal || 0,
            discount: grouped[key].discount || 0,
            productDiscount: grouped[key].productDiscount || 0,
            promoDiscount: grouped[key].promoDiscount || 0,
            total: grouped[key].total || 0
          }
        : { subtotal: 0, discount: 0, productDiscount: 0, promoDiscount: 0, total: 0 }
    });
  };
  pushOrder('ours');
  pushOrder('partner');
  return orders;
},

openPaygate() {
  if (this.paygateModal.open) return;
  if (this.route !== 'purchase-review') {
    this.finalizePurchase();
    return;
  }
  this.refreshCheckoutReview();
  const amount = this.paygateTotal();
  if (amount <= 0) {
    this.paygateModal.open = false;
    this.paygateModal.step = 'intro';
    this.paygateModal.amount = 0;
    this.paygateModal.variant = 'online';
    this.syncPaygateModal();
    this.finalizePurchase();
    return;
  }
  this.paygateModal.amount = amount;
  this.paygateModal.variant = this.paygateVariant();
  this.paygateModal.step = 'intro';
  this.paygateModal.open = true;
  this.$nextTick(() => this.syncPaygateModal());
},

startPaygateProcessing() {
  if (this.paygateModal.step !== 'intro') return;
  this.paygateModal.step = 'processing';
  if (this.paygateModal.timer) {
    clearTimeout(this.paygateModal.timer);
    this.paygateModal.timer = null;
  }
  this.paygateModal.timer = setTimeout(() => {
    this.paygateModal.step = 'success';
    if (this.paygateModal.timer) {
      clearTimeout(this.paygateModal.timer);
      this.paygateModal.timer = null;
    }
    this.paygateModal.timer = setTimeout(() => {
      this.closePaygate(true);
    }, 2000);
  }, 2000);
},

closePaygate(proceed = false) {
  if (this.paygateModal.timer) {
    clearTimeout(this.paygateModal.timer);
    this.paygateModal.timer = null;
  }
  this.paygateModal.open = false;
  this.paygateModal.step = 'intro';
  this.paygateModal.amount = 0;
  this.paygateModal.variant = 'online';
  this.syncPaygateModal();
  if (proceed) {
    this.finalizePurchase();
  }
},

paygateManualCancel() {
  if (this.paygateModal.step !== 'intro') return;
  this.closePaygate(false);
},

syncPaygateModal() {
  const dialog = this.$refs?.paygate;
  if (!dialog) return;
  try {
    if (this.paygateModal.open) {
      if (typeof dialog.showModal === 'function' && !dialog.open) {
        dialog.showModal();
      }
    } else {
      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.close();
      }
      if (typeof dialog.removeAttribute === 'function') {
        dialog.removeAttribute('open');
      }
    }
  } catch (e) {
    console.warn('paygate modal sync failed', e);
  }
},

finalizePurchase() {
  this.closePaygate(false);
  const reviewSnapshot = this.checkoutReview || this.refreshCheckoutReview();
  const orderStore = Alpine.store('activeOrder');
  if (orderStore && typeof orderStore.createFromCheckout === 'function') {
    try {
      orderStore.createFromCheckout({
        review: reviewSnapshot,
        deliveryMeta: this.deliveryMetaFor('ours'),
        paymentMeta: this.paymentMetaFor('ours'),
        partnerOrders: (reviewSnapshot.orders || []).filter(o => o.key === 'partner'),
        orders: reviewSnapshot.orders,
        freeShippingApplied: this.cartFreeShippingActive()
      });
    } catch (e) {
      console.warn('activeOrder: failed to create order snapshot', e);
    }
  }
  this.reviewValidationErrors = [];
  this.suppressCartRedirect = true;
  const cart = Alpine.store('cart');
  cart?.clear?.();
  this.checkoutReview = null;
  try { localStorage.removeItem('checkout.review'); } catch (_) {}
  location.hash = '/active-order';
},

refreshCheckoutReview() {
  this.loadCheckoutMeta();
  if (!this.addressFormLoaded && !this.contactFormSections.length && this.contactFormSchema.length) {
    this.initAddressForm(this.contactFormSchema);
  }
  const saved = this.checkoutFormData || this.loadSavedAddressForm();
  this.checkoutFormData = saved;
  const review = {
    contact: this.sectionSummary('Kontaktní údaje', saved),
    shippingAddress: this.shippingAddressSummary(saved),
    billingAddress: this.groupSummary('Podrobnosti k fakturaci', saved),
    deliveryDetails: this.groupSummary('Kurýr', saved),
    companyDetails: this.groupSummary('Firemní údaje', saved),
    orders: this.buildCheckoutOrders(),
    cart: this.checkoutCartSummary()
  };
  this.checkoutReview = review;
  try { localStorage.setItem('checkout.review', JSON.stringify(review)); }
  catch (e) { console.warn('Failed to persist checkout review', e); }
  return review;
},

formatCZK(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return window.__fitMoney.format(0, { fromCurrency: 'CZK' });
  return window.__fitMoney.format(num, { fromCurrency: 'CZK' });
},

resetCheckoutConsents() {
  this.checkoutConsents = { terms: false, privacy: false, marketing: false };
  this.reviewValidationErrors = [];
},

purchaseReviewReady() {
  return !!(this.checkoutConsents.terms && this.checkoutConsents.privacy);
},
scrollToReviewErrors() {
  this.$nextTick(() => {
    const el = this.$refs?.reviewConsents;
    if (!el || typeof el.scrollIntoView !== 'function') return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (el.querySelector && typeof el.querySelector === 'function') {
      const firstInput = el.querySelector('input[type="checkbox"]');
      firstInput?.focus?.({ preventScroll: true });
    }
  });
},

submitPurchaseReview() {
  if (!this.purchaseReviewReady()) {
    this.reviewValidationErrors = ['Potvrďte souhlas s obchodními podmínkami a zásadami zpracování osobních údajů.'];
    this.scrollToReviewErrors();
    return;
  }
  this.reviewValidationErrors = [];
  if (this.isSelectedPaymentOnline()) {
    this.openPaygate();
    return;
  }
  this.finalizePurchase();
},

loadCheckoutReviewFromStorage() {
  this.loadCheckoutMeta();
  try {
    const raw = localStorage.getItem('checkout.review');
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') {
      if (!Array.isArray(parsed.orders)) {
        parsed.orders = this.buildCheckoutOrders();
      }
      this.checkoutReview = parsed;
    }
  } catch (e) {
    console.warn('Failed to load checkout review', e);
  }
}

});

  Alpine.data('storeApp', storeAppDefinition);
  window.storeApp = storeAppDefinition;
Alpine.data('storeApp', storeAppDefinition);
window.storeApp = storeAppDefinition;
