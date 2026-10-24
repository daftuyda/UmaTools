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

  // Accent color sits on top of the neutral Graphite theme; blue is the default.
  var ACCENT_KEY = 'umatools-accent';
  var ACCENTS = ['blue', 'mono', 'green', 'violet', 'pink', 'orange'];

  function normalizeAccent(value) {
    return ACCENTS.indexOf(value) === -1 ? 'blue' : value;
  }

  function applyAccent(value, persist) {
    var accent = normalizeAccent(value);
    document.documentElement.dataset.accent = accent;
    var radio = document.querySelector('input[name="nav-accent"][value="' + accent + '"]');
    if (radio) radio.checked = true;
    if (persist) {
      try {
        localStorage.setItem(ACCENT_KEY, accent);
      } catch {}
    }
    window.dispatchEvent(new CustomEvent('umatools:accent-change', { detail: { accent: accent } }));
  }

  var initialAccent = 'blue';
  try {
    initialAccent = localStorage.getItem(ACCENT_KEY);
  } catch {}
  applyAccent(initialAccent, false);

  window.UmaAccent = {
    list: ACCENTS.slice(),
    get: function () {
      return normalizeAccent(document.documentElement.dataset.accent);
    },
    set: function (accent, options) {
      applyAccent(accent, !options || options.persist !== false);
    },
  };

  window.addEventListener('storage', function (event) {
    if (event.key === ACCENT_KEY) {
      applyAccent(event.newValue, false);
    } else if (event.key === THEME_KEY) {
      applyTheme(event.newValue, false, true);
    } else if (event.key === LEGACY_KEY) {
      applyTheme(readStoredTheme() || (event.newValue === 'dark' ? 'dark' : 'light'), false, true);
    }
  });

  // Shared, purely decorative Halloween corner; never intercept page controls.
  function addHalloweenCorner() {
    if (document.querySelector('.halloween-corner')) return;
    var corner = document.createElement('div');
    corner.className = 'halloween-corner';
    corner.setAttribute('aria-hidden', 'true');
    corner.innerHTML = `<svg viewBox="0 0 96 120" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false">
      <g stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.48">
        <path d="M96 0H3M96 0L10 36M96 0L31 65M96 0L61 86M96 0V94"/>
        <path d="M74 0Q76 5 76 8Q81 10 81 15Q86 16 88 20Q91 20 96 22
          M53 0Q57 9 56 17Q65 20 66 30Q76 31 79 40Q88 39 96 43
          M32 0Q37 14 37 25Q50 32 51 45Q65 47 71 59Q83 58 96 64
          M11 0Q18 19 17 33Q36 43 36 60Q55 63 63 79Q79 77 96 85"/>
        <path d="M63 79V99"/>
      </g>
      <g stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M60 102L54 98L51 101M59 105L52 104L49 108M60 108L54 111L53 115M66 102L72 98L75 101M67 105L74 104L77 108M66 108L72 111L73 115M60 110L58 115L59 118M66 110L68 115L67 118"/>
        <ellipse cx="63" cy="106" rx="4.5" ry="6" fill="currentColor" stroke="none"/>
        <circle cx="63" cy="100" r="3" fill="currentColor" stroke="none"/>
      </g>
      <g fill="#e79a4b"><circle cx="61.9" cy="99.5" r="0.7"/><circle cx="64.1" cy="99.5" r="0.7"/></g>
    </svg>`;
    document.body.appendChild(corner);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addHalloweenCorner, { once: true });
  } else {
    addHalloweenCorner();
  }
})();
