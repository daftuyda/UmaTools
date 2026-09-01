(function () {
  const DEFAULT_ROUTES = [
    {
      label: 'Rating',
      i18nKey: 'nav.rating',
      children: [
        {
          label: 'Optimizer',
          i18nKey: 'nav.optimizer',
          path: '/optimizer',
          file: '/optimizer.html',
        },
        {
          label: 'Calculator',
          i18nKey: 'nav.calculator',
          path: '/calculator',
          file: '/calculator.html',
        },
      ],
    },
    {
      label: 'Tools',
      i18nKey: 'nav.tools',
      children: [
        { label: 'Event OCR', i18nKey: 'nav.eventOCR', path: '/events', file: '/events.html' },
        {
          label: 'Support Hints',
          i18nKey: 'nav.supportHints',
          path: '/hints',
          file: '/hints.html',
        },
        { label: 'Deck Builder', i18nKey: 'nav.deckBuilder', path: '/deck', file: '/deck.html' },
        {
          label: 'Stamina Check',
          i18nKey: 'nav.staminaCheck',
          path: '/stamina',
          file: '/stamina.html',
        },
        {
          label: 'Token Planner',
          i18nKey: 'nav.tokenPlanner',
          path: '/token-planner',
          file: '/token-planner.html',
        },
        {
          label: 'Accel Checker',
          path: '/accel',
          file: '/accel.html',
        },
        {
          label: 'Race Scheduler',
          i18nKey: 'nav.raceScheduler',
          href: 'https://race.daftuyda.moe',
        },
      ],
    },
    {
      label: 'Data',
      i18nKey: 'nav.data',
      children: [
        {
          label: 'Skill Library',
          i18nKey: 'nav.skillLibrary',
          path: '/skills',
          file: '/skills.html',
        },
        {
          label: 'Rank Breakdown',
          i18nKey: 'nav.rankBreakdown',
          path: '/rank-breakdown',
          file: '/rank-breakdown.html',
        },
      ],
    },
    {
      label: 'Fun',
      i18nKey: 'nav.fun',
      children: [
        { label: 'Randomizer', i18nKey: 'nav.randomizer', path: '/random', file: '/random.html' },
        { label: 'Umadle', i18nKey: 'nav.umadle', path: '/umadle', file: '/umadle.html' },
      ],
    },
    {
      label: 'About',
      i18nKey: 'nav.about',
      variant: 'guide-directory',
      menuMetaLabel: 'Reference library',
      menuMetaI18nKey: 'nav.guideLibrary',
      children: [
        {
          label: 'About UmaTools',
          i18nKey: 'nav.aboutUmaTools',
          path: '/about',
          file: '/about.html',
          promoted: true,
        },
        {
          label: 'All Documentation',
          i18nKey: 'nav.allGuides',
          path: '/guides',
          file: '/guides.html',
          promoted: true,
        },
        {
          label: 'Rating & Skills',
          i18nKey: 'nav.guideRating',
          path: '/guides/rating-system',
          file: '/guides/rating-system.html',
        },
        {
          label: 'Team Trials',
          i18nKey: 'nav.guideTeamTrials',
          path: '/guides/team-trials',
          file: '/guides/team-trials.html',
        },
        {
          label: 'Acceleration',
          i18nKey: 'nav.guideAcceleration',
          path: '/guides/accel-checker',
          file: '/guides/accel-checker.html',
        },
        {
          label: 'Stamina',
          i18nKey: 'nav.guideStamina',
          path: '/guides/stamina-calculator',
          file: '/guides/stamina-calculator.html',
        },
        {
          label: 'Deck Builder',
          i18nKey: 'nav.deckBuilder',
          path: '/guides/deck-tools',
          file: '/guides/deck-tools.html',
        },
        {
          label: 'Grand Live',
          i18nKey: 'nav.guideGrandLive',
          path: '/guides/token-planner',
          file: '/guides/token-planner.html',
        },
        {
          label: 'OCR & Recognition',
          i18nKey: 'nav.guideOcr',
          path: '/guides/ocr-guide',
          file: '/guides/ocr-guide.html',
        },
        {
          label: 'Data & Privacy',
          i18nKey: 'nav.guidePrivacy',
          path: '/guides/persistence-and-sharing',
          file: '/guides/persistence-and-sharing.html',
        },
        {
          label: 'Translations',
          i18nKey: 'nav.guideTranslations',
          path: '/guides/translations',
          file: '/guides/translations.html',
        },
      ],
    },
  ];
  const ROUTES =
    Array.isArray(window.NAV_ROUTES) && window.NAV_ROUTES.length
      ? window.NAV_ROUTES
      : DEFAULT_ROUTES;
  const SERVER_PREF_KEY = 'umatoolsServer';
  const SITE_LANG_PREF_KEY = 'umatoolsSiteLanguage';
  const YOUTUBE_URL = 'https://youtube.com/@MaybeVoid';

  function normalizeServer(value) {
    return (value || '').toString().trim().toLowerCase() === 'jp' ? 'jp' : 'en';
  }

  // EN server can't reach uncapped stats above 1200; JP keeps the page's original max.
  const STAT_INPUT_IDS = ['stat-speed', 'stat-stamina', 'stat-power', 'stat-guts', 'stat-wisdom'];
  const EN_STAT_CAP = 1200;
  function applyServerStatCap(serverValue) {
    const isEN = normalizeServer(serverValue) === 'en';
    STAT_INPUT_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (!('originalMax' in el.dataset)) {
        el.dataset.originalMax = el.getAttribute('max') || '';
      }
      const target = isEN ? String(EN_STAT_CAP) : el.dataset.originalMax;
      if (target) el.setAttribute('max', target);
      else el.removeAttribute('max');
      if (isEN) {
        const current = Number.parseInt(el.value, 10);
        if (Number.isFinite(current) && current > EN_STAT_CAP) {
          el.value = String(EN_STAT_CAP);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
  }

  function normalizeSiteLanguage(value) {
    return (value || '').toString().trim().toLowerCase() === 'jp' ? 'jp' : 'en';
  }

  function readPref(key, normalizeFn, fallback) {
    try {
      return normalizeFn(localStorage.getItem(key));
    } catch {
      return fallback;
    }
  }

  function writePref(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }

  function applySiteLanguage(lang) {
    const normalized = normalizeSiteLanguage(lang);
    document.documentElement.lang = normalized === 'jp' ? 'ja' : 'en';
    document.documentElement.dataset.siteLanguage = normalized;
  }

  // Footer links: override per-page with window.FOOTER_LINKS if you want
  const DEFAULT_FOOTER = [
    {
      label: 'GitHub',
      href: 'https://github.com/daftuyda/UmaTools',
    },
    { label: 'Discord', href: 'https://discord.gg/hsm' },
  ];
  const FOOTER =
    Array.isArray(window.FOOTER_LINKS) && window.FOOTER_LINKS.length
      ? window.FOOTER_LINKS
      : DEFAULT_FOOTER;

  // Build navbar element (not in DOM yet)
  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  var _t = function (key, fallback) {
    return typeof window.t === 'function' ? window.t(key) : fallback || key;
  };
  nav.setAttribute('aria-label', _t('nav.primary'));
  nav.setAttribute('data-i18n-aria', 'nav.primary');
  nav.innerHTML = `
    <div class="nav-inner">
      <div class="nav-left">
        <a class="brand" href="/">
          <span class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 640 680" role="img">
              <path d="M24 20c49 0 87 36 122 84v278c0 97 59 151 174 151s174-54 174-151V104c35-48 73-84 122-84 9 0 16 8 16 18v344c0 175-124 282-312 282S8 557 8 382V38c0-10 7-18 16-18Z" />
              <path d="M110 20h420l-65 84c-10 12-20 16-38 16h-37c-7 0-12 6-12 14v252c0 35-26 62-58 62s-58-27-58-62V134c0-8-5-14-12-14h-37c-18 0-28-4-38-16L110 20Z" />
            </svg>
          </span>
          <span class="brand-copy">
            <span class="brand-text">UmaTools</span>
            <span class="brand-subtitle">Training toolkit</span>
          </span>
        </a>
        <button class="menu-btn" data-i18n-aria="nav.menu" aria-label="${_t('nav.menu')}" aria-expanded="false">
          <span class="menu-lines" aria-hidden="true"><span></span><span></span><span></span></span>
        </button>
        <div class="nav-links"></div>
      </div>
      <div class="nav-right">
        <a
          class="nav-action nav-youtube"
          href="${YOUTUBE_URL}"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open MaybeVoid on YouTube"
          title="YouTube"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21.2 7.1a2.7 2.7 0 0 0-1.9-1.9C17.6 4.75 12 4.75 12 4.75s-5.6 0-7.3.45a2.7 2.7 0 0 0-1.9 1.9A28 28 0 0 0 2.35 12a28 28 0 0 0 .45 4.9 2.7 2.7 0 0 0 1.9 1.9c1.7.45 7.3.45 7.3.45s5.6 0 7.3-.45a2.7 2.7 0 0 0 1.9-1.9 28 28 0 0 0 .45-4.9 28 28 0 0 0-.45-4.9Z" />
            <path class="youtube-play" d="m10 9 5 3-5 3V9Z" />
          </svg>
          <span class="nav-action-label">YouTube</span>
        </a>
        <div class="nav-settings">
          <button
            type="button"
            class="settings-btn nav-action"
            id="nav-settings-toggle"
            aria-expanded="false"
            aria-controls="nav-settings-panel"
            aria-haspopup="true"
            title="${_t('nav.settings')}"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Z" />
              <path d="M19.4 13.5a7.7 7.7 0 0 0 0-3l1.35-1.05-1.8-3.1-1.58.65a8.1 8.1 0 0 0-2.6-1.5L14.55 3h-3.6l-.22 2.5A8.1 8.1 0 0 0 8.13 7l-1.58-.65-1.8 3.1L6.1 10.5a7.7 7.7 0 0 0 0 3l-1.35 1.05 1.8 3.1L8.13 17a8.1 8.1 0 0 0 2.6 1.5l.22 2.5h3.6l.22-2.5a8.1 8.1 0 0 0 2.6-1.5l1.58.65 1.8-3.1L19.4 13.5Z" />
            </svg>
            <span class="nav-action-label" data-i18n="nav.settings">${_t('nav.settings')}</span>
          </button>
          <div
            class="nav-settings-panel"
            id="nav-settings-panel"
            role="group"
            data-i18n-aria="nav.globalSettings"
            aria-label="${_t('nav.globalSettings')}"
            hidden
          >
            <div class="nav-settings-title" data-i18n="nav.globalSettings">${_t('nav.globalSettings')}</div>
            <label class="nav-control">
              <span data-i18n="nav.server">${_t('nav.server')}</span>
              <select id="nav-server-select" aria-label="Game server">
                <option value="en">EN</option>
                <option value="jp">JP</option>
              </select>
            </label>
            <label class="nav-control">
              <span data-i18n="nav.siteLanguage">${_t('nav.siteLanguage')}</span>
              <select id="nav-site-lang-select" aria-label="Site language">
                <option value="en">EN</option>
                <option value="jp">JP</option>
              </select>
            </label>
            <label class="nav-control theme-control">
              <span>Theme</span>
              <select id="nav-theme-select" aria-label="Color theme">
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="oled">OLED</option>
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  `;

  const navEl = nav;
  const linksWrap = nav.querySelector('.nav-links');
  const menuBtn = nav.querySelector('.menu-btn');
  const settingsToggleBtn = nav.querySelector('#nav-settings-toggle');
  const settingsPanel = nav.querySelector('#nav-settings-panel');
  let settingsOpen = false;

  function setSettingsOpen(open) {
    if (!settingsToggleBtn || !settingsPanel) return;
    settingsOpen = !!open;
    settingsToggleBtn.setAttribute('aria-expanded', String(settingsOpen));
    settingsPanel.hidden = !settingsOpen;
  }

  function closeAllDropdowns() {
    for (const dd of navEl.querySelectorAll('.nav-group.open')) {
      dd.classList.remove('open');
      const btn = dd.querySelector('.nav-group-btn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  }

  // Toggle hamburger on mobile
  menuBtn.addEventListener('click', () => {
    setSettingsOpen(false);
    closeAllDropdowns();
    const open = navEl.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });

  // Close menu when a link is chosen
  linksWrap.addEventListener('click', (e) => {
    if (e.target.closest('.nav-link')) {
      setSettingsOpen(false);
      closeAllDropdowns();
      navEl.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
    }
  });

  if (settingsToggleBtn && settingsPanel) {
    settingsToggleBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeAllDropdowns();
      setSettingsOpen(!settingsOpen);
    });
    settingsPanel.addEventListener('click', (event) => event.stopPropagation());
    document.addEventListener('click', (event) => {
      if (!settingsOpen) return;
      const target = event.target;
      if (target instanceof Element && target.closest('.nav-settings')) return;
      setSettingsOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const restoreSettingsFocus = settingsOpen;
        const restoreMenuFocus = navEl.classList.contains('open');
        setSettingsOpen(false);
        closeAllDropdowns();
        navEl.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
        if (restoreSettingsFocus) settingsToggleBtn.focus();
        else if (restoreMenuFocus) menuBtn.focus();
      }
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest('.nav-group')) return;
    closeAllDropdowns();
  });

  // Collect all leaf links for clean-URL fallback and active marking
  function collectLeaves(routes) {
    const leaves = [];
    for (const r of routes) {
      if (r.children) {
        for (const child of r.children) leaves.push(child);
      } else {
        leaves.push(r);
      }
    }
    return leaves;
  }

  // This script is deferred on every page, so the body is complete when it runs.
  // Mount before DOMContentLoaded to keep the navigation from shifting the page.
  function mountNavigation() {
    // Put navbar at top
    const navSlot = document.getElementById('site-nav-slot');
    const skipLink = document.querySelector('.skip-link');
    if (navSlot) {
      navSlot.replaceWith(nav);
    } else if (skipLink && skipLink.parentNode) {
      skipLink.insertAdjacentElement('afterend', nav);
    } else {
      document.body.prepend(nav);
    }
    document.body.classList.add('nav-mounted');

    // Announcement banner with countdown (auto-hides after giveaway ends)
    const giveawayEnd = new Date('2026-04-10T15:00:00Z');
    const BANNER_DISMISS_KEY = 'giveaway-banner-dismissed';
    let bannerDismissed = false;
    try {
      bannerDismissed = localStorage.getItem(BANNER_DISMISS_KEY) === '1';
    } catch {}
    if (!bannerDismissed && giveawayEnd.getTime() > Date.now()) {
      const banner = document.createElement('div');
      banner.className = 'site-banner';
      let bannerInterval = null;
      function updateBannerCountdown() {
        const now = Date.now();
        const diff = giveawayEnd.getTime() - now;
        if (diff <= 0) {
          banner.remove();
          if (bannerInterval) clearInterval(bannerInterval);
          return;
        }
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        const time = (d > 0 ? d + 'd ' : '') + h + 'h ' + m + 'm ' + s + 's';
        banner.innerHTML =
          '<a href="https://discord.gg/hsm" target="_blank" rel="noopener">\uD83C\uDF89 10x 1st Anni Ticket Giveaway \u2014 ' +
          time +
          ' left \u2014 Join the Discord!</a><button class="banner-dismiss" aria-label="Dismiss">\u00d7</button>';
      }
      updateBannerCountdown();
      bannerInterval = setInterval(updateBannerCountdown, 1000);
      banner.addEventListener('click', function (e) {
        if (e.target.closest('.banner-dismiss')) {
          e.preventDefault();
          banner.remove();
          if (bannerInterval) clearInterval(bannerInterval);
          try {
            localStorage.setItem(BANNER_DISMISS_KEY, '1');
          } catch {}
        }
      });
      nav.insertAdjacentElement('afterend', banner);
    }

    const here = location.pathname.replace(/\/+$/, '') || '/';
    const norm = (s) => (s || '').replace(/\/+$/, '') || '/';
    const allLinks = [];
    let navGroupIndex = 0;

    // Build links — supports both flat and grouped routes
    for (const route of ROUTES) {
      if (route.children) {
        // Dropdown group
        const group = document.createElement('div');
        group.className = 'nav-group';
        if (route.variant) group.classList.add('nav-group-' + route.variant);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-group-btn';
        btn.setAttribute('aria-expanded', 'false');
        const menuId = 'nav-group-menu-' + navGroupIndex++;
        const triggerId = menuId + '-trigger';
        btn.id = triggerId;
        btn.setAttribute('aria-controls', menuId);
        const groupLabel = route.i18nKey ? _t(route.i18nKey, route.label) : route.label;
        btn.innerHTML =
          '<span' +
          (route.i18nKey ? ' data-i18n="' + route.i18nKey + '"' : '') +
          '>' +
          groupLabel +
          '</span><svg class="nav-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">' +
          '<path d="M3 4.5L6 7.5L9 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
          '</svg>';

        const menu = document.createElement('div');
        menu.className = 'nav-group-menu';
        if (route.variant) menu.classList.add('nav-group-menu-' + route.variant);
        menu.id = menuId;
        menu.setAttribute('aria-labelledby', triggerId);

        const menuHeading = document.createElement('div');
        menuHeading.className = 'nav-menu-heading';
        const menuHeadingLabel = document.createElement('span');
        menuHeadingLabel.textContent = groupLabel;
        if (route.i18nKey) menuHeadingLabel.setAttribute('data-i18n', route.i18nKey);
        const menuHeadingMeta = document.createElement('span');
        menuHeadingMeta.textContent = route.menuMetaI18nKey
          ? _t(route.menuMetaI18nKey, route.menuMetaLabel)
          : route.menuMetaLabel || 'Workspace';
        if (route.menuMetaI18nKey) {
          menuHeadingMeta.setAttribute('data-i18n', route.menuMetaI18nKey);
        }
        menuHeading.appendChild(menuHeadingLabel);
        menuHeading.appendChild(menuHeadingMeta);
        menu.appendChild(menuHeading);

        let hasActive = false;
        for (const child of route.children) {
          const a = document.createElement('a');
          a.className = 'nav-link';
          if (route.variant) a.classList.add('nav-link-' + route.variant);
          if (child.promoted) a.classList.add('nav-link-promoted');
          const itemLabel = document.createElement('span');
          itemLabel.className = 'nav-link-label';
          itemLabel.textContent = child.i18nKey ? _t(child.i18nKey, child.label) : child.label;
          if (child.i18nKey) itemLabel.setAttribute('data-i18n', child.i18nKey);
          const itemArrow = document.createElement('span');
          itemArrow.className = 'nav-link-arrow';
          itemArrow.setAttribute('aria-hidden', 'true');
          itemArrow.innerHTML = child.href
            ? '<svg viewBox="0 0 16 16"><path d="M6 3h7v7M13 3 5 11"/></svg>'
            : '<svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg>';
          a.appendChild(itemLabel);
          a.appendChild(itemArrow);
          a.href = child.href || child.path || child.file || '#';
          if (child.href) {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
          }
          if (child.file) a.dataset.file = child.file;
          if (child.path) a.dataset.clean = child.path;
          if (
            (child.path && here === norm(child.path)) ||
            (child.file && here === norm(child.file))
          ) {
            a.classList.add('active');
            a.setAttribute('aria-current', 'page');
            hasActive = true;
          }
          menu.appendChild(a);
          allLinks.push(a);
        }
        if (hasActive) group.classList.add('has-active');

        const menuItems = () => Array.from(menu.querySelectorAll('.nav-link'));
        const openGroup = (focusIndex) => {
          setSettingsOpen(false);
          closeAllDropdowns();
          group.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
          if (typeof focusIndex === 'number') {
            window.setTimeout(() => {
              if (!group.classList.contains('open')) return;
              const items = menuItems();
              const targetIndex = focusIndex < 0 ? items.length - 1 : focusIndex;
              if (items[targetIndex]) items[targetIndex].focus({ preventScroll: true });
            }, 180);
          }
        };

        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const wasOpen = group.classList.contains('open');
          closeAllDropdowns();
          if (!wasOpen) openGroup();
        });

        btn.addEventListener('keydown', (event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          event.stopPropagation();
          openGroup(event.key === 'ArrowDown' ? 0 : -1);
        });

        menu.addEventListener('keydown', (event) => {
          const items = menuItems();
          const currentIndex = items.indexOf(document.activeElement);
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            group.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
            btn.focus();
            return;
          }
          const columnCount = Math.max(
            1,
            getComputedStyle(menu).gridTemplateColumns.split(/\s+/).filter(Boolean).length
          );
          let nextIndex = null;
          if (event.key === 'ArrowDown') {
            nextIndex = currentIndex + columnCount;
            if (nextIndex >= items.length) {
              nextIndex = items.findIndex(
                (_, index) => index % columnCount === currentIndex % columnCount
              );
            }
          } else if (event.key === 'ArrowUp') {
            nextIndex = currentIndex - columnCount;
            if (nextIndex < 0) {
              for (let index = items.length - 1; index >= 0; index -= 1) {
                if (index % columnCount === currentIndex % columnCount) {
                  nextIndex = index;
                  break;
                }
              }
            }
          } else if (
            event.key === 'ArrowRight' &&
            columnCount > 1 &&
            currentIndex % columnCount < columnCount - 1 &&
            currentIndex + 1 < items.length
          ) {
            nextIndex = currentIndex + 1;
          } else if (
            event.key === 'ArrowLeft' &&
            columnCount > 1 &&
            currentIndex % columnCount > 0
          ) {
            nextIndex = currentIndex - 1;
          } else if (event.key === 'Home') nextIndex = 0;
          else if (event.key === 'End') nextIndex = items.length - 1;
          if (nextIndex === null || !items[nextIndex]) return;
          event.preventDefault();
          event.stopPropagation();
          items[nextIndex].focus();
        });

        group.addEventListener('focusout', () => {
          window.setTimeout(() => {
            if (group.contains(document.activeElement)) return;
            group.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
          }, 0);
        });

        group.appendChild(btn);
        group.appendChild(menu);
        linksWrap.appendChild(group);
      } else {
        // Flat link (backward compat)
        const a = document.createElement('a');
        a.className = 'nav-link nav-group-btn';
        a.textContent = route.i18nKey ? _t(route.i18nKey, route.label) : route.label;
        if (route.i18nKey) a.setAttribute('data-i18n', route.i18nKey);
        a.href = route.path || route.file || '#';
        if (route.file) a.dataset.file = route.file;
        if (route.path) a.dataset.clean = route.path;
        if (here === norm(route.path) || here === norm(route.file)) {
          a.classList.add('active');
          a.setAttribute('aria-current', 'page');
        }
        linksWrap.appendChild(a);
        allLinks.push(a);
      }
    }

    // Prefer clean URLs, fall back to .html if needed
    const leaves = collectLeaves(ROUTES);
    const test = leaves.find((r) => r.path && r.file && r.path !== '/');
    if (test) {
      fetch(test.path, { method: 'HEAD' })
        .then((res) => {
          if (!res.ok) throw 0;
        })
        .catch(() => {
          allLinks.forEach((a) => {
            if (a.dataset.file) a.href = a.dataset.file;
          });
        });
    }

    // Theme selection lives in Settings; retain the legacy button only as a hidden fallback.
    const toggle = document.getElementById('modeToggleBtn');
    if (toggle) toggle.hidden = true;
    const serverSelect = nav.querySelector('#nav-server-select');
    const siteLangSelect = nav.querySelector('#nav-site-lang-select');
    const themeSelect = nav.querySelector('#nav-theme-select');
    if (serverSelect) {
      serverSelect.value = readPref(SERVER_PREF_KEY, normalizeServer, 'en');
      serverSelect.addEventListener('change', () => {
        const next = normalizeServer(serverSelect.value);
        serverSelect.value = next;
        writePref(SERVER_PREF_KEY, next);
        window.dispatchEvent(
          new CustomEvent('umatools:server-change', {
            detail: { server: next, source: 'nav' },
          })
        );
      });
      window.addEventListener('umatools:server-change', (event) => {
        const next = normalizeServer(event?.detail?.server);
        if (serverSelect.value !== next) serverSelect.value = next;
        applyServerStatCap(next);
      });
      applyServerStatCap(serverSelect.value);
      window.dispatchEvent(
        new CustomEvent('umatools:server-change', {
          detail: { server: serverSelect.value, source: 'nav-init' },
        })
      );
    }
    if (siteLangSelect) {
      siteLangSelect.value = readPref(SITE_LANG_PREF_KEY, normalizeSiteLanguage, 'en');
      applySiteLanguage(siteLangSelect.value);
      siteLangSelect.addEventListener('change', () => {
        const next = normalizeSiteLanguage(siteLangSelect.value);
        siteLangSelect.value = next;
        writePref(SITE_LANG_PREF_KEY, next);
        applySiteLanguage(next);
        window.dispatchEvent(
          new CustomEvent('umatools:site-language-change', {
            detail: { language: next, source: 'nav' },
          })
        );
      });
      window.addEventListener('umatools:site-language-change', (event) => {
        const next = normalizeSiteLanguage(event?.detail?.language);
        if (siteLangSelect.value !== next) siteLangSelect.value = next;
        applySiteLanguage(next);
      });
      window.dispatchEvent(
        new CustomEvent('umatools:site-language-change', {
          detail: { language: siteLangSelect.value, source: 'nav-init' },
        })
      );
    }
    if (themeSelect) {
      const currentTheme =
        window.UmaTheme && typeof window.UmaTheme.get === 'function'
          ? window.UmaTheme.get()
          : document.documentElement.classList.contains('oled')
            ? 'oled'
            : document.documentElement.classList.contains('dark')
              ? 'dark'
              : 'light';
      themeSelect.value = currentTheme;
      themeSelect.addEventListener('change', () => {
        if (window.UmaTheme && typeof window.UmaTheme.set === 'function') {
          window.UmaTheme.set(themeSelect.value);
        }
      });
      window.addEventListener('umatools:theme-change', (event) => {
        const next = event && event.detail ? event.detail.theme : 'light';
        if (themeSelect.value !== next) themeSelect.value = next;
      });
    }

    // Footer at bottom
    const footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.innerHTML = `
      <div class="footer-inner">
        <div class="footer-identity">
          <span class="footer-mark" aria-hidden="true">
            <svg viewBox="0 0 640 680">
              <path d="M24 20c49 0 87 36 122 84v278c0 97 59 151 174 151s174-54 174-151V104c35-48 73-84 122-84 9 0 16 8 16 18v344c0 175-124 282-312 282S8 557 8 382V38c0-10 7-18 16-18Z" />
              <path d="M110 20h420l-65 84c-10 12-20 16-38 16h-37c-7 0-12 6-12 14v252c0 35-26 62-58 62s-58-27-58-62V134c0-8-5-14-12-14h-37c-18 0-28-4-38-16L110 20Z" />
            </svg>
          </span>
          <span><strong>UmaTools</strong><span class="footer-note"><span data-i18n="nav.madeWith">${_t('nav.madeWith')}</span> <span aria-label="love">&#10084;&#65039;</span></span></span>
        </div>
        <div class="footer-links" aria-label="Community links">
          ${FOOTER.map(
            (l) =>
              `<a href="${l.href}" target="_blank" rel="noopener noreferrer"><span>${l.label}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3 5 11"/></svg></a>`
          ).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(footer);

    let navElevationFrame = null;
    let navIsElevated = null;
    const updateNavElevation = () => {
      navElevationFrame = null;
      const nextState = window.scrollY > 10;
      if (nextState === navIsElevated) return;
      navIsElevated = nextState;
      navEl.classList.toggle('is-scrolled', nextState);
    };
    const queueNavElevationUpdate = () => {
      if (navElevationFrame !== null) return;
      navElevationFrame = requestAnimationFrame(updateNavElevation);
    };
    updateNavElevation();
    window.addEventListener('scroll', queueNavElevationUpdate, { passive: true });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
    }

    // Re-apply i18n to nav elements when language changes
    window.addEventListener('i18n:changed', () => {
      if (typeof window.applyI18n === 'function') {
        window.applyI18n(navEl);
        window.applyI18n(footer);
      }
    });

    // Signal that nav is ready so loaders can safely release.
    window.dispatchEvent(new Event('nav:ready'));
  }

  if (document.body) {
    mountNavigation();
  } else {
    document.addEventListener('DOMContentLoaded', mountNavigation, { once: true });
  }

  // Close menu/dropdowns if switching to desktop width
  window.addEventListener('resize', () => {
    if (window.innerWidth > 640 && navEl.classList.contains('open')) {
      navEl.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
      closeAllDropdowns();
    }
    if (window.innerWidth <= 640 && settingsOpen) {
      setSettingsOpen(false);
    }
  });
})();

