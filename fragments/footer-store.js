function pageFooter() {
  return {
    columns: [],

    async init() {
      await Alpine.store('menu').load();
      this.buildColumns();
      this._onMenuLoaded = () => this.buildColumns();
      window.addEventListener('fit:menu-loaded', this._onMenuLoaded);
      if (this.$el) {
        this.$el.addEventListener('alpine:destroy', () => {
          if (this._onMenuLoaded) {
            window.removeEventListener('fit:menu-loaded', this._onMenuLoaded);
            this._onMenuLoaded = null;
          }
        });
      }
    },

    buildColumns() {
      const store = Alpine.store('menu');
      const cols = (store.menus || [])
        .filter(m => typeof m.footer_position === 'number')
        .sort((a, b) => Number(a.footer_position) - Number(b.footer_position))
        .map((menu, idx) => {
          const sections = Array.isArray(menu.sections) && menu.sections.length
            ? menu.sections
            : [{ name: null, items: menu.items || [] }];

          const normSections = sections.map((sec, sIdx) => ({
            key: `${menu.id}-section-${sIdx}`,
            title: sec.name ? String(sec.name).trim() : null,
            items: (Array.isArray(sec.items) ? sec.items : []).map((it, iIdx) => ({
              key: `${menu.id}-item-${sIdx}-${iIdx}`,
              label: String(it.name || '').trim(),
              route: it.route || null,
              linkMenuId: it.linkMenuId ?? null,
              action: it.action ?? null
            }))
          })).filter(sec => sec.items.length);

          return {
            key: `footer-col-${idx}-${menu.id}`,
            sections: normSections
          };
        }).filter(col => col.sections.length);

      this.columns = cols;
    },

    gridClass() {
      const count = Math.max(1, this.columns.length);
      return {
        [`grid-cols-${count}`]: count <= 6,
        'sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6': count > 6
      };
    },

    handleItemClick(item) {
      if (item.linkMenuId != null) {
        Alpine.store('menu').openAt(item.linkMenuId);
        return;
      }
      const menuStore = Alpine.store('menu');
      if (menuStore?.triggerAction && menuStore.triggerAction(item)) {
        return;
      }
      if (item.route) {
        const route = String(item.route).replace(/^#?\/?/, '');
        location.hash = '#/' + route;
      }
    }
  };
}

function contactModal() {
  return {
    get store() { return Alpine.store('contacts'); },
    get items() { return this.store?.items || []; },
    get isLoading() { return (this.store?.status || '') === 'loading'; },
    get hasError() { return (this.store?.status || '') === 'error'; },
    get errorMessage() { return this.store?.error || ''; },
    phoneHref(contact) { return this.store?.phoneHref(contact) || null; },
    emailHref(contact) { return this.store?.emailHref(contact) || null; },
    routeHref(contact) { return this.store?.routeHref(contact) || null; },
    close() {
      this.store?.closeModal?.();
    },
    handleRoute(contact, event) {
      const href = this.routeHref(contact);
      if (!href) {
        event?.preventDefault?.();
        return;
      }
      if (event && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1)) {
        return;
      }
      event?.preventDefault?.();
      this.close();
      if (/^(https?:)?\/\//i.test(href) || href.startsWith('/')) {
        window.location.href = href;
        return;
      }
      if (href.startsWith('#')) {
        window.location.hash = href;
        return;
      }
      window.location.href = href;
    }
  };
}

function precartModal() {
  const randId = Math.random().toString(36).slice(2, 9);
  return {
    // accessibility helpers
    listId: 'precart-list-' + randId,
    itemId(i) { return `precart-item-${randId}-${i}`; },

    // price formatter; fallback if global isn't present
    koruny(v) {
      if (window.__fitMoney) return window.__fitMoney.format(v, { fromCurrency: 'CZK' });
      if (window.koruny) return window.koruny(v);
      try {
        const currency = (window.__fitI18n && window.__fitI18n.defaultCurrency) || 'CZK';
        return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
      }
      catch {
        const currency = (window.__fitI18n && window.__fitI18n.defaultCurrency) || 'CZK';
        return `${v} ${currency}`;
      }
    },

    // link builder; use your existing global link() if available
    link(name, params) {
      if (typeof window.link === 'function') return window.link(name, params);
      // fallback hash routes
      if (name === 'product') return `#/product/${params?.id ?? ''}`;
      if (name === 'cart') return '#/cart';
      return '#';
    },

    // actions
    close() { Alpine.store('precart').close(); },
    goCart() {
      this.close();
      window.location.href = this.link('cart');
    },
    goDetail(item) {
      this.close();
      window.location.href = this.link('product', { id: item.id });
    },
    quickAdd(item) {
      Alpine.store('cart').silentAdd(item);
      Alpine.store('precart').markQuickAdded(item.id);
    },
  };
}
</script>

