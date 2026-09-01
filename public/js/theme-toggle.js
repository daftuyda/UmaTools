(function () {
  var THEME_KEY = 'umatools-theme';
  var LEGACY_KEY = 'umasearch-darkmode';

  function normalizeTheme(value) {
    return value === 'dark' || value === 'oled' ? value : 'light';
  }

  function readStoredTheme() {
    try {
      var saved = localStorage.getItem(THEME_KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'oled') return saved;
      var legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy === 'light' || legacy === 'dark') return legacy;
    } catch {}
    return null;
  }

  function applyTheme(value, persist, animate) {
    var root = document.documentElement;
    var theme = normalizeTheme(value);
    var dark = theme !== 'light';

    function setTheme() {
      root.classList.toggle('dark', dark);
      root.classList.toggle('oled', theme === 'oled');
      root.dataset.theme = theme;
      root.style.colorScheme = dark ? 'dark' : 'light';

      var sun = document.getElementById('iconSun');
      var moon = document.getElementById('iconMoon');
      if (sun && moon) {
        sun.style.display = dark ? 'none' : 'inline';
        moon.style.display = dark ? 'inline' : 'none';
      }

      var select = document.getElementById('nav-theme-select');
      if (select && select.value !== theme) select.value = theme;
    }

    if (animate && document.body) {
      root.classList.add('theme-transition');
      var overlay = document.createElement('div');
      overlay.className = 'theme-transition-overlay';
      overlay.style.background =
        theme === 'oled'
          ? 'rgba(0, 0, 0, 0.9)'
          : dark
            ? 'rgba(12, 16, 28, 0.75)'
            : 'rgba(248, 250, 252, 0.7)';
      document.body.appendChild(overlay);
      overlay.getBoundingClientRect();
      setTheme();
      requestAnimationFrame(function () {
        overlay.classList.add('is-active');
      });
      window.setTimeout(function () {
        root.classList.remove('theme-transition');
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 240);
    } else {
      setTheme();
    }

    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, theme);
        localStorage.setItem(LEGACY_KEY, dark ? 'dark' : 'light');
      } catch {}
    }

    window.dispatchEvent(new CustomEvent('umatools:theme-change', { detail: { theme: theme } }));
  }

  var initialTheme =
    readStoredTheme() || (document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  applyTheme(initialTheme, false, false);

  window.UmaTheme = {
    get: function () {
      return normalizeTheme(document.documentElement.dataset.theme);
    },
    set: function (theme, options) {
      var opts = options || {};
      applyTheme(theme, opts.persist !== false, opts.animate !== false);
    },
  };

  var btn = document.getElementById('modeToggleBtn');
  if (btn) {
    btn.addEventListener('click', function () {
      applyTheme(
        document.documentElement.classList.contains('dark') ? 'light' : 'dark',
        true,
        true
      );
    });
  }

  window.addEventListener('storage', function (event) {
    if (event.key === THEME_KEY) {
      applyTheme(event.newValue, false, true);
    } else if (event.key === LEGACY_KEY) {
      applyTheme(readStoredTheme() || (event.newValue === 'dark' ? 'dark' : 'light'), false, true);
    }
  });
})();