// April Fools — activates only on April 1st (or ?af=1 to test)
(function aprilFools() {
  var now = new Date();
  var forceAF = /[?&]af=1/.test(location.search);
  if (!forceAF && (now.getMonth() !== 3 || now.getDate() !== 1)) return;

  // Check opt-out
  var AF_KEY = 'umafools-off';
  try {
    if (localStorage.getItem(AF_KEY) === '1' && !forceAF) return;
  } catch {}

  var active = true;
  var afStyle = null;
  var tipsyObs = null;
  var clickHandler = null;

  function enableAF() {
    active = true;

    // Force light mode
    var root = document.documentElement;
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
    var sun = document.querySelector('.sun');
    var moon = document.querySelector('.moon');
    if (sun) sun.style.display = 'inline';
    if (moon) moon.style.display = 'none';

    // "UmaFools" branding
    var brand = document.querySelector('.brand-text');
    if (brand) brand.textContent = 'UmaFools';

    // Tipsy style
    if (!afStyle) {
      afStyle = document.createElement('style');
      afStyle.id = 'af-style';
      afStyle.textContent =
        '@keyframes af-wobble{0%{transform:rotate(var(--af-r,0deg))}50%{transform:rotate(calc(var(--af-r,0deg)*-1))}100%{transform:rotate(var(--af-r,0deg))}}' +
        '.af-active .result-item,.af-active .pill,.af-active .btn,.af-active .nav-link,.af-active .card{--af-r:0deg;animation:af-wobble 3s ease-in-out infinite}';
    }
    document.head.appendChild(afStyle);
    document.body.classList.add('af-active');
    applyTipsy();

    // Start mutation observer
    if (!tipsyObs) {
      tipsyObs = new MutationObserver(applyTipsy);
    }
    tipsyObs.observe(document.documentElement, { childList: true, subtree: true });

    // Horse emoji clicks
    if (!clickHandler) {
      clickHandler = function (e) {
        if (!active) return;
        var horses = ['\uD83D\uDC0E', '\uD83C\uDFC7', '\uD83E\uDD84', '\uD83D\uDC34'];
        var emoji = document.createElement('span');
        emoji.textContent = horses[Math.floor(Math.random() * horses.length)];
        emoji.setAttribute('aria-hidden', 'true');
        emoji.style.cssText =
          'position:fixed;pointer-events:none;font-size:24px;z-index:9999;' +
          'left:' +
          e.clientX +
          'px;top:' +
          e.clientY +
          'px;' +
          'transition:all 1s ease-out;opacity:1;';
        document.body.appendChild(emoji);
        requestAnimationFrame(function () {
          emoji.style.top = e.clientY - 60 + 'px';
          emoji.style.opacity = '0';
        });
        setTimeout(function () {
          emoji.remove();
        }, 1100);
      };
      document.addEventListener('click', clickHandler);
    }

    // Update toggle if it exists
    var toggle = document.getElementById('af-toggle');
    if (toggle) toggle.value = 'on';
  }

  function disableAF() {
    active = false;
    document.body.classList.remove('af-active');
    if (afStyle && afStyle.parentNode) afStyle.parentNode.removeChild(afStyle);
    if (tipsyObs) tipsyObs.disconnect();

    // Restore branding
    var brand = document.querySelector('.brand-text');
    if (brand) brand.textContent = 'UmaTools';

    // Remove tipsy data
    document.querySelectorAll('[data-af-done]').forEach(function (el) {
      el.removeAttribute('data-af-done');
      el.style.removeProperty('--af-r');
      el.style.removeProperty('animation-delay');
    });

    // Restore theme from localStorage
    try {
      var saved = localStorage.getItem('umasearch-darkmode');
      if (saved === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.style.colorScheme = 'dark';
        var sun = document.querySelector('.sun');
        var moon = document.querySelector('.moon');
        if (sun) sun.style.display = 'none';
        if (moon) moon.style.display = 'inline';
      }
    } catch {}

    var toggle = document.getElementById('af-toggle');
    if (toggle) toggle.value = 'off';
  }

  function applyTipsy() {
    if (!active) return;
    var els = document.querySelectorAll('.result-item,.pill,.btn,.nav-link,.card');
    els.forEach(function (el) {
      if (el.dataset.afDone) return;
      el.dataset.afDone = '1';
      el.style.setProperty('--af-r', (Math.random() * 2 - 1).toFixed(2) + 'deg');
      el.style.animationDelay = (Math.random() * 2).toFixed(2) + 's';
    });
  }

  // Add toggle to settings panel (uses select like the other settings)
  function addToggle() {
    var panel = document.getElementById('nav-settings-panel');
    if (!panel || document.getElementById('af-toggle')) return;
    var label = document.createElement('label');
    label.className = 'nav-control';
    label.innerHTML =
      '<span>\uD83C\uDFC7 April Fools</span>' +
      '<select id="af-toggle">' +
      '<option value="on" selected>On</option>' +
      '<option value="off">Off</option>' +
      '</select>';
    panel.appendChild(label);
    var sel = document.getElementById('af-toggle');
    sel.addEventListener('change', function () {
      if (sel.value === 'on') {
        try {
          localStorage.removeItem(AF_KEY);
        } catch {}
        enableAF();
      } else {
        try {
          localStorage.setItem(AF_KEY, '1');
        } catch {}
        disableAF();
      }
    });
  }

  // Block dark mode toggle while AF is active
  function blockDarkMode() {
    var modeBtn = document.getElementById('modeToggleBtn');
    if (modeBtn && !modeBtn.dataset.afBlocked) {
      modeBtn.dataset.afBlocked = '1';
      modeBtn.addEventListener(
        'click',
        function (e) {
          if (active) {
            e.stopImmediatePropagation();
            e.preventDefault();
          }
        },
        true
      );
    }
  }

  // nav:ready fires after the nav is fully in the DOM with settings panel
  window.addEventListener('nav:ready', function () {
    addToggle();
    enableAF();
    blockDarkMode();
  });
})();