<!-- Auth Modal -->
<div class="modal bg-base-200/95"
     x-cloak
     :class="{ 'modal-open': $store.auth?.modalOpen }"
     x-show="$store.auth?.modalOpen"
     @click.self="$store.auth?.closeModal()"
     @keydown.escape.window="$store.auth?.closeModal()">
  <div class="modal-box max-w-md space-y-2 relative p-6 md:p-10" @click.stop>
    <div class="flex items-start justify-between gap-4">
        <div class="space-y-1">
        <h2 class="text-2xl font-semibold"
            x-show="!['processing','success'].includes($store.auth?.registration?.phase)"
            x-text="$store.auth?.view === 'register'
              ? 'Registrace'
              : ($store.auth?.view === 'forgot' ? 'Zapomenuté heslo' : 'Přihlášení')"></h2>
      </div>
      <button type="button"
              class="absolute top-2 right-2 btn btn-md btn-circle btn-ghost shrink-0"
              aria-label="Zavřít přihlašovací dialog"
              x-show="!['processing','success'].includes($store.auth?.registration?.phase)"
              @click="$store.auth?.closeModal()">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>

    <template x-if="$store.auth?.view === 'login'">
      <form class="flex flex-col gap-4" @submit.prevent="$store.auth?.submitLogin()">
        <label class="form-control w-full">
          <span class="label-text text-sm font-semibold text-base-content/80">E-mail</span>
          <input
            type="email"
            class="input input-bordered w-full"
            x-model.trim="$store.auth.loginForm.email"
            autocomplete="email"
            placeholder=""
            required
          >
        </label>
        <label class="form-control w-full">
          <span class="label-text text-sm font-semibold text-base-content/80">Heslo</span>
          <div class="relative">
            <input
            :type="$store.auth?.passwordVisible ? 'text' : 'password'"
            class="input input-bordered w-full pr-12"
            x-model.trim="$store.auth.loginForm.password"
            autocomplete="current-password"
            placeholder=""
            required
          >
            <button
              type="button"
              class="absolute inset-y-0 right-2 flex items-center px-2 text-base-content transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100 hover:text-secondary z-20"
              :aria-label="$store.auth?.passwordVisible ? 'Skrýt heslo' : 'Zobrazit heslo'"
              :title="$store.auth?.passwordVisible ? 'Skrýt heslo' : 'Zobrazit heslo'"
              :aria-pressed="$store.auth?.passwordVisible ? 'true' : 'false'"
              @click="$store.auth?.togglePasswordVisibility()">
              <i class="fa-regular text-base-content"
                 :class="$store.auth?.passwordVisible ? 'fa-eye-slash' : 'fa-eye'"></i>
            </button>
          </div>
          <button type="button"
          class="btn btn-link text-secondary btn-md px-0 self-start no-underline hover:underline"
          @click="$store.auth?.openForgot()">
            Zapomněli jste heslo?
          </button>  
        </label>

        <p class="text-sm text-error"
           x-show="$store.auth?.status === 'error'"
           x-text="$store.auth?.error || 'Přihlášení se nezdařilo.'"></p>

        <div class="modal-action justify-between mt-0">
          <button type="button"
                  class="btn btn-outline"
                  @click="$store.auth?.toggleView('register')">
            Nová registrace
          </button>
          <button type="submit"
                  class="btn btn-primary"
                  :class="{ 'btn-disabled': $store.auth?.status === 'loading' }">
            Přihlásit se
          </button>
        </div>
      </form>
    </template>

    <template x-if="$store.auth?.view === 'forgot'">
      <form class="flex flex-col gap-4" @submit.prevent>
        <label class="form-control w-full">
          <span class="label-text text-sm font-semibold text-base-content/80">E-mail</span>
          <input
            type="email"
            class="input input-bordered w-full"
            x-model.trim="$store.auth.forgotForm.email"
            autocomplete="email"
            placeholder="jan.novak@example.com"
            required
          >
        </label>
        <div class="modal-action justify-between">
          <button type="button"
                  class="btn btn-link px-0 text-secondary no-underline hover:underline btn-md"
                  @click="$store.auth?.toggleView('login')">
            Zpět na přihlášení
          </button>
          <button type="button"
                  class="btn btn-primary">
            Odeslat
          </button>
        </div>
      </form>
    </template>

    <template x-if="$store.auth?.view === 'register'">
      <div class="space-y-6 relative">
        <template x-if="$store.auth.registration.loading">
          <div class="rounded-2xl border border-base-300 bg-base-100 p-6 text-base-content/70">
            Načítám registrační formulář…
          </div>
        </template>

        <template x-if="!$store.auth.registration.loading && $store.auth.registration.loadError">
          <div class="rounded-xl border border-error/40 bg-error/5 p-4 text-sm text-error">
            <span x-text="$store.auth.registration.loadError"></span>
          </div>
        </template>

        <template x-if="!$store.auth.registration.loading && $store.auth.registration.ready">
          <div class="relative">
            <div class="space-y-5" x-show="!['processing','success'].includes($store.auth.registration.phase)">
            <!-- Step 1 -->
            <section class="space-y-4" x-show="$store.auth.registration.step === 1">
              <p class="text-sm text-base-content/70">
                Vyberte, jak chcete pokračovat:
              </p>
              <div class="space-y-3">
                <template x-for="option in $store.auth.registration.flowOptions" :key="option.id">
                  <label class="flex items-start gap-3 rounded-xl border border-base-200 bg-base-100 p-4 cursor-pointer transition hover:border-secondary"
                         :class="{
                           'opacity-60 cursor-not-allowed': option.disabled,
                           'border-secondary ring-1 ring-primary/30': $store.auth.registration.selectedFlow === option.value
                         }">
                    <input type="radio"
                           class="radio radio-secondary"
                           name="registration-flow"
                           :value="option.value"
                           :checked="$store.auth.registration.selectedFlow === option.value"
                           :disabled="option.disabled"
                           @change="$store.auth.registration.selectedFlow = option.value">
                    <div class="grow">
                      <div class="flex items-center gap-2">
                        <span class="font-semibold" x-text="option.label"></span>
                      </div>
                    </div>
                  </label>
                </template>
              </div>
              <div class="modal-action justify-between pt-2">
                <button type="button"
                        class="btn btn-link px-0 text-secondary no-underline hover:underline btn-md"
                        @click="$store.auth.toggleView('login')">
                  Zpět na přihlášení
                </button>
                <button type="button"
                        class="btn btn-primary"
                        @click="$store.auth.nextRegistrationStep()">
                  Pokračovat
                </button>
              </div>
            </section>

            <!-- Step 2 -->
            <section class="space-y-5" x-show="$store.auth.registration.step === 2">
              <div class="space-y-3" x-data="{ field: $store.auth.registrationEmailField(), focusEmail() { this.$refs?.email?.focus?.(); } }" x-show="field">
                <template x-if="!$store.auth.registration.emailVerified">
                  <div class="space-y-2">
                    <label class="form-control w-full gap-2">
                      <span class="text-sm font-semibold text-base-content/80" x-text="field.label"></span>
                      <input type="email"
                             class="input input-bordered w-full"
                             x-ref="email"
                             :name="field.key"
                             :placeholder="field.placeholder || 'jan.novak@example.com'"
                             :autocomplete="$store.auth.registrationInputAutocomplete(field)"
                             x-model="$store.auth.registration.values[field.key]"
                             @input="$store.auth.registrationHandleInput(field.key)"
                             @blur="$store.auth.registrationHandleBlur(field.key)">
                    </label>
                    <p class="text-xs text-base-content/70" x-show="field.note" x-text="field.note"></p>
                    <p class="text-sm text-error"
                       x-show="$store.auth.registration.errors[field.key]?.length"
                       x-text="$store.auth.registration.errors[field.key][0]"></p>
                  </div>
                </template>

                <template x-if="$store.auth.registration.emailVerified">
                  <div class="border border-dashed border-base-300 rounded-xl p-4 bg-max-green-25 flex items-center justify-between gap-3">
                    <div class="space-y-1">
                      <div class="text-xs text-base-content/60 uppercase tracking-wide" x-text="field.label || 'E-mail'"></div>
                      <div class="text-base font-semibold break-all" x-text="$store.auth.registration.values[field.key]"></div>
                    </div>
                    <button type="button"
                            class="btn btn-xs btn-ghost text-max-blue-500 px-0"
                            @click="
                              $store.auth.registration.emailVerified = false;
                              $store.auth.registration.phase = 'idle';
                              $store.auth.registration.submitAttempted = false;
                              $store.auth.registration.touched[field.key] = false;
                              focusEmail();
                            ">
                      Změnit
                    </button>
                  </div>
                </template>
              </div>

              <template x-if="$store.auth.registration.phase === 'verifying-email'">
                <div class="rounded-xl border border-base-200 bg-base-100/80 px-4 py-3 flex items-center gap-3">
                  <span class="loading loading-spinner text-secondary"></span>
                  <span class="text-sm text-base-content/70">Ověřujeme e-mail…</span>
                </div>
              </template>

              <div class="modal-action justify-end" x-show="!$store.auth.registration.emailVerified">
                <button type="button"
                        class="btn btn-primary"
                        :class="{ 'btn-disabled': $store.auth.registration.phase === 'verifying-email' }"
                        @click="$store.auth.registrationStartEmailVerification()">
                  Ověřit e-mail
                </button>
              </div>

              <template x-if="$store.auth.registration.emailVerified">
                <div class="space-y-5">
                  <div class="space-y-4">
                    <template x-for="field in $store.auth.registrationStepFields(2, { excludeTypes: ['email', 'tel'] })" :key="field.key">
                      <div class="space-y-2">
                        <template x-if="field.isToggle">
                          <label class="flex items-center gap-3 rounded-lg border border-base-200 bg-base-100 px-4 py-3">
                            <input type="checkbox"
                                   class="checkbox checkbox-secondary"
                                   x-model="$store.auth.registration.values[field.key]"
                                   @change="$store.auth.registrationHandleGroupToggle(field.key)">
                            <div>
                              <span class="font-semibold" x-text="field.label"></span>
                              <p class="text-sm text-base-content/70" x-show="field.note" x-text="field.note"></p>
                            </div>
                          </label>
                        </template>
                        <template x-if="!field.isToggle">
                          <div class="space-y-2">
                            <template x-if="!$store.auth.registrationIsPhoneField(field) && field.type === 'password'">
                              <label class="form-control w-full gap-2">
                                <span class="text-sm font-semibold text-base-content/80" x-text="field.label"></span>
                                <div class="relative">
                                  <input :type="$store.auth.registration.passwordVisible ? 'text' : 'password'"
                                         :class="`input input-bordered w-full pr-12 ${$store.auth.registration.errors[field.key]?.length ? 'input-error' : ''}`"
                                         :placeholder="field.placeholder || undefined"
                                         :name="field.key"
                                         autocomplete="new-password"
                                         x-model="$store.auth.registration.values[field.key]"
                                         @input="$store.auth.registrationHandleInput(field.key)"
                                          @blur="$store.auth.registrationHandleBlur(field.key)">
                                  <button type="button"
                                          class="absolute inset-y-0 right-2 flex items-center px-2 text-base-content transition-colors duration-150 hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100 z-20"
                                          @click="$store.auth.registration.passwordVisible = !$store.auth.registration.passwordVisible"
                                          :aria-label="$store.auth.registration.passwordVisible ? 'Skrýt heslo' : 'Zobrazit heslo'">
                                    <i class="fa-regular text-base-content"
                                       :class="$store.auth.registration.passwordVisible ? 'fa-eye-slash' : 'fa-eye'"></i>
                                  </button>
                                </div>
                                <div class="mt-3 grid gap-1 text-sm">
                                  <div class="flex items-center gap-2"
                                       :class="$store.auth.registrationRuleColor(field.key, $store.auth.registration.passwordRules.length)">
                                    <i :class="$store.auth.registration.passwordRules.length ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'"></i>
                                    <span>Alespoň 8 znaků</span>
                                  </div>
                                  <div class="flex items-center gap-2"
                                       :class="$store.auth.registrationRuleColor(field.key, $store.auth.registration.passwordRules.capital)">
                                    <i :class="$store.auth.registration.passwordRules.capital ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'"></i>
                                    <span>Alespoň 1 velké písmeno</span>
                                  </div>
                                  <div class="flex items-center gap-2"
                                       :class="$store.auth.registrationRuleColor(field.key, $store.auth.registration.passwordRules.number)">
                                    <i :class="$store.auth.registration.passwordRules.number ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'"></i>
                                    <span>Alespoň 1 číslice</span>
                                  </div>
                                </div>
                              </label>
                            </template>

                            <template x-if="!$store.auth.registrationIsPhoneField(field) && ['text','email'].includes(field.type) && field.type !== 'password'">
                              <label class="form-control w-full gap-2">
                                <span class="text-sm font-semibold text-base-content/80" x-text="field.label"></span>
                                <input :type="field.type === 'email' ? 'email' : 'text'"
                                       class="input input-bordered w-full"
                                       :placeholder="field.placeholder || undefined"
                                       :name="field.key"
                                       :autocomplete="$store.auth.registrationInputAutocomplete(field)"
                                       x-model="$store.auth.registration.values[field.key]"
                                       @input="$store.auth.registrationHandleInput(field.key)"
                                       @blur="$store.auth.registrationHandleBlur(field.key)">
                              </label>
                            </template>

                            <template x-if="field.type === 'radio' && field.items.length">
                              <div class="space-y-2">
                                <span class="text-sm font-semibold text-base-content/80" x-text="field.label"></span>
                                <div class="space-y-2">
                                  <template x-for="item in field.items" :key="item">
                                    <label class="flex items-center gap-3 rounded-lg border border-base-200 px-4 py-2">
                                      <input type="radio"
                                             class="radio radio-primary"
                                             :name="`reg-${field.key}`"
                                             :value="item"
                                             x-model="$store.auth.registration.values[field.key]"
                                             @change="$store.auth.registrationHandleInput(field.key); $store.auth.registrationHandleBlur(field.key)">
                                      <span class="text-sm" x-text="item"></span>
                                    </label>
                                  </template>
                                </div>
                              </div>
                            </template>

                            <template x-if="field.type === 'checkbox' && !field.isToggle">
                              <label class="flex items-start gap-3 rounded-lg border border-base-200 bg-base-100 px-4 py-3">
                                <input type="checkbox"
                                       class="checkbox checkbox-secondary mt-1"
                                       x-model="$store.auth.registration.values[field.key]"
                                       @change="$store.auth.registrationHandleInput(field.key); $store.auth.registrationHandleBlur(field.key)">
                                <span class="text-sm leading-snug" x-html="field.label"></span>
                              </label>
                            </template>

                            <template x-if="field.type === 'date'">
                              <label class="form-control w-full gap-2">
                                <span class="text-sm font-semibold text-base-content/80" x-text="field.label"></span>
                                <input type="date"
                                       class="input input-bordered w-full"
                                       x-model="$store.auth.registration.values[field.key]"
                                       @input="$store.auth.registrationHandleInput(field.key)"
                                       @blur="$store.auth.registrationHandleBlur(field.key)">
                              </label>
                            </template>


                            <p class="text-xs text-base-content/70" x-show="field.note" x-text="field.note"></p>
                            <p class="text-sm text-error"
                               x-show="field.type !== 'password' && $store.auth.registration.errors[field.key]?.length"
                               x-text="$store.auth.registration.errors[field.key][0]"></p>
                          </div>
                        </template>
                      </div>
                    </template>
                  </div>
                  <div class="modal-action justify-end">
                    <button type="button"
                            class="btn btn-primary"
                            @click="$store.auth.advanceAfterStepTwo()">
                      Pokračovat
                    </button>
                  </div>
                </div>
              </template>
            </section>

            <!-- Step 3 -->
            <section class="space-y-5" x-show="$store.auth.registration.step === 3">
              <p class="text-sm text-base-content/70">
                Vaše kontakty potřebujeme pro lékárníka, kurýra nebo zákaznickou linku. Můžete je kdykoli změnit.
              </p>
              <div class="space-y-4">
                <template x-for="field in $store.auth.registrationStepFields(3)" :key="field.key">
                  <div class="space-y-2">
                    <template x-if="field.isToggle">
                      <label class="flex items-center gap-3 rounded-lg border border-base-200 bg-base-100 px-4 py-3">
                        <input type="checkbox"
                               class="checkbox checkbox-secondary"
                               x-model="$store.auth.registration.values[field.key]"
                               @change="$store.auth.registrationHandleGroupToggle(field.key)">
                        <div>
                          <span class="font-semibold" x-text="field.label"></span>
                          <p class="text-sm text-base-content/70" x-show="field.note" x-text="field.note"></p>
                        </div>
                      </label>
                    </template>
                    <template x-if="!field.isToggle">
                      <div class="space-y-2">
                        <template x-if="$store.auth.registrationIsPhoneField(field)">
                          <div class="space-y-1">
                            <span class="text-sm font-semibold text-base-content/80" x-text="field.label"></span>
                            <label class="input input-bordered flex items-center gap-3 w-full"
                                   :class="$store.auth.registration.errors[field.key]?.length ? 'input-error' : ''">
                              <span class="font-semibold text-base-content/70" x-show="field.prefix" x-text="field.prefix"></span>
                              <div class="relative grow min-w-0 w-full">
                                <input type="tel"
                                       class="w-full bg-transparent focus:outline-none tabular-nums"
                                       :style="$store.auth.registration.values[field.key] ? 'color: transparent; caret-color: var(--fallback-bc, currentColor);' : ''"
                                       x-model="$store.auth.registration.values[field.key]"
                                       @input="$store.auth.registrationHandleInput(field.key)"
                                       @blur="$store.auth.registrationHandleBlur(field.key)"
                                       :placeholder="field.placeholder || '737 456 789'">
                                <span class="pointer-events-none absolute inset-0 flex items-center text-base-content tabular-nums"
                                      :class="$store.auth.registration.values[field.key] ? 'opacity-100' : 'opacity-0'"
                                      x-text="$store.auth.registrationFormatPhoneDisplay($store.auth.registration.values[field.key])"></span>
                              </div>
                            </label>
                          </div>
                        </template>

                        <template x-if="!$store.auth.registrationIsPhoneField(field) && ['text','email'].includes(field.type) && field.type !== 'password'">
                          <label class="form-control w-full gap-2">
                            <span class="text-sm font-semibold text-base-content/80" x-text="field.label"></span>
                            <input :type="field.type === 'email' ? 'email' : 'text'"
                                   class="input input-bordered w-full"
                                   :placeholder="field.placeholder || undefined"
                                   x-model="$store.auth.registration.values[field.key]"
                                   @input="$store.auth.registrationHandleInput(field.key)"
                                   @blur="$store.auth.registrationHandleBlur(field.key)">
                          </label>
                        </template>

                        <template x-if="field.type === 'radio' && field.items.length">
                          <div class="space-y-2">
                            <span class="text-sm font-semibold text-base-content/80" x-text="field.label"></span>
                            <div class="space-y-2">
                              <template x-for="item in field.items" :key="item">
                                <label class="flex items-center gap-3 rounded-lg border border-base-200 px-4 py-2">
                                  <input type="radio"
                                         class="radio radio-primary"
                                         :name="`reg-${field.key}`"
                                         :value="item"
                                         x-model="$store.auth.registration.values[field.key]"
                                         @change="$store.auth.registrationHandleInput(field.key); $store.auth.registrationHandleBlur(field.key)">
                                  <span class="text-sm" x-text="item"></span>
                                </label>
                              </template>
                            </div>
                          </div>
                        </template>

                        <template x-if="field.type === 'checkbox' && !field.isToggle">
                          <label class="flex items-start gap-3 rounded-lg border border-base-200 bg-base-100 px-4 py-3">
                            <input type="checkbox"
                                   class="checkbox checkbox-secondary mt-1"
                                   x-model="$store.auth.registration.values[field.key]"
                                   @change="$store.auth.registrationHandleInput(field.key); $store.auth.registrationHandleBlur(field.key)">
                            <span class="text-sm leading-snug" x-html="field.label"></span>
                          </label>
                        </template>

                        <template x-if="field.type === 'date'">
                          <label class="form-control w-full gap-2">
                            <span class="text-sm font-semibold text-base-content/80" x-text="field.label"></span>
                            <input type="date"
                                   class="input input-bordered w-full"
                                   x-model="$store.auth.registration.values[field.key]"
                                   @input="$store.auth.registrationHandleInput(field.key)"
                                   @blur="$store.auth.registrationHandleBlur(field.key)">
                          </label>
                        </template>

                        <template x-if="$store.auth.registrationIsAddressField(field)">
                          <div x-data="$store.auth.registrationAddressField(field.key)" x-init="init()" class="space-y-2">
                            <label class="form-control w-full gap-2">
                              <span class="text-sm font-semibold text-base-content/80"
                                    x-text="field.label"
                                    x-show="!hasSelection || !((query || '').trim().length)"></span>
                              <template x-if="!hasSelection">
                                <div class="space-y-3">
                                    <div class="relative">
                                      <input type="text"
                                             class="input input-bordered w-full"
                                             :placeholder="(field.placeholder && field.placeholder.street) || 'Začněte psát adresu'"
                                             x-model="query"
                                             x-ref="input"
                                             :name="`${field.key}-search`"
                                             autocomplete="street-address"
                                             autocapitalize="none"
                                             spellcheck="false"
                                              @focus="openSuggestions()"
                                              @input="onInput($event)"
                                              @blur="onBlur()"
                                             @keydown.arrow-down.prevent="highlightNext()"
                                             @keydown.arrow-up.prevent="highlightPrev()"
                                             @keydown.enter.prevent="selectHighlighted()">
                                      <button type="button"
                                              class="btn btn-xs btn-ghost absolute right-2 top-1/2 -translate-y-1/2"
                                              x-show="hasValue"
                                              @mousedown.prevent
                                              @click="clearSelection(false)">
                                        Vymazat
                                      </button>
                                    </div>
                                    <div class="relative" x-show="open && filteredOptions.length">
                                      <ul class="menu absolute z-10 w-full rounded-xl border border-base-200 bg-base-100 shadow overflow-hidden max-h-[240px]">
                                        <template x-for="(option, index) in filteredOptions" :key="option.id">
                                          <li>
                                            <button type="button"
                                                    class="w-full text-left text-base px-4 py-1 hover:bg-base-200 focus:bg-base-200 flex items-center gap-2"
                                                    :class="{ 'active text-primary': highlighted === index }"
                                                    @mouseenter="highlighted = index"
                                                    @mousedown.prevent="selectOption(option)">
                                              <span class="font-medium truncate" x-text="option.label"></span>
                                              <span class="text-sm text-base-content/70 truncate" x-text="option.cityLine"></span>
                                            </button>
                                          </li>
                                        </template>
                                      </ul>
                                    </div>
                                  </div>
                                </template>

                              <template x-if="hasSelection">
                                <div class="border border-dashed border-base-300 rounded-xl p-4 bg-max-green-25 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                  <div class="space-y-2">
                                    <div class="text-base font-semibold"
                                         x-text="summaryHeading || field.summaryTitle || 'Vybraná adresa'"></div>
                                    <p class="text-sm text-base-content/80 whitespace-pre-line" x-text="summaryBody"></p>
                                  </div>
                                  <div class="flex items-center gap-3 shrink-0">
                                    <button type="button"
                                            class="btn btn-xs btn-ghost text-max-green-500"
                                            @click="clearSelection(true)">
                                      Změnit adresu
                                    </button>
                                    <i class="fa-solid fa-check text-max-green-500 text-xl"></i>
                                  </div>
                                </div>
                              </template>
                            </label>
                          </div>
                        </template>

                        <p class="text-xs text-base-content/70" x-show="field.note" x-text="field.note"></p>
                        <p class="text-sm text-error"
                           x-show="$store.auth.registration.errors[field.key]?.length"
                           x-text="$store.auth.registration.errors[field.key][0]"></p>
                      </div>
                    </template>
                  </div>
                </template>
              </div>
              <div class="modal-action justify-end">
                <button type="button"
                        class="btn btn-primary"
                        :class="{ 'btn-disabled': $store.auth.registration.phase === 'processing' }"
                        @click="$store.auth.submitRegistration()">
                  Dokončit registraci
                </button>
              </div>
            </section>
            </div>

            <div class="rounded-2xl bg-base-100 p-10 text-center grid place-items-center"
                 x-show="['processing','success'].includes($store.auth.registration.phase)"
                 x-transition.opacity>
              <template x-if="$store.auth.registration.phase === 'processing'">
                <div class="flex flex-col items-center gap-3">
                  <span class="loading loading-spinner loading-lg text-secondary"></span>
                  <p class="text-lg font-normal text-base-content/70">Dokončujeme registraci…</p>
                </div>
              </template>
              <template x-if="$store.auth.registration.phase === 'success'">
                <div class="flex flex-col items-center gap-3">
                  <span class="text-4xl text-success">
                    <i class="fa-solid fa-circle-check"></i>
                  </span>
                  <h3 class="text-lg font-normal text-base-content/70">Probíhá první přihlášení…</h3>
                </div>
              </template>
            </div>
          </div>
        </template>
      </div>
    </template>

    <div class="absolute inset-0 rounded-2xl bg-base-100/90 backdrop-blur-sm grid place-items-center"
         x-show="$store.auth?.status === 'loading'"
         x-transition.opacity>
      <div class="flex flex-col items-center gap-3">
        <span class="loading loading-spinner loading-lg text-primary"></span>
        <p class="text-sm text-base-content/70">Ověřujeme údaje…</p>
      </div>
    </div>
  </div>
