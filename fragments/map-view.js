//MAP  
    Alpine.data('mapPane', () => ({

    resizeObserver: null,

    boot() {
      this.$nextTick(() => {
        this._afterTransitionInvalidate();

        // Keep it healthy on container resizes
        const wrap = this.$refs.wrap || this.$refs.mapEl;
        if (wrap && !this.resizeObserver) {
          this.resizeObserver = new ResizeObserver(() => this._invalidate());
          this.resizeObserver.observe(wrap);
        }

        // Orientation
        window.addEventListener('orientationchange', () => this._afterTransitionInvalidate());
      });
    },

    onVisibilityChange(visible) {
      if (visible) this._afterTransitionInvalidate();
    },

    _invalidate() {
      window.dispatchEvent(new CustomEvent('map:invalidate'));
    },

    _afterTransitionInvalidate() {
      // Wait for x-show + Tailwind transition (~200ms)
      requestAnimationFrame(() => {
        setTimeout(() => this._invalidate(), 220);
      });
    }
  }));
  
      