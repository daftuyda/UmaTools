(function (global) {
  'use strict';

  // ── Constants ──
  var SKILLS_URLS = ['/assets/skills_all.json', './assets/skills_all.json'];
  var HINTS_URLS = ['/assets/support_hints.json', './assets/support_hints.json'];

  var EFFECT_I18N_KEYS = {
    1: 'skillPopup.effectSpeed',
    2: 'skillPopup.effectStamina',
    3: 'skillPopup.effectPower',
    4: 'skillPopup.effectGuts',
    5: 'skillPopup.effectWisdom',
    6: 'skillPopup.effectRunningStyle',
    8: 'skillPopup.effectFieldOfView',
    9: 'skillPopup.effectStaminaRecovery',
    10: 'skillPopup.effectLaneChangeSpeed',
    13: 'skillPopup.effectPositionAwareness',
    14: 'skillPopup.effectPaceControl',
    21: 'skillPopup.effectTargetSpeed',
    22: 'skillPopup.effectTargetSpeed',
    27: 'skillPopup.effectTargetSpeed',
    28: 'skillPopup.effectLaneMovementSpeed',
    29: 'skillPopup.effectDecelerationBlock',
    31: 'skillPopup.effectAcceleration',
    32: 'skillPopup.effectSpecial',
    35: 'skillPopup.effectSpecial',
    37: 'skillPopup.effectSpecial',
    38: 'skillPopup.effectSpecial',
    41: 'skillPopup.effectSpecial',
    42: 'skillPopup.effectSpecial',
    501: 'skillPopup.effectStatBoost',
    502: 'skillPopup.effectStatBoost',
    503: 'skillPopup.effectStatBoost',
  };

  function getEffectLabel(type) {
    var key = EFFECT_I18N_KEYS[type];
    return key ? t(key) : 'Effect ' + type;
  }

  var RARITY_LABELS = {
    1: 'Normal',
    2: 'Rare',
    3: 'SR',
    4: 'SSR',
    5: 'Unique / Gold',
    6: 'Common',
  };

  var UMA_URLS = ['/assets/uma_data.json', './assets/uma_data.json'];

  // ── State ──
  var skillsById = null;
  var skillsByName = null;
  var cardById = null; // Map<string_id, {name, rarity, image, server, type}>
  var umaById = null; // Map<string_id, {name, nickname, server}>
  var loadPromise = null;
  var popupEl = null;
  var backdropEl = null;
  var isOpen = false;

  // ── Helpers ──
  function normalize(str) {
    return (str || '').toString().trim().toLowerCase();
  }

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function getLanguage() {
    try {
      return (localStorage.getItem('umatoolsServer') || '').trim().toLowerCase() === 'jp'
        ? 'jp'
        : 'en';
    } catch {
      return 'en';
    }
  }

  function getSiteLang() {
    try {
      var val = (localStorage.getItem('umatoolsSiteLanguage') || '').trim().toLowerCase();
      return val === 'ja' || val === 'jp' ? 'ja' : 'en';
    } catch {
      return 'en';
    }
  }

  function formatCompactNumber(value, maxDecimals) {
    var number = Number(value);
    if (!Number.isFinite(number)) return '';
    return Number(number.toFixed(maxDecimals == null ? 3 : maxDecimals)).toString();
  }

  function formatEffectValue(effect) {
    var raw = Number(effect && effect.value);
    if (!Number.isFinite(raw) || raw === 0) {
      return { value: t('skillPopup.activeEffect'), note: '', tone: 'neutral' };
    }

    // Recovery values are stored as basis points of maximum stamina:
    // 550 raw = 0.055 of max stamina = 5.5%.
    if (effect.type === 9) {
      return {
        value: formatCompactNumber(raw / 100, 2) + '%',
        note: t('skillPopup.ofMaxStamina'),
        tone: raw > 0 ? 'recovery' : 'negative',
      };
    }

    var scaled = raw / 10000;
    var suffix = '';
    if ([10, 21, 22, 27, 28].indexOf(effect.type) !== -1) suffix = ' m/s';
    if (effect.type === 31) suffix = ' m/s²';

    return {
      value: (scaled > 0 ? '+' : '') + formatCompactNumber(scaled, 3) + suffix,
      note: '',
      tone: scaled > 0 ? 'positive' : 'negative',
    };
  }

  function t(key) {
    return typeof global.t === 'function' ? global.t(key) : key;
  }

  // ── Data Loading ──
  function fetchFirst(urls, opts) {
    var i = 0;
    function tryNext() {
      if (i >= urls.length) return Promise.reject(new Error('all URLs failed'));
      var url = urls[i++];
      return fetch(url, opts)
        .then(function (res) {
          if (!res.ok) return tryNext();
          return res.json();
        })
        .catch(function () {
          return tryNext();
        });
    }
    return tryNext();
  }

  function loadData() {
    if (loadPromise) return loadPromise;
    loadPromise = Promise.all([loadSkills(), loadHints(), loadUma()]).then(function () {
      // If skills failed to load, allow retry on next attempt
      if (!skillsById) loadPromise = null;
    });
    return loadPromise;
  }

  function loadSkills() {
    if (global.__skillsAllData) {
      buildSkillMaps(global.__skillsAllData);
      return Promise.resolve();
    }
    return fetchFirst(SKILLS_URLS, { cache: 'force-cache' })
      .then(function (data) {
        if (!Array.isArray(data)) return;
        global.__skillsAllData = data;
        buildSkillMaps(data);
        if (typeof global.buildJPSkillNameMap === 'function') global.buildJPSkillNameMap(data);
      })
      .catch(function () {
        /* silent */
      });
  }

  function buildSkillMaps(data) {
    skillsById = new Map();
    skillsByName = new Map();

    data.forEach(function (skill) {
      if (skill.id != null) {
        skillsById.set(String(skill.id), skill);
      }

      // Index by all name variants
      indexName(skill.name_en, skill);
      indexName(skill.enname, skill);
      indexName(skill.jpname, skill);
      indexName(skill.name_ko, skill);
      indexName(skill.name_tw, skill);

      // Index gene_version too
      if (skill.gene_version) {
        var gv = skill.gene_version;
        if (gv.id != null) skillsById.set(String(gv.id), gv);
        indexName(gv.name_en, gv);
        indexName(gv.enname, gv);
        indexName(gv.jpname, gv);
        indexName(gv.name_ko, gv);
        indexName(gv.name_tw, gv);
      }
    });
  }

  function indexName(name, skill) {
    var key = normalize(name);
    if (key && !skillsByName.has(key)) {
      skillsByName.set(key, skill);
    }
  }

  function loadHints() {
    if (Array.isArray(global.__supportHintsData)) {
      buildCardMap(global.__supportHintsData);
      return Promise.resolve();
    }
    return fetchFirst(HINTS_URLS, { cache: 'force-cache' })
      .then(function (cards) {
        if (!Array.isArray(cards)) return;
        global.__supportHintsData = cards;
        buildCardMap(cards);
      })
      .catch(function () {
        /* silent */
      });
  }

  function buildCardMap(cards) {
    cardById = new Map();
    cards.forEach(function (card) {
      if (!card.SupportId) return;
      cardById.set(String(card.SupportId), {
        name: card.SupportName || '',
        nameJP: card.SupportNameJP || '',
        rarity: card.SupportRarity || '',
        image: card.SupportImage || '',
        server: card.SupportServer || '',
        type: card.SupportType || '',
      });
    });
  }

  function loadUma() {
    if (Array.isArray(global.__umaData)) {
      buildUmaMap(global.__umaData);
      return Promise.resolve();
    }
    return fetchFirst(UMA_URLS, { cache: 'force-cache' })
      .then(function (chars) {
        if (!Array.isArray(chars)) return;
        global.__umaData = chars;
        buildUmaMap(chars);
      })
      .catch(function () {
        /* silent */
      });
  }

  function buildUmaMap(chars) {
    umaById = new Map();
    chars.forEach(function (u) {
      if (!u.UmaId) return;
      umaById.set(String(u.UmaId), {
        name: u.UmaName || '',
        nameJP: u.UmaNameJP || '',
        nickname: u.UmaNickname || '',
        nicknameJP: u.UmaNicknameJP || '',
        server: u.UmaServer || '',
        image: u.UmaImage || '',
      });
    });
  }

  // Resolve card IDs from skill's sup_hint/sup_e arrays into card objects
  function getCardsForSkill(skill, serverPref) {
    if (!cardById) return { hintCards: [], eventCards: [] };
    var hintIds = flattenIdArrays(skill.sup_hint);
    var eventIds = flattenIdArrays(skill.sup_e);
    return {
      hintCards: resolveCards(hintIds, serverPref),
      eventCards: resolveCards(eventIds, serverPref),
    };
  }

  function flattenIdArrays(arr) {
    if (!Array.isArray(arr)) return [];
    var out = [];
    arr.forEach(function (sub) {
      if (Array.isArray(sub)) {
        sub.forEach(function (id) {
          out.push(String(id));
        });
      }
    });
    return out;
  }

  function resolveCards(ids, serverPref) {
    var seen = new Set();
    var result = [];
    ids.forEach(function (id) {
      if (seen.has(id)) return;
      seen.add(id);
      var card = cardById.get(id);
      if (!card) return;
      // Filter by server: EN shows only global; JP shows all
      if (serverPref !== 'jp' && card.server && card.server !== 'global') return;
      result.push(card);
    });
    return result;
  }

  function resolveCharacters(charIds, serverPref) {
    if (!umaById || !Array.isArray(charIds)) return [];
    var seen = new Set();
    var result = [];
    charIds.forEach(function (id) {
      var key = String(id);
      if (seen.has(key)) return;
      seen.add(key);
      var uma = umaById.get(key);
      if (!uma) return;
      if (serverPref !== 'jp' && uma.server && uma.server !== 'global') return;
      result.push(uma);
    });
    return result;
  }

  // ── Skill Lookup ──
  function findSkill(nameOrId) {
    if (!skillsById || !skillsByName) return null;
    // Try by ID first
    var byId = skillsById.get(String(nameOrId));
    if (byId) return byId;
    // Try by normalized name
    var key = normalize(nameOrId);
    // Direct match
    var found = skillsByName.get(key);
    if (found) return found;
    // Try stripping circle symbols for lookup
    var stripped = key.replace(/[\u25ce\u25cb\u25a0\u25a1\u25c9\u25ef]/g, '').trim();
    if (stripped !== key) return skillsByName.get(stripped) || null;
    return null;
  }

  // ── Popup Content ──
  // Strip trailing rarity tag like " (SSR)" from card name if rarity is shown separately
  var RARITY_SUFFIX_RE = /\s*\((SSR|SR|R)\)\s*$/i;

  function renderCardRow(c) {
    var siteLang = getSiteLang();
    var name = (siteLang === 'ja' && c.nameJP) || c.name;
    var row = '<div class="sp-card-row">';
    if (c.image) {
      row +=
        '<img class="sp-card-thumb" src="' +
        escapeHtml(c.image) +
        '" alt="" loading="lazy" decoding="async" fetchpriority="low">';
    }
    var displayName = c.rarity ? name.replace(RARITY_SUFFIX_RE, '') : name;
    row += '<span class="sp-card-name">' + escapeHtml(displayName) + '</span>';
    if (c.rarity) {
      row += '<span class="sp-card-rarity">' + escapeHtml(c.rarity) + '</span>';
    }
    row += '</div>';
    return row;
  }

  function renderCharRow(u) {
    var siteLang = getSiteLang();
    var name = (siteLang === 'ja' && u.nameJP) || u.name;
    var nickname = (siteLang === 'ja' && u.nicknameJP) || u.nickname;
    var row = '<div class="sp-card-row">';
    if (u.image) {
      row +=
        '<img class="sp-card-thumb" src="' +
        escapeHtml(u.image) +
        '" alt="" loading="lazy" decoding="async" fetchpriority="low">';
    }
    var label = nickname ? name + ' (' + nickname + ')' : name;
    row += '<span class="sp-card-name">' + escapeHtml(label) + '</span>';
    row += '</div>';
    return row;
  }

  function buildPopupHTML(skill, rawName) {
    var siteLang = getSiteLang();
    var isJP = siteLang === 'ja';

    // Name resolution — follows site language
    var displayName = isJP
      ? skill.jpname || skill.name_en || skill.enname || rawName
      : skill.name_en || skill.enname || skill.jpname || rawName;
    var altName = isJP ? skill.name_en || skill.enname || '' : skill.jpname || '';

    // Description — follows site language
    var desc = isJP
      ? skill.jpdesc || skill.desc_en || skill.endesc || ''
      : skill.desc_en || skill.endesc || skill.jpdesc || '';

    var rarity = skill.rarity;
    var cost = typeof skill.cost === 'number' ? skill.cost : null;
    var html = '';

    // ── Header ──
    html += '<div class="sp-header">';
    html += '<div class="sp-heading">';
    html += '<span class="sp-kicker">' + escapeHtml(t('skillPopup.skillDetails')) + '</span>';
    html += '<span class="sp-title" id="skill-popup-title">' + escapeHtml(displayName) + '</span>';
    html += '</div>';
    html +=
      '<button type="button" class="sp-close" aria-label="' +
      escapeHtml(t('common.close')) +
      '">&times;</button>';
    html += '</div>';

    html += '<div class="sp-body">';

    // ── Alt name ──
    if (altName && normalize(altName) !== normalize(displayName)) {
      html +=
        '<div class="sp-section sp-alt-name"><div class="sp-label">' +
        escapeHtml(isJP ? t('skillPopup.english') : t('skillPopup.japanese')) +
        '</div><div class="sp-desc">' +
        escapeHtml(altName) +
        '</div></div>';
    }

    // ── Meta (rarity + cost) ──
    if (rarity != null || cost != null) {
      html += '<div class="sp-section"><div class="sp-meta">';
      if (rarity != null) {
        var rarityLabel = RARITY_LABELS[rarity] || 'Rarity ' + rarity;
        html +=
          '<span class="sp-meta-item sp-meta-rarity" data-rarity="' +
          escapeHtml(String(rarity)) +
          '"><span class="sp-meta-label">' +
          escapeHtml(t('skillPopup.rarity')) +
          '</span><strong>' +
          escapeHtml(rarityLabel) +
          '</strong>' +
          '</span>';
      }
      if (cost != null) {
        html +=
          '<span class="sp-meta-item"><span class="sp-meta-label">' +
          escapeHtml(t('skillPopup.cost')) +
          '</span><strong>' +
          cost +
          ' SP</strong></span>';
      }
      html += '</div></div>';
    }

    // ── Description ──
    if (desc) {
      html +=
        '<div class="sp-section"><div class="sp-label">' +
        escapeHtml(t('skillPopup.description')) +
        '</div>';
      html += '<div class="sp-desc">' + escapeHtml(desc) + '</div></div>';
    }

    // ── Effects / activation conditions ──
    var condGroups = skill.condition_groups || [];
    if (condGroups.length) {
      var effectItems = [];
      condGroups.forEach(function (cg) {
        (cg.effects || []).forEach(function (eff) {
          var label = getEffectLabel(eff.type);
          var display = formatEffectValue(eff);
          effectItems.push({ label: label, display: display });
        });
      });
      if (effectItems.length) {
        html +=
          '<div class="sp-section"><div class="sp-label">' +
          escapeHtml(t('skillPopup.effects')) +
          '</div>';
        html += '<ul class="sp-effects-list">';
        effectItems.forEach(function (item) {
          html += '<li class="sp-effect-item sp-effect-' + escapeHtml(item.display.tone) + '">';
          html += '<span class="sp-effect-icon" aria-hidden="true"></span>';
          html += '<span class="sp-effect-copy"><span class="sp-effect-name">';
          html += escapeHtml(item.label) + '</span>';
          if (item.display.note) {
            html += '<span class="sp-effect-note">' + escapeHtml(item.display.note) + '</span>';
          }
          html += '</span><strong class="sp-effect-value">';
          html += escapeHtml(item.display.value) + '</strong></li>';
        });
        html += '</ul></div>';
      }

      // Duration
      var baseTime = condGroups[0].base_time;
      if (baseTime > 0) {
        var secs = (baseTime / 10000).toFixed(1);
        html += '<div class="sp-section"><div class="sp-meta">';
        html +=
          '<span class="sp-meta-item">' +
          escapeHtml(t('skillPopup.duration')) +
          ': ' +
          secs +
          's</span>';
        html += '</div></div>';
      }
    }

    // ── Support cards (hints + events) ──
    if (cardById) {
      var serverPref = getLanguage() === 'jp' ? 'jp' : 'global';
      var resolved = getCardsForSkill(skill, serverPref);
      var totalCards = resolved.hintCards.length + resolved.eventCards.length;

      if (totalCards) {
        html +=
          '<div class="sp-section"><div class="sp-label">' +
          escapeHtml(t('skillPopup.availableFrom')) +
          ' (' +
          totalCards +
          ')</div>';
        html += '<div class="sp-cards-list">';
        if (resolved.hintCards.length) {
          html +=
            '<div class="sp-card-group-label">' + escapeHtml(t('skillPopup.hints')) + '</div>';
          resolved.hintCards.forEach(function (c) {
            html += renderCardRow(c);
          });
        }
        if (resolved.eventCards.length) {
          html +=
            '<div class="sp-card-group-label">' + escapeHtml(t('skillPopup.events')) + '</div>';
          resolved.eventCards.forEach(function (c) {
            html += renderCardRow(c);
          });
        }
        html += '</div></div>';
      } else {
        html +=
          '<div class="sp-section"><div class="sp-label">' +
          escapeHtml(t('skillPopup.availableFrom')) +
          '</div>';
        html += '<div class="sp-empty">' + escapeHtml(t('skillPopup.noCards')) + '</div></div>';
      }
    }

    // ── Characters ──
    if (umaById) {
      var serverPref2 = getLanguage() === 'jp' ? 'jp' : 'global';
      var potentialChars = resolveCharacters(skill.char, serverPref2);
      var eventChars = resolveCharacters(skill.char_e, serverPref2);
      var totalChars = potentialChars.length + eventChars.length;

      if (totalChars) {
        html +=
          '<div class="sp-section"><div class="sp-label">' +
          escapeHtml(t('skillPopup.characters')) +
          ' (' +
          totalChars +
          ')</div>';
        html += '<div class="sp-chars-list">';
        if (potentialChars.length) {
          html +=
            '<div class="sp-card-group-label">' + escapeHtml(t('skillPopup.potential')) + '</div>';
          potentialChars.forEach(function (u) {
            html += renderCharRow(u);
          });
        }
        if (eventChars.length) {
          html +=
            '<div class="sp-card-group-label">' + escapeHtml(t('skillPopup.charEvents')) + '</div>';
          eventChars.forEach(function (u) {
            html += renderCharRow(u);
          });
        }
        html += '</div></div>';
      }
    }

    html += '</div>'; // .sp-body
    return html;
  }

  // ── Positioning ──
  function positionPopup(popup) {
    var vpW = global.innerWidth;

    popup.style.position = 'fixed';
    popup.style.right = 'auto';

    // Mobile uses a bottom sheet; larger screens use a viewport-centred dialog.
    if (vpW <= 480) {
      popup.style.left = '0';
      popup.style.right = '0';
      popup.style.bottom = '0';
      popup.style.top = 'auto';
      popup.style.transform = 'none';
      return;
    }

    popup.style.top = '50%';
    popup.style.bottom = 'auto';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
  }

  // ── Open / Close ──
  function openPopup(skillName, anchorEl) {
    closePopup();

    loadData().then(function () {
      var skill = findSkill(skillName);
      if (!skill) return;

      // Create backdrop
      backdropEl = document.createElement('div');
      backdropEl.className = 'skill-popup-backdrop';
      backdropEl.addEventListener('click', closePopup);

      // Create popup
      popupEl = document.createElement('div');
      popupEl.className = 'skill-popup';
      popupEl.setAttribute('role', 'dialog');
      popupEl.setAttribute('aria-modal', 'true');
      popupEl.innerHTML = buildPopupHTML(skill, skillName);
      popupEl.setAttribute('aria-labelledby', 'skill-popup-title');

      document.body.appendChild(backdropEl);
      document.body.appendChild(popupEl);

      // Close button handler
      var closeBtn = popupEl.querySelector('.sp-close');
      if (closeBtn) closeBtn.addEventListener('click', closePopup);

      // Position
      positionPopup(popupEl);

      isOpen = true;

      // Focus for keyboard users
      popupEl.setAttribute('tabindex', '-1');
      popupEl.focus({ preventScroll: true });
    });
  }

  function closePopup() {
    if (popupEl && popupEl.parentNode) popupEl.parentNode.removeChild(popupEl);
    if (backdropEl && backdropEl.parentNode) backdropEl.parentNode.removeChild(backdropEl);
    popupEl = null;
    backdropEl = null;
    isOpen = false;
  }

  // ── Event Delegation ──
  function handleClick(e) {
    var target = e.target.closest('[data-skill-name],[data-skill-id]');
    if (!target) return;

    // Don't interfere with other interactive elements
    // Allow .card-name and .card-lower inside .skill-card to trigger popup
    if (e.target.closest('.skill-card') && !e.target.closest('.card-name, .card-lower')) return;
    if (e.target.closest('input, button, th[data-sort], .ocr-skill-checkbox, .ocr-edit-icon'))
      return;

    e.preventDefault();
    e.stopPropagation();

    // Prefer ID-based lookup to avoid collisions with duplicate EN names
    var skillId = target.getAttribute('data-skill-id');
    var skillName = target.getAttribute('data-skill-name');
    if (skillId) openPopup(skillId, target);
    else if (skillName) openPopup(skillName, target);
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && isOpen) {
      closePopup();
      return;
    }
    if (
      (e.key === 'Enter' || e.key === ' ') &&
      e.target &&
      e.target.hasAttribute &&
      (e.target.hasAttribute('data-skill-name') || e.target.hasAttribute('data-skill-id'))
    ) {
      e.preventDefault();
      var skillId = e.target.getAttribute('data-skill-id');
      var skillName = e.target.getAttribute('data-skill-name');
      if (skillId) openPopup(skillId, e.target);
      else if (skillName) openPopup(skillName, e.target);
    }
  }

  // ── Init ──
  function init() {
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeydown);
    // Skill data is loaded on-demand when a popup is opened (openPopup → loadData).
    // The JP name map is built by optimizer's backgroundHydrateFullData() or by
    // loadData() on first popup click — no need to eagerly fetch 3.4MB here.
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API
  global.SkillPopup = {
    open: openPopup,
    close: closePopup,
    findSkill: function (name) {
      return loadData().then(function () {
        return findSkill(name);
      });
    },
    preload: loadData,
  };
})(window);