</div>

<!-- Tailwind breakpoint badge (dev helper) -->
<div
  id="tw-breakpoint-indicator"
  class="fixed bottom-4 left-4 z-[9999] flex items-center gap-2 rounded-full border border-base-300 bg-base-100/90 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-base-content shadow-lg pointer-events-none select-none backdrop-blur">
  <span aria-hidden="true" class="inline-flex h-2 w-2 rounded-full bg-success animate-pulse"></span>
  <span data-label>base</span>
  <span data-width class="font-normal lowercase text-base-content/70">(0px)</span>
</div>
<script>
  (() => {
    const badge = document.getElementById('tw-breakpoint-indicator');
    if (!badge) return;
    const STORAGE_KEY = 'fit:app-config';
    const SETTING_KEY = 'showBreakpointBadge';
    const DEFAULT_VISIBLE = false;
    const labelEl = badge.querySelector('[data-label]');
    const widthEl = badge.querySelector('[data-width]');
    const breakpoints = [
      { name: '2xl', min: 1536 },
      { name: 'xl', min: 1280 },
      { name: 'lg', min: 1024 },
      { name: 'md', min: 768 },
      { name: 'sm', min: 640 }
    ];
    const maxOnly = { name: 'xs', max: 413 };
    const baseName = 'base';
    const readVisibility = () => {
      if (typeof localStorage === 'undefined') return DEFAULT_VISIBLE;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_VISIBLE;
        const parsed = JSON.parse(raw);
        const value = parsed && typeof parsed === 'object' ? parsed[SETTING_KEY] : undefined;
        return typeof value === 'boolean' ? value : DEFAULT_VISIBLE;
      } catch (e) {
        console.warn('badge visibility read failed', e);
        return DEFAULT_VISIBLE;
      }
    };
    const applyVisibility = (show) => {
      badge.classList.toggle('hidden', !show);
      badge.setAttribute('aria-hidden', show ? 'false' : 'true');
      badge.dataset.visible = show ? '1' : '0';
    };
    let visible = readVisibility();
    applyVisibility(visible);

    const resolve = (width) => {
      if (width <= maxOnly.max) return maxOnly.name;
      for (const bp of breakpoints) {
        if (width >= bp.min) return bp.name;
      }
      return baseName;
    };

    const update = () => {
      const width = Math.round(window.innerWidth || document.documentElement.clientWidth || 0);
      labelEl.textContent = resolve(width);
      widthEl.textContent = `(${width}px)`;
    };

    update();
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('orientationchange', update, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', update, { passive: true });
    }

    const setVisible = (value) => {
      const show = !!value;
      if (visible === show) return;
      visible = show;
      applyVisibility(visible);
    };

    window.addEventListener('fit:config-change', (event) => {
      if (!event || event.detail?.key !== SETTING_KEY) return;
      setVisible(event.detail.value);
    });

    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY) return;
      setVisible(readVisibility());
    });
  })();
</script>


</body>
</html>
