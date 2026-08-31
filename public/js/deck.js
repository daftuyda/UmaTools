(async function () {
  'use strict';

  const CHAR_URL = '/assets/uma_data.json';
  const SUPPORT_URL = '/assets/support_hints.json';
  const MAX_SUPPORTS = 6;
  const STORAGE_KEY = 'umatools-deck';
  const SAVED_DECKS_KEY = 'umatools-saved-decks';
  const SERVER_PREF_KEY = 'umatoolsServer';
  const SUPPORT_TYPES = ['Speed', 'Stamina', 'Power', 'Guts', 'Wit', 'Friend', 'Group'];
  const RARITY_ORDER = ['SSR', 'SR', 'R'];

  // i18n mappings for support type filter buttons
  const TYPE_I18N = {
    'Speed': 'common.speed',
    'Stamina': 'common.stamina',
    'Power': 'common.power',
    'Guts': 'common.guts',
    'Wit': 'deck.wit',
    'Friend': 'deck.friend',
    'Group': 'deck.group',
  };

  // i18n mappings for effect names
  const EFFECT_I18N = {
    'Race Bonus': 'deck.effect.raceBonus',
    'Fan Bonus': 'deck.effect.fanBonus',
    'Training Effectiveness': 'deck.effect.trainingEffectiveness',
    'Speed Bonus': 'deck.effect.speedBonus',
    'Stamina Bonus': 'deck.effect.staminaBonus',
    'Power Bonus': 'deck.effect.powerBonus',
    'Guts Bonus': 'deck.effect.gutsBonus',
    'Wit Bonus': 'deck.effect.witBonus',
    'Skill Point Bonus': 'deck.effect.skillPointBonus',
    'Hint Levels': 'deck.effect.hintLevels',
    'Friendship Bonus': 'deck.effect.friendshipBonus',
    'Initial Speed': 'deck.effect.initialSpeed',
    'Initial Stamina': 'deck.effect.initialStamina',
    'Initial Power': 'deck.effect.initialPower',
    'Initial Guts': 'deck.effect.initialGuts',
    'Initial Wit': 'deck.effect.initialWit',
    'Initial Friendship Gauge': 'deck.effect.initialFriendshipGauge',
    'Hint Frequency': 'deck.effect.hintFrequency',
    'Specialty Priority': 'deck.effect.specialtyPriority',
    'Wit Friendship Recovery': 'deck.effect.witFriendshipRecovery',
    'Mood Effect': 'deck.effect.moodEffect',
    'Energy Cost Reduction': 'deck.effect.energyCostReduction',
    'Event Effectiveness': 'deck.effect.eventEffectiveness',
    'Event Recovery': 'deck.effect.eventRecovery',
    'Failure Protection': 'deck.effect.failureProtection',
    'Effect #32': 'deck.effect.initialSkillPoints',
  };

  function localizeEffectName(name) {
    var key = EFFECT_I18N[name];
    return key ? t(key) : name;
  }

  function localizeTypeName(name) {
    var key = TYPE_I18N[name];
    return key ? t(key) : name;
  }

  // i18n mappings for character filter buttons
  const CHAR_FILTER_I18N = {
    'Short': 'common.sprint',
    'Mile': 'common.mile',
    'Medium': 'common.medium',
    'Long': 'common.long',
    'Turf': 'common.turf',
    'Dirt': 'common.dirt',
    'Front': 'common.front',
    'Pace': 'common.pace',
    'Late': 'common.late',
    'End': 'common.end',
  };

  // Limit break labels (5 stops)
  const LB_LABELS = ['LB0', 'LB1', 'LB2', 'LB3', 'MLB'];

  // Map LB stop (0-4) → index in the 11-value effects array, per rarity
  // Breakpoints are at Lv1,5,10,15,20,25,30,35,40,45,50 (indices 0-10)
  // SSR: LB0=Lv30(6), LB1=Lv35(7), LB2=Lv40(8), LB3=Lv45(9), MLB=Lv50(10)
  // SR:  LB0=Lv25(5), LB1=Lv30(6), LB2=Lv35(7), LB3=Lv40(8), MLB=Lv45(9)
  // R:   LB0=Lv20(4), LB1=Lv25(5), LB2=Lv30(6), LB3=Lv35(7), MLB=Lv40(8)
  const LB_INDICES = { SSR: [6, 7, 8, 9, 10], SR: [5, 6, 7, 8, 9], R: [4, 5, 6, 7, 8] };

  function lbToEffectIndex(lbStop, rarity) {
    return (LB_INDICES[rarity] || LB_INDICES.SSR)[lbStop] ?? 10;
  }

  const CHAR_STAR_LEVEL = 5;

  // Elements
  const charDisplay = document.getElementById('charDisplay');
  const supportSlots = document.getElementById('supportSlots');
  const supportCount = document.getElementById('supportCount');
  const summarySection = document.getElementById('summarySection');
  const summaryContent = document.getElementById('summaryContent');
  const shareLinkBtn = document.getElementById('shareLinkBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const statusMsg = document.getElementById('statusMsg');

  function mountOverlayAtViewport(overlay) {
    if (overlay && overlay.parentElement !== document.body) {
      document.body.appendChild(overlay);
    }
  }

  // Modal elements
  const supportModal = document.getElementById('supportModal');
  const supportSearch = document.getElementById('supportSearch');
  const supportModalList = document.getElementById('supportModalList');
  const typeFiltersEl = document.getElementById('typeFilters');
  const rarityFiltersEl = document.getElementById('rarityFilters');

  // Effects panel elements
  const effectsPanel = document.getElementById('effectsPanel');
  const effectsPanelTitle = document.getElementById('effectsPanelTitle');
  const effectsLevelSlider = document.getElementById('effectsLevelSlider');
  const effectsLevelLabel = document.getElementById('effectsLevelLabel');
  const effectsPanelBody = document.getElementById('effectsPanelBody');

  // Breakpoint levels (index in the 11-value effects array) for each LB stop
  // Lv1,5,10,15,20,25,30,35,40,45,50 → indices 0-10
  const LB_UNLOCK_INDEX = {
    0: 0,
    1: 0,
    5: 1,
    10: 2,
    15: 3,
    20: 4,
    25: 5,
    30: 6,
    35: 7,
    40: 8,
    45: 9,
    50: 10,
  };

  function uniqueActiveAtLb(card, lbStop) {
    if (!card.SupportUnique) return false;
    const rarity = card.SupportRarity || 'SSR';
    const cardIdx = lbToEffectIndex(lbStop, rarity);
    const unlockLv = card.SupportUnique.level || 0;
    const unlockIdx = LB_UNLOCK_INDEX[unlockLv] ?? 0;
    return cardIdx >= unlockIdx;
  }

  // Character modal elements
  const charModal = document.getElementById('charModal');
  const charSearchInput = document.getElementById('charSearch');
  const charModalList = document.getElementById('charModalList');

  // State
  let characters = [];
  let supports = [];
  let selectedChar = null;
  let selectedSupports = []; // card objects
  let supportLbStops = []; // per-card LB stop (0-4), parallel to selectedSupports
  let currentServer = 'en';

  // Character modal filter state
  let charFilterSearch = '';
  let charFilterDist = new Set(); // Distance aptitude filters (OR within)
  let charFilterSurf = new Set(); // Surface aptitude filters (OR within)
  let charFilterStrat = new Set(); // Strategy aptitude filters (OR within)

  // Modal filter state
  let filterTypes = new Set(); // multi-select type filter
  let filterRarity = null;
  let filterSearch = '';
  let sortByEffect = '';

  // Effects panel state
  let effectsCard = null;
  let effectsLbStop = 4; // 0=LB0 .. 4=MLB
  let effectsSlotIdx = -1; // index into selectedSupports, -1 if none

  // Support swap state: index of slot being replaced, or -1 for "add new"
  let pendingReplaceIdx = -1;

  // --- Data loading ---
  function showStatus(msg) {
    if (statusMsg) statusMsg.textContent = msg;
  }

  showStatus(t('deck.loadingData'));

  try {
    const [charRes, supRes] = await Promise.all([fetch(CHAR_URL), fetch(SUPPORT_URL)]);
    if (!charRes.ok) throw new Error(t('deck.failedCharData'));
    if (!supRes.ok) throw new Error(t('deck.failedSupportData'));
    characters = await charRes.json();
    supports = await supRes.json();
    showStatus('');
  } catch (err) {
    showStatus(t('deck.failedLoadData'));
    console.error(err);
    return;
  }

  // --- Lazy-load skills_all.json for hint categorization ---
  let skillsAllMap = null; // Map<string_id, skill_object>

  async function loadSkillsAll() {
    if (skillsAllMap) return skillsAllMap;
    try {
      const res = await fetch('/assets/skills_all.json');
      if (!res.ok) return null;
      const data = await res.json();
      skillsAllMap = new Map(data.map((s) => [String(s.id), s]));
      return skillsAllMap;
    } catch {
      return null;
    }
  }

  // --- Skill categorization ---
  const HINT_CATEGORIES = {
    sprint: { i18nKey: 'common.sprint', order: 0 },
    mile: { i18nKey: 'common.mile', order: 1 },
    medium: { i18nKey: 'common.medium', order: 2 },
    long: { i18nKey: 'common.long', order: 3 },
    'front-pace': { i18nKey: 'common.frontPace', order: 4 },
    'late-end': { i18nKey: 'common.lateEnd', order: 5 },
    corner: { i18nKey: 'common.corner', order: 6 },
    straight: { i18nKey: 'common.straight', order: 7 },
    dirt: { i18nKey: 'common.dirt', order: 8 },
    turf: { i18nKey: 'common.turf', order: 9 },
    debuff: { i18nKey: 'common.debuff', order: 10 },
    general: { i18nKey: 'common.general', order: 11 },
  };

  function hintCatLabel(catKey) {
    var cat = HINT_CATEGORIES[catKey];
    return cat ? t(cat.i18nKey) : catKey;
  }

  function categorizeSkill(skill) {
    const types = skill?.type || [];
    const typeSet = new Set(types);
    if (typeSet.has('sho')) return 'sprint';
    if (typeSet.has('mil')) return 'mile';
    if (typeSet.has('med')) return 'medium';
    if (typeSet.has('lng')) return 'long';
    if (typeSet.has('run') || typeSet.has('ldr')) return 'front-pace';
    if (typeSet.has('cha')) return 'late-end';
    if (typeSet.has('dir')) return 'dirt';
    if (typeSet.has('tur')) return 'turf';
    if (typeSet.has('dbf')) return 'debuff';
    if (typeSet.has('cor') || typeSet.has('f_c')) return 'corner';
    if (typeSet.has('str') || typeSet.has('f_s')) return 'straight';
    return 'general';
  }

  function getCharAptitudeCategories() {
    if (!selectedChar?.UmaAptitudes) return new Set();
    const good = new Set();
    const apt = selectedChar.UmaAptitudes;
    const addGood = (entries, map) => {
      for (const [name, grade] of Object.entries(entries || {})) {
        if (grade === 'S' || grade === 'A') {
          const cats = map[name.toLowerCase()] || map[name];
          if (cats) cats.forEach((c) => good.add(c));
        }
      }
    };
    addGood(apt.Distance, {
      short: ['sprint'],
      mile: ['mile'],
      medium: ['medium'],
      long: ['long'],
      Short: ['sprint'],
      Mile: ['mile'],
      Medium: ['medium'],
      Long: ['long'],
    });
    addGood(apt.Strategy, {
      front: ['front-pace'],
      pace: ['front-pace'],
      late: ['late-end'],
      end: ['late-end'],
      Front: ['front-pace'],
      Pace: ['front-pace'],
      Late: ['late-end'],
      End: ['late-end'],
    });
    addGood(apt.Surface, {
      turf: ['turf'],
      dirt: ['dirt'],
      Turf: ['turf'],
      Dirt: ['dirt'],
    });
    return good;
  }

  // --- Compatibility Score ---
  // Based on uma.moe 2026-08-28 statistics:
  // Grand Live / Grand Concert scenario, Team Stadium class 6 only.
  // Light Hello is the scenario-defining Friend card and appears in roughly
  // 97-98% of these decks. The most common shape is 3 Speed + 2 Wit + 1 Friend,
  // with Stamina replacing a Speed or Wit slot most often at Medium/Long.
  const META_TYPE_RANGES = {
    Speed: { ideal: [2, 3], ok: [1, 4], weight: 5 },
    Wit: { ideal: [2, 3], ok: [1, 4], weight: 5 },
    Friend: { ideal: [1, 1], ok: [1, 1], weight: 5 },
    Stamina: { ideal: [0, 1], ok: [0, 2], weight: 3 },
    Power: { ideal: [0, 1], ok: [0, 2], weight: 2 },
    Guts: { ideal: [0, 0], ok: [0, 1], weight: 1 },
    Group: { ideal: [0, 0], ok: [0, 1], weight: 1 },
  };

  function scoreTypeDistribution() {
    if (selectedSupports.length === 0) return 0;
    const typeCounts = {};
    for (const s of selectedSupports) {
      typeCounts[s.SupportType] = (typeCounts[s.SupportType] || 0) + 1;
    }

    let score = 0;
    let totalWeight = 0;
    for (const [type, meta] of Object.entries(META_TYPE_RANGES)) {
      let count = typeCounts[type] || 0;
      if (type === 'Friend') {
        const hasRequiredScenarioCard = selectedSupports.some(
          (support) => support.SupportSlug === '30052-light-hello'
        );
        count = count === 1 && hasRequiredScenarioCard ? 1 : -1;
      }
      totalWeight += meta.weight;
      if (count >= meta.ideal[0] && count <= meta.ideal[1]) {
        score += meta.weight; // Perfect
      } else if (count >= meta.ok[0] && count <= meta.ok[1]) {
        score += meta.weight * 0.5; // Acceptable
      }
      // Outside ok range = 0 points
    }

    // Normalize to 0-25
    return Math.round((score / totalWeight) * 25);
  }

  // Extend deck effects for scoring (includes Training Effectiveness)
  function buildAllEffects() {
    const totals = {};
    for (let i = 0; i < selectedSupports.length; i++) {
      const card = selectedSupports[i];
      const rarity = card.SupportRarity || 'SSR';
      const lb = supportLbStops[i] ?? 4;
      const idx = lbToEffectIndex(lb, rarity);
      for (const eff of card.SupportEffects || []) {
        const val = eff.values?.[idx] ?? 0;
        if (val === 0) continue;
        totals[eff.name] = (totals[eff.name] || 0) + val;
      }
      if (uniqueActiveAtLb(card, lb) && card.SupportUnique) {
        for (const u of card.SupportUnique.effects) {
          totals[u.name] = (totals[u.name] || 0) + u.value;
        }
      }
    }
    return totals;
  }

  function scoreEffectStacking() {
    const totals = buildAllEffects();
    let score = 0;
    const te = totals['Training Effectiveness'] || 0;
    if (te >= 15) score += 8;
    else if (te >= 5) score += 4;
    const rb = totals['Race Bonus'] || 0;
    if (rb >= 30) score += 7;
    else if (rb >= 15) score += 4;
    else if (rb >= 5) score += 2;
    const fb = totals['Fan Bonus'] || 0;
    if (fb >= 30) score += 5;
    else if (fb >= 15) score += 3;
    const initials = [
      'Initial Speed',
      'Initial Stamina',
      'Initial Power',
      'Initial Guts',
      'Initial Wit',
    ];
    const initCount = initials.filter((n) => totals[n] > 0).length;
    score += Math.min(5, initCount);
    return Math.min(25, score);
  }

  function scoreHintSynergy() {
    const hintCounts = new Map();
    for (const s of selectedSupports) {
      for (const h of s.SupportHints || []) {
        if (!h.Name || !h.SkillId) continue;
        hintCounts.set(h.Name, (hintCounts.get(h.Name) || 0) + 1);
      }
    }
    const total = hintCounts.size;
    const shared = [...hintCounts.values()].filter((c) => c > 1).length;
    if (total === 0) return 0;
    let score = 0;
    if (shared >= 8) score += 15;
    else if (shared >= 5) score += 12;
    else if (shared >= 3) score += 8;
    else if (shared >= 1) score += 4;
    if (total >= 25) score += 10;
    else if (total >= 18) score += 8;
    else if (total >= 12) score += 6;
    else if (total >= 6) score += 3;
    return Math.min(25, score);
  }

  // Distance-appropriate type weights from Grand Live class 6 distance stats.
  const DISTANCE_TYPE_WEIGHTS = {
    Short: { Speed: 3, Wit: 3, Friend: 3, Power: 1 },
    Mile: { Speed: 3, Wit: 3, Friend: 3, Power: 1 },
    Medium: { Speed: 3, Wit: 3, Friend: 3, Stamina: 2 },
    Long: { Speed: 3, Stamina: 3, Wit: 2, Friend: 3 },
  };

  function scoreCharacterFit() {
    if (!selectedChar) return 12;
    const bonuses = selectedChar.UmaStatBonuses || {};
    const apt = selectedChar.UmaAptitudes || {};
    const typeToStat = {
      Speed: 'Speed',
      Stamina: 'Stamina',
      Power: 'Power',
      Guts: 'Guts',
      Wit: 'Wit',
    };

    // Find character's best distance for weight selection
    let bestDist = null;
    let bestGrade = 'G';
    const gradeOrder = 'SABCDEFG';
    for (const [name, grade] of Object.entries(apt.Distance || {})) {
      if (gradeOrder.indexOf(grade) < gradeOrder.indexOf(bestGrade)) {
        bestGrade = grade;
        bestDist = name;
      }
    }
    const distWeights = DISTANCE_TYPE_WEIGHTS[bestDist] || {};

    let score = 0;
    for (const s of selectedSupports) {
      const stat = typeToStat[s.SupportType];
      // Stat bonus match
      if (stat && bonuses[stat] > 0) score += 2;
      // Distance-appropriate type bonus
      if (distWeights[s.SupportType]) score += distWeights[s.SupportType];
      // Friend/Group universal value
      if (s.SupportType === 'Friend' || s.SupportType === 'Group') score += 1;
    }
    return Math.min(25, Math.round((score * 25) / 20));
  }

  const LIMIT_BREAK_SCORE_CAPS = [55, 65, 78, 90, 100];

  function getCompatibilityGrade(total) {
    return total >= 90
      ? 'S'
      : total >= 75
        ? 'A'
        : total >= 60
          ? 'B'
          : total >= 45
            ? 'C'
            : total >= 30
              ? 'D'
              : 'F';
  }

  function getLimitBreakScoreCap() {
    if (selectedSupports.length === 0) return null;
    let lbTotal = 0;
    for (let i = 0; i < selectedSupports.length; i++) {
      const lb = Number(supportLbStops[i] ?? 4);
      const normalized = Number.isFinite(lb) ? Math.max(0, Math.min(4, lb)) : 4;
      lbTotal += normalized;
    }

    const avgLb = lbTotal / selectedSupports.length;
    const lower = Math.floor(avgLb);
    const upper = Math.ceil(avgLb);
    const lowerCap = LIMIT_BREAK_SCORE_CAPS[lower] ?? LIMIT_BREAK_SCORE_CAPS[4];
    const upperCap = LIMIT_BREAK_SCORE_CAPS[upper] ?? lowerCap;
    const scoreCap = Math.round(lowerCap + (upperCap - lowerCap) * (avgLb - lower));
    return { avgLb, scoreCap };
  }

  function computeCompatibilityScore() {
    if (selectedSupports.length === 0) return null;
    const breakdown = {
      typeBalance: scoreTypeDistribution(),
      effectStacking: scoreEffectStacking(),
      hintSynergy: scoreHintSynergy(),
      characterFit: scoreCharacterFit(),
    };
    const total =
      breakdown.typeBalance +
      breakdown.effectStacking +
      breakdown.hintSynergy +
      breakdown.characterFit;
    const lbCap = getLimitBreakScoreCap();
    const adjustedTotal = lbCap ? Math.min(total, lbCap.scoreCap) : total;
    const grade = getCompatibilityGrade(adjustedTotal);
    const limitBreakCap =
      lbCap && adjustedTotal < total
        ? { scoreCap: lbCap.scoreCap, avgLb: lbCap.avgLb, rawTotal: total }
        : null;
    return { total: adjustedTotal, grade, breakdown, limitBreakCap };
  }

  // --- Synergy helpers ---
  function getCardHintLevel(card, lbStop) {
    const rarity = card.SupportRarity || 'SSR';
    const idx = lbToEffectIndex(lbStop, rarity);
    const hintEff = (card.SupportEffects || []).find((e) => e.name === 'Hint Levels');
    return hintEff?.values?.[idx] ?? 0;
  }

  function computeHintSavings() {
    const hintDetails = new Map();
    for (let i = 0; i < selectedSupports.length; i++) {
      const card = selectedSupports[i];
      const lb = supportLbStops[i] ?? 4;
      const cardHintLv = getCardHintLevel(card, lb);
      for (const h of card.SupportHints || []) {
        if (!h.Name || !h.SkillId) continue;
        if (!hintDetails.has(h.Name)) {
          hintDetails.set(h.Name, { sources: [], totalLevel: 0, skillId: h.SkillId });
        }
        const entry = hintDetails.get(h.Name);
        entry.sources.push({ cardName: cleanCardName(getLocalizedSupportName(card)), hintLevel: cardHintLv });
        entry.totalLevel += cardHintLv;
      }
    }
    const shared = [];
    for (const [name, data] of hintDetails) {
      if (data.sources.length < 2) continue;
      const effectiveLevel = Math.min(data.totalLevel, 5);
      const discountPct = Math.min(effectiveLevel * 10, 40);
      shared.push({
        name,
        sources: data.sources,
        effectiveLevel,
        discountPct,
        skillId: data.skillId,
      });
    }
    return shared;
  }

  function getTypeCoverage() {
    const typeCounts = {};
    for (const s of selectedSupports) {
      typeCounts[s.SupportType] = (typeCounts[s.SupportType] || 0) + 1;
    }
    const trainable = ['Speed', 'Stamina', 'Power', 'Guts', 'Wit'];
    const covered = trainable.filter((t) => typeCounts[t] > 0);
    return { typeCounts, covered, total: trainable.length };
  }

  // --- Helpers ---
  function cleanCardName(full) {
    return String(full || '')
      .replace(/\s*\((?:SSR|SR|R)\)\s*/i, ' ')
      .replace(/Support\s*Card/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function initialsOf(name) {
    const cleaned = String(name || '')
      .replace(/\(.*?\)/g, '')
      .replace(/Support\s*Card/i, '')
      .trim();
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return '?';
    if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
    return (tokens[0][0] + tokens[1][0]).toUpperCase();
  }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function readServerPref() {
    try {
      const v = localStorage.getItem(SERVER_PREF_KEY);
      return v === 'jp' ? 'jp' : 'en';
    } catch {
      return 'en';
    }
  }

  function matchesServer(item) {
    if (currentServer === 'jp') return true; // JP shows all
    const server = item.UmaServer || item.SupportServer || '';
    return server === 'global';
  }

  function findCharBySlug(slug) {
    return characters.find((c) => c.UmaSlug === slug || c.UmaId === slug) || null;
  }

  function findSupportBySlug(slug) {
    return supports.find((s) => s.SupportSlug === slug || s.SupportId === slug) || null;
  }

  // --- Render character ---
  function renderCharacter() {
    if (!selectedChar) {
      charDisplay.innerHTML = `
        <div class="deck-support-slot" data-action="open-char-picker">
          <div class="slot-placeholder">+</div>
          <div class="slot-placeholder-text">${t('deck.selectChar')}</div>
        </div>`;
      return;
    }
    const c = selectedChar;

    const starKey = `${CHAR_STAR_LEVEL}\u2605`;
    const stats = c.UmaBaseStats?.[starKey] || c.UmaBaseStats?.['5\u2605'] || {};
    const bonuses = c.UmaStatBonuses || {};
    const statNames = ['Speed', 'Stamina', 'Power', 'Guts', 'Wit'];
    const statLabel = {
      Speed: t('common.speed'),
      Stamina: t('common.stamina'),
      Power: t('common.power'),
      Guts: t('common.guts'),
      Wit: t('common.wisdom'),
    };

    let statsHtml = '<div class="deck-stats-grid">';
    for (const s of statNames) {
      const val = stats[s] ?? '-';
      const bonus = bonuses[s];
      const bonusStr = bonus ? `+${bonus}%` : '';
      statsHtml += `
        <div class="deck-stat">
          <div class="stat-label">${escHtml(statLabel[s] || s)}</div>
          <div class="stat-value">${escHtml(String(val))}</div>
          ${bonusStr ? `<div class="stat-bonus">${escHtml(bonusStr)}</div>` : ''}
        </div>`;
    }
    statsHtml += '</div>';

    let aptHtml = '';
    const apt = c.UmaAptitudes;
    if (apt && Object.keys(apt).length) {
      aptHtml = '<div class="deck-aptitudes">';
      const APT_GROUP_I18N = { 'Surface': 'deck.surface', 'Distance': 'deck.distance', 'Strategy': 'deck.strategy' };
      for (const [group, entries] of Object.entries(apt)) {
        const groupLabel = APT_GROUP_I18N[group] ? t(APT_GROUP_I18N[group]) : group;
        aptHtml += `<div class="apt-group"><span class="apt-group-label">${escHtml(groupLabel)}</span>`;
        for (const [name, grade] of Object.entries(entries || {})) {
          const aptLabel = CHAR_FILTER_I18N[name] ? t(CHAR_FILTER_I18N[name]) : name;
          aptHtml += `<span class="apt-badge"><span class="apt-name">${escHtml(aptLabel)}</span> <span class="apt-grade" data-grade="${escHtml(String(grade))}">${escHtml(String(grade))}</span></span>`;
        }
        aptHtml += '</div>';
      }
      aptHtml += '</div>';
    }

    const locChar = getLocalizedUmaName(c);
    const charImgSrc = c.UmaImage || '';
    const charImgHtml = charImgSrc
      ? `<img class="char-thumb" src="${escHtml(charImgSrc)}" alt="${escHtml(locChar.name)}" loading="lazy">`
      : '';


    charDisplay.innerHTML = `
      <div class="deck-character-card">
        ${charImgHtml}
        <div class="char-info">
          <div class="char-name">${escHtml(locChar.name)}</div>
          ${locChar.nickname ? `<div class="char-nickname">${escHtml(locChar.nickname)}</div>` : ''}
          ${statsHtml}
          ${aptHtml}
        </div>
        <button class="remove-btn" title="${t('deck.removeChar')}" data-action="remove-char">&times;</button>
      </div>`;
  }

  // --- Render support slots ---
  function renderSupportSlots() {
    supportCount.textContent = String(selectedSupports.length);
    let html = '';

    for (let i = 0; i < MAX_SUPPORTS; i++) {
      const s = selectedSupports[i];
      if (s) {
        const name = cleanCardName(getLocalizedSupportName(s));
        const imgSrc = s.SupportImage || '';
        const imgHtml = imgSrc
          ? `<img class="support-thumb" src="${escHtml(imgSrc)}" alt="${escHtml(name)}" loading="lazy">`
          : `<div class="support-initials">${escHtml(initialsOf(name))}</div>`;

        const typeStr = s.SupportType || '';
        const typeBadge = typeStr
          ? `<span class="support-type-badge" data-type="${escHtml(typeStr)}">${escHtml(localizeTypeName(typeStr))}</span>`
          : '';

        const lb = supportLbStops[i] ?? 4;
        let lbHtml = '<div class="slot-lb-row">';
        for (let j = 0; j < LB_LABELS.length; j++) {
          const cls = j === lb ? 'lb-btn active' : 'lb-btn';
          lbHtml += `<button class="${cls}" data-idx="${i}" data-lb="${j}">${LB_LABELS[j]}</button>`;
        }
        lbHtml += '</div>';

        html += `
          <div class="deck-support-slot filled" data-idx="${i}">
            <button class="slot-swap" title="${t('deck.swapCard')}" data-idx="${i}">&#x21C4;</button>
            <button class="slot-remove" title="${t('common.remove')}" data-idx="${i}">&times;</button>
            ${imgHtml}
            <div class="support-name">${escHtml(name)}</div>
            ${typeBadge}
            ${lbHtml}
          </div>`;
      } else {
        html += `
          <div class="deck-support-slot" data-action="open-picker">
            <div class="slot-placeholder">+</div>
            <div class="slot-placeholder-text">${t('deck.addCard')}</div>
          </div>`;
      }
    }

    supportSlots.innerHTML = html;
  }

  // --- Render combined summary ---

  // Only these effects are shown in the deck breakdown
  const DECK_EFFECT_NAMES = [
    'Race Bonus',
    'Fan Bonus',
    'Initial Speed',
    'Initial Stamina',
    'Initial Power',
    'Initial Guts',
    'Initial Wit',
  ];
  const DECK_EFFECT_SET = new Set(DECK_EFFECT_NAMES);

  function buildDeckEffects() {
    const totals = {};
    const symbols = {};
    for (let i = 0; i < selectedSupports.length; i++) {
      const card = selectedSupports[i];
      const rarity = card.SupportRarity || 'SSR';
      const lb = supportLbStops[i] ?? 4;
      const idx = lbToEffectIndex(lb, rarity);

      // Regular effects
      for (const eff of card.SupportEffects || []) {
        if (!DECK_EFFECT_SET.has(eff.name)) continue;
        const val = eff.values?.[idx] ?? 0;
        if (val === 0) continue;
        totals[eff.name] = (totals[eff.name] || 0) + val;
        symbols[eff.name] = eff.symbol;
      }

      // Unique effects (if unlocked at this LB)
      if (uniqueActiveAtLb(card, lb)) {
        for (const u of card.SupportUnique.effects) {
          if (!DECK_EFFECT_SET.has(u.name)) continue;
          totals[u.name] = (totals[u.name] || 0) + u.value;
          symbols[u.name] = u.symbol;
        }
      }
    }
    return { totals, symbols };
  }

  function renderSummary() {
    if (!selectedChar && selectedSupports.length === 0) {
      summarySection.style.display = 'none';
      return;
    }
    summarySection.style.display = '';

    let html = '';

    // Compatibility score
    if (selectedSupports.length > 0) {
      const compat = computeCompatibilityScore();
      if (compat) {
        const { total, grade, breakdown, limitBreakCap } = compat;
        html += `
          <div class="compat-score">
            <div class="compat-grade" data-grade="${grade}">${grade}</div>
            <div class="compat-bar"><div class="compat-fill" data-grade="${grade}" style="width: ${total}%"></div></div>
            <div class="compat-value">${total}/100</div>
            <div class="compat-breakdown">
              <div class="compat-item"><span>${t('deck.typeBalance')}</span><span class="compat-item-score">${breakdown.typeBalance}/25</span></div>
              <div class="compat-item"><span>${t('deck.effectStacking')}</span><span class="compat-item-score">${breakdown.effectStacking}/25</span></div>
              <div class="compat-item"><span>${t('deck.hintSynergy')}</span><span class="compat-item-score">${breakdown.hintSynergy}/25</span></div>
              <div class="compat-item"><span>${t('deck.characterFit')}</span><span class="compat-item-score">${breakdown.characterFit}/25</span></div>
            </div>
            ${
              limitBreakCap
                ? `<div class="compat-cap-note">${escHtml(t('deck.limitBreakCap', { score: limitBreakCap.scoreCap }))}</div>`
                : ''
            }
          </div>`;
      }
    }

    // Character stat bonuses
    if (selectedChar) {
      const bonuses = selectedChar.UmaStatBonuses || {};
      const statNames = ['Speed', 'Stamina', 'Power', 'Guts', 'Wit'];
      const statLabel = {
        Speed: t('common.speed'),
        Stamina: t('common.stamina'),
        Power: t('common.power'),
        Guts: t('common.guts'),
        Wit: t('common.wisdom'),
      };
      const bonusParts = statNames
        .filter((s) => bonuses[s])
        .map((s) => `${statLabel[s] || s} +${bonuses[s]}%`);
      if (bonusParts.length) {
        html += `
          <div class="deck-summary-row">
            <span class="deck-summary-label">${t('deck.statBonuses')}</span>
            <span class="deck-summary-value">${escHtml(bonusParts.join(', '))}</span>
          </div>`;
      }
    }

    // Deck effect breakdown
    if (selectedSupports.length > 0) {
      const { totals, symbols } = buildDeckEffects();
      const effectRows = DECK_EFFECT_NAMES.filter((n) => totals[n]).map((n) => {
        const sym = symbols[n] === 'percent' ? '%' : '';
        return `<div class="effect-row">
          <span class="effect-name">${escHtml(localizeEffectName(n))}</span>
          <span class="effect-value">${totals[n]}${sym}</span>
        </div>`;
      });

      if (effectRows.length) {
        html += `
          <div class="deck-summary-sub">
            <div class="deck-summary-label">${t('deck.combinedEffects')}</div>
            <div class="deck-effects-grid">${effectRows.join('')}</div>
          </div>`;
      }

      // Build hint source map: hintName -> { count, sources, skillId }
      const hintSources = new Map();
      for (const s of selectedSupports) {
        for (const h of s.SupportHints || []) {
          if (!h.Name || !h.SkillId) continue;
          if (!hintSources.has(h.Name)) {
            hintSources.set(h.Name, {
              count: 0,
              sources: [],
              skillId: h.SkillId,
              category: 'general',
            });
          }
          const entry = hintSources.get(h.Name);
          entry.count++;
          entry.sources.push(cleanCardName(getLocalizedSupportName(s)));
        }
      }

      // Categorize hints if skills data is loaded
      if (skillsAllMap) {
        for (const [, entry] of hintSources) {
          const skill = skillsAllMap.get(entry.skillId);
          if (skill) entry.category = categorizeSkill(skill);
        }
      }

      const aptCategories = getCharAptitudeCategories();
      const allHints = Array.from(hintSources.entries());
      const unique = allHints.length;
      const shared = allHints.filter(([, e]) => e.count > 1).length;

      html += `
        <div class="deck-summary-row">
          <span class="deck-summary-label">${t('deck.skillHints')}</span>
          <span class="deck-summary-value">${unique} ${t('deck.unique')}${shared ? `, ${shared} ${t('deck.shared')}` : ''}</span>
        </div>`;

      if (allHints.length) {
        // Group by category
        const grouped = {};
        for (const [name, entry] of allHints) {
          const cat = entry.category;
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push({ name, ...entry });
        }

        // Sort categories by defined order
        const sortedCats = Object.keys(grouped).sort((a, b) => {
          return (HINT_CATEGORIES[a]?.order ?? 99) - (HINT_CATEGORIES[b]?.order ?? 99);
        });

        html += '<div class="deck-hints-grouped">';
        for (const cat of sortedCats) {
          const hints = grouped[cat].sort((a, b) => a.name.localeCompare(b.name, 'en'));
          html += '<div class="hint-category">';
          html += `<span class="hint-cat-label">${escHtml(hintCatLabel(cat))}</span>`;
          for (const h of hints) {
            const isShared = h.count > 1;
            const isAptMatch = aptCategories.has(cat);
            let cls = 'hint-pill';
            if (isShared) cls += ' shared';
            if (isAptMatch) cls += ' apt-match';
            var hintDisplayName = typeof window.getLocalizedSkillName === 'function' ? window.getLocalizedSkillName(h.name) : h.name;
            const label = isShared ? `${hintDisplayName} (${h.count})` : hintDisplayName;
            const tooltip = h.sources.join(', ');
            html += `<span class="${cls}" data-skill-name="${escHtml(h.name)}" tabindex="0" role="button" title="${escHtml(tooltip)}">${escHtml(label)}</span>`;
          }
          html += '</div>';
        }
        html += '</div>';
      }

      // Synergy analysis
      const coverage = getTypeCoverage();
      const sharedHints = computeHintSavings();

      html += '<div class="deck-synergy">';
      html += `<div class="deck-summary-label">${t('deck.synergyAnalysis')}</div>`;

      // Type coverage
      html += '<div class="synergy-type-coverage">';
      html += `<span>${t('deck.typeCoverage')}: ${coverage.covered.length}/${coverage.total}</span>`;
      for (const [type, count] of Object.entries(coverage.typeCounts)) {
        html += `<span class="synergy-type-badge" data-type="${escHtml(type)}"><span>${escHtml(localizeTypeName(type))}</span><span class="synergy-type-count">&times;${count}</span></span>`;
      }
      html += '</div>';

      // Shared hint details
      if (sharedHints.length) {
        html += `<div class="deck-summary-label" style="margin-top:0.35rem">${t('deck.sharedHintDetails')}</div>`;
        html += '<div class="synergy-shared-hints">';
        for (const sh of sharedHints) {
          const srcNames = sh.sources.map((s) => s.cardName).join(', ');
          var shDisplayName = typeof window.getLocalizedSkillName === 'function' ? window.getLocalizedSkillName(sh.name) : sh.name;
          html += `<div class="synergy-hint-row">
            <span class="hint-pill shared" data-skill-name="${escHtml(sh.name)}" tabindex="0" role="button">${escHtml(shDisplayName)}</span>
            <span class="synergy-detail">Lv${sh.effectiveLevel} (${sh.discountPct}% off) &mdash; ${escHtml(srcNames)}</span>
          </div>`;
        }
        html += '</div>';
        const avgDiscount = Math.round(
          sharedHints.reduce((sum, h) => sum + h.discountPct, 0) / sharedHints.length
        );
        html += `<div class="synergy-savings">${t('deck.avgHintDiscount')}: ${avgDiscount}% ${t('deck.across')} ${sharedHints.length} ${t('deck.sharedSkills')}</div>`;
      }

      html += '</div>'; // .deck-synergy
    }

    if (!html) {
      html = `<div class="deck-empty">${t('deck.emptySummary')}</div>`;
    }

    summaryContent.innerHTML = html;

    // Lazy-load skills data for categorization on first render with supports
    if (selectedSupports.length > 0 && !skillsAllMap) {
      loadSkillsAll().then(() => {
        if (skillsAllMap) renderSummary();
      });
    }
  }

  // --- Full render ---
  function render() {
    renderCharacter();
    renderSupportSlots();
    renderSummary();
  }

  // --- Persistence ---
  function saveDeck() {
    const data = {
      char: selectedChar?.UmaSlug || null,
      supports: selectedSupports.map((s) => s.SupportSlug),
      lbs: supportLbStops.slice(0, selectedSupports.length),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }

  function loadDeck() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.char) {
        selectedChar = findCharBySlug(data.char);
      }
      if (Array.isArray(data.supports)) {
        selectedSupports = data.supports
          .map((slug) => findSupportBySlug(slug))
          .filter(Boolean)
          .slice(0, MAX_SUPPORTS);
        supportLbStops = (data.lbs || []).slice(0, selectedSupports.length);
        // Fill any missing LB stops with MLB (4)
        while (supportLbStops.length < selectedSupports.length) supportLbStops.push(4);
      }
    } catch {}
  }

  function loadFromUrl() {
    const params = new URLSearchParams(location.search);
    const c = params.get('c');
    const s = params.get('s');
    let loaded = false;
    if (c) {
      const found = findCharBySlug(c);
      if (found) {
        selectedChar = found;
        loaded = true;
      }
    }
    if (s) {
      const slugs = s.split(',').filter(Boolean);
      const found = slugs.map((sl) => findSupportBySlug(sl)).filter(Boolean);
      if (found.length) {
        selectedSupports = found.slice(0, MAX_SUPPORTS);
        // Parse LB stops from URL, default to MLB
        const lbParam = params.get('lb');
        if (lbParam) {
          supportLbStops = lbParam
            .split(',')
            .map((v) => {
              const n = parseInt(v, 10);
              return n >= 0 && n <= 4 ? n : 4;
            })
            .slice(0, selectedSupports.length);
        } else {
          supportLbStops = selectedSupports.map(() => 4);
        }
        while (supportLbStops.length < selectedSupports.length) supportLbStops.push(4);
        loaded = true;
      }
    }
    return loaded;
  }

  // =====================================================================
  // Saved Decks
  // =====================================================================

  const savedDecksModal = document.getElementById('savedDecksModal');
  const savedDecksList = document.getElementById('savedDecksList');
  const saveDeckBtn = document.getElementById('saveDeckBtn');
  const saveDeckName = document.getElementById('saveDeckName');
  const openSavedBtn = document.getElementById('openSavedBtn');

  function getSavedDecks() {
    try {
      const raw = localStorage.getItem(SAVED_DECKS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function writeSavedDecks(decks) {
    try {
      localStorage.setItem(SAVED_DECKS_KEY, JSON.stringify(decks));
    } catch {}
  }

  function saveCurrentDeck() {
    if (!selectedChar && selectedSupports.length === 0) {
      showStatus(t('deck.nothingToSave'));
      setTimeout(() => showStatus(''), 2000);
      return;
    }

    const name = saveDeckName.value.trim();
    if (!name) {
      saveDeckName.focus();
      return;
    }

    const deck = {
      name,
      char: selectedChar?.UmaSlug || null,
      supports: selectedSupports.map((s) => s.SupportSlug),
      lbs: supportLbStops.slice(0, selectedSupports.length),
      ts: Date.now(),
    };

    const decks = getSavedDecks();
    decks.unshift(deck);
    writeSavedDecks(decks);
    saveDeckName.value = '';
    renderSavedDecks();
  }

  function loadSavedDeck(index) {
    const decks = getSavedDecks();
    const deck = decks[index];
    if (!deck) return;

    selectedChar = deck.char ? findCharBySlug(deck.char) : null;
    selectedSupports = (deck.supports || [])
      .map((slug) => findSupportBySlug(slug))
      .filter(Boolean)
      .slice(0, MAX_SUPPORTS);
    supportLbStops = (deck.lbs || []).slice(0, selectedSupports.length);
    while (supportLbStops.length < selectedSupports.length) supportLbStops.push(4);

    saveDeck();
    render();
    showStatus(t('deck.loadedDeck', { name: deck.name }));
    setTimeout(() => showStatus(''), 2000);
  }

  function deleteSavedDeck(index) {
    const decks = getSavedDecks();
    if (index < 0 || index >= decks.length) return;
    decks.splice(index, 1);
    writeSavedDecks(decks);
    renderSavedDecks();
  }

  function renderSavedDecks() {
    const decks = getSavedDecks();
    if (decks.length === 0) {
      savedDecksList.innerHTML = `<div class="modal-card-empty">${t('deck.noSavedDecks')}</div>`;
      return;
    }

    let html = '';
    for (let i = 0; i < decks.length; i++) {
      const d = decks[i];
      const charObj = d.char ? findCharBySlug(d.char) : null;
      const charName = charObj ? getLocalizedUmaName(charObj).name || d.char : t('deck.noCharacter');
      const supCount = (d.supports || []).length;

      html += `<div class="saved-deck-item" data-idx="${i}">
        <div class="saved-deck-info">
          <div class="saved-deck-name">${escHtml(d.name)}</div>
          <div class="saved-deck-meta">${escHtml(charName)} + ${supCount} support${supCount !== 1 ? 's' : ''}</div>
        </div>
        <div class="saved-deck-actions">
          <button class="saved-deck-load" data-idx="${i}" title="Load">Load</button>
          <button class="saved-deck-delete" data-idx="${i}" title="Delete">&times;</button>
        </div>
      </div>`;
    }
    savedDecksList.innerHTML = html;
  }

  function openSavedDecksModal() {
    mountOverlayAtViewport(savedDecksModal);
    saveDeckName.value = selectedChar ? getLocalizedUmaName(selectedChar).name : '';
    renderSavedDecks();
    savedDecksModal.hidden = false;
  }

  function closeSavedDecksModal() {
    savedDecksModal.hidden = true;
  }

  openSavedBtn.addEventListener('click', openSavedDecksModal);
  savedDecksModal
    .querySelector('.support-modal-backdrop')
    .addEventListener('click', closeSavedDecksModal);
  savedDecksModal
    .querySelector('.support-modal-close')
    .addEventListener('click', closeSavedDecksModal);

  saveDeckBtn.addEventListener('click', saveCurrentDeck);
  saveDeckName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveCurrentDeck();
    }
  });

  savedDecksList.addEventListener('click', (e) => {
    const loadBtn = e.target.closest('.saved-deck-load');
    if (loadBtn) {
      loadSavedDeck(parseInt(loadBtn.dataset.idx, 10));
      closeSavedDecksModal();
      return;
    }
    const delBtn = e.target.closest('.saved-deck-delete');
    if (delBtn) {
      deleteSavedDeck(parseInt(delBtn.dataset.idx, 10));
    }
  });

  // =====================================================================
  // Meta Templates (from uma.moe Grand Live Class 6 statistics, 2026-08-28)
  // =====================================================================

  const META_TEMPLATES = [
    {
      id: 'grand-live-sprint-spd3-wit2-friend',
      distance: 'Sprint',
      combo: '3 Speed + 2 Wit + 1 Friend',
      usage: 59.08,
      slugs: [
        '30028-kitasan-black',
        '30101-agnes-tachyon',
        '30107-maruzensky',
        '30010-fine-motion',
        '20002-daiwa-scarlet',
        '30052-light-hello',
      ],
    },
    {
      id: 'grand-live-sprint-spd2-wit3-friend',
      distance: 'Sprint',
      combo: '2 Speed + 3 Wit + 1 Friend',
      usage: 20.58,
      slugs: [
        '30028-kitasan-black',
        '30101-agnes-tachyon',
        '30010-fine-motion',
        '20015-marvelous-sunday',
        '20002-daiwa-scarlet',
        '30052-light-hello',
      ],
    },
    {
      id: 'grand-live-mile-spd3-wit2-friend',
      distance: 'Mile',
      combo: '3 Speed + 2 Wit + 1 Friend',
      usage: 57.54,
      slugs: [
        '30028-kitasan-black',
        '30101-agnes-tachyon',
        '30107-maruzensky',
        '30010-fine-motion',
        '20015-marvelous-sunday',
        '30052-light-hello',
      ],
    },
    {
      id: 'grand-live-mile-spd2-wit3-friend',
      distance: 'Mile',
      combo: '2 Speed + 3 Wit + 1 Friend',
      usage: 16.62,
      slugs: [
        '30028-kitasan-black',
        '30101-agnes-tachyon',
        '30010-fine-motion',
        '20015-marvelous-sunday',
        '20002-daiwa-scarlet',
        '30052-light-hello',
      ],
    },
    {
      id: 'grand-live-medium-spd3-wit2-friend',
      distance: 'Medium',
      combo: '3 Speed + 2 Wit + 1 Friend',
      usage: 42.52,
      slugs: [
        '30028-kitasan-black',
        '30101-agnes-tachyon',
        '30107-maruzensky',
        '30010-fine-motion',
        '20015-marvelous-sunday',
        '30052-light-hello',
      ],
    },
    {
      id: 'grand-live-medium-spd2-sta-wit2-friend',
      distance: 'Medium',
      combo: '2 Speed + 1 Stamina + 2 Wit + 1 Friend',
      usage: 16.32,
      slugs: [
        '30028-kitasan-black',
        '30101-agnes-tachyon',
        '30016-super-creek',
        '30010-fine-motion',
        '20015-marvelous-sunday',
        '30052-light-hello',
      ],
    },
    {
      id: 'grand-live-long-spd2-sta-wit2-friend',
      distance: 'Long',
      combo: '2 Speed + 1 Stamina + 2 Wit + 1 Friend',
      usage: 32.86,
      slugs: [
        '30028-kitasan-black',
        '30101-agnes-tachyon',
        '30016-super-creek',
        '30010-fine-motion',
        '30097-mr-cb',
        '30052-light-hello',
      ],
    },
    {
      id: 'grand-live-long-spd3-wit2-friend',
      distance: 'Long',
      combo: '3 Speed + 2 Wit + 1 Friend',
      usage: 22.27,
      slugs: [
        '30028-kitasan-black',
        '30101-agnes-tachyon',
        '30107-maruzensky',
        '30010-fine-motion',
        '30097-mr-cb',
        '30052-light-hello',
      ],
    },
    {
      id: 'grand-live-dirt-spd3-wit2-friend',
      distance: 'Dirt',
      combo: '3 Speed + 2 Wit + 1 Friend',
      usage: 49.57,
      slugs: [
        '30028-kitasan-black',
        '30101-agnes-tachyon',
        '30107-maruzensky',
        '30010-fine-motion',
        '20002-daiwa-scarlet',
        '30052-light-hello',
      ],
    },
    {
      id: 'grand-live-dirt-spd2-wit3-friend',
      distance: 'Dirt',
      combo: '2 Speed + 3 Wit + 1 Friend',
      usage: 16.76,
      slugs: [
        '30028-kitasan-black',
        '30101-agnes-tachyon',
        '30010-fine-motion',
        '20002-daiwa-scarlet',
        '20015-marvelous-sunday',
        '30052-light-hello',
      ],
    },
  ];

  const templatesModal = document.getElementById('templatesModal');
  const templatesModalList = document.getElementById('templatesModalList');
  const openTemplatesBtn = document.getElementById('openTemplatesBtn');

  function renderTemplates() {
    let html = '';
    for (let i = 0; i < META_TEMPLATES.length; i++) {
      const tmpl = META_TEMPLATES[i];
      const cards = tmpl.slugs.map((slug) => findSupportBySlug(slug)).filter(Boolean);
      const cardPills = cards
        .map(
          (c) =>
            `<span class="template-card-pill"><span class="pill-type" data-type="${escHtml(c.SupportType)}">${escHtml(c.SupportType)}</span>${escHtml(cleanCardName(getLocalizedSupportName(c)))}</span>`
        )
        .join('');
      const usageText = t('deck.templateUsage').replace('{0}', tmpl.usage);
      html += `<div class="template-card" data-idx="${i}">
        <div class="template-header">
          <span class="template-title">${escHtml(tmpl.distance)}</span>
          <span class="template-usage">${escHtml(usageText)}</span>
        </div>
        <div class="template-combo">${escHtml(tmpl.combo)}</div>
        <div class="template-cards">${cardPills}</div>
        <div class="template-actions">
          <button class="btn primary template-load-btn" data-idx="${i}">${t('deck.loadTemplate')}</button>
        </div>
      </div>`;
    }
    templatesModalList.innerHTML = html;
  }

  function loadTemplate(index) {
    const tmpl = META_TEMPLATES[index];
    if (!tmpl) return;
    const cards = tmpl.slugs.map((slug) => findSupportBySlug(slug)).filter(Boolean);
    selectedSupports = cards.slice(0, MAX_SUPPORTS);
    supportLbStops = selectedSupports.map(() => 4);
    saveDeck();
    render();
    showStatus(t('deck.loadedTemplate', { distance: tmpl.distance }));
    setTimeout(() => showStatus(''), 2000);
  }

  function openTemplatesModal() {
    mountOverlayAtViewport(templatesModal);
    renderTemplates();
    templatesModal.hidden = false;
  }

  function closeTemplatesModal() {
    templatesModal.hidden = true;
  }

  openTemplatesBtn.addEventListener('click', openTemplatesModal);
  templatesModal
    .querySelector('.support-modal-backdrop')
    .addEventListener('click', closeTemplatesModal);
  templatesModal
    .querySelector('.support-modal-close')
    .addEventListener('click', closeTemplatesModal);

  templatesModalList.addEventListener('click', (e) => {
    const loadBtn = e.target.closest('.template-load-btn');
    if (loadBtn) {
      loadTemplate(parseInt(loadBtn.dataset.idx, 10));
      closeTemplatesModal();
    }
  });

  // =====================================================================
  // Support Card Picker Modal
  // =====================================================================

  function initFilterButtons() {
    typeFiltersEl.innerHTML = '';
    for (const tp of SUPPORT_TYPES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-btn';
      btn.textContent = localizeTypeName(tp);
      btn.dataset.type = tp;
      btn.addEventListener('click', () => {
        if (filterTypes.has(tp)) filterTypes.delete(tp);
        else filterTypes.add(tp);
        updateFilterButtons();
        renderModalList();
      });
      typeFiltersEl.appendChild(btn);
    }

    rarityFiltersEl.innerHTML = '';
    for (const r of RARITY_ORDER) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-btn';
      btn.textContent = r;
      btn.dataset.rarity = r;
      btn.addEventListener('click', () => {
        filterRarity = filterRarity === r ? null : r;
        updateFilterButtons();
        renderModalList();
      });
      rarityFiltersEl.appendChild(btn);
    }
  }

  function updateFilterButtons() {
    for (const btn of typeFiltersEl.querySelectorAll('.filter-btn')) {
      btn.classList.toggle('active', filterTypes.has(btn.dataset.type));
    }
    for (const btn of rarityFiltersEl.querySelectorAll('.filter-btn')) {
      btn.classList.toggle('active', btn.dataset.rarity === filterRarity);
    }
  }

  // Sort dropdown
  const SORTABLE_EFFECTS = [
    'Race Bonus',
    'Fan Bonus',
    'Training Effectiveness',
    'Speed Bonus',
    'Stamina Bonus',
    'Power Bonus',
    'Guts Bonus',
    'Wit Bonus',
    'Skill Point Bonus',
    'Hint Levels',
    'Friendship Bonus',
    'Initial Speed',
    'Initial Stamina',
    'Initial Power',
    'Initial Guts',
    'Initial Wit',
  ];

  const supportSortEl = document.getElementById('supportSort');

  function populateSortDropdown() {
    const prev = supportSortEl.value;
    supportSortEl.innerHTML = `<option value="">\u2014</option>`;
    for (const name of SORTABLE_EFFECTS) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = localizeEffectName(name);
      supportSortEl.appendChild(opt);
    }
    supportSortEl.value = prev;
  }

  function initSortDropdown() {
    populateSortDropdown();
    supportSortEl.addEventListener('change', () => {
      sortByEffect = supportSortEl.value;
      renderModalList();
    });
  }

  initSortDropdown();

  function getEffectValueAtMlb(card, effectName) {
    const rarity = card.SupportRarity || 'SSR';
    const idx = lbToEffectIndex(4, rarity);
    const eff = (card.SupportEffects || []).find((e) => e.name === effectName);
    return eff?.values?.[idx] ?? 0;
  }

  function getFilteredSupports() {
    const search = filterSearch.toLowerCase();
    const selectedSlugs = new Set(selectedSupports.map((s) => s.SupportSlug));

    const filtered = supports
      .filter((s) => {
        if (!matchesServer(s)) return false;
        if (filterTypes.size > 0 && !filterTypes.has(s.SupportType)) return false;
        if (filterRarity && s.SupportRarity !== filterRarity) return false;
        if (search && !cleanCardName(s.SupportName).toLowerCase().includes(search) &&
            !cleanCardName(s.SupportNameJP || '').toLowerCase().includes(search)) return false;
        return true;
      })
      .map((s) => {
        const copy = { ...s, _selected: selectedSlugs.has(s.SupportSlug) };
        if (sortByEffect) copy._sortVal = getEffectValueAtMlb(s, sortByEffect);
        return copy;
      });

    if (sortByEffect) {
      filtered.sort((a, b) => (b._sortVal || 0) - (a._sortVal || 0));
    }

    return filtered;
  }

  function renderModalList() {
    const filtered = getFilteredSupports();

    if (filtered.length === 0) {
      supportModalList.innerHTML = `<div class="modal-card-empty">${t('deck.noCardsMatch')}</div>`;
      return;
    }

    let html = '';
    for (const s of filtered) {
      const name = cleanCardName(getLocalizedSupportName(s));
      const cls = s._selected ? 'modal-card-item disabled' : 'modal-card-item';
      const typeStr = s.SupportType || '';
      const typeBadge = typeStr
        ? `<span class="support-type-badge" data-type="${escHtml(typeStr)}">${escHtml(localizeTypeName(typeStr))}</span>`
        : '';
      const imgSrc = s.SupportImage || '';
      const imgHtml = imgSrc
        ? `<img class="modal-card-thumb" src="${escHtml(imgSrc)}" alt="" loading="lazy">`
        : `<span class="modal-card-initials">${escHtml(initialsOf(name))}</span>`;

      const valBadge = sortByEffect
        ? `<span class="modal-card-effect-val${s._sortVal ? '' : ' zero'}">${s._sortVal ?? 0}</span>`
        : '';

      html += `<div class="${cls}" data-slug="${escHtml(s.SupportSlug)}">
        ${imgHtml}
        <span class="modal-card-name">${escHtml(name)}</span>
        ${typeBadge}
        <span class="modal-card-rarity">${escHtml(s.SupportRarity || '')}</span>
        ${valBadge}
      </div>`;
    }
    supportModalList.innerHTML = html;
  }

  function openPickerModal(replaceIdx) {
    pendingReplaceIdx = typeof replaceIdx === 'number' ? replaceIdx : -1;
    if (pendingReplaceIdx === -1 && selectedSupports.length >= MAX_SUPPORTS) {
      showStatus(t('deck.maxSupports'));
      return;
    }
    filterSearch = '';
    supportSearch.value = '';
    mountOverlayAtViewport(supportModal);
    renderModalList();
    updateFilterButtons();
    supportModal.hidden = false;
    supportSearch.focus();
  }

  function closePickerModal() {
    supportModal.hidden = true;
    pendingReplaceIdx = -1;
  }

  function selectFromModal(slug) {
    const card = findSupportBySlug(slug);
    if (!card) return;
    if (selectedSupports.some((s) => s.SupportSlug === card.SupportSlug)) return;

    if (pendingReplaceIdx >= 0 && pendingReplaceIdx < selectedSupports.length) {
      // Swap mode: replace the card at that index, keep same LB
      selectedSupports[pendingReplaceIdx] = card;
    } else {
      if (selectedSupports.length >= MAX_SUPPORTS) return;
      selectedSupports.push(card);
      supportLbStops.push(4); // default MLB
    }

    showStatus('');
    pendingReplaceIdx = -1;
    saveDeck();
    render();
    closePickerModal();
  }

  // Modal event listeners
  supportModal.querySelector('.support-modal-backdrop').addEventListener('click', closePickerModal);
  supportModal.querySelector('.support-modal-close').addEventListener('click', closePickerModal);

  supportSearch.addEventListener('input', () => {
    filterSearch = supportSearch.value;
    renderModalList();
  });

  supportModalList.addEventListener('click', (e) => {
    const item = e.target.closest('.modal-card-item');
    if (!item || item.classList.contains('disabled')) return;
    selectFromModal(item.dataset.slug);
  });

  initFilterButtons();

  // =====================================================================
  // Effects Panel
  // =====================================================================

  function openEffectsPanel(card, lbStop, slotIdx) {
    if (!card) return;
    mountOverlayAtViewport(effectsPanel);
    effectsCard = card;
    effectsLbStop = lbStop ?? 4;
    effectsSlotIdx = typeof slotIdx === 'number' ? slotIdx : -1;
    effectsLevelSlider.max = 4;
    effectsLevelSlider.value = effectsLbStop;
    effectsPanelTitle.textContent = cleanCardName(getLocalizedSupportName(card));
    renderEffects();
    effectsPanel.hidden = false;
  }

  function closeEffectsPanel() {
    effectsPanel.hidden = true;
    effectsCard = null;
    effectsSlotIdx = -1;
  }

  function renderEffects() {
    if (!effectsCard) return;
    effectsLevelLabel.textContent = LB_LABELS[effectsLbStop] || 'MLB';
    const rarity = effectsCard.SupportRarity || 'SSR';
    const idx = lbToEffectIndex(effectsLbStop, rarity);

    const effects = effectsCard.SupportEffects || [];
    if (effects.length === 0 && !effectsCard.SupportUnique) {
      effectsPanelBody.innerHTML = `<div class="modal-card-empty">${t('deck.noEffectData')}</div>`;
      return;
    }

    let html = '';
    for (const eff of effects) {
      const val = eff.values?.[idx] ?? 0;
      const symbol = eff.symbol === 'percent' ? '%' : '';
      const cls = val === 0 ? 'effect-value zero' : 'effect-value';
      html += `<div class="effect-row">
        <span class="effect-name">${escHtml(localizeEffectName(eff.name))}</span>
        <span class="${cls}">${val}${symbol}</span>
      </div>`;
    }

    // Show unique effects with locked/unlocked state based on LB level
    if (effectsCard.SupportUnique) {
      const unlocked = uniqueActiveAtLb(effectsCard, effectsLbStop);
      const unlockLv = effectsCard.SupportUnique.level || 0;
      const lockLabel = unlocked ? '' : ` (Lv${unlockLv})`;
      html += `<div class="effect-unique-header${unlocked ? '' : ' locked'}">${t('deck.uniqueEffect') || 'Unique Effect'}${escHtml(lockLabel)}</div>`;
      for (const u of effectsCard.SupportUnique.effects) {
        const symbol = u.symbol === 'percent' ? '%' : '';
        const cls = unlocked ? 'effect-value' : 'effect-value zero';
        const val = unlocked ? u.value : 0;
        html += `<div class="effect-row${unlocked ? '' : ' locked'}">
          <span class="effect-name">${escHtml(localizeEffectName(u.name))}</span>
          <span class="${cls}">${val}${symbol}</span>
        </div>`;
      }
    }

    effectsPanelBody.innerHTML = html;
  }

  effectsPanel
    .querySelector('.effects-panel-backdrop')
    .addEventListener('click', closeEffectsPanel);
  effectsPanel.querySelector('.effects-panel-close').addEventListener('click', closeEffectsPanel);

  effectsLevelSlider.addEventListener('input', () => {
    effectsLbStop = parseInt(effectsLevelSlider.value, 10);
    // Sync slider change back to the card's actual LB stop
    if (effectsSlotIdx >= 0 && effectsSlotIdx < supportLbStops.length) {
      supportLbStops[effectsSlotIdx] = effectsLbStop;
      saveDeck();
      renderSupportSlots();
      renderSummary();
    }
    renderEffects();
  });

  // =====================================================================
  // Character Picker Modal
  // =====================================================================

  function aptitudePassesFilter(apt, group, filterSet) {
    if (filterSet.size === 0) return true;
    const grades = apt?.[group] || {};
    // OR within group: character passes if ANY selected aptitude is A or S
    for (const key of filterSet) {
      const grade = grades[key];
      if (grade === 'S' || grade === 'A') return true;
    }
    return false;
  }

  function getFilteredCharacters() {
    const search = charFilterSearch.toLowerCase();
    return characters.filter((c) => {
      if (!matchesServer(c)) return false;
      if (search) {
        const name = (c.UmaName || '').toLowerCase();
        const nick = (c.UmaNickname || '').toLowerCase();
        const nameJP = (c.UmaNameJP || '').toLowerCase();
        const nickJP = (c.UmaNicknameJP || '').toLowerCase();
        if (!name.includes(search) && !nick.includes(search) &&
            !nameJP.includes(search) && !nickJP.includes(search)) return false;
      }
      // AND across groups: must pass all non-empty groups
      const apt = c.UmaAptitudes;
      if (!aptitudePassesFilter(apt, 'Distance', charFilterDist)) return false;
      if (!aptitudePassesFilter(apt, 'Surface', charFilterSurf)) return false;
      if (!aptitudePassesFilter(apt, 'Strategy', charFilterStrat)) return false;
      return true;
    });
  }

  const charDistFiltersEl = document.getElementById('charDistFilters');
  const charSurfFiltersEl = document.getElementById('charSurfFilters');
  const charStratFiltersEl = document.getElementById('charStratFilters');

  function initCharFilterButtons() {
    const groups = [
      { el: charDistFiltersEl, keys: ['Short', 'Mile', 'Medium', 'Long'], set: charFilterDist },
      { el: charSurfFiltersEl, keys: ['Turf', 'Dirt'], set: charFilterSurf },
      { el: charStratFiltersEl, keys: ['Front', 'Pace', 'Late', 'End'], set: charFilterStrat },
    ];
    for (const g of groups) {
      g.el.innerHTML = '';
      for (const key of g.keys) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'filter-btn';
        btn.textContent = CHAR_FILTER_I18N[key] ? t(CHAR_FILTER_I18N[key]) : key;
        btn.dataset.key = key;
        btn.addEventListener('click', () => {
          if (g.set.has(key)) g.set.delete(key);
          else g.set.add(key);
          updateCharFilterButtons();
          renderCharModalList();
        });
        g.el.appendChild(btn);
      }
    }
  }

  function updateCharFilterButtons() {
    for (const [el, set] of [
      [charDistFiltersEl, charFilterDist],
      [charSurfFiltersEl, charFilterSurf],
      [charStratFiltersEl, charFilterStrat],
    ]) {
      for (const btn of el.querySelectorAll('.filter-btn')) {
        btn.classList.toggle('active', set.has(btn.dataset.key));
      }
    }
  }

  initCharFilterButtons();

  function renderCharModalList() {
    const filtered = getFilteredCharacters();
    if (filtered.length === 0) {
      charModalList.innerHTML = `<div class="modal-card-empty">${t('deck.noCharsMatch')}</div>`;
      return;
    }

    let html = '';
    for (const c of filtered) {
      const locC = getLocalizedUmaName(c);
      const name = locC.name;
      const nick = locC.nickname;
      const isSelected = selectedChar && selectedChar.UmaSlug === c.UmaSlug;
      const cls = isSelected ? 'modal-card-item disabled' : 'modal-card-item';
      const imgSrc = c.UmaImage || '';
      const imgHtml = imgSrc
        ? `<img class="modal-card-thumb" src="${escHtml(imgSrc)}" alt="" loading="lazy">`
        : `<span class="modal-card-initials">${escHtml(initialsOf(name))}</span>`;
      const stars = c.UmaBaseStars ? '\u2605'.repeat(Math.min(c.UmaBaseStars, 5)) : '';

      html += `<div class="${cls}" data-slug="${escHtml(c.UmaSlug)}">
        ${imgHtml}
        <span class="modal-card-name">${escHtml(name)}${nick ? ` <span class="modal-card-nick">(${escHtml(nick)})</span>` : ''}</span>
        <span class="modal-card-rarity char-stars">${stars}</span>
      </div>`;
    }
    charModalList.innerHTML = html;
  }

  function openCharModal() {
    charFilterSearch = '';
    charSearchInput.value = '';
    charFilterDist.clear();
    charFilterSurf.clear();
    charFilterStrat.clear();
    mountOverlayAtViewport(charModal);
    updateCharFilterButtons();
    renderCharModalList();
    charModal.hidden = false;
    charSearchInput.focus();
  }

  function closeCharModal() {
    charModal.hidden = true;
  }

  charModal.querySelector('.support-modal-backdrop').addEventListener('click', closeCharModal);
  charModal.querySelector('.support-modal-close').addEventListener('click', closeCharModal);

  charSearchInput.addEventListener('input', () => {
    charFilterSearch = charSearchInput.value;
    renderCharModalList();
  });

  charModalList.addEventListener('click', (e) => {
    const item = e.target.closest('.modal-card-item');
    if (!item || item.classList.contains('disabled')) return;
    const found = findCharBySlug(item.dataset.slug);
    if (found) {
      selectedChar = found;
      saveDeck();
      render();
      closeCharModal();
    }
  });

  // =====================================================================
  // Event handlers
  // =====================================================================

  charDisplay.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="remove-char"]')) {
      selectedChar = null;
      saveDeck();
      render();
      return;
    }
    // Click anywhere on the character card or empty slot opens picker
    if (
      e.target.closest('.deck-character-card') ||
      e.target.closest('[data-action="open-char-picker"]')
    ) {
      openCharModal();
    }
  });

  supportSlots.addEventListener('click', (e) => {
    // Remove button
    const removeBtn = e.target.closest('.slot-remove');
    if (removeBtn) {
      const idx = parseInt(removeBtn.dataset.idx, 10);
      if (idx >= 0 && idx < selectedSupports.length) {
        selectedSupports.splice(idx, 1);
        supportLbStops.splice(idx, 1);
        saveDeck();
        render();
      }
      return;
    }

    // Swap button -> open picker in replace mode
    const swapBtn = e.target.closest('.slot-swap');
    if (swapBtn) {
      const idx = parseInt(swapBtn.dataset.idx, 10);
      if (idx >= 0 && idx < selectedSupports.length) {
        openPickerModal(idx);
      }
      return;
    }

    // LB button click
    const lbBtn = e.target.closest('.lb-btn');
    if (lbBtn) {
      const idx = parseInt(lbBtn.dataset.idx, 10);
      const lb = parseInt(lbBtn.dataset.lb, 10);
      if (idx >= 0 && idx < selectedSupports.length && lb >= 0 && lb <= 4) {
        supportLbStops[idx] = lb;
        saveDeck();
        render();
      }
      return;
    }

    // Click on filled slot -> open effects panel
    const filledSlot = e.target.closest('.deck-support-slot.filled');
    if (filledSlot) {
      const idx = parseInt(filledSlot.dataset.idx, 10);
      const card = selectedSupports[idx];
      if (card) openEffectsPanel(card, supportLbStops[idx] ?? 4, idx);
      return;
    }

    // Click on empty slot -> open picker
    const emptySlot = e.target.closest('[data-action="open-picker"]');
    if (emptySlot) {
      openPickerModal();
    }
  });

  shareLinkBtn.addEventListener('click', () => {
    const params = new URLSearchParams();
    if (selectedChar) {
      // Use ID if shorter than slug, otherwise slug
      const id = selectedChar.UmaId || '';
      const slug = selectedChar.UmaSlug || '';
      params.set('c', id && id.length < slug.length ? id : slug);
    }
    if (selectedSupports.length) {
      // Use IDs if shorter than slugs
      const ids = selectedSupports.map((s) => s.SupportId || s.SupportSlug);
      const slugs = selectedSupports.map((s) => s.SupportSlug);
      const idsStr = ids.join(',');
      const slugsStr = slugs.join(',');
      params.set('s', idsStr.length < slugsStr.length ? idsStr : slugsStr);
      // Only include LBs if any differ from MLB
      const lbs = supportLbStops.slice(0, selectedSupports.length);
      if (lbs.some((lb) => lb !== 4)) {
        params.set('lb', lbs.join(','));
      }
    }
    const url = `${location.origin}${location.pathname}?${params.toString()}`;
    navigator.clipboard.writeText(url).then(
      () => showStatus(t('common.copied')),
      () => showStatus(t('deck.copyLinkFailed'))
    );
    setTimeout(() => showStatus(''), 2000);
  });

  clearAllBtn.addEventListener('click', () => {
    selectedChar = null;
    selectedSupports = [];
    supportLbStops = [];
    saveDeck();
    render();
    showStatus('');
    if (location.search) {
      history.replaceState(null, '', location.pathname);
    }
  });

  // Close modals on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!effectsPanel.hidden) closeEffectsPanel();
      else if (!templatesModal.hidden) closeTemplatesModal();
      else if (!savedDecksModal.hidden) closeSavedDecksModal();
      else if (!supportModal.hidden) closePickerModal();
      else if (!charModal.hidden) closeCharModal();
    }
  });

  // =====================================================================
  // Open in Skill Optimizer
  // =====================================================================

  const openOptimizerBtn = document.getElementById('openOptimizerBtn');

  function openInOptimizer() {
    if (selectedSupports.length === 0) {
      showStatus(t('deck.noSupportsForOptimizer'));
      setTimeout(() => showStatus(''), 2000);
      return;
    }

    // Collect all hints with effective hint levels
    const hintMap = new Map();
    for (let i = 0; i < selectedSupports.length; i++) {
      const card = selectedSupports[i];
      const lb = supportLbStops[i] ?? 4;
      const cardHintLv = getCardHintLevel(card, lb);
      for (const h of card.SupportHints || []) {
        if (!h.Name || !h.SkillId) continue;
        const existing = hintMap.get(h.Name) || 0;
        hintMap.set(h.Name, Math.min(existing + cardHintLv, 5));
      }
    }

    // Build optimizer-compatible row string: name=0|H{level}
    const rows = [];
    for (const [name, level] of hintMap) {
      rows.push(`${name}=0${level > 0 ? `|H${level}` : ''}`);
    }
    const buildString = rows.join('\n');

    // Base64-encode (URL-safe variant)
    const encoded = btoa(unescape(encodeURIComponent(buildString)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const params = new URLSearchParams();
    params.set('b', encoded);

    // Pass race config from character aptitudes
    if (selectedChar?.UmaAptitudes) {
      const apt = selectedChar.UmaAptitudes;
      const cfgMap = {
        turf: apt.Surface?.Turf,
        dirt: apt.Surface?.Dirt,
        sprint: apt.Distance?.Short,
        mile: apt.Distance?.Mile,
        medium: apt.Distance?.Medium,
        long: apt.Distance?.Long,
        front: apt.Strategy?.Front,
        pace: apt.Strategy?.Pace,
        late: apt.Strategy?.Late,
        end: apt.Strategy?.End,
      };
      const cfgKeys = [
        'turf',
        'dirt',
        'sprint',
        'mile',
        'medium',
        'long',
        'front',
        'pace',
        'late',
        'end',
      ];
      const cfgValues = cfgKeys.map((k) => cfgMap[k] || 'A');
      params.set('c', cfgValues.join(','));
    }

    window.open(`/optimizer#${params.toString()}`, '_blank');
  }

  openOptimizerBtn.addEventListener('click', openInOptimizer);

  // =====================================================================
  // Server change listener
  // =====================================================================

  window.addEventListener('umatools:server-change', (e) => {
    const next = e?.detail?.server === 'jp' ? 'jp' : 'en';
    if (next === currentServer) return;
    currentServer = next;
    render();
    if (!supportModal.hidden) renderModalList();
    if (!charModal.hidden) renderCharModalList();
  });

  // Re-render visible sections when site language changes (EN↔JP)
  function refreshLocalizedDisplay() {
    renderCharacter();
    renderSupportSlots();
    renderSummary();
    initFilterButtons();
    updateFilterButtons();
    initCharFilterButtons();
    updateCharFilterButtons();
    populateSortDropdown();
    if (!supportModal.hidden) renderModalList();
    if (!charModal.hidden) renderCharModalList();
    if (!savedDecksModal.hidden) renderSavedDecks();
    if (!templatesModal.hidden) renderTemplates();
    if (!effectsPanel.hidden && effectsCard) {
      effectsPanelTitle.textContent = cleanCardName(getLocalizedSupportName(effectsCard));
      renderEffects();
    }
  }
  window.addEventListener('umatools:site-language-change', refreshLocalizedDisplay);

  // Re-render when JP skill name map becomes available (async load from skill-popup.js)
  window.addEventListener('i18n:jpnames-ready', refreshLocalizedDisplay);

  // --- Init ---
  currentServer = readServerPref();
  const loadedFromUrl = loadFromUrl();
  if (!loadedFromUrl) {
    loadDeck();
  }
  render();
})();