// Easter egg: type "oguri" anywhere to make the UI chonky (Oguri Cap's appetite)
(function oguriEgg() {
  var seq = 'oguri';
  var pos = 0;
  var fat = false;
  var eggStyle = null;
  var oguriAudio = null;

  // Preload audio on first user interaction so autoplay policy is satisfied
  function ensureAudio() {
    if (oguriAudio) return;
    oguriAudio = new Audio('/assets/required.mp3');
    oguriAudio.preload = 'auto';
    oguriAudio.volume = 0.5;
    oguriAudio.addEventListener('error', function () {
      console.warn(
        'Oguri audio failed to load',
        oguriAudio.currentSrc || oguriAudio.src,
        oguriAudio.error
      );
    });
    oguriAudio.load();
  }
  document.addEventListener('click', ensureAudio, { once: true });
  document.addEventListener('keydown', ensureAudio, { once: true });

  function toggleFat() {
    fat = !fat;
    if (fat) {
      if (!eggStyle) {
        eggStyle = document.createElement('style');
        eggStyle.id = 'oguri-style';
        eggStyle.textContent =
          '@keyframes oguri-chomp{0%{transform:scaleX(1)}15%{transform:scaleX(1.18)}30%{transform:scaleX(1)}45%{transform:scaleX(1.12)}60%{transform:scaleX(1)}}' +
          'body.oguri-fat{animation:oguri-chomp 0.6s ease-out;transform:scaleX(1.15);transform-origin:center top;transition:transform 0.5s cubic-bezier(.68,-0.55,.27,1.55)}' +
          'body.oguri-fat *{letter-spacing:0.04em}' +
          'body.oguri-fat .pill,body.oguri-fat .btn,body.oguri-fat .result-item,body.oguri-fat .card{padding-left:1.5em;padding-right:1.5em}';
      }
      document.head.appendChild(eggStyle);
      document.body.classList.add('oguri-fat');
      ensureAudio();
      if (oguriAudio) {
        oguriAudio.currentTime = 0;
        var p = oguriAudio.play();
        if (p && p.catch) {
          p.catch(function (err) {
            console.warn('Oguri audio playback failed', err);
          });
        }
      }
    } else {
      document.body.classList.remove('oguri-fat');
      if (eggStyle && eggStyle.parentNode) eggStyle.parentNode.removeChild(eggStyle);
    }
  }

  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    var key = (e.key || '').toLowerCase();
    if (key.length !== 1) return;
    if (key === seq[pos]) {
      pos++;
      if (pos === seq.length) {
        pos = 0;
        toggleFat();
      }
    } else {
      pos = key === seq[0] ? 1 : 0;
    }
  });
})();

// Give every Air workspace the same restrained entrance and scroll motion.
(function initWorkspaceMotion() {
  function revealWorkspace() {
    if (!document.body.classList.contains('ui-revamp-page')) return;

    var selector = [
      'main.container > h1',
      'main.container > .token-page-header',
      'main.container > .subtle',
      'main.container > section',
      'main.container > .card',
      'main.container > .search-panel',
      'main.container > .result',
      'main.container > .grid > .card',
      'main.container > [class$="-layout"]',
      'main.container > [class$="-tabs"]',
      'main.container > [class$="-toolbar"]',
      'main.container > [class$="-table-wrap"]',
      'main.container > [class$="-info"]',
      'main.container > [class$="-tab-panel"].active',
    ].join(',');
    var items = Array.from(new Set(document.querySelectorAll(selector)));
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    items.forEach(function (item, index) {
      item.classList.add('ui-motion-item');
      item.style.setProperty('--ui-motion-delay', Math.min(index, 6) * 45 + 'ms');
    });

    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (item) {
        item.classList.add('is-visible');
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -6% 0px' }
    );

    items.forEach(function (item) {
      observer.observe(item);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', revealWorkspace, { once: true });
  } else {
    revealWorkspace();
  }
})();
