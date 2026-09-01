(function () {
  'use strict';

  var STORAGE_KEY = 'umatools.changelog.dismissed';

  function readDismissed() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function writeDismissed(version) {
    try {
      localStorage.setItem(STORAGE_KEY, version);
    } catch {}
  }

  function getLang() {
    if (window.I18n && typeof window.I18n.getLang === 'function') {
      var lang = window.I18n.getLang();
      return lang === 'ja' ? 'ja' : 'en';
    }
    return 'en';
  }

  function localized(obj) {
    var lang = getLang();
    return (obj && (obj[lang] || obj.en)) || '';
  }

  function renderEntries(ul, entries) {
    ul.innerHTML = '';
    var fragment = document.createDocumentFragment();
    for (var i = 0; i < entries.length; i++) {
      var li = document.createElement('li');
      li.textContent = localized(entries[i]);
      fragment.appendChild(li);
    }
    ul.appendChild(fragment);
  }

  function mount(data) {
    var version = data.version;
    var entries = data.entries;
    if (!version || !entries || !entries.length) return;
    if (readDismissed() === version) return;

    var _t = function (key) {
      return typeof window.t === 'function' ? window.t(key) : key;
    };

    // -- backdrop --
    var backdrop = document.createElement('div');
    backdrop.className = 'changelog-backdrop';

    // -- modal --
    var modal = document.createElement('div');
    modal.className = 'changelog-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', _t('changelog.whatsNew'));

    // -- header --
    var header = document.createElement('div');
    header.className = 'changelog-modal-header';

    var title = document.createElement('h2');
    title.className = 'changelog-modal-title';
    title.setAttribute('data-i18n', 'changelog.whatsNew');
    title.textContent = _t('changelog.whatsNew');

    var versionTag = document.createElement('span');
    versionTag.className = 'changelog-version';
    versionTag.textContent = version;

    header.appendChild(title);
    header.appendChild(versionTag);

    // -- body with entries --
    var body = document.createElement('div');
    body.className = 'changelog-modal-body';

    var summary = document.createElement('p');
    summary.className = 'changelog-summary';
    summary.textContent = localized(data.summary);
    if (summary.textContent) body.appendChild(summary);

    var ul = document.createElement('ul');
    ul.className = 'changelog-list';
    renderEntries(ul, entries);
    body.appendChild(ul);

    // -- footer with dismiss --
    var footer = document.createElement('div');
    footer.className = 'changelog-modal-footer';

    var dismissBtn = document.createElement('button');
    dismissBtn.className = 'changelog-dismiss';
    dismissBtn.setAttribute('data-i18n', 'changelog.dismiss');
    dismissBtn.textContent = _t('changelog.dismiss');

    footer.appendChild(dismissBtn);

    // -- assemble --
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    // Trigger entrance animation on next frame
    requestAnimationFrame(function () {
      backdrop.classList.add('changelog-visible');
    });

    // -- close helpers --
    var closing = false;
    function close() {
      if (closing) return;
      closing = true;
      writeDismissed(version);
      document.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('i18n:changed', handleLanguageChange);
      backdrop.classList.remove('changelog-visible');
      backdrop.classList.add('changelog-hiding');
      backdrop.addEventListener('transitionend', function handler() {
        backdrop.removeEventListener('transitionend', handler);
        backdrop.remove();
      });
    }

    dismissBtn.addEventListener('click', close);
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) close();
    });
    function handleKeydown(e) {
      if (e.key === 'Escape' && backdrop.parentNode) {
        close();
      }
    }
    document.addEventListener('keydown', handleKeydown);

    // Focus the dismiss button for accessibility
    dismissBtn.focus();

    // Re-apply i18n if available
    if (typeof window.applyI18n === 'function') {
      window.applyI18n(backdrop);
    }

    // Update text when language changes
    function handleLanguageChange() {
      summary.textContent = localized(data.summary);
      renderEntries(ul, entries);
      if (typeof window.applyI18n === 'function') {
        window.applyI18n(backdrop);
      }
    }
    window.addEventListener('i18n:changed', handleLanguageChange);
  }

  var initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;
    fetch('/assets/changelog.json')
      .then(function (res) {
        if (!res.ok) throw new Error(res.status);
        return res.json();
      })
      .then(mount)
      .catch(function () {
        // Silently fail — changelog is non-critical
      });
  }

  // Wait for nav to be ready so we can insert after it
  var navReady = false;
  var domReady = false;

  function tryInit() {
    if (navReady && domReady) init();
  }

  window.addEventListener('nav:ready', function () {
    navReady = true;
    tryInit();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      domReady = true;
      tryInit();
    });
  } else {
    domReady = true;
    tryInit();
  }

  // Fallback in case nav:ready never fires
  setTimeout(function () {
    navReady = true;
    tryInit();
  }, 3000);
})();
