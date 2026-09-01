(function () {
  'use strict';

  var tableBody = document.getElementById('rank-breakdown-body');
  var lookupInput = document.getElementById('rating-lookup');
  var lookupButton = document.getElementById('rating-lookup-go');
  var lookupResult = document.getElementById('rating-lookup-result');
  var overallPercent = document.getElementById('rank-overall-percent');
  var overallBar = document.getElementById('rank-overall-bar');
  var overallFill = document.getElementById('rank-overall-fill');
  var rangeMarkers = document.getElementById('rank-range-markers');
  if (!tableBody) return;

  var badgeRows = [];
  var spriteState = null;
  var resizeTimer = null;
  var activeRow = null;

  function t(key, vars) {
    return typeof window.t === 'function' ? window.t(key, vars) : key;
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) return '';
    return value.toLocaleString('en-US');
  }

  function toNumber(value) {
    var parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function renderUnavailable() {
    tableBody.innerHTML = '';
    var row = document.createElement('tr');
    var cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'muted';
    cell.textContent = t('rankBreakdown.unavailable');
    row.appendChild(cell);
    tableBody.appendChild(row);
  }

  function getRangeLabel(badge) {
    if (!Number.isFinite(badge.max)) {
      return t('rankBreakdown.rangeNoUpper', { min: formatNumber(badge.min) });
    }
    return t('rankBreakdown.rangeTemplate', {
      min: formatNumber(badge.min),
      max: formatNumber(badge.max),
    });
  }

  function renderRows(badges) {
    badgeRows = Array.isArray(badges) ? badges : [];
    tableBody.innerHTML = '';
    if (!badgeRows.length) {
      renderUnavailable();
      return;
    }

    var frag = document.createDocumentFragment();
    badgeRows.forEach(function (badge, index) {
      var row = document.createElement('tr');
      row.dataset.badgeIndex = String(index);
      row.dataset.min = String(badge.min);
      row.dataset.max = Number.isFinite(badge.max) ? String(badge.max) : '';
      row.dataset.label = badge.label;

      var iconCell = document.createElement('td');
      iconCell.className = 'icon-col';
      var icon = document.createElement('div');
      icon.className = 'rank-badge-icon';
      icon.setAttribute('role', 'img');
      icon.setAttribute('aria-label', t('rankBreakdown.iconAlt', { rank: badge.label }));
      icon.textContent = badge.label;
      if (badge.sprite) {
        icon.dataset.x = String(badge.sprite.x);
        icon.dataset.y = String(badge.sprite.y);
        icon.dataset.w = String(badge.sprite.w);
        icon.dataset.h = String(badge.sprite.h);
      }
      iconCell.appendChild(icon);
      row.appendChild(iconCell);

      var rankCell = document.createElement('td');
      rankCell.className = 'rank-col';
      rankCell.dataset.label = t('rankBreakdown.colRank');
      rankCell.textContent = badge.label;
      row.appendChild(rankCell);

      var minCell = document.createElement('td');
      minCell.className = 'number-col';
      minCell.dataset.label = t('rankBreakdown.colMinimum');
      minCell.textContent = formatNumber(badge.min);
      row.appendChild(minCell);

      var nextCell = document.createElement('td');
      nextCell.className = 'number-col';
      nextCell.dataset.label = t('rankBreakdown.colNext');
      nextCell.textContent = Number.isFinite(badge.nextThreshold)
        ? formatNumber(badge.nextThreshold)
        : t('rankBreakdown.maxRank');
      row.appendChild(nextCell);

      var rangeCell = document.createElement('td');
      rangeCell.className = 'number-col';
      rangeCell.dataset.label = t('rankBreakdown.colRange');
      rangeCell.textContent = getRangeLabel(badge);
      row.appendChild(rangeCell);

      frag.appendChild(row);
    });
    tableBody.appendChild(frag);
    renderRangeMarkers();
  }

  function renderRangeMarkers() {
    if (!rangeMarkers || !badgeRows.length) return;
    var markers = [
      { label: 'G–A+', target: 'G' },
      { label: 'S–SS+', target: 'S' },
    ];
    badgeRows.forEach(function (badge) {
      var base = badge.label;
      if (!/^[UL][A-Z]$/.test(base)) return;
      var maxSuffix = 0;
      badgeRows.forEach(function (candidate) {
        var match = candidate.label.match(new RegExp('^' + base + '(\\d+)$'));
        if (match) maxSuffix = Math.max(maxSuffix, Number.parseInt(match[1], 10) || 0);
      });
      markers.push({
        label: maxSuffix ? base + '–' + base + maxSuffix : base,
        target: base,
      });
    });

    rangeMarkers.innerHTML = markers
      .map(function (marker) {
        var index = badgeRows.findIndex(function (badge) {
          return badge.label === marker.target;
        });
        return index < 0
          ? ''
          : '<button class="rank-range-marker" type="button" data-badge-index="' +
              index +
              '">' +
              marker.label +
              '</button>';
      })
      .join('');
  }

  function findBadgeIndexByRating(rating) {
    if (!badgeRows.length) return -1;
    if (!Number.isFinite(rating)) return -1;
    if (rating <= badgeRows[0].min) return 0;
    for (var i = 0; i < badgeRows.length; i++) {
      var badge = badgeRows[i];
      var upper = Number.isFinite(badge.max) ? badge.max : Infinity;
      if (rating >= badge.min && rating <= upper) return i;
    }
    return badgeRows.length - 1;
  }

  function setActiveRow(row, smooth) {
    if (!row) return;
    if (activeRow && activeRow !== row) activeRow.classList.remove('is-active');
    activeRow = row;
    activeRow.classList.add('is-active');
    if (smooth) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
  }

  function clearActiveRow() {
    if (!activeRow) return;
    activeRow.classList.remove('is-active');
    activeRow = null;
  }

  function setOverallProgress(rating) {
    if (!overallFill || !overallPercent || !overallBar || !badgeRows.length) return;
    var maxRating = badgeRows[badgeRows.length - 1].min;
    var safeRating = Math.max(0, Number.isFinite(rating) ? rating : 0);
    var ratio = maxRating > 0 ? Math.min(1, safeRating / maxRating) : 0;
    var percentText = Math.round(ratio * 100) + '%';
    overallFill.style.width = percentText;
    overallPercent.textContent = percentText;
    overallBar.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  }

  function applyRatingLookup(opts) {
    var options = opts || {};
    if (!lookupInput || !lookupResult) return;
    var raw = (lookupInput.value || '').trim();
    if (!raw.length) {
      lookupResult.textContent = '';
      setOverallProgress(0);
      clearActiveRow();
      return;
    }

    var normalized = raw.replace(/,/g, '');
    var parsed = Number.parseInt(normalized, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      lookupResult.textContent = t('rankBreakdown.lookupInvalid');
      setOverallProgress(0);
      clearActiveRow();
      return;
    }
    var index = findBadgeIndexByRating(parsed);
    if (index < 0 || index >= badgeRows.length) return;
    var badge = badgeRows[index];
    var row = tableBody.querySelector('tr[data-badge-index="' + String(index) + '"]');
    if (row) setActiveRow(row, Boolean(options.smoothScroll));
    setOverallProgress(parsed);
    lookupResult.textContent = t('rankBreakdown.lookupResult', {
      rating: formatNumber(parsed),
      rank: badge.label,
      range: getRangeLabel(badge),
    });
  }

  function loadSpriteMetadata(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        resolve({
          url: url,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  function applyIconSprite(iconEl, rect, sprite) {
    if (!iconEl || !rect || !sprite || !sprite.width || !sprite.height) return;
    var renderWidth = iconEl.clientWidth || rect.w;
    var renderHeight = iconEl.clientHeight || rect.h;
    var scale = Math.min(renderWidth / rect.w, renderHeight / rect.h) * 0.96;
    var scaledSpriteWidth = sprite.width * scale;
    var scaledSpriteHeight = sprite.height * scale;
    var scaledRectWidth = rect.w * scale;
    var scaledRectHeight = rect.h * scale;
    var offsetX = (renderWidth - scaledRectWidth) / 2 - rect.x * scale;
    var offsetY = (renderHeight - scaledRectHeight) / 2 - rect.y * scale;

    iconEl.style.backgroundImage = 'url(' + sprite.url + ')';
    iconEl.style.backgroundSize = scaledSpriteWidth + 'px ' + scaledSpriteHeight + 'px';
    iconEl.style.backgroundPosition = offsetX + 'px ' + offsetY + 'px';
    iconEl.textContent = '';
  }

  function paintIcons() {
    if (!spriteState) return;
    var iconEls = tableBody.querySelectorAll('.rank-badge-icon[data-x]');
    iconEls.forEach(function (iconEl) {
      var rect = {
        x: toNumber(iconEl.dataset.x),
        y: toNumber(iconEl.dataset.y),
        w: toNumber(iconEl.dataset.w),
        h: toNumber(iconEl.dataset.h),
      };
      if (!rect.w || !rect.h) return;
      applyIconSprite(iconEl, rect, spriteState);
    });
  }

  function handleResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      paintIcons();
    }, 120);
  }

  async function init() {
    if (!window.RatingShared || typeof window.RatingShared.getRatingBadgeCatalog !== 'function') {
      renderUnavailable();
      return;
    }
    var catalog = window.RatingShared.getRatingBadgeCatalog();
    var badges = catalog && Array.isArray(catalog.badges) ? catalog.badges : [];
    renderRows(badges);
    if (lookupInput) {
      lookupInput.addEventListener('input', function () {
        applyRatingLookup({ smoothScroll: false });
      });
      lookupInput.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        applyRatingLookup({ smoothScroll: true });
      });
    }
    if (lookupButton) {
      lookupButton.addEventListener('click', function () {
        applyRatingLookup({ smoothScroll: true });
      });
    }
    if (rangeMarkers) {
      rangeMarkers.addEventListener('click', function (event) {
        var button = event.target.closest('.rank-range-marker');
        if (!button) return;
        var index = Number.parseInt(button.dataset.badgeIndex, 10);
        var badge = badgeRows[index];
        var row = tableBody.querySelector('tr[data-badge-index="' + String(index) + '"]');
        if (!badge || !row) return;
        lookupInput.value = String(badge.min);
        applyRatingLookup({ smoothScroll: false });
        row.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
      });
    }
    var spriteUrl = catalog && catalog.sprite ? catalog.sprite.url : '';
    setOverallProgress(0);
    if (!spriteUrl) return;

    try {
      spriteState = await loadSpriteMetadata(spriteUrl);
      paintIcons();
      window.addEventListener('resize', handleResize);
    } catch {
      // Keep text fallback labels if sprite metadata fails to load.
    }
  }

  window.addEventListener('i18n:changed', function () {
    if (!badgeRows.length) return;
    renderRows(badgeRows);
    paintIcons();
    applyRatingLookup({ smoothScroll: false });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
