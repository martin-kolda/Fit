document.addEventListener('alpine:init', () => {
if (!Alpine.store('auth')) {
      const storageKey = 'fit:auth';
      const defaults = {
        isAuthenticated: false,
        account: null,
        lastLoginAt: null,
        throttleMs: 1300,
        fallbackAccount: {
          id: 'demo-user',
          email: 'demo@fit.test',
          firstName: 'Demo',
          lastName: 'Uživatel'
        }
      };
      const load = () => {
        if (typeof localStorage === 'undefined') return {};
        try {
          const raw = localStorage.getItem(storageKey);
          if (!raw) return {};
          const parsed = JSON.parse(raw);
          return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
          console.warn('auth store load failed', e);
          return {};
        }
      };
      const clone = (value) => {
        if (value == null || typeof value !== 'object') return value;
        try {
          return JSON.parse(JSON.stringify(value));
        } catch {
          if (Array.isArray(value)) return value.map(clone);
          return { ...value };
        }
      };
      const normalizeAccount = (payload, fallback = {}, options = {}) => {
        const { defaultFallback = false } = options || {};
        const hasPayload = payload && typeof payload === 'object';
        if (!hasPayload && !defaultFallback) return null;
        const base = clone(fallback) || {};
        const incoming = hasPayload ? clone(payload) : {};
        const merged = { ...base, ...incoming };
        if (!Object.keys(merged).length) return null;
        if (merged.email != null) merged.email = String(merged.email).trim();
        if (merged.firstName != null) merged.firstName = String(merged.firstName);
        if (merged.lastName != null) merged.lastName = String(merged.lastName);
        merged.id = String((merged.id || base?.id || 'user') || 'user');
        return merged;
      };
      const accountInitials = (account) => {
        if (!account) return '';
        const getInitial = (value) => {
          if (!value) return '';
          return String(value).trim().charAt(0).toUpperCase();
        };
        const first = getInitial(account.firstName);
        const last = getInitial(account.lastName);
        if (first || last) return `${first}${last || ''}`;
        const email = String(account.email || '').trim();
        if (email) {
          const sanitized = email.replace(/[^A-Za-z0-9]/g, '');
          return sanitized.slice(0, 2).toUpperCase();
        }
        return '';
      };
      const ensureThrottle = (value) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return defaults.throttleMs;
        if (num < 0) return defaults.throttleMs;
        return num;
      };
      const emit = (name, detail = {}) => {
        window.dispatchEvent(new CustomEvent(name, { detail }));
      };

      const stored = load();
      const initial = { ...defaults, ...stored };
      initial.fallbackAccount = normalizeAccount(
        stored?.fallbackAccount ?? initial.fallbackAccount,
        defaults.fallbackAccount,
        { defaultFallback: true }
      ) || clone(defaults.fallbackAccount);
      initial.account = normalizeAccount(
        stored?.account ?? initial.account,
        initial.fallbackAccount,
        { defaultFallback: false }
      );
      const initialThrottle = ensureThrottle(stored?.throttleMs ?? initial.throttleMs);

      Alpine.store('auth', {
        key: storageKey,
        defaults,
        isAuthenticated: !!initial.isAuthenticated && !!initial.account,
        account: initial.account,
        lastLoginAt: initial.lastLoginAt || null,
        fallbackAccount: initial.fallbackAccount,
        throttleMs: initialThrottle,
        modalOpen: false,
        view: 'login',
        status: 'idle',
        error: '',
        loginForm: {
          email: initial.account?.email || initial.fallbackAccount?.email || '',
          password: ''
        },
        registration: {
          loading: false,
          ready: false,
          loadError: '',
          step: 1,
          maxStep: 3,
          schema: [],
          fieldMap: {},
          fieldsByStep: {},
          values: {},
          errors: {},
          touched: {},
          groups: {},
          groupMembers: {},
          groupToggles: {},
          fieldRefs: {},
          flowOptions: [],
          selectedFlow: '',
          emailVerified: false,
          phase: 'idle',
          submitAttempted: false,
          passwordVisible: false,
          passwordRules: {
            length: false,
            capital: false,
            number: false
          },
          addressOptions: [],
          addressLoaded: false
        },
        forgotForm: {
          email: initial.account?.email || initial.fallbackAccount?.email || ''
        },
        passwordVisible: false,
        _timer: null,
        _registrationTimers: {
          email: null,
          process: null,
          success: null
        },
        accountTooltip: {
          visible: false,
          message: 'Váš účet',
          timer: null,
          duration: null
        },
        initials() {
          const active = accountInitials(this.account);
          if (active) return active;
          return accountInitials(this.fallbackAccount) || '??';
        },
        showAccountTooltip(message = 'Dokončete profil a získejte 100 Kč na první nákup!', duration = null) {
          const tip = this.accountTooltip;
          if (!tip) return;
          tip.message = message;
          tip.visible = true;
          if (tip.timer) {
            clearTimeout(tip.timer);
          }
          const timeout = Number(duration ?? tip.duration);
          if (Number.isFinite(timeout) && timeout > 0) {
            tip.timer = setTimeout(() => {
              tip.visible = false;
              tip.timer = null;
            }, timeout);
          } else {
            tip.timer = null;
          }
        },
        celebrateAccountAccess(type = 'success') {
          this.showAccountTooltip();
          this.accountConfetti(type);
        },
        accountConfetti(type = 'success') {
          const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
          if (prefersReduced || typeof window.confetti !== 'function') return;
          const button = document.querySelector('[data-auth-account-button]');
          let origin = { x: 0.5, y: 0.55 };
          if (button?.getBoundingClientRect) {
            const rect = button.getBoundingClientRect();
            const centerX = (rect.left + rect.width / 2) / (window.innerWidth || document.documentElement.clientWidth || 1);
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
            const scrollY = window.scrollY || window.pageYOffset || 0;
            const centerY = (rect.top + rect.height / 2 + scrollY) /
              ((document.documentElement.scrollHeight || viewportHeight) || 1);
            origin = {
              x: Math.min(0.98, Math.max(0.02, centerX)),
              y: Math.min(0.98, Math.max(0.02, centerY))
            };
          }
          const base = { ticks: 200, gravity: 0.9, scalar: 1, spread: 65, origin };
          const burst = (opts) => window.confetti({ ...base, ...opts });
          if (type === 'success') {
            burst({ particleCount: 45, spread: 75, scalar: 0.9 });
          } else if (type === 'celebrate') {
            burst({ particleCount: 70, angle: 60, origin: { x: Math.max(0.05, origin.x - 0.2), y: origin.y } });
            burst({ particleCount: 70, angle: 120, origin: { x: Math.min(0.95, origin.x + 0.2), y: origin.y } });
            burst({ particleCount: 60, spread: 120, scalar: 1.1 });
          } else if (type === 'coupon') {
            burst({ particleCount: 40, spread: 75, scalar: 0.9 });
          } else {
            burst({ particleCount: 60, spread: 100 });
          }
        },
        hideAccountTooltip() {
          const tip = this.accountTooltip;
          if (!tip) return;
          tip.visible = false;
          if (tip.timer) {
            clearTimeout(tip.timer);
            tip.timer = null;
          }
        },
        persist() {
          if (typeof localStorage === 'undefined') return;
          const payload = {
            isAuthenticated: !!this.isAuthenticated,
            account: this.account ? clone(this.account) : null,
            lastLoginAt: this.lastLoginAt || null,
            fallbackAccount: this.fallbackAccount ? clone(this.fallbackAccount) : null,
            throttleMs: this.throttleMs
          };
          try {
            localStorage.setItem(this.key, JSON.stringify(payload));
          } catch (e) {
            console.warn('auth store persist failed', e);
          }
        },
        openModal(view = 'login') {
          this.hideAccountTooltip();
          this.view = view;
          this.modalOpen = true;
          this.status = 'idle';
          this.error = '';
          this.passwordVisible = false;
          if (this.view === 'register') {
            this.prepareRegistration();
          } else {
            this.resetRegistrationState({ keepSchema: true });
          }
          if (!this.loginForm.email) {
            this.loginForm.email = this.fallbackAccount?.email || '';
          }
          this.loginForm.password = '';
          this.forgotForm.email = this.loginForm.email || this.fallbackAccount?.email || '';
        },
        closeModal() {
          this.modalOpen = false;
          this.status = 'idle';
          this.error = '';
          this.view = 'login';
          this.passwordVisible = false;
          this.forgotForm.email = this.loginForm.email || this.fallbackAccount?.email || '';
          if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
          }
          this.registrationCancelTimers();
          this.resetRegistrationState({ keepSchema: true });
        },
        handleAccountClick() {
          const hadTooltip = !!this.accountTooltip?.visible;
          this.hideAccountTooltip();
          if (this.isAuthenticated) {
            location.hash = '/my-account';
            if (hadTooltip) {
              setTimeout(() => this.hideAccountTooltip(), 50);
            }
            return;
          }
          this.openModal('login');
        },
        submitLogin() {
          if (this.status === 'loading') return;
          const email = String(this.loginForm.email || '').trim();
          const password = String(this.loginForm.password || '').trim();
          if (!email || !password) {
            this.status = 'error';
            this.error = 'Zadejte e-mail i heslo.';
            return;
          }
          this.status = 'loading';
          this.error = '';
          if (this._timer) clearTimeout(this._timer);
          const delay = Math.max(400, Number(this.throttleMs) || defaults.throttleMs);
          this._timer = setTimeout(() => {
            this._timer = null;
            const baseAccount = clone(this.fallbackAccount) || {};
            const account = {
              ...baseAccount,
              email,
              id: (baseAccount?.id && String(baseAccount.id)) || 'user',
              lastLoginEmail: email
            };
            this.isAuthenticated = true;
            this.account = account;
            this.lastLoginAt = new Date().toISOString();
            this.loginForm.email = email;
            this.loginForm.password = '';
            this.persist();
            emit('fit:auth-login', { account: this.account, source: 'manual' });
            this.closeModal();
            this.celebrateAccountAccess('success');
          }, delay);
        },
        loginWithFallback() {
          const account = this.fallbackAccount ? clone(this.fallbackAccount) : null;
          this.isAuthenticated = !!account;
          this.account = account;
          this.lastLoginAt = this.isAuthenticated ? new Date().toISOString() : null;
          this.loginForm.email = account?.email || this.loginForm.email;
          this.loginForm.password = '';
          this.persist();
          emit('fit:auth-login', { account: this.account, source: 'fallback' });
          this.closeModal();
          this.celebrateAccountAccess('success');
        },
        logout() {
          this.hideAccountTooltip();
          this.isAuthenticated = false;
          this.account = null;
          this.lastLoginAt = null;
          this.loginForm.password = '';
          if (this.fallbackAccount?.email) {
            this.loginForm.email = this.fallbackAccount.email;
          }
          this.forgotForm.email = this.loginForm.email || this.fallbackAccount?.email || '';
          this.persist();
          emit('fit:auth-logout', {});
        },
        reset() {
          this.hideAccountTooltip();
          this.closeModal();
          this.isAuthenticated = !!defaults.isAuthenticated && !!defaults.account;
          this.account = defaults.account ? clone(defaults.account) : null;
          this.lastLoginAt = defaults.lastLoginAt || null;
          this.fallbackAccount = clone(defaults.fallbackAccount);
          this.throttleMs = defaults.throttleMs;
          this.loginForm.email = this.fallbackAccount?.email || '';
          this.loginForm.password = '';
          this.forgotForm.email = this.fallbackAccount?.email || '';
          this.registrationCancelTimers();
          this.resetRegistrationState({ hard: true });
          this.persist();
          emit('fit:auth-reset', {});
        },
        setFallbackAccount(payload) {
          const normalized = normalizeAccount(payload, defaults.fallbackAccount, { defaultFallback: true }) || clone(defaults.fallbackAccount);
          this.fallbackAccount = clone(normalized);
          if (!this.isAuthenticated) {
            this.loginForm.email = normalized.email || this.loginForm.email;
          }
          if (this.view !== 'register') {
            this.forgotForm.email = normalized.email || this.forgotForm.email;
          }
          this.persist();
          emit('fit:auth-fallback-change', { fallbackAccount: this.fallbackAccount });
        },
        setThrottle(value) {
          this.throttleMs = ensureThrottle(value);
          this.persist();
          emit('fit:auth-throttle-change', { throttleMs: this.throttleMs });
        },
        toggleView(next) {
          const allowed = ['login', 'register', 'forgot'];
          const target = typeof next === 'string' && allowed.includes(next)
            ? next
            : (this.view === 'login' ? 'register' : 'login');
          this.view = target;
          this.status = 'idle';
          this.error = '';
          if (target !== 'login') {
            this.passwordVisible = false;
          }
          if (target === 'login') {
            this.loginForm.password = '';
          }
          if (target === 'forgot') {
            this.forgotForm.email = this.loginForm.email || this.fallbackAccount?.email || this.forgotForm.email || '';
          } else {
            this.forgotForm.email = this.fallbackAccount?.email || this.loginForm.email || this.forgotForm.email || '';
          }
          if (target === 'register') {
            this.prepareRegistration();
          } else {
            this.resetRegistrationState({ keepSchema: true });
          }
        },
        prepareRegistration(force = false) {
          if (this.registration.loading) return;
          if (force || !this.registration.ready) {
            this.loadRegistrationSchema();
            return;
          }
          this.resetRegistrationState({ keepSchema: true });
        },
        async loadRegistrationSchema() {
          if (this.registration.loading) return;
          this.registration.loading = true;
          this.registration.loadError = '';
          try {
            const res = await fetch('data/forms/registration.json', { cache: 'no-store' });
            const data = await res.json();
            this.initRegistration(Array.isArray(data) ? data : []);
          } catch (e) {
            console.warn('registration.json load failed', e);
            this.registration.loadError = 'Nepodařilo se načíst registrační formulář. Zkuste to prosím znovu.';
            this.initRegistration([]);
          } finally {
            this.registration.loading = false;
          }
        },
        initRegistration(schema) {
          const reg = this.registration;
          reg.schema = Array.isArray(schema) ? schema : [];
          reg.fieldMap = {};
          reg.fieldsByStep = {};
          reg.values = {};
          reg.errors = {};
          reg.touched = {};
          reg.groups = {};
          reg.groupMembers = {};
          reg.groupToggles = {};
          reg.fieldRefs = {};
          const flowOptions = [];
          const used = new Set();
          reg.schema.forEach((raw, idx) => {
            const step = Number(raw?.step) || 1;
            if (step === 1 && (raw?.type === 'radio') && !Array.isArray(raw?.items)) {
              const label = String(raw?.label || `Možnost ${idx + 1}`);
              const lowerLabel = label.toLowerCase();
              const isExistingCard = /kartu/.test(lowerLabel);
              const value = raw?.value || (isExistingCard ? 'existing-card' : 'new-member');
              flowOptions.push({
                id: `flow-${idx}`,
                label,
                value,
                disabled: !!raw?.disabled
              });
              return;
            }
            const key = this.registrationNormalizeKey(raw?.label || raw?.type || `field-${idx}`, idx, used);
            used.add(key);
            const field = {
              key,
              type: raw?.type || 'text',
              label: raw?.label || '',
              placeholder: raw?.placeholder || '',
              prefix: raw?.prefix || null,
              suffix: raw?.suffix || null,
              note: raw?.note || null,
              validations: Array.isArray(raw?.validations) ? raw.validations : [],
              items: Array.isArray(raw?.items) ? raw.items : [],
              section: raw?.form_section || '',
              groupKey: raw?.fieldset_group || null,
              step
            };
            field.isToggle = field.type === 'checkbox_toggle_fieldset';
            if (!reg.fieldsByStep[step]) reg.fieldsByStep[step] = [];
            reg.fieldsByStep[step].push(field);
            reg.fieldMap[key] = field;
            reg.values[key] = this.registrationDefaultValue(field);
            reg.errors[key] = [];
            reg.touched[key] = false;
            if (field.isToggle && field.groupKey) {
              reg.groupToggles[field.groupKey] = key;
              reg.groups[field.groupKey] = false;
            } else if (field.groupKey) {
              if (!reg.groupMembers[field.groupKey]) reg.groupMembers[field.groupKey] = [];
              reg.groupMembers[field.groupKey].push(key);
              if (!(field.groupKey in reg.groups)) {
                reg.groups[field.groupKey] = false;
              }
            }
            this.registrationCaptureFieldRefs(field, key);
          });
          reg.flowOptions = flowOptions.length
            ? flowOptions.map((opt, idx) => ({
                ...opt,
                value: opt.value || `option-${idx}`,
                disabled: !!opt.disabled
              }))
            : [{ id: 'flow-default', label: 'Jsem nový člen', value: 'new-member', disabled: false }];
          const firstActive = reg.flowOptions.find(opt => !opt.disabled);
          reg.selectedFlow = firstActive ? firstActive.value : reg.flowOptions[0]?.value;
          reg.step = 1;
          reg.maxStep = Math.max(3, ...Object.keys(reg.fieldsByStep).map(s => Number(s) || 1));
          reg.emailVerified = false;
          reg.phase = 'idle';
          reg.submitAttempted = false;
          reg.passwordVisible = false;
          reg.passwordRules = this.registrationPasswordChecks('');
          reg.ready = reg.schema.length > 0;
          reg.addressLoaded = false;
          reg.addressOptions = [];
        },
        resetRegistrationState({ keepSchema = true, hard = false } = {}) {
          const reg = this.registration;
          if (!keepSchema || hard) {
            reg.schema = keepSchema ? reg.schema : [];
            reg.ready = keepSchema ? reg.ready : false;
          }
          const map = reg.fieldMap || {};
          Object.keys(map).forEach((key) => {
            reg.values[key] = this.registrationDefaultValue(map[key]);
            reg.errors[key] = [];
            reg.touched[key] = false;
          });
          Object.keys(reg.groupToggles || {}).forEach((groupKey) => {
            reg.groups[groupKey] = false;
          });
          const flowOptions = Array.isArray(reg.flowOptions) ? reg.flowOptions : [];
          const activeOption = flowOptions.find(opt => !opt.disabled);
          if (flowOptions.length) {
            reg.selectedFlow = (activeOption ? activeOption.value : flowOptions[0].value) || reg.selectedFlow;
          }
          reg.step = 1;
          reg.emailVerified = false;
          reg.phase = 'idle';
          reg.submitAttempted = false;
          reg.passwordVisible = false;
          reg.passwordRules = this.registrationPasswordChecks('');
        },
        registrationNormalizeKey(label, idx, existing = new Set()) {
          const base = String(label || `field-${idx}`)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || `field-${idx}`;
          let key = base;
          let counter = 1;
          while (existing.has(key)) {
            key = `${base}-${counter++}`;
          }
          return key;
        },
        registrationDefaultValue(field) {
          if (!field) return '';
          switch (field.type) {
            case 'checkbox':
            case 'checkbox_toggle_fieldset':
              return false;
            case 'address':
            case 'billing_address':
              return { street: '', extra: '', city: '', zip: '', district: '' };
            default:
              return '';
          }
        },
        registrationCaptureFieldRefs(field, key) {
          if (!field || !key) return;
          const reg = this.registration;
          const normalizedLabel = String(field.label || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
          if (field.type === 'email') reg.fieldRefs.email = key;
          if (field.type === 'password') reg.fieldRefs.password = key;
          if (field.type === 'tel') reg.fieldRefs.phone = key;
          if (this.registrationIsAddressField(field)) reg.fieldRefs.address = key;
          if (field.type === 'date') reg.fieldRefs.birthDate = key;
          if (field.type === 'radio' && /v[ěe]rnostn/i.test(field.fieldset_group || '')) {
            reg.fieldRefs.gender = key;
          }
          if (field.type === 'checkbox') reg.fieldRefs.consent = key;
          if (/jmeno/.test(normalizedLabel) && !/prijmeni/.test(normalizedLabel)) {
            reg.fieldRefs.firstName = key;
          }
          if (/prijmeni/.test(normalizedLabel)) {
            reg.fieldRefs.lastName = key;
          }
          if ((field.groupKey || '').toLowerCase().includes('titul')) {
            if (/pred/.test(normalizedLabel)) reg.fieldRefs.titleBefore = key;
            if (/za/.test(normalizedLabel)) reg.fieldRefs.titleAfter = key;
          }
        },
        registrationStepList() {
          return [
            { id: 1, label: 'Typ registrace' },
            { id: 2, label: 'Osobní údaje' },
            { id: 3, label: 'Kontaktní údaje' }
          ];
        },
        registrationStepFields(step, options = {}) {
          const excludeTypes = Array.isArray(options.excludeTypes) ? options.excludeTypes : [];
          const fields = this.registration.fieldsByStep?.[step] || [];
          return fields.filter((field) => {
            if (!field) return false;
            if (excludeTypes.includes(field.type)) return false;
            if (field.isToggle) return true;
            return this.registrationFieldVisible(field);
          });
        },
        registrationEmailField() {
          const key = this.registration.fieldRefs.email;
          if (!key) return null;
          return this.registration.fieldMap?.[key] || null;
        },
        registrationFieldVisible(field) {
          if (!field) return false;
          if (!field.groupKey) return true;
          if (field.isToggle) return true;
          if (!(field.groupKey in (this.registration.groups || {}))) return true;
          return !!this.registration.groups[field.groupKey];
        },
        registrationHandleInput(fieldKey) {
          const reg = this.registration;
          const field = reg.fieldMap?.[fieldKey];
          if (!field) return;
          if (field.type === 'tel') {
            const digits = String(reg.values[fieldKey] || '').replace(/\D+/g, '');
            reg.values[fieldKey] = digits.slice(0, 12);
          }
          if (field.type === 'password') {
            reg.passwordRules = this.registrationPasswordChecks(reg.values[fieldKey]);
          }
          if (this.registrationIsAddressField(field)) {
            reg.values[fieldKey] = this.normalizeRegistrationAddress(reg.values[fieldKey]);
          }
          if (reg.fieldRefs.email === fieldKey) {
            if (reg.emailVerified) {
              reg.emailVerified = false;
            }
            if (reg.phase === 'verifying-email') {
              reg.phase = 'idle';
            }
            this.registrationCancelTimers('email');
          }
          if (!field.isToggle && reg.touched[fieldKey]) {
            this.registrationValidateFieldByKey(fieldKey);
          }
        },
        registrationHandleBlur(fieldKey) {
          const reg = this.registration;
          if (!(fieldKey in reg.touched)) return;
          reg.touched[fieldKey] = true;
          this.registrationValidateFieldByKey(fieldKey);
        },
        registrationHandleGroupToggle(fieldKey) {
          const reg = this.registration;
          const field = reg.fieldMap?.[fieldKey];
          if (!field || !field.groupKey) return;
          const active = !!reg.values[fieldKey];
          reg.groups[field.groupKey] = active;
          if (!active) {
            (reg.groupMembers[field.groupKey] || []).forEach((memberKey) => {
              reg.values[memberKey] = this.registrationDefaultValue(reg.fieldMap[memberKey]);
              reg.errors[memberKey] = [];
              reg.touched[memberKey] = false;
            });
          }
        },
        registrationIsPhoneField(field) {
          return !!field && field.type === 'tel';
        },
        registrationIsAddressField(field) {
          if (!field) return false;
          const type = String(field.type || '').toLowerCase();
          return type === 'address' || type === 'billing_address';
        },
        registrationHasValue(field, value) {
          if (!field) return false;
          if (field.type === 'checkbox' || field.type === 'checkbox_toggle_fieldset') {
            return !!value;
          }
          if (this.registrationIsAddressField(field)) {
            const addr = this.normalizeRegistrationAddress(value);
            return !!(addr.street || addr.city || addr.zip);
          }
          const val = typeof value === 'string' ? value.trim() : value;
          return val !== null && val !== undefined && String(val).trim() !== '';
        },
        registrationPasswordChecks(value) {
          const text = String(value || '').trim();
          return {
            length: text.length >= 8,
            capital: /[A-ZÁČĎÉĚÍĹĽŇÓŘŠŤÚŮÝŽ]/.test(text),
            number: /\d/.test(text)
          };
        },
        registrationRuleColor(fieldKey, satisfied) {
          const reg = this.registration;
          const showError = reg.submitAttempted || !!reg.touched?.[fieldKey];
          if (satisfied) return 'text-success';
          return showError ? 'text-error' : 'text-base-content/70';
        },
        registrationInputAutocomplete(field) {
          if (!field) return 'off';
          const key = String(field.key || '').toLowerCase();
          const type = String(field.type || '').toLowerCase();
          if (type === 'email' || key.includes('email')) return 'email';
          if (type === 'password') return 'new-password';
          if (key.includes('jmeno')) return 'given-name';
          if (key.includes('prijmeni')) return 'family-name';
          if (type === 'tel') return 'tel';
          return 'off';
        },
        registrationComputeFieldErrors(field) {
          if (!field) return [];
          const reg = this.registration;
          const value = reg.values[field.key];
          const errors = [];
          const validations = Array.isArray(field.validations) ? field.validations : [];
          const addr = this.registrationIsAddressField(field) ? this.normalizeRegistrationAddress(value) : null;
          const textValue = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
          for (const rule of validations) {
            const type = (rule?.type || '').toLowerCase();
            const message = rule?.fails || 'Neplatná hodnota';
            switch (type) {
              case 'required':
                if (!this.registrationHasValue(field, value)) errors.push(message);
                break;
              case 'email':
                if (textValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(textValue)) errors.push(message);
                break;
              case 'phone': {
                const digits = String(value || '').replace(/\D+/g, '');
                if (digits && digits.length !== 9) errors.push(message);
                break;
              }
              case 'address': {
                const zipPlain = (addr?.zip || '').replace(/\s+/g, '');
                if (!(addr?.street && addr?.city && /^\d{5}$/.test(zipPlain))) errors.push(message);
                break;
              }
              case 'date': {
                if (textValue && !/^\d{4}-\d{2}-\d{2}$/.test(textValue)) {
                  errors.push(message);
                }
                break;
              }
              case 'legth':
              case 'length':
                if (textValue.length < 8) errors.push(message);
                break;
              case 'capital':
                if (textValue && !/[A-ZÁČĎÉĚÍĹĽŇÓŘŠŤÚŮÝŽ]/.test(textValue)) errors.push(message);
                break;
              case 'number':
                if (textValue && !/\d/.test(textValue)) errors.push(message);
                break;
              default:
                break;
            }
          }
          return Array.from(new Set(errors));
        },
        registrationValidateFieldByKey(fieldKey) {
          const field = this.registration.fieldMap?.[fieldKey];
          if (!field) return [];
          const errs = this.registrationComputeFieldErrors(field);
          this.registration.errors[fieldKey] = errs;
          return errs;
        },
        registrationValidateStep(step) {
          let ok = true;
          this.registrationStepFields(step).forEach((field) => {
            if (!field || field.isToggle) return;
            const errs = this.registrationValidateFieldByKey(field.key);
            if (errs.length) ok = false;
          });
          return ok;
        },
        registrationGoToStep(step) {
          const reg = this.registration;
          const max = Number(reg.maxStep) || 3;
          const target = Math.min(Math.max(1, Number(step) || 1), max);
          reg.step = target;
        },
        nextRegistrationStep() {
          if (this.registration.selectedFlow === 'existing-card') {
            return;
          }
          this.registrationGoToStep((this.registration.step || 1) + 1);
        },
        prevRegistrationStep() {
          this.registrationGoToStep((this.registration.step || 1) - 1);
        },
        registrationStartEmailVerification() {
          const reg = this.registration;
          const emailField = this.registrationEmailField();
          if (!emailField) return;
          reg.submitAttempted = true;
          reg.touched[emailField.key] = true;
          const errs = this.registrationValidateFieldByKey(emailField.key);
          if (errs.length) return;
          if (reg.emailVerified || reg.phase === 'verifying-email') return;
          reg.phase = 'verifying-email';
          this.registrationCancelTimers('email');
          const delay = Math.max(800, Number(this.throttleMs) || defaults.throttleMs || 1300);
          this._registrationTimers.email = setTimeout(() => {
            reg.phase = 'idle';
            reg.emailVerified = true;
            reg.submitAttempted = false;
            this._registrationTimers.email = null;
          }, delay);
        },
        advanceAfterStepTwo() {
          const reg = this.registration;
          if (!reg.emailVerified) {
            this.registrationStartEmailVerification();
            return;
          }
          reg.submitAttempted = true;
          if (!this.registrationValidateStep(2)) return;
          reg.submitAttempted = false;
          this.registrationGoToStep(3);
          this.registrationEnsureAddressOptions();
        },
        submitRegistration() {
          const reg = this.registration;
          if (reg.phase === 'processing') return;
          reg.submitAttempted = true;
          const step2Ok = this.registrationValidateStep(2);
          const step3Ok = this.registrationValidateStep(3);
          if (!(step2Ok && step3Ok)) return;
          reg.phase = 'processing';
          this.registrationCancelTimers('process');
          this.registrationCancelTimers('success');
          const delay = Math.max(1000, Number(this.throttleMs) || defaults.throttleMs || 1300);
          this._registrationTimers.process = setTimeout(() => {
            const account = this.registrationCollectAccountPayload();
            this.applyRegistrationAccount(account);
            reg.phase = 'success';
            this._registrationTimers.process = null;
            this.registrationCancelTimers('success');
            this._registrationTimers.success = setTimeout(() => {
              this.closeModal();
              this.celebrateAccountAccess('celebrate');
            }, 1600);
          }, delay);
        },
        registrationCollectAccountPayload() {
          const reg = this.registration;
          const emailKey = reg.fieldRefs.email;
          const firstNameKey = reg.fieldRefs.firstName;
          const lastNameKey = reg.fieldRefs.lastName;
          const phoneKey = reg.fieldRefs.phone;
          const addressKey = reg.fieldRefs.address;
          const genderKey = reg.fieldRefs.gender;
          const birthKey = reg.fieldRefs.birthDate;
          const titleBeforeKey = reg.fieldRefs.titleBefore;
          const titleAfterKey = reg.fieldRefs.titleAfter;
          const phoneDigits = String(reg.values[phoneKey] || '').replace(/\D+/g, '');
          const account = {
            id: `reg-${Date.now()}`,
            email: String(reg.values[emailKey] || '').trim(),
            firstName: String(reg.values[firstNameKey] || '').trim(),
            lastName: String(reg.values[lastNameKey] || '').trim()
          };
          if (titleBeforeKey) account.titleBefore = String(reg.values[titleBeforeKey] || '').trim();
          if (titleAfterKey) account.titleAfter = String(reg.values[titleAfterKey] || '').trim();
          if (genderKey) account.gender = reg.values[genderKey] || '';
          if (birthKey) account.birthDate = reg.values[birthKey] || '';
          if (phoneDigits) {
            account.phone = `+420 ${this.registrationFormatPhoneDisplay(phoneDigits)}`.trim();
          }
          if (addressKey) {
            const addr = this.normalizeRegistrationAddress(reg.values[addressKey]);
            account.address = addr;
            account.addressDisplay = this.formatRegistrationAddressDisplay(addr);
          }
          account.createdAt = new Date().toISOString();
          return account;
        },
        applyRegistrationAccount(account) {
          if (!account || !account.email) return;
          const normalized = normalizeAccount(account, defaults.fallbackAccount, { defaultFallback: true }) || clone(defaults.fallbackAccount);
          this.account = normalized;
          this.isAuthenticated = true;
          this.lastLoginAt = new Date().toISOString();
          this.loginForm.email = normalized.email || '';
          this.loginForm.password = '';
          this.forgotForm.email = normalized.email || this.forgotForm.email || '';
          this.fallbackAccount = clone(normalized);
          this.persist();
          emit('fit:auth-login', { account: this.account, source: 'register' });
        },
        async registrationEnsureAddressOptions() {
          if (this.registration.addressLoaded && Array.isArray(this.registration.addressOptions) && this.registration.addressOptions.length) {
            return this.registration.addressOptions;
          }
          try {
            const res = await fetch('data/addresses/prague.json', { cache: 'no-store' });
            const list = await res.json();
            const normalized = Array.isArray(list) ? list : [];
            this.registration.addressOptions = normalized.map((item, idx) => {
              const street = String(item.street ?? '').trim();
              const extra = String(item.extra ?? '').trim();
              const city = String(item.city ?? '').trim();
              const zip = String(item.zip ?? '').replace(/\s+/g, '');
              const label = String(item.label ?? `${street}, ${city}`).trim();
              const cityLine = [zip, city].filter(Boolean).join(' ');
              const district = String(item.district ?? '').trim();
              const search = [label, street, extra, city, zip, district].filter(Boolean).join(' ').toLowerCase();
              const address = [street, extra].filter(Boolean).join(', ');
              const fallbackId = street || city || zip ? `${street || 'addr'}-${zip || idx}` : `addr-${idx}`;
              return {
                id: String(item.id ?? fallbackId),
                label: label || street || cityLine,
                street,
                extra,
                city,
                zip,
                district,
                cityLine,
                address: address || cityLine || label,
                search
              };
            });
          } catch (e) {
            console.warn('registration address suggestions load failed', e);
            this.registration.addressOptions = [];
          } finally {
            this.registration.addressLoaded = true;
          }
          return this.registration.addressOptions;
        },
        registrationAddressField(fieldKey) {
          const store = this;
          return {
            fieldKey,
            query: '',
            open: false,
            highlighted: -1,
            isCommitted: false,
            init() {
              store.registrationEnsureAddressOptions().then(() => {
                this.syncFromStore(store.registration.values[this.fieldKey]);
              });
              this.$watch(
                () => store.registration.values[this.fieldKey],
                (value) => this.syncFromStore(value)
              );
            },
            get filteredOptions() {
              const opts = Array.isArray(store.registration.addressOptions) ? store.registration.addressOptions : [];
              const q = this.query.trim().toLowerCase();
              const results = q ? opts.filter(opt => opt.search.includes(q)) : opts;
              return results.slice(0, 4);
            },
            get hasValue() {
              const val = store.normalizeRegistrationAddress(store.registration.values[this.fieldKey]);
              return !!(val.street || val.extra || val.city || val.zip || val.district);
            },
            get hasSelection() {
              return this.isCommitted && !!this.summaryBody;
            },
            get shouldShowLabel() {
              if (this.hasSelection) return false;
              return !((this.query || '').trim().length);
            },
            get summaryBody() {
              return store.formatRegistrationAddressSummary(store.registration.values[this.fieldKey]);
            },
            get summaryHeading() {
              return store.formatRegistrationAddressStreet(store.registration.values[this.fieldKey]);
            },
            openSuggestions() {
              if (this.hasSelection) return;
              store.registrationEnsureAddressOptions();
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
              const next = store.normalizeRegistrationAddress(store.registration.values[this.fieldKey]);
              store.registration.values[this.fieldKey] = { ...next, street: this.query };
              store.registrationHandleInput(this.fieldKey);
              this.openSuggestions();
            },
            onBlur() {
              setTimeout(() => this.closeSuggestions(), 120);
              store.registrationHandleBlur(this.fieldKey);
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
              const value = store.normalizeRegistrationAddress(opt);
              store.registration.values[this.fieldKey] = value;
              store.registrationHandleInput(this.fieldKey);
              store.registrationHandleBlur(this.fieldKey);
              this.isCommitted = this.hasCompleteValue(value);
              this.query = this.isCommitted ? '' : store.formatRegistrationAddressLine(value);
              this.closeSuggestions();
            },
            clearSelection(focusAfter = false) {
              store.registration.values[this.fieldKey] = store.normalizeRegistrationAddress({});
              this.query = '';
              this.isCommitted = false;
              store.registrationHandleInput(this.fieldKey);
              store.registrationHandleBlur(this.fieldKey);
              this.closeSuggestions();
              if (focusAfter) {
                this.focusInputSoon();
                this.openSuggestions();
              }
            },
            syncFromStore(value) {
              const normalized = store.normalizeRegistrationAddress(value);
              const current = store.normalizeRegistrationAddress(store.registration.values[this.fieldKey]);
              if (!this.addressesEqual(normalized, current)) {
                store.registration.values[this.fieldKey] = normalized;
              }
              this.isCommitted = this.hasCompleteValue(normalized);
              this.query = this.isCommitted ? '' : store.formatRegistrationAddressLine(normalized);
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
              const normalized = store.normalizeRegistrationAddress(addr);
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
        normalizeRegistrationAddress(val) {
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
        formatRegistrationAddressLine(val) {
          const addr = this.normalizeRegistrationAddress(val);
          const parts = [];
          if (addr.street) parts.push(addr.street);
          const cityLine = [addr.zip, addr.city].filter(Boolean).join(' ');
          if (cityLine) parts.push(cityLine);
          return parts.join(', ');
        },
        formatRegistrationAddressDisplay(val) {
          const addr = this.normalizeRegistrationAddress(val);
          const parts = [];
          if (addr.street) parts.push(addr.street);
          if (addr.extra) parts.push(addr.extra);
          const cityLine = [addr.zip, addr.city].filter(Boolean).join(' ');
          if (cityLine) parts.push(cityLine);
          return parts.join('\n');
        },
        formatRegistrationAddressStreet(val) {
          return this.normalizeRegistrationAddress(val).street || '';
        },
        formatRegistrationAddressSummary(val) {
          const addr = this.normalizeRegistrationAddress(val);
          const parts = [];
          if (addr.extra) parts.push(addr.extra);
          const cityLine = [addr.zip, addr.city].filter(Boolean).join(' ');
          if (cityLine) parts.push(cityLine);
          if (addr.district) parts.push(addr.district);
          return parts.join('\n');
        },
        registrationFormatPhoneDisplay(val) {
          const digits = String(val || '').replace(/\D+/g, '');
          if (!digits) return '';
          return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
        },
        registrationCancelTimers(type = null) {
          const targets = type ? [type] : ['email', 'process', 'success'];
          targets.forEach((key) => {
            const timerKey = key === 'email' ? 'email' : (key === 'success' ? 'success' : 'process');
            if (this._registrationTimers[timerKey]) {
              clearTimeout(this._registrationTimers[timerKey]);
              this._registrationTimers[timerKey] = null;
            }
          });
        },
        isAnonymous() {
          return !this.isAuthenticated;
        },
        togglePasswordVisibility() {
          this.passwordVisible = !this.passwordVisible;
        },
        openForgot() {
          this.toggleView('forgot');
        }
      });

      try {
        if (typeof localStorage !== 'undefined' && !localStorage.getItem(storageKey)) {
          Alpine.store('auth').persist();
        }
      } catch (e) {
        console.warn('auth store bootstrap failed', e);
      }

      window.fitAuthStore = () => Alpine.store('auth');
      if (!window.__fitAuthRegistrationInstrumented) {
        window.__fitAuthRegistrationInstrumented = true;
        const authStore = Alpine.store('auth');
        if (authStore?.registrationHandleInput) {
          const originalRegistrationHandleInput = authStore.registrationHandleInput;
          authStore.registrationHandleInput = function wrappedRegistrationHandleInput(fieldKey, ...args) {
            const label = `registrationHandleInput:${fieldKey || 'unknown'}`;
            const start = performance.now ? performance.now() : Date.now();
            try {
              return originalRegistrationHandleInput.call(this, fieldKey, ...args);
            } finally {
              const end = performance.now ? performance.now() : Date.now();
              const duration = (end - start).toFixed(2);
              console.info(`${label} ${duration}ms`);
            }
          };
        }
      }
    }
});
