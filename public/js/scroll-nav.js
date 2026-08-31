(function () {
  'use strict';

  var SCROLL_THRESHOLD = 200;
  var DEBOUNCE_MS = 300;
  var currentIndex = -1;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    var sections = document.querySelectorAll('[data-scroll-section]');
    if (sections.length < 2) return;

    var sectionList = Array.prototype.slice.call(sections);
    var nav = buildNav(sectionList);
    document.body.appendChild(nav);

    // Track which section is in view
    new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var idx = sectionList.indexOf(entry.target);
          if (idx !== -1) currentIndex = idx;
        });
      },
      { rootMargin: '-20% 0px -70% 0px' }
    ).observe(sections[0]);

    // Observe all sections
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var idx = sectionList.indexOf(entry.target);
          if (idx !== -1) currentIndex = idx;
        });
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );

    sectionList.forEach(function (s) {
      observer.observe(s);
    });

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        updateVisibility(nav);
      }, DEBOUNCE_MS);
    });

    setTimeout(function () {
      updateVisibility(nav);
    }, 100);
  }

  function buildNav(sectionList) {
    var nav = document.createElement('nav');
    nav.className = 'scroll-nav';
    nav.setAttribute('aria-label', 'Section navigation');

    // Up arrow
    var upBtn = document.createElement('button');
    upBtn.className = 'scroll-nav-btn';
    upBtn.type = 'button';
    upBtn.setAttribute('aria-label', 'Previous section');
    upBtn.innerHTML =
      '<svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"></polyline></svg>';
    nav.appendChild(upBtn);

    // Down arrow
    var downBtn = document.createElement('button');
    downBtn.className = 'scroll-nav-btn';
    downBtn.type = 'button';
    downBtn.setAttribute('aria-label', 'Next section');
    downBtn.innerHTML =
      '<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    nav.appendChild(downBtn);

    upBtn.addEventListener('click', function () {
      var target = currentIndex > 0 ? currentIndex - 1 : 0;
      // If already at top section, scroll to page top
      if (currentIndex <= 0) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        sectionList[target].scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      currentIndex = target;
    });

    downBtn.addEventListener('click', function () {
      var target =
        currentIndex < sectionList.length - 1 ? currentIndex + 1 : sectionList.length - 1;
      sectionList[target].scrollIntoView({ behavior: 'smooth', block: 'start' });
      currentIndex = target;
    });

    return nav;
  }

  function updateVisibility(nav) {
    var scrollable = document.documentElement.scrollHeight > window.innerHeight + SCROLL_THRESHOLD;
    if (scrollable) {
      nav.classList.add('visible');
    } else {
      nav.classList.remove('visible');
    }
  }
})();
