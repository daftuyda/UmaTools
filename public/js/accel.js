(function () {
  'use strict';

  const SERVER_PREF_KEY = 'umatoolsServer';
  const SITE_LANG_PREF_KEY = 'umatoolsSiteLanguage';

  const COPY = {
    en: {
      title: 'Valid Accel Checker',
      subtitle: 'VAC race timing logic integrated with site-wide server/language settings.',
      raceSetup: 'Race Setup',
      racePreset: 'Race preset',
      distance: 'Distance',
      trackType: 'Track type',
      trackCondition: 'Track condition',
      racecourse: 'Racecourse',
      mood: 'Mood (optional)',
      skillNameFilter: 'Skill name filter (optional)',
      skillNameFilterPlaceholder: 'Search by EN or JP skill name',
      rarityFilter: 'Rarity Filter',
      courseDetails: 'Course Details',
      finalPhaseStart: 'Final phase start (ls)',
      finalCorner: 'Final corner (fc)',
      finalStraight: 'Final straight (fs)',
      uphill: 'Uphill Sections',
      downhill: 'Downhill Sections',
      addSection: 'Add section',
      search: 'Search Valid Acceleration',
      reset: 'Reset',
      results: 'Results',
      resultsSub: 'Output is sorted by activation timing, uncertainty, and effect value.',
      dbSkills: 'DB skills',
      serverMode: 'Server mode',
      validSkills: 'Valid skills',
      missingCourseInfoWarning:
        'Final corner (fc) or final straight (fs) is missing. Accuracy may decrease.',
      selectRace: '- Select race -',
      selectDistance: '- Select distance -',
      selectTrack: '- Select track -',
      selectCondition: '- Select condition -',
      selectRacecourse: '- Select racecourse -',
      allMoods: 'All moods',
      groupJra: 'JRA',
      groupRegional: 'Regional',
      groupOverseas: 'Overseas',
      requiredError: 'Please select distance, track type, track condition, and racecourse.',
      raceDataMissingError:
        'Race data could not be loaded from assets/races.json. Ensure this file is deployed.',
      skillDataMissingError:
        'Skill timing data could not be loaded from assets/accel_skills_compat.json.',
      skillMetaMissingError:
        'Global skill metadata could not be loaded from assets/skills_all.json, so EN-only filtering is unavailable.',
      emptyPrompt:
        'Select race conditions and press "Search Valid Acceleration" to evaluate skills.',
      noMatch: 'No matching skills found.',
      outOf: '(out of {count})',
      serverGlobal: 'Global only',
      serverJp: 'JP all skills',
      sortHint:
        'Sort: activation timing (earliest first) -> uncertainty score (ascending) -> effect value (descending)',
      colSkillName: 'Skill Name',
      colRarity: 'Rarity',
      colEffectValue: 'Effect Value',
      colExpectedImpact: 'Expected Impact (1200 SPD)',
      colEffectCondition: 'Effect / Activation Condition',
      colPositionCondition: 'Position Condition',
      colTiming: 'Timing',
      colUncertainty: 'Uncertainty',
      rankTop: 'Top',
      uncCertain: 'Certain',
      uncLow: 'Low RNG',
      uncMedium: 'Medium RNG',
      uncHigh: 'High RNG',
      uncHighest: 'Very High RNG',
      uncNoRandom: 'No random activation conditions.',
      uncMore: '(+{count} more factors)',
      impactGain: '+{meters}m lead (~{seconds}s gain)',
      impactLoss: '-{meters}m loss (~{seconds}s loss)',
      impactFlat: 'No measurable impact',
      impactDistanceLabel: 'Dist',
      impactTimeLabel: 'Time',
      impactGainShort: 'gain',
      impactLossShort: 'loss',
      posCm: 'CM',
      posLoh: 'LoH',
      rarityAll: 'All',
      rarityWhite: 'White',
      rarityGold: 'Gold',
      raritySubUnique: 'Sub-Unique',
      rarityUnique: 'Unique',
      rarityEvolution: 'Evolution',
    },
    ja: {
      title: '\u6709\u52b9\u52a0\u901f\u30c1\u30a7\u30c3\u30ab\u30fc',
      subtitle:
        'VAC\u306e\u30bf\u30a4\u30df\u30f3\u30b0\u5224\u5b9a\u3092\u3001\u30b5\u30fc\u30d0\u30fc/\u8a00\u8a9e\u8a2d\u5b9a\u306b\u9023\u52d5\u3057\u3066\u5229\u7528\u3067\u304d\u307e\u3059\u3002',
      raceSetup: '\u30ec\u30fc\u30b9\u8a2d\u5b9a',
      racePreset: '\u30ec\u30fc\u30b9\u30d7\u30ea\u30bb\u30c3\u30c8',
      distance: '\u8ddd\u96e2',
      trackType: '\u30d0\u5834\u7a2e\u5225',
      trackCondition: '\u99ac\u5834\u72b6\u614b',
      racecourse: '\u30ec\u30fc\u30b9\u5834',
      mood: '\u3084\u308b\u6c17\uff08\u4efb\u610f\uff09',
      skillNameFilter: '\u30b9\u30ad\u30eb\u540d\u30d5\u30a3\u30eb\u30bf\uff08\u4efb\u610f\uff09',
      skillNameFilterPlaceholder: 'EN/\u65e5\u672c\u8a9e\u30b9\u30ad\u30eb\u540d\u3067\u691c\u7d22',
      rarityFilter: '\u30ec\u30a2\u30ea\u30c6\u30a3\u30d5\u30a3\u30eb\u30bf',
      courseDetails: '\u30b3\u30fc\u30b9\u8a73\u7d30',
      finalPhaseStart: '\u7d42\u76e4\u958b\u59cb (ls)',
      finalCorner: '\u6700\u7d42\u30b3\u30fc\u30ca\u30fc (fc)',
      finalStraight: '\u6700\u7d42\u76f4\u7dda (fs)',
      uphill: '\u4e0a\u308a\u5742\u533a\u9593',
      downhill: '\u4e0b\u308a\u5742\u533a\u9593',
      addSection: '\u533a\u9593\u3092\u8ffd\u52a0',
      search: '\u6709\u52b9\u52a0\u901f\u3092\u691c\u7d22',
      reset: '\u30ea\u30bb\u30c3\u30c8',
      results: '\u691c\u7d22\u7d50\u679c',
      resultsSub:
        '\u767a\u52d5\u30bf\u30a4\u30df\u30f3\u30b0\u3001\u4e0d\u78ba\u5b9f\u6027\u3001\u52b9\u679c\u91cf\u306e\u9806\u3067\u4e26\u3073\u307e\u3059\u3002',
      dbSkills: 'DB\u30b9\u30ad\u30eb',
      serverMode: '\u30b5\u30fc\u30d0\u30fc\u30e2\u30fc\u30c9',
      validSkills: '\u6709\u52b9\u30b9\u30ad\u30eb',
      missingCourseInfoWarning:
        '\u6700\u7d42\u30b3\u30fc\u30ca\u30fc (fc) \u307e\u305f\u306f\u6700\u7d42\u76f4\u7dda (fs) \u304c\u672a\u5165\u529b\u3067\u3059\u3002\u7cbe\u5ea6\u304c\u4e0b\u304c\u308b\u5834\u5408\u304c\u3042\u308a\u307e\u3059\u3002',
      selectRace: '- \u30ec\u30fc\u30b9\u3092\u9078\u629e -',
      selectDistance: '- \u8ddd\u96e2\u3092\u9078\u629e -',
      selectTrack: '- \u30d0\u5834\u3092\u9078\u629e -',
      selectCondition: '- \u99ac\u5834\u72b6\u614b\u3092\u9078\u629e -',
      selectRacecourse: '- \u30ec\u30fc\u30b9\u5834\u3092\u9078\u629e -',
      allMoods: '\u5168\u3066',
      groupJra: 'JRA',
      groupRegional: '\u5730\u65b9',
      groupOverseas: '\u6d77\u5916',
      requiredError:
        '\u8ddd\u96e2\u3001\u30d0\u5834\u7a2e\u5225\u3001\u99ac\u5834\u72b6\u614b\u3001\u30ec\u30fc\u30b9\u5834\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044\u3002',
      raceDataMissingError:
        'assets/races.json \u304b\u3089\u30ec\u30fc\u30b9\u30c7\u30fc\u30bf\u3092\u8aad\u307f\u8fbc\u3081\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u914d\u5099\u72b6\u614b\u3092\u3054\u78ba\u8a8d\u304f\u3060\u3055\u3044\u3002',
      skillDataMissingError:
        'assets/accel_skills_compat.json \u304b\u3089\u30b9\u30ad\u30eb\u5224\u5b9a\u30c7\u30fc\u30bf\u3092\u8aad\u307f\u8fbc\u3081\u307e\u305b\u3093\u3067\u3057\u305f\u3002',
      skillMetaMissingError:
        'assets/skills_all.json \u304b\u3089\u30b0\u30ed\u30fc\u30d0\u30eb\u30b9\u30ad\u30eb\u60c5\u5831\u3092\u8aad\u307f\u8fbc\u3081\u306a\u3044\u305f\u3081\u3001EN\u30b5\u30fc\u30d0\u30fc\u5411\u3051\u7d5e\u308a\u8fbc\u307f\u304c\u3067\u304d\u307e\u305b\u3093\u3002',
      emptyPrompt:
        '\u30ec\u30fc\u30b9\u6761\u4ef6\u3092\u8a2d\u5b9a\u3057\u3001\u300c\u6709\u52b9\u52a0\u901f\u3092\u691c\u7d22\u300d\u3092\u62bc\u3059\u3068\u7d50\u679c\u304c\u8868\u793a\u3055\u308c\u307e\u3059\u3002',
      noMatch: '\u4e00\u81f4\u3059\u308b\u30b9\u30ad\u30eb\u304c\u3042\u308a\u307e\u305b\u3093\u3002',
      outOf: '(\u5168 {count} \u4ef6)',
      serverGlobal: '\u30b0\u30ed\u30fc\u30d0\u30eb\u306e\u307f',
      serverJp: '\u65e5\u672c\u5168\u30b9\u30ad\u30eb',
      sortHint:
        '\u30bd\u30fc\u30c8: \u767a\u52d5\u30bf\u30a4\u30df\u30f3\u30b0 (\u65e9\u3044\u9806) -> \u4e0d\u78ba\u5b9f\u6027 (\u663c\u9806) -> \u52b9\u679c\u91cf (\u964d\u9806)',
      colSkillName: '\u30b9\u30ad\u30eb\u540d',
      colRarity: '\u30ec\u30a2\u30ea\u30c6\u30a3',
      colEffectValue: '\u52b9\u679c\u91cf',
      colExpectedImpact: '\u4e88\u60f3\u30ea\u30bf\u30fc\u30f3 (1200\u901f\u529b)',
      colEffectCondition: '\u52b9\u679c/\u767a\u52d5\u6761\u4ef6',
      colPositionCondition: '\u4f4d\u7f6e\u6761\u4ef6',
      colTiming: '\u767a\u52d5\u30bf\u30a4\u30df\u30f3\u30b0',
      colUncertainty: '\u4e0d\u78ba\u5b9f\u6027',
      rankTop: '\u4e0a\u4f4d',
      uncCertain: '\u78ba\u5b9a',
      uncLow: '\u4f4e',
      uncMedium: '\u4e2d',
      uncHigh: '\u9ad8',
      uncHighest: '\u6700\u9ad8',
      uncNoRandom:
        '\u767a\u52d5\u6761\u4ef6\u306b\u30e9\u30f3\u30c0\u30e0\u8981\u7d20\u306f\u3042\u308a\u307e\u305b\u3093\u3002',
      uncMore: '(\u307b\u304b {count} \u8981\u7d20)',
      impactGain: '+{meters}m \u30ea\u30fc\u30c9 (~{seconds}\u79d2\u5f97)',
      impactLoss: '-{meters}m \u30ed\u30b9 (~{seconds}\u79d2\u640d)',
      impactFlat: '\u4f53\u611f\u53ef\u80fd\u306a\u5f71\u97ff\u306a\u3057',
      impactDistanceLabel: '\u8ddd\u96e2',
      impactTimeLabel: '\u6642\u9593',
      impactGainShort: '\u5f97',
      impactLossShort: '\u640d',
      posCm: 'CM',
      posLoh: 'LoH',
      rarityAll: '\u3059\u3079\u3066',
      rarityWhite: '\u767d',
      rarityGold: '\u91d1',
      raritySubUnique: '\u7d99\u627f\u56fa\u6709',
      rarityUnique: '\u56fa\u6709',
      rarityEvolution: '\u9032\u5316',
    },
  };

  const DIST_LABEL = {
    en: { 1: 'Sprint', 2: 'Mile', 3: 'Mid-Distance', 4: 'Long-Distance' },
    ja: { 1: '\u77ed\u8ddd\u96e2', 2: '\u30de\u30a4\u30eb', 3: '\u4e2d\u8ddd\u96e2', 4: '\u9577\u8ddd\u96e2' },
  };
  const TRACK_LABEL = {
    en: { 1: 'Turf', 2: 'Dirt' },
    ja: { 1: '\u829d', 2: '\u30c0\u30fc\u30c8' },
  };
  const CONDITION_LABEL = {
    en: { 1: 'Firm', 2: 'Good', 3: 'Soft', 4: 'Heavy' },
    ja: { 1: '\u826f', 2: '\u7a0d\u91cd', 3: '\u91cd', 4: '\u4e0d\u826f' },
  };
  const MOOD_LABEL = {
    en: { 1: 'Worst', 2: 'Bad', 3: 'Normal', 4: 'Good', 5: 'Best' },
    ja: {
      1: '\u7d76\u4e0d\u8abf',
      2: '\u4e0d\u8abf',
      3: '\u666e\u901a',
      4: '\u597d\u8abf',
      5: '\u7d76\u597d\u8abf',
    },
  };

  const VENUE_LABEL_EN = {
    '\u6771\u4eac': 'Tokyo',
    '\u4e2d\u5c71': 'Nakayama',
    '\u4eac\u90fd': 'Kyoto',
    '\u962a\u795e': 'Hanshin',
    '\u4e2d\u4eac': 'Chukyo',
    '\u5927\u4e95': 'Oi',
    '\u5ddd\u5d0e': 'Kawasaki',
    '\u8239\u6a4b': 'Funabashi',
    '\u76db\u5ca1': 'Morioka',
    '\u672d\u5e4c': 'Sapporo',
    '\u51fd\u9928': 'Hakodate',
    '\u798f\u5cf6': 'Fukushima',
    '\u65b0\u6f5f': 'Niigata',
    '\u5c0f\u5009': 'Kokura',
    '\u4f50\u8cc0': 'Saga',
    '\u30ed\u30f3\u30b7\u30e3\u30f3': 'Longchamp',
    '\u30b5\u30f3\u30bf\u30a2\u30cb\u30bf\u30d1\u30fc\u30af': 'Santa Anita Park',
    '\u30c7\u30eb\u30de\u30fc': 'Del Mar',
  };

  const RR_WEAK_VARS = new Set(['infront_near_lane_time', 'behind_near_lane_time']);
  const FIXED_RR_VARS = new Set(['hp_per', 'order', 'order_rate']);
  const FIXED_RV_VARS = new Set(['popularity']);
  const UNCERTAINTY_FACTOR_LABELS = {
    en: {
      activate_count_all_team: 'Ally skill activation count',
      activate_count_heal: 'Recovery skill activation count',
      activate_count_start: 'Early-race activation count',
      bashin_diff_behind: 'Gap from runner behind',
      bashin_diff_infront: 'Gap from runner ahead',
      blocked_front: 'Blocked by runner in front',
      blocked_front_continuetime: 'Time spent blocked in front',
      blocked_side_continuetime: 'Time spent blocked from side',
      change_order_onetime: 'One-time position change',
      change_order_up_middle: 'Mid-race position gain',
      compete_fight_count: 'Lead contest count',
      distance_diff_rate: 'Relative distance gap',
      distance_diff_top: 'Distance from race leader',
      infront_near_lane_time: 'Nearby runner ahead duration',
      is_behind_in: 'Running from behind condition',
      is_move_lane: 'Lane-change trigger',
      is_overtake: 'Overtake event trigger',
      is_used_skill_id: 'Specific skill proc dependency',
      overtake_target_time: 'Overtake target timing',
      temptation_count: 'Temptation trigger count',
      motivation: 'Mood variation',
      post_number: 'Gate number variation',
    },
    ja: {
      activate_count_all_team: '\u5473\u65b9\u306e\u767a\u52d5\u30b9\u30ad\u30eb\u6570',
      activate_count_heal: '\u56de\u5fa9\u30b9\u30ad\u30eb\u767a\u52d5\u6570',
      activate_count_start: '\u5e8f\u76e4\u767a\u52d5\u6570',
      bashin_diff_behind: '\u5f8c\u65b9\u3068\u306e\u8ddd\u96e2\u5dee',
      bashin_diff_infront: '\u524d\u65b9\u3068\u306e\u8ddd\u96e2\u5dee',
      blocked_front: '\u524d\u65b9\u30d6\u30ed\u30c3\u30af',
      blocked_front_continuetime: '\u524d\u65b9\u30d6\u30ed\u30c3\u30af\u7d99\u7d9a\u6642\u9593',
      blocked_side_continuetime: '\u5074\u65b9\u30d6\u30ed\u30c3\u30af\u7d99\u7d9a\u6642\u9593',
      change_order_onetime: '\u4e00\u5ea6\u306e\u9806\u4f4d\u5909\u5316',
      change_order_up_middle: '\u4e2d\u76e4\u3067\u306e\u9806\u4f4d\u4e0a\u6607',
      compete_fight_count: '\u5148\u982d\u7af6\u308a\u5408\u3044\u56de\u6570',
      distance_diff_rate: '\u8ddd\u96e2\u5dee\u7387',
      distance_diff_top: '\u5148\u982d\u3068\u306e\u8ddd\u96e2',
      infront_near_lane_time: '\u524d\u65b9\u8fd1\u63a5\u6642\u9593',
      is_behind_in: '\u5f8c\u65b9\u811a\u8cea\u6761\u4ef6',
      is_move_lane: '\u9032\u8def\u5909\u66f4\u767a\u751f',
      is_overtake: '\u8ffd\u3044\u629c\u304d\u767a\u751f',
      is_used_skill_id: '\u7279\u5b9a\u30b9\u30ad\u30eb\u767a\u52d5\u4f9d\u5b58',
      overtake_target_time: '\u8ffd\u3044\u629c\u304d\u76ee\u6a19\u30bf\u30a4\u30df\u30f3\u30b0',
      temptation_count: '\u304b\u304b\u308a\u767a\u751f\u56de\u6570',
      motivation: '\u3084\u308b\u6c17\u5909\u52d5',
      post_number: '\u67a0\u9806\u5909\u52d5',
    },
  };
  const raceList = [];

  const venueTracks = {};
  const venueGroupByName = {};
  const venueNamesByGroup = { jra: [], regional: [], overseas: [] };
  const presetIndexesByGroup = { jra: [], regional: [], overseas: [] };

  const accelSkillDb = [];
  const skillMetaByJP = new Map();
  const skillIdByJP = new Map();
  const officialSkillIds = new Set();
  const RARITY_VALUES = [1, 2, 3, 4, 6];
  let skillDataLoaded = false;
  let metadataLoaded = false;
  let upCounter = 0;
  let dnCounter = 0;
  let lastRows = null;
  let activeRarity = 'all';

  const el = {
    presetSel: document.getElementById('presetSel'),
    distSel: document.getElementById('distSel'),
    gtSel: document.getElementById('gtSel'),
    gcSel: document.getElementById('gcSel'),
    venueSel: document.getElementById('venueSel'),
    mvSel: document.getElementById('mvSel'),
    skillSearch: document.getElementById('skillSearch'),
    manLS: document.getElementById('manLS'),
    manFC: document.getElementById('manFC'),
    manFS: document.getElementById('manFS'),
    rarityFilters: document.getElementById('rarityFilters'),
    upRows: document.getElementById('upRows'),
    dnRows: document.getElementById('dnRows'),
    addUpBtn: document.getElementById('addUpBtn'),
    addDnBtn: document.getElementById('addDnBtn'),
    searchBtn: document.getElementById('searchBtn'),
    resetBtn: document.getElementById('resetBtn'),
    formError: document.getElementById('formError'),
    resCnt: document.getElementById('resCnt'),
    resTot: document.getElementById('resTot'),
    resBody: document.getElementById('resBody'),
    chips: document.getElementById('chips'),
    warnBox: document.getElementById('warnBox'),
    dbCnt: document.getElementById('dbCnt'),
    serverMode: document.getElementById('serverMode'),
  };

  function normalize(value) {
    return (value || '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function debounce(fn, ms) {
    let timer = null;
    return function (...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, '&quot;');
  }

  function getServerMode() {
    try {
      return (localStorage.getItem(SERVER_PREF_KEY) || '').trim().toLowerCase() === 'jp'
        ? 'jp'
        : 'en';
    } catch {
      return 'en';
    }
  }

  function getSiteLanguage() {
    const attr = (document.documentElement.dataset.siteLanguage || '').trim().toLowerCase();
    if (attr === 'jp') return 'jp';
    try {
      return (localStorage.getItem(SITE_LANG_PREF_KEY) || '').trim().toLowerCase() === 'jp'
        ? 'jp'
        : 'en';
    } catch {
      return 'en';
    }
  }

  function getSiteLangKey() {
    return getSiteLanguage() === 'jp' ? 'ja' : 'en';
  }

  function t(key, vars) {
    const lang = getSiteLangKey();
    const table = COPY[lang] || COPY.en;
    let out = table[key] || COPY.en[key] || key;
    if (!vars) return out;
    Object.keys(vars).forEach((name) => {
      out = out.replace(new RegExp(`\\{${name}\\}`, 'g'), String(vars[name]));
    });
    return out;
  }

  function labelBy(map, value) {
    const lang = getSiteLangKey();
    return (map[lang] && map[lang][value]) || (map.en && map.en[value]) || String(value || '');
  }

  function venueLabel(venue) {
    if (getSiteLangKey() === 'ja') return venue;
    return VENUE_LABEL_EN[venue] || venue;
  }

  function raceNameLabel(race) {
    if (!race || typeof race !== 'object') return '';
    if (getSiteLanguage() === 'jp') return race.name || race.name_en || '';
    return race.name_en || race.name || '';
  }

  function getDistType(distance) {
    return distance <= 1599 ? 1 : distance <= 1999 ? 2 : distance <= 2499 ? 3 : 4;
  }

  function classifyByTrackId(trackId) {
    if (trackId >= 10201) return 'overseas';
    if (trackId >= 10100) return 'regional';
    return 'jra';
  }

  function getRarityButtons() {
    return Array.from(document.querySelectorAll('.accel-rarity-btn'));
  }

  function setActiveRarity(value) {
    const next =
      value === 'all' || value == null || value === ''
        ? 'all'
        : Number.isFinite(Number(value))
          ? Number(value)
          : 'all';
    activeRarity = next;
    getRarityButtons().forEach((button) => {
      const buttonValue = button.dataset.rarity || 'all';
      const isActive = String(next) === buttonValue;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function buildVenueAndPresetIndexes() {
    Object.keys(venueTracks).forEach((key) => delete venueTracks[key]);
    Object.keys(venueGroupByName).forEach((key) => delete venueGroupByName[key]);
    ['jra', 'regional', 'overseas'].forEach((group) => {
      venueNamesByGroup[group] = [];
      presetIndexesByGroup[group] = [];
    });

    const seenVenue = new Set();
    raceList.forEach((race, index) => {
      if (!race || !race.venue || typeof race.track_id !== 'number') return;
      const group = classifyByTrackId(race.track_id);
      venueGroupByName[race.venue] = group;
      presetIndexesByGroup[group].push(index);
      if (!seenVenue.has(race.venue)) {
        seenVenue.add(race.venue);
        venueNamesByGroup[group].push(race.venue);
      }
      if (!venueTracks[race.venue]) venueTracks[race.venue] = [];
      if (!venueTracks[race.venue].includes(race.track_id)) {
        venueTracks[race.venue].push(race.track_id);
      }
    });
  }

  function applyStaticCopy() {
    document.title = `UmaTools - ${t('title')}`;
    document.querySelectorAll('[data-l10n]').forEach((node) => {
      const key = node.getAttribute('data-l10n');
      if (!key) return;
      node.textContent = t(key);
    });
    document.querySelectorAll('[data-l10n-placeholder]').forEach((node) => {
      const key = node.getAttribute('data-l10n-placeholder');
      if (!key) return;
      node.setAttribute('placeholder', t(key));
    });
  }

  function populateDistanceOptions() {
    const selected = el.distSel.value;
    el.distSel.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = t('selectDistance');
    el.distSel.appendChild(empty);

    const distances = raceList.length
      ? Array.from(
          new Set(
            raceList
              .map((race) => numOrNull(race.distance))
              .filter((distance) => distance != null)
              .map((distance) => Math.round(distance))
          )
        ).sort((a, b) => a - b)
      : [];

    if (!distances.length) {
      for (let d = 1000; d <= 3600; d += 100) distances.push(d);
    }

    distances.forEach((d) => {
      const option = document.createElement('option');
      option.value = String(d);
      option.textContent = `${d}m (${labelBy(DIST_LABEL, getDistType(d))})`;
      el.distSel.appendChild(option);
    });
    el.distSel.value = selected;
  }

  function populateSimpleSelect(selectEl, values, labelMap, emptyLabelKey) {
    const selected = selectEl.value;
    selectEl.innerHTML = '';
    if (emptyLabelKey) {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = t(emptyLabelKey);
      selectEl.appendChild(empty);
    }
    values.forEach((value) => {
      const option = document.createElement('option');
      option.value = String(value);
      option.textContent = labelBy(labelMap, value);
      selectEl.appendChild(option);
    });
    selectEl.value = selected;
  }

  function numOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeSlopePairs(value) {
    const out = [];
    if (!Array.isArray(value)) return out;
    value.forEach((pair) => {
      if (!Array.isArray(pair) || pair.length < 2) return;
      const start = numOrNull(pair[0]);
      const end = numOrNull(pair[1]);
      if (start == null || end == null || end <= start) return;
      out.push([Math.round(start), Math.round(end)]);
    });
    out.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]));
    return out;
  }

  function normalizeRaceEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const distance = numOrNull(entry.distance);
    const trackId = numOrNull(entry.track_id != null ? entry.track_id : entry.track);
    const gt = numOrNull(entry.gt != null ? entry.gt : entry.terrain);
    if (distance == null || trackId == null || gt == null) return null;

    return {
      id: numOrNull(entry.id),
      name: entry.name || entry.name_jp || entry.name_en || '',
      name_en: entry.name_en || entry.name || entry.name_jp || '',
      venue: entry.venue || '',
      track_id: Math.round(trackId),
      course_id: numOrNull(entry.course_id),
      distance: Math.round(distance),
      gt: gt === 2 ? 2 : 1,
      ls: numOrNull(entry.ls),
      fc: numOrNull(entry.fc),
      fs: numOrNull(entry.fs),
      us: normalizeSlopePairs(entry.us),
      ds: normalizeSlopePairs(entry.ds),
    };
  }

  function getRaceJsonCandidates() {
    const urls = [];
    const seen = new Set();

    function add(url) {
      if (!url || seen.has(url)) return;
      seen.add(url);
      urls.push(url);
    }

    try {
      add(new URL('/assets/races.json', window.location.origin).toString());
    } catch {
      /* ignore */
    }
    try {
      add(new URL('assets/races.json', window.location.href).toString());
    } catch {
      /* ignore */
    }
    try {
      const script = document.querySelector('script[src*="/js/accel.js"]');
      const rawSrc = script ? script.getAttribute('src') : '';
      if (rawSrc) {
        const srcUrl = new URL(rawSrc, window.location.href);
        const basePath = srcUrl.pathname.replace(/\/js\/accel\.js(?:$|\?.*)/, '').replace(/\/+$/, '');
        add(new URL(`${basePath}/assets/races.json`, window.location.origin).toString());
      }
    } catch {
      /* ignore */
    }

    add('/assets/races.json');
    add('./assets/races.json');
    add('assets/races.json');
    return urls;
  }

  async function loadRaceData() {
    const candidates = getRaceJsonCandidates();
    let lastFailure = '';

    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      try {
        const response = await fetch(candidate, { cache: 'no-cache' });
        if (!response.ok) {
          lastFailure = `HTTP ${response.status} on ${candidate}`;
          continue;
        }
        const data = await response.json();
        if (!Array.isArray(data) || !data.length) {
          lastFailure = `Empty or invalid JSON payload at ${candidate}`;
          continue;
        }
        const normalized = data.map((entry) => normalizeRaceEntry(entry)).filter(Boolean);
        if (!normalized.length) {
          lastFailure = `No valid race entries at ${candidate}`;
          continue;
        }
        raceList.splice(0, raceList.length, ...normalized);
        return true;
      } catch (error) {
        lastFailure = `${candidate}: ${error && error.message ? error.message : String(error)}`;
      }
    }
    console.error('[accel] Failed to load race data from assets/races.json', {
      candidates,
      lastFailure,
    });
    return false;
  }

  function populateVenueOptions() {
    const selected = el.venueSel.value;
    el.venueSel.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = t('selectRacecourse');
    el.venueSel.appendChild(empty);

    [
      { key: 'jra', label: t('groupJra') },
      { key: 'regional', label: t('groupRegional') },
      { key: 'overseas', label: t('groupOverseas') },
    ].forEach((group) => {
      const list = venueNamesByGroup[group.key];
      if (!Array.isArray(list) || !list.length) return;
      const optGroup = document.createElement('optgroup');
      optGroup.label = group.label;
      list.forEach((venue) => {
        const option = document.createElement('option');
        option.value = venue;
        option.textContent = venueLabel(venue);
        optGroup.appendChild(option);
      });
      el.venueSel.appendChild(optGroup);
    });
    el.venueSel.value = selected;
  }

  function populatePresetOptions() {
    const selected = el.presetSel.value;
    el.presetSel.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = t('selectRace');
    el.presetSel.appendChild(empty);

    [
      { key: 'jra', label: t('groupJra') },
      { key: 'regional', label: t('groupRegional') },
      { key: 'overseas', label: t('groupOverseas') },
    ].forEach((group) => {
      const indexes = presetIndexesByGroup[group.key];
      if (!Array.isArray(indexes) || !indexes.length) return;
      const optGroup = document.createElement('optgroup');
      optGroup.label = group.label;
      indexes.forEach((index) => {
        const race = raceList[index];
        if (!race) return;
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = `${raceNameLabel(race)} (${venueLabel(race.venue)} ${race.distance}m/${labelBy(
          TRACK_LABEL,
          race.gt
        )})`;
        optGroup.appendChild(option);
      });
      el.presetSel.appendChild(optGroup);
    });
    el.presetSel.value = selected;
  }

  function rerenderStaticSelectors() {
    populateDistanceOptions();
    populateSimpleSelect(el.gtSel, [1, 2], TRACK_LABEL, 'selectTrack');
    populateSimpleSelect(el.gcSel, [1, 2, 3, 4], CONDITION_LABEL, 'selectCondition');
    populateSimpleSelect(el.mvSel, [1, 2, 3, 4, 5], MOOD_LABEL, 'allMoods');
    populateVenueOptions();
    populatePresetOptions();
  }

  function showFormError(message) {
    el.formError.textContent = message;
    el.formError.hidden = false;
  }

  function hideFormError() {
    el.formError.hidden = true;
    el.formError.textContent = '';
  }

  function addSlopeRow(kind, startValue, endValue) {
    const id = kind === 'up' ? ++upCounter : ++dnCounter;
    const row = document.createElement('div');
    row.className = 'slope-row';
    row.dataset.kind = kind;
    row.dataset.id = String(id);

    const startInput = document.createElement('input');
    startInput.type = 'number';
    startInput.min = '0';
    startInput.max = '4000';
    startInput.placeholder = 'Start';
    startInput.value = startValue == null ? '' : String(startValue);

    const separator = document.createElement('span');
    separator.className = 'slope-row-sep';
    separator.textContent = '~';

    const endInput = document.createElement('input');
    endInput.type = 'number';
    endInput.min = '0';
    endInput.max = '4000';
    endInput.placeholder = 'End';
    endInput.value = endValue == null ? '' : String(endValue);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.dataset.action = 'remove-slope';
    removeBtn.setAttribute('aria-label', 'Remove slope row');
    removeBtn.textContent = 'X';

    row.appendChild(startInput);
    row.appendChild(separator);
    row.appendChild(endInput);
    row.appendChild(removeBtn);

    if (kind === 'up') el.upRows.appendChild(row);
    else el.dnRows.appendChild(row);
  }

  function clearSlopeRows() {
    el.upRows.innerHTML = '';
    el.dnRows.innerHTML = '';
    upCounter = 0;
    dnCounter = 0;
  }

  function getSlopes(kind) {
    const container = kind === 'up' ? el.upRows : el.dnRows;
    const rows = [];
    container.querySelectorAll('.slope-row').forEach((row) => {
      const inputs = row.querySelectorAll('input');
      if (inputs.length < 2) return;
      const start = parseFloat(inputs[0].value);
      const end = parseFloat(inputs[1].value);
      if (Number.isFinite(start) && Number.isFinite(end) && start < end) rows.push([start, end]);
    });
    return rows;
  }

  function getSelectedRarities() {
    if (activeRarity === 'all') return new Set(RARITY_VALUES);
    return new Set([Number(activeRarity)]);
  }

  function applyPreset() {
    const index = parseInt(el.presetSel.value, 10);
    if (!Number.isFinite(index)) return;
    const race = raceList[index];
    if (!race) return;

    el.distSel.value = String(race.distance || '');
    el.gtSel.value = String(race.gt || '');
    el.venueSel.value = race.venue || '';
    el.manLS.value = Number.isFinite(race.ls) ? String(race.ls) : '';
    el.manFC.value = Number.isFinite(race.fc) ? String(race.fc) : '';
    el.manFS.value = Number.isFinite(race.fs) ? String(race.fs) : '';

    clearSlopeRows();
    (race.us || []).forEach((pair) => addSlopeRow('up', pair[0], pair[1]));
    (race.ds || []).forEach((pair) => addSlopeRow('dn', pair[0], pair[1]));
  }

  function onDistanceChange() {
    const distance = parseInt(el.distSel.value, 10);
    if (!Number.isFinite(distance)) return;
    if (!el.manLS.value) el.manLS.value = String(Math.floor((distance * 2) / 3));
  }

  function calcUnc(skill) {
    let score = 0;
    (skill.rv || []).forEach((entry) => {
      if (!FIXED_RV_VARS.has(entry)) score += 4;
    });
    (skill.rr || []).forEach((entry) => {
      if (FIXED_RR_VARS.has(entry)) return;
      if (RR_WEAK_VARS.has(entry)) score += 1;
      else score += 2;
    });
    return score;
  }

  function humanizeUncertaintyKey(key) {
    return String(key || '')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function getUncertaintyFactorLabel(key) {
    const lang = getSiteLangKey();
    const map = UNCERTAINTY_FACTOR_LABELS[lang] || UNCERTAINTY_FACTOR_LABELS.en;
    return map[key] || UNCERTAINTY_FACTOR_LABELS.en[key] || humanizeUncertaintyKey(key);
  }

  function getUncertaintyBreakdown(skill) {
    const factors = [];

    (skill.rv || []).forEach((entry) => {
      if (FIXED_RV_VARS.has(entry)) return;
      factors.push({ key: entry, score: 4 });
    });

    (skill.rr || []).forEach((entry) => {
      if (FIXED_RR_VARS.has(entry)) return;
      factors.push({ key: entry, score: RR_WEAK_VARS.has(entry) ? 1 : 2 });
    });

    factors.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
    return factors;
  }

  function getUncertaintySummary(skill) {
    const factors = getUncertaintyBreakdown(skill);
    if (!factors.length) return t('uncNoRandom');
    const parts = factors.map((factor) => `+${factor.score} ${getUncertaintyFactorLabel(factor.key)}`);
    if (parts.length <= 2) return parts.join(', ');
    return `${parts.slice(0, 2).join(', ')} ${t('uncMore', { count: parts.length - 2 })}`;
  }

  function estimateReferenceSpeedAt1200(distance) {
    const raceDistance = Number.isFinite(distance) ? distance : 2000;
    const baseSpeed = 20 - (raceDistance - 2000) / 1000;
    const speedBonus = Math.sqrt(500 * 1200) * 0.002;
    const speed = baseSpeed + speedBonus;
    return Number.isFinite(speed) && speed > 0 ? speed : 20;
  }

  function getExpectedImpact(skill, raceContext) {
    const qty = Number(skill && skill.qty);
    if (!Number.isFinite(qty)) return { line1: '-', line2: '', cls: 'impact-na' };

    const accel = qty / 10000;
    if (accel === 0) return { line1: t('impactFlat'), line2: '', cls: 'impact-flat' };

    const rawDuration = Number(skill && skill.dur);
    const duration =
      Number.isFinite(rawDuration) && rawDuration > 0
        ? Math.max(0.1, Math.min(rawDuration / 10000, 10))
        : 3;
    const distanceDelta = 0.5 * accel * duration * duration;
    const referenceSpeed = estimateReferenceSpeedAt1200(
      raceContext && Number.isFinite(raceContext.distance) ? raceContext.distance : 2000
    );
    const seconds = Math.abs(distanceDelta / referenceSpeed);

    const vars = {
      meters: Math.abs(distanceDelta).toFixed(2),
      seconds: seconds.toFixed(3),
    };
    const positive = distanceDelta >= 0;
    return {
      line1: `${t('impactDistanceLabel')}: ${positive ? '+' : '-'}${vars.meters}m`,
      line2: `${t('impactTimeLabel')}: ~${vars.seconds}s ${t(
        positive ? 'impactGainShort' : 'impactLossShort'
      )}`,
      cls: positive ? 'impact-pos' : 'impact-neg',
    };
  }

  function getEffectSortBucket(skill) {
    const qty = Number(skill && skill.qty);
    if (!Number.isFinite(qty) || qty === 0) return 1;
    return qty < 0 ? 2 : 0;
  }

  function judgeOffset(offset, suffix) {
    const suffixText = suffix ? ` ${suffix}` : '';
    if (offset >= -50 && offset <= 0) {
      const label =
        offset === 0 ? 'Fastest (ls)' : `Fastest (${Math.abs(Math.round(offset))}m ahead)`;
      return { valid: true, cls: 'b-fast', label: `${label}${suffixText}`, pri: 0 };
    }
    if (offset > 0 && offset <= 100) {
      return {
        valid: true,
        cls: 'b-semi',
        label: `Semi-Fast (+${Math.round(offset)}m)${suffixText}`,
        pri: 1,
      };
    }
    if (offset < -50) {
      return {
        valid: false,
        cls: 'b-inv',
        label: `Invalid (Early ${Math.abs(Math.round(offset))}m ahead)${suffixText}`,
        pri: 90,
      };
    }
    return {
      valid: false,
      cls: 'b-inv',
      label: `Invalid (Delayed +${Math.round(offset)}m)${suffixText}`,
      pri: 91,
    };
  }

  function calcSegTiming(segment, raceContext) {
    const { ls, fc, fs, distance, us, ds } = raceContext;

    if (!segment) return { valid: false, cls: 'b-inv', label: 'Cannot Determine', pri: 99 };
    if (segment.type === 'always')
      return { valid: true, cls: 'b-always', label: 'Always Valid', pri: 2 };
    if (segment.type === 'exclude') return null;

    if (segment.type === 'fixed') {
      let fixedPoint = null;
      let suffix = '';

      switch (segment.fixed_point) {
        case 'ls':
          fixedPoint = ls;
          break;
        case 'finalcorner':
          if (fc == null)
            return { valid: true, cls: 'b-rand', label: 'Course info missing (fc not entered)', pri: 50 };
          fixedPoint = fc;
          suffix = fc < ls ? '(Mid-Phase Corner)' : '(Final-Phase Corner)';
          break;
        case 'finalstraight':
          if (fs == null)
            return { valid: true, cls: 'b-rand', label: 'Course info missing (fs not entered)', pri: 50 };
          fixedPoint = fs;
          break;
        case 'remain':
          fixedPoint = distance - segment.rv;
          break;
        case 'distance_rate':
          fixedPoint = Math.floor((distance * segment.rv) / 100);
          break;
        case 'phase2_corner':
          if (fc == null)
            return { valid: true, cls: 'b-rand', label: 'Course info missing (fc not entered)', pri: 50 };
          fixedPoint = fc >= ls ? fc : ls;
          suffix = fc >= ls ? '(Final Corner Entry)' : '(In Corner at ls)';
          break;
        case 'phase2_straight':
          if (fs == null)
            return { valid: true, cls: 'b-rand', label: 'Course info missing (fs not entered)', pri: 50 };
          fixedPoint = fs >= ls ? fs : ls;
          suffix = fs >= ls ? '(Final Straight Entry)' : '(In Straight at ls)';
          break;
        case 'phase2_front_straight':
          if (fc == null)
            return { valid: true, cls: 'b-rand', label: 'Course info missing (fc not entered)', pri: 50 };
          if (ls < fc) {
            fixedPoint = ls;
            suffix = '(Far Straight / Final Phase Entry)';
          } else {
            return {
              valid: false,
              cls: 'b-inv',
              label: 'No trigger (Far straight already passed before final phase)',
              pri: 94,
            };
          }
          break;
        case 'phase2_corner_nonfinal':
          return {
            valid: true,
            cls: 'b-rand',
            label: 'Course-dependent (Non-final corner in final phase)',
            pri: 24,
          };
        default:
          return { valid: false, cls: 'b-inv', label: 'Cannot Determine', pri: 99 };
      }

      if (fixedPoint == null) return { valid: false, cls: 'b-inv', label: 'Cannot Determine', pri: 99 };
      return judgeOffset(fixedPoint - ls, suffix);
    }

    if (segment.type === 'slope_up') {
      if (!us || !us.length)
        return { valid: true, cls: 'b-rand', label: 'Uphill (Slope data not entered)', pri: 40 };
      const onSlope = us.some((pair) => ls >= pair[0] && ls <= pair[1]);
      return onSlope
        ? { valid: true, cls: 'b-slope', label: 'Uphill (Valid)', pri: 10 }
        : { valid: false, cls: 'b-slopex', label: 'Uphill (Invalid)', pri: 92 };
    }

    if (segment.type === 'slope_down') {
      if (!ds || !ds.length)
        return { valid: true, cls: 'b-rand', label: 'Downhill (Slope data not entered)', pri: 41 };
      const onSlope = ds.some((pair) => ls >= pair[0] && ls <= pair[1]);
      return onSlope
        ? { valid: true, cls: 'b-slope', label: 'Downhill (Valid)', pri: 11 }
        : { valid: false, cls: 'b-slopex', label: 'Downhill (Invalid)', pri: 93 };
    }

    if (segment.type === 'slope_up_later_half') {
      if (!us || !us.length)
        return { valid: true, cls: 'b-rand', label: 'Uphill / Latter Half (Not entered)', pri: 40 };
      const atLs = us.some((pair) => ls >= pair[0] && ls <= pair[1]);
      if (atLs) return { valid: true, cls: 'b-slope', label: 'Uphill / Latter Half (Valid)', pri: 10 };
      const intersectsLater = us.some((pair) => pair[1] > ls);
      if (intersectsLater)
        return { valid: true, cls: 'b-rand', label: 'Uphill / Latter Half (Random)', pri: 25 };
      return { valid: false, cls: 'b-slopex', label: 'Uphill / Latter Half (Invalid)', pri: 92 };
    }

    if (segment.type === 'random') {
      const subtype = segment.subtype;
      const rv = segment.rv;
      if (subtype === 'remain_range') {
        const remainAtLs = distance - ls;
        if (remainAtLs >= rv) {
          return {
            valid: true,
            cls: 'b-fast',
            label: `Fastest (Remaining ${Math.round(remainAtLs)}m>=${rv}m at ls)`,
            pri: 0,
          };
        }
        const triggerPoint = distance - rv;
        const base = judgeOffset(triggerPoint - ls);
        base.label = base.label
          .replace('Fastest', `Fastest (Remaining ${rv}m cond.)`)
          .replace('Semi-Fast', `Semi-Fast (Remaining ${rv}m cond.)`);
        return base;
      }

      if (subtype === 'remain_lte') {
        const triggerPoint = distance - rv;
        const base = judgeOffset(triggerPoint - ls);
        base.label = base.label
          .replace('Fastest', `Fastest (<=${rv}m remaining)`)
          .replace('Semi-Fast', `Semi-Fast (<=${rv}m remaining)`);
        return base;
      }

      const map = {
        fq: { label: 'Random Valid (First Quarter of Final)', pri: 20 },
        fh: { label: 'Random Valid (First Half of Final)', pri: 21 },
        phase2: { label: 'Random Valid (Entire Final Phase)', pri: 22 },
        finalcorner_random: { label: 'Random Valid (Final Corner)', pri: 23 },
        finalcorner_lh: { label: 'Random Valid (Final Corner Latter Half)', pri: 24 },
        phase_corner: { label: 'Random Valid (Final Phase Corner)', pri: 23 },
        phase_straight: { label: 'Random Valid (Final Phase Straight)', pri: 24 },
        all_corner: { label: 'Random Valid (Corner)', pri: 25 },
        straight_random: { label: 'Random Valid (Straight)', pri: 26 },
        after50: { label: 'Random Valid (After 50%)', pri: 27 },
        dist_rate_after: { label: 'Random Valid (Latter Half)', pri: 27 },
        dist_rate_after_rand: { label: 'Random Valid (Latter Half)', pri: 27 },
        lh: { label: 'Random Valid (Mid-Phase Latter Half)', pri: 29 },
        phase_latter_straight: { label: 'Random Valid (Final Latter Half Straight)', pri: 24 },
        other: { label: 'Random Valid (Other)', pri: 35 },
      };
      const info = map[subtype];
      if (info) return { valid: true, cls: 'b-rand', label: info.label, pri: info.pri };
      return { valid: true, cls: 'b-rand', label: 'Random Valid', pri: 36 };
    }

    return { valid: false, cls: 'b-inv', label: 'Cannot Determine', pri: 99 };
  }

  function calcResult(skill, raceContext) {
    const segments = Array.isArray(skill.segs) && skill.segs.length ? skill.segs : [skill.tm];
    let best = null;
    segments.forEach((segment) => {
      const result = calcSegTiming(segment, raceContext);
      if (result == null) return;
      if (!best || result.pri < best.pri) best = result;
    });
    if (!best) return { valid: false, cls: 'b-inv', label: 'Excluded Skill', pri: 99 };
    return best;
  }

  function getSkillMeta(skill) {
    return skillMetaByJP.get(normalize(skill.n)) || null;
  }

  function isGlobalSkill(skill) {
    if (!metadataLoaded) return false;
    const meta = getSkillMeta(skill);
    return Boolean(meta && meta.isGlobal);
  }

  function passesServerFilter(skill) {
    if (getServerMode() === 'jp') return true;
    return isGlobalSkill(skill);
  }

  function getDisplaySkillName(skill) {
    const meta = getSkillMeta(skill);
    if (!meta) return skill.n || '';
    if (getSiteLanguage() === 'jp') return meta.jpName || skill.n || '';
    return meta.officialEn || meta.enName || meta.jpName || skill.n || '';
  }

  function matchesSkillQuery(skill, query) {
    if (!query) return true;
    const meta = getSkillMeta(skill);
    const fields = [skill.n, skill.e];
    if (meta) {
      fields.push(meta.jpName, meta.enName, meta.officialEn, meta.jpDesc, meta.enDesc);
    }
    return fields.some((value) => normalize(value).includes(query));
  }

  function matchesFilters(skill, context) {
    const { dist, dt, gt, gc, mv, trackIds, raritySet, query } = context;

    if (Array.isArray(skill.segs) && skill.segs.length) {
      const hasNonExcluded = skill.segs.some((segment) => segment.type !== 'exclude');
      if (!hasNonExcluded) return false;
    } else if (skill.tm && skill.tm.type === 'exclude') {
      return false;
    }

    if (Array.isArray(skill.dt) && skill.dt.length && !skill.dt.includes(dt)) return false;
    if (Array.isArray(skill.gt) && skill.gt.length && !skill.gt.includes(gt)) return false;
    if (Array.isArray(skill.gc) && skill.gc.length && !skill.gc.includes(gc)) return false;
    if (mv !== null && skill.mv && mv < skill.mv) return false;
    if (
      Array.isArray(skill.track) &&
      skill.track.length &&
      !skill.track.some((track) => trackIds.includes(track))
    ) {
      return false;
    }
    if (skill.cd_ge != null && dist < skill.cd_ge) return false;
    if (skill.cd_le != null && dist > skill.cd_le) return false;
    if (Array.isArray(skill.cd_eq) && skill.cd_eq.length && !skill.cd_eq.includes(dist)) return false;

    const rawRarity = skill.rar || 1;
    const normalizedRarity = rawRarity === 5 ? 4 : rawRarity;
    if (!raritySet.has(normalizedRarity)) return false;

    if (!matchesSkillQuery(skill, query)) return false;
    return true;
  }

  function rankDisplay(raw) {
    if (!raw) return { cr: '-', lr: '-' };
    const segments = String(raw).split('@');
    const champRanks = new Set();
    const lohRanks = new Set();

    segments.forEach((segment) => {
      const le = segment.match(/order_rate<=(\d+)/);
      const ge = segment.match(/order_rate>=(\d+)/);
      const ltStrict = segment.match(/order_rate<(\d+)/);
      const gtStrict = segment.match(/order_rate>(\d+)/);
      const eqOrder = segment.match(/\border==(\d+)\b/);
      const leOrder = segment.match(/\border<=(\d+)\b/);

      if (eqOrder) {
        champRanks.add(`#${eqOrder[1]}`);
        lohRanks.add(`#${eqOrder[1]}`);
        return;
      }
      if (leOrder) {
        champRanks.add(`${t('rankTop')} ${leOrder[1]}`);
        lohRanks.add(`${t('rankTop')} ${leOrder[1]}`);
        return;
      }
      if (le && ge) {
        const lo = parseInt(ge[1], 10);
        const hi = parseInt(le[1], 10);
        champRanks.add(`#${Math.ceil((lo / 100) * 9)}-${Math.ceil((hi / 100) * 9)}`);
        lohRanks.add(`#${Math.ceil((lo / 100) * 12)}-${Math.ceil((hi / 100) * 12)}`);
        return;
      }
      if (le) {
        const value = parseInt(le[1], 10);
        champRanks.add(`${t('rankTop')} ${Math.ceil((value / 100) * 9)}`);
        lohRanks.add(`${t('rankTop')} ${Math.ceil((value / 100) * 12)}`);
        return;
      }
      if (ge) {
        const value = parseInt(ge[1], 10);
        const champ = 9 - Math.floor((value / 100) * 9);
        const loh = 12 - Math.floor((value / 100) * 12);
        if (champ > 0) champRanks.add(`#${champ}+`);
        if (loh > 0) lohRanks.add(`#${loh}+`);
        return;
      }
      if (ltStrict) {
        const value = parseInt(ltStrict[1], 10);
        const champ = Math.ceil(((value - 1) / 100) * 9);
        const loh = Math.ceil(((value - 1) / 100) * 12);
        if (champ > 0) champRanks.add(`${t('rankTop')} ${champ}`);
        if (loh > 0) lohRanks.add(`${t('rankTop')} ${loh}`);
        return;
      }
      if (gtStrict) {
        const value = parseInt(gtStrict[1], 10);
        const champ = 9 - Math.floor((value / 100) * 9);
        const loh = 12 - Math.floor((value / 100) * 12);
        if (champ > 0) champRanks.add(`#${champ}+`);
        if (loh > 0) lohRanks.add(`#${loh}+`);
      }
    });

    return {
      cr: champRanks.size ? Array.from(champRanks).join(' / ') : '-',
      lr: lohRanks.size ? Array.from(lohRanks).join(' / ') : '-',
    };
  }

  function renderEmptyState() {
    el.resBody.innerHTML = `<div class="accel-empty">${escapeHtml(t('emptyPrompt'))}</div>`;
  }

  function renderRows(rows, raceContext) {
    if (!rows.length) {
      el.resBody.innerHTML = `<div class="accel-nores">${escapeHtml(t('noMatch'))}</div>`;
      return;
    }

    const rarityInfo = {
      1: { cls: 'rar-w', label: t('rarityWhite') },
      2: { cls: 'rar-g', label: t('rarityGold') },
      3: { cls: 'rar-ub', label: t('raritySubUnique') },
      4: { cls: 'rar-u', label: t('rarityUnique') },
      5: { cls: 'rar-u', label: t('rarityUnique') },
      6: { cls: 'rar-e', label: t('rarityEvolution') },
    };

    function uncInfo(uncertainty) {
      if (uncertainty === 0) return { cls: 'u-zero', label: t('uncCertain') };
      if (uncertainty <= 2) return { cls: 'u-low', label: t('uncLow') };
      if (uncertainty <= 4) return { cls: 'u-mid', label: t('uncMedium') };
      if (uncertainty <= 6) return { cls: 'u-high', label: t('uncHigh') };
      return { cls: 'u-vhigh', label: t('uncHighest') };
    }

    let html = `<div class="sort-bar">${escapeHtml(t('sortHint'))}</div>`;
    html += '<div class="accel-table-wrap"><table class="accel-table"><thead><tr>';
    html += `<th>${escapeHtml(t('colSkillName'))}</th>`;
    html += `<th>${escapeHtml(t('colRarity'))}</th>`;
    html += `<th>${escapeHtml(t('colEffectValue'))}</th>`;
    html += `<th>${escapeHtml(t('colExpectedImpact'))}</th>`;
    html += `<th>${escapeHtml(t('colPositionCondition'))}</th>`;
    html += `<th>${escapeHtml(t('colTiming'))}</th>`;
    html += `<th>${escapeHtml(t('colUncertainty'))}</th>`;
    html += '</tr></thead><tbody>';

    rows.forEach((row) => {
      const uncertainty = calcUnc(row);
      const uncertaintyInfo = uncInfo(uncertainty);
      const rarity = rarityInfo[row.rar] || rarityInfo[1];
      const value = row.qty != null ? (row.qty / 10000).toFixed(2) : '-';
      const displayName = getDisplaySkillName(row);
      const canShowAltName = getServerMode() === 'jp';
      const hasAltName = canShowAltName && displayName && row.n && displayName !== row.n;
      const altName = getSiteLanguage() === 'jp' ? (getSkillMeta(row) || {}).enName : row.n;

      const hasOrderRule = /\border(?:_rate)?[=<>!]/.test(row.raw || '');
      let rank = { cr: '-', lr: '-' };
      if (hasOrderRule) rank = rankDisplay(row.raw);
      const impact = getExpectedImpact(row, raceContext);

      html += `<tr class="${row.res.valid ? '' : 'invalid'}">`;
      html += '<td>';
      html += `<span class="skill-name skill-name-popup" data-skill-name="${escapeAttr(row.n || '')}" tabindex="0" role="button">${escapeHtml(displayName || row.n || '-')}</span>`;
      if (hasAltName && altName) {
        html += `<div class="skill-alt-name">${escapeHtml(altName)}</div>`;
      }
      html += '</td>';
      html += `<td><span class="rar-badge ${rarity.cls}">${escapeHtml(rarity.label)}</span></td>`;
      html += `<td class="value-col">${escapeHtml(value)}</td>`;
      html += `<td class="impact-col"><div class="impact-lines"><div class="impact-line impact-main ${escapeHtml(
        impact.cls
      )}">${escapeHtml(impact.line1)}</div>${
        impact.line2
          ? `<div class="impact-line impact-sub">${escapeHtml(impact.line2)}</div>`
          : ''
      }</div></td>`;
      html += '<td class="rank-col"><div class="pos-lines">';
      html += `<div class="pos-line"><span class="pos-tag">${escapeHtml(t('posCm'))}</span><span class="pos-val">${escapeHtml(rank.cr)}</span></div>`;
      html += `<div class="pos-line"><span class="pos-tag">${escapeHtml(t('posLoh'))}</span><span class="pos-val">${escapeHtml(rank.lr)}</span></div>`;
      html += '</div></td>';
      html += `<td><span class="timing-badge ${row.res.cls}">${escapeHtml(row.res.label)}</span></td>`;
      html += '<td><div class="unc-wrap">';
      html += `<span class="unc-badge ${uncertaintyInfo.cls}">${escapeHtml(`${uncertaintyInfo.label} (${uncertainty})`)}</span>`;
      html += `<div class="unc-why">${escapeHtml(getUncertaintySummary(row))}</div>`;
      html += '</div></td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    el.resBody.innerHTML = html;
  }

  function updateSummary(rows) {
    const validCount = rows.filter((row) => row.res.valid).length;
    el.resCnt.textContent = String(validCount);
    el.resTot.textContent = t('outOf', { count: rows.length });
  }

  function updateServerAndDbInfo() {
    const filtered = accelSkillDb.filter((skill) => passesServerFilter(skill)).length;
    el.dbCnt.textContent = String(filtered);
    el.serverMode.textContent = getServerMode() === 'jp' ? t('serverJp') : t('serverGlobal');
  }

  function updateChips(distance, dt, gt, gc, mv, venue, raceContext) {
    const chips = [];
    chips.push(`${distance}m (${labelBy(DIST_LABEL, dt)})`);
    chips.push(labelBy(TRACK_LABEL, gt));
    chips.push(labelBy(CONDITION_LABEL, gc));
    if (mv != null) chips.push(labelBy(MOOD_LABEL, mv));
    chips.push(venueLabel(venue));
    if (raceContext.name) chips.push(raceContext.name);
    chips.push(`ls=${Math.round(raceContext.ls)}m`);
    if (raceContext.fc != null) chips.push(`fc=${Math.round(raceContext.fc)}m`);
    if (raceContext.fs != null) chips.push(`fs=${Math.round(raceContext.fs)}m`);

    el.chips.innerHTML = chips.map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`).join('');
  }

  function updateWarning(rows, raceContext) {
    const needsFc = rows.some((row) =>
      (row.segs || [row.tm]).some((segment) => segment && segment.fixed_point === 'finalcorner')
    );
    const needsFs = rows.some((row) =>
      (row.segs || [row.tm]).some(
        (segment) =>
          segment &&
          (segment.fixed_point === 'finalstraight' || segment.subtype === 'finalstraight')
      )
    );
    const shouldWarn = (needsFc && raceContext.fc == null) || (needsFs && raceContext.fs == null);
    el.warnBox.hidden = !shouldWarn;
  }

  function doSearch(options) {
    const settings = options || {};
    const silent = Boolean(settings.silent);
    hideFormError();
    if (getServerMode() === 'en' && !metadataLoaded) {
      if (!silent) showFormError(t('skillMetaMissingError'));
      return false;
    }

    const distance = parseInt(el.distSel.value, 10);
    const gt = parseInt(el.gtSel.value, 10);
    const gc = parseInt(el.gcSel.value, 10);
    const moodRaw = el.mvSel.value;
    const mood = moodRaw === '' ? null : parseInt(moodRaw, 10);
    const venue = el.venueSel.value;
    const query = normalize(el.skillSearch.value);
    const raritySet = getSelectedRarities();

    if (!Number.isFinite(distance) || !Number.isFinite(gt) || !Number.isFinite(gc) || !venue) {
      if (!silent) showFormError(t('requiredError'));
      return false;
    }

    const dt = getDistType(distance);
    const trackIds = venueTracks[venue] || [];
    const manualLs = parseFloat(el.manLS.value);
    const manualFc = parseFloat(el.manFC.value);
    const manualFs = parseFloat(el.manFS.value);
    const ups = getSlopes('up');
    const downs = getSlopes('dn');

    const presetIndex = parseInt(el.presetSel.value, 10);
    const presetRace = Number.isFinite(presetIndex) ? raceList[presetIndex] || {} : {};

    const raceContext = {
      distance: distance,
      ls: Number.isFinite(manualLs) ? manualLs : presetRace.ls || Math.floor((distance * 2) / 3),
      fc: Number.isFinite(manualFc) ? manualFc : Number.isFinite(presetRace.fc) ? presetRace.fc : null,
      fs: Number.isFinite(manualFs) ? manualFs : Number.isFinite(presetRace.fs) ? presetRace.fs : null,
      us: ups.length ? ups : presetRace.us || [],
      ds: downs.length ? downs : presetRace.ds || [],
      gt: gt,
      venue: venue,
      name: raceNameLabel(presetRace),
    };

    const context = { dist: distance, dt, gt, gc, mv: mood, trackIds, raritySet, query };

    const rows = [];
    accelSkillDb.forEach((skill) => {
      if (!passesServerFilter(skill)) return;
      if (!matchesFilters(skill, context)) return;
      const result = calcResult(skill, raceContext);
      rows.push({ ...skill, res: result });
    });

    rows.sort((a, b) => {
      const aEffectBucket = getEffectSortBucket(a);
      const bEffectBucket = getEffectSortBucket(b);
      if (aEffectBucket !== bEffectBucket) return aEffectBucket - bEffectBucket;
      if (a.res.pri !== b.res.pri) return a.res.pri - b.res.pri;
      const aUnc = calcUnc(a);
      const bUnc = calcUnc(b);
      if (aUnc !== bUnc) return aUnc - bUnc;
      if ((b.qty || 0) !== (a.qty || 0)) return (b.qty || 0) - (a.qty || 0);
      return (a.n || '').localeCompare(b.n || '', 'ja');
    });

    const finalRows = rows.filter((row) => passesServerFilter(row));
    lastRows = finalRows;
    updateSummary(finalRows);
    updateChips(distance, dt, gt, gc, mood, venue, raceContext);
    updateWarning(finalRows, raceContext);
    renderRows(finalRows, raceContext);
    return true;
  }

  function resetAll() {
    el.presetSel.value = '';
    el.distSel.value = '';
    el.gtSel.value = '';
    el.gcSel.value = '';
    el.venueSel.value = '';
    el.mvSel.value = '';
    el.skillSearch.value = '';
    el.manLS.value = '';
    el.manFC.value = '';
    el.manFS.value = '';
    setActiveRarity('all');
    clearSlopeRows();
    hideFormError();
    el.warnBox.hidden = true;
    el.chips.innerHTML = '';
    el.resCnt.textContent = '-';
    el.resTot.textContent = '';
    lastRows = null;
    renderEmptyState();
  }

  function hasOfficialEnglishName(source) {
    return Boolean(source && source.name_en && String(source.name_en).trim());
  }

  function buildMetaEntry(source, isGlobal) {
    if (!source || !source.jpname) return null;
    return {
      jpName: source.jpname || '',
      enName: source.enname || source.name_en || source.name || source.jpname || '',
      officialEn: source.name_en || '',
      jpDesc: source.jpdesc || '',
      enDesc: source.desc_en || source.endesc || '',
      isGlobal: Boolean(isGlobal),
    };
  }

  function buildSkillMetaIndex(rawList) {
    skillMetaByJP.clear();
    skillIdByJP.clear();
    officialSkillIds.clear();

    rawList.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      if (entry.id != null && entry.jpname) {
        skillIdByJP.set(normalize(entry.jpname), String(entry.id));
      }
      if (entry.id != null && hasOfficialEnglishName(entry)) {
        officialSkillIds.add(String(entry.id));
      }
      const gene = entry.gene_version;
      if (gene && typeof gene === 'object') {
        if (gene.id != null && gene.jpname) {
          skillIdByJP.set(normalize(gene.jpname), String(gene.id));
        }
        if (gene.id != null && hasOfficialEnglishName(gene)) {
          officialSkillIds.add(String(gene.id));
        }
      }
    });

    rawList.forEach((entry) => {
      const baseId = entry && entry.jpname ? skillIdByJP.get(normalize(entry.jpname)) : null;
      const base = buildMetaEntry(entry, baseId && officialSkillIds.has(baseId));
      if (base) skillMetaByJP.set(normalize(base.jpName), base);
      if (entry && entry.gene_version) {
        const geneId = entry.gene_version.jpname
          ? skillIdByJP.get(normalize(entry.gene_version.jpname))
          : null;
        const gene = buildMetaEntry(
          entry.gene_version,
          geneId && officialSkillIds.has(geneId)
        );
        if (gene) skillMetaByJP.set(normalize(gene.jpName), gene);
      }
    });
  }

  function getJsonCandidates(fileName) {
    return [`/assets/${fileName}`, `./assets/${fileName}`, `assets/${fileName}`];
  }

  function isStartTimingSkill(entry) {
    return entry.raw === 'always==1' && (entry.dur === 0 || entry.dur == null);
  }

  function setAccelSkillDb(rawList) {
    accelSkillDb.splice(0, accelSkillDb.length);
    if (!Array.isArray(rawList)) return;
    rawList.forEach((entry) => {
      if (!entry || !entry.n) return;
      if (metadataLoaded && !skillMetaByJP.has(normalize(entry.n))) return;
      if (isStartTimingSkill(entry)) return;
      accelSkillDb.push(entry);
    });
  }

  async function loadSkillMetadata() {
    const candidates = getJsonCandidates('skills_all.json');
    for (let i = 0; i < candidates.length; i += 1) {
      try {
        const response = await fetch(candidates[i], { cache: 'no-cache' });
        if (!response.ok) continue;
        const data = await response.json();
        if (!Array.isArray(data) || !data.length) continue;
        buildSkillMetaIndex(data);
        metadataLoaded = true;
        return true;
      } catch {
        /* try next source */
      }
    }
    metadataLoaded = false;
    return false;
  }

  async function loadAccelSkillData() {
    skillDataLoaded = false;
    const skillCandidates = getJsonCandidates('accel_skills_compat.json');
    for (let i = 0; i < skillCandidates.length; i += 1) {
      try {
        const response = await fetch(skillCandidates[i], { cache: 'no-cache' });
        if (!response.ok) continue;
        const data = await response.json();
        if (!Array.isArray(data) || !data.length) continue;
        setAccelSkillDb(data);
        skillDataLoaded = true;
        break;
      } catch {
        /* try next source */
      }
    }

    return skillDataLoaded;
  }

  function refreshForLanguageOrServerChange() {
    applyStaticCopy();
    rerenderStaticSelectors();
    updateServerAndDbInfo();
    if (lastRows !== null) {
      const reran = doSearch({ silent: true });
      if (!reran) {
        lastRows = null;
        el.chips.innerHTML = '';
        el.resCnt.textContent = '-';
        el.resTot.textContent = '';
        renderEmptyState();
      }
    } else {
      renderEmptyState();
    }
    if (getServerMode() === 'en' && !metadataLoaded) {
      showFormError(t('skillMetaMissingError'));
    }
  }

  function wireEvents() {
    el.presetSel.addEventListener('change', () => applyPreset());
    el.distSel.addEventListener('change', () => onDistanceChange());
    el.addUpBtn.addEventListener('click', () => addSlopeRow('up'));
    el.addDnBtn.addEventListener('click', () => addSlopeRow('dn'));
    el.searchBtn.addEventListener('click', () => doSearch());
    el.resetBtn.addEventListener('click', () => resetAll());
    if (el.rarityFilters) {
      el.rarityFilters.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const button = target.closest('.accel-rarity-btn');
        if (!button) return;
        setActiveRarity(button.dataset.rarity || 'all');
        if (lastRows !== null) doSearch({ silent: true });
      });
    }

    el.upRows.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.action !== 'remove-slope') return;
      const row = target.closest('.slope-row');
      if (row) row.remove();
    });
    el.dnRows.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.action !== 'remove-slope') return;
      const row = target.closest('.slope-row');
      if (row) row.remove();
    });

    const debouncedSearchFilter = debounce(() => {
      if (lastRows !== null) doSearch({ silent: true });
    }, 140);

    el.skillSearch.addEventListener('input', () => {
      debouncedSearchFilter();
    });

    el.skillSearch.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        doSearch();
      }
    });

    window.addEventListener('umatools:server-change', () => {
      refreshForLanguageOrServerChange();
    });
    window.addEventListener('umatools:site-language-change', () => {
      refreshForLanguageOrServerChange();
    });
    window.addEventListener('i18n:changed', () => {
      refreshForLanguageOrServerChange();
    });
  }

  async function init() {
    const racesLoaded = await loadRaceData();
    buildVenueAndPresetIndexes();
    applyStaticCopy();
    rerenderStaticSelectors();
    setActiveRarity('all');
    wireEvents();
    renderEmptyState();
    if (!racesLoaded) showFormError(t('raceDataMissingError'));

    const metaLoaded = await loadSkillMetadata();
    const skillsLoaded = await loadAccelSkillData();
    if (!metaLoaded && getServerMode() === 'en') showFormError(t('skillMetaMissingError'));
    if (!skillsLoaded) showFormError(t('skillDataMissingError'));
    updateServerAndDbInfo();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
    });
  } else {
    init();
  }
})();
