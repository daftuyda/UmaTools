// Skill Optimizer Page Script
// Loads skills from JSON or CSV, lets you select purchasable skills with costs,
// and maximizes total score under a budget with gold cost and mutual-exclusion constraints.

(function () {
  function attrEsc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  const rowsEl = document.getElementById('rows');
  const addRowBtn = document.getElementById('add-row');
  const optimizeBtn = document.getElementById('optimize');
  const clearAllBtn = document.getElementById('clear-all');
  const budgetInput = document.getElementById('budget');
  const fastLearnerToggle = document.getElementById('fast-learner');
  const officialEnglishToggle = document.getElementById('official-en-only');
  const optimizeModeSelect = document.getElementById('optimize-mode');
  const libStatus = document.getElementById('lib-status');
  if (libStatus)
    libStatus.innerHTML =
      '<span class="loading-indicator">' + t('optimizer.loadingSkills') + '</span>';

  const resultsEl = document.getElementById('results');
  const bestScoreEl = document.getElementById('best-score');
  const usedPointsEl = document.getElementById('used-points');
  const totalPointsEl = document.getElementById('total-points');
  const remainingPointsEl = document.getElementById('remaining-points');
  const selectedListEl = document.getElementById('selected-list');
  const aptitudeScorePill = document.getElementById('aptitude-score-pill');
  const aptitudeScoreEl = document.getElementById('aptitude-score');
  const teamConsistencyPill = document.getElementById('team-consistency-pill');
  const teamConsistencyEl = document.getElementById('team-consistency');
  const teamExpectedPill = document.getElementById('team-expected-pill');
  const teamExpectedEl = document.getElementById('team-expected');
  const teamSVPill = document.getElementById('team-sv-pill');
  const teamSVEl = document.getElementById('team-sv');
  const teamActivationsPill = document.getElementById('team-activations-pill');
  const teamActivationsEl = document.getElementById('team-activations');
  const teamSVPerSPPill = document.getElementById('team-sv-per-sp-pill');
  const teamSVPerSPEl = document.getElementById('team-sv-per-sp');
  const teamDensityPill = document.getElementById('team-density-pill');
  const teamDensityEl = document.getElementById('team-density');
  const teamPredictedScorePill = document.getElementById('team-predicted-score-pill');
  const teamPredictedScoreEl = document.getElementById('team-predicted-score');
  const teamExplainPanel = document.getElementById('team-explain-panel');
  const teamExplainStrengthsEl = document.getElementById('team-explain-strengths');
  const teamExplainRisksEl = document.getElementById('team-explain-risks');
  const teamWarningsEl = document.getElementById('team-warnings');
  const autoBuildBtn = document.getElementById('auto-build-btn');
  const autoTargetInputs = document.querySelectorAll('input[name="auto-target"]');
  const autoBuilderStatus = document.getElementById('auto-builder-status');
  const saveBuildBtn = document.getElementById('save-build');
  const shareBuildBtn = document.getElementById('share-build');
  const viewBuildsBtn = document.getElementById('view-builds');

  const saveBuildModal = document.getElementById('save-build-modal');
  const saveBuildNameInput = document.getElementById('save-build-name');
  const saveBuildDescInput = document.getElementById('save-build-description');
  const saveModalClose = document.getElementById('save-modal-close');
  const saveModalCancel = document.getElementById('save-modal-cancel');
  const saveModalSave = document.getElementById('save-modal-save');

  const buildsListModal = document.getElementById('builds-list-modal');
  const buildsListContainer = document.getElementById('builds-list-container');
  const buildsListModalClose = document.getElementById('builds-list-modal-close');
  const buildsListModalCloseBtn = document.getElementById('builds-list-modal-close-btn');

  const skillBrowserBackdrop = document.getElementById('skill-browser-backdrop');
  const skillBrowserClose = document.getElementById('skill-browser-close');
  const skillBrowserCancel = document.getElementById('skill-browser-cancel');
  const skillBrowserAdd = document.getElementById('skill-browser-add');
  const skillBrowserSearch = document.getElementById('skill-browser-search');
  const skillBrowserGrid = document.getElementById('skill-browser-grid');
  const skillBrowserCount = document.getElementById('skill-browser-count');
  const skillBrowserSelectedCount = document.getElementById('skill-browser-selected-count');
  const skillBrowserColorChips = document.getElementById('skill-browser-color-chips');
  const skillBrowserTypeChips = document.getElementById('skill-browser-type-chips');
  const browseSkillsBtn = document.getElementById('browse-skills-btn');

  const ratingInputs = {
    speed: document.getElementById('stat-speed'),
    stamina: document.getElementById('stat-stamina'),
    power: document.getElementById('stat-power'),
    guts: document.getElementById('stat-guts'),
    wisdom: document.getElementById('stat-wisdom'),
    star: document.getElementById('star-level'),
    unique: document.getElementById('unique-level'),
  };
  const ratingDisplays = {
    stats: document.getElementById('rating-stats-score'),
    skills: document.getElementById('rating-skills-score'),
    unique: document.getElementById('rating-unique-bonus'),
    total: document.getElementById('rating-total'),
    badgeSprite: document.getElementById('rating-badge-sprite'),
    floatTotal: document.getElementById('rating-float-total'),
    floatBadgeSprite: document.getElementById('rating-float-badge-sprite'),
    nextLabel: document.getElementById('rating-next-label'),
    nextNeeded: document.getElementById('rating-next-needed'),
    progressFill: document.getElementById('rating-progress-fill'),
    progressBar: document.getElementById('rating-progress-bar'),
    floatNextLabel: document.getElementById('rating-float-next-label'),
    floatNextNeeded: document.getElementById('rating-float-next-needed'),
    floatProgressFill: document.getElementById('rating-float-progress-fill'),
    floatProgressBar: document.getElementById('rating-float-progress-bar'),
  };

  // Race config selects (mirroring main page)
  const cfg = {
    turf: document.getElementById('cfg-turf'),
    dirt: document.getElementById('cfg-dirt'),
    sprint: document.getElementById('cfg-sprint'),
    mile: document.getElementById('cfg-mile'),
    medium: document.getElementById('cfg-medium'),
    long: document.getElementById('cfg-long'),
    front: document.getElementById('cfg-front'),
    pace: document.getElementById('cfg-pace'),
    late: document.getElementById('cfg-late'),
    end: document.getElementById('cfg-end'),
  };

  const { normalize, updateAffinityStyles, getBucketForSkill, evaluateSkillScore } =
    RatingShared.createAffinityHelpers(cfg);
  const ratingEngine = RatingShared.createRatingEngine({
    ratingInputs,
    ratingDisplays,
    onChange: () => saveState(),
  });

  let skillsByCategory = {}; // category -> [{ name, score, checkType }]
  let categories = [];
  const preferredOrder = ['golden', 'yellow', 'blue', 'green', 'red', 'purple', 'evo', 'ius'];
  let skillIndex = new Map(); // normalized name -> { name, score, checkType, category }
  let skillLookupLoose = new Map(); // punctuation-insensitive lookup key -> skill
  let skillIdIndex = new Map(); // id string -> skill object
  let evosByParentName = new Map(); // normalized parent name -> [evo skill objects]
  let _restoringState = false; // suppress save/optimize during state restoration
  let _initComplete = false; // prevent saves before state is loaded
  let allSkillNames = [];
  let allSkillNamesNormalized = []; // pre-normalized for fast datalist filtering
  let datalistPrefix1Index = new Map(); // first-char prefix -> [name indexes]
  let datalistPrefix2Index = new Map(); // first-2-char prefix -> [name indexes]
  const MAX_SKILL_SUGGESTIONS = 80;
  const MAX_SKILL_SUGGESTIONS_WITH_PREFIX = 15;
  const DATALIST_CACHE_MAX_KEYS = 120;

  // Performance optimization: track active skill keys for O(1) duplicate detection
  const activeSkillKeys = new Map(); // skillKey -> rowId

  // Performance optimization: shared datalist for all skill inputs
  let sharedSkillDatalist = null;
  let datalistSuggestionCache = new Map();
  let lastDatalistPrefix = null;
  let skillLibraryRevision = 0;
  const HINT_DISCOUNT_STEP = 0.1;
  const HINT_DISCOUNTS = { 0: 0.0, 1: 0.1, 2: 0.2, 3: 0.3, 4: 0.35, 5: 0.4 };
  const HINT_LEVELS = [0, 1, 2, 3, 4, 5];
  const OFFICIAL_EN_PREF_KEY = 'optimizerOfficialEnglishOnly';
  const SERVER_PREF_KEY = 'umatoolsServer';

  if (officialEnglishToggle) {
    try {
      const saved = localStorage.getItem(OFFICIAL_EN_PREF_KEY);
      if (saved === '0' || saved === 'false') {
        officialEnglishToggle.checked = false;
      } else if (saved === '1' || saved === 'true') {
        officialEnglishToggle.checked = true;
      }
    } catch {}
  }
  updateOfficialEnglishToggleState();

  function getFastLearnerDiscount() {
    return fastLearnerToggle && fastLearnerToggle.checked ? 0.1 : 0;
  }

  function getOptimizeMode() {
    return optimizeModeSelect ? optimizeModeSelect.value : 'rating';
  }

  function getOptimizeModeLabel(mode) {
    if (mode === TEAM_TRIALS_MODE) return t('optimizer.optTeamTrials');
    if (mode === 'aptitude-test') return t('optimizer.optAptitudeTest');
    return t('optimizer.optRating');
  }

  function getRaceConfigSnapshot() {
    const snapshot = {};
    Object.entries(cfg).forEach(([k, el]) => {
      snapshot[k] = el ? el.value : '';
    });
    return snapshot;
  }

  // Trainer Aptitude Test scoring: normal skills = 400, gold/rare skills = 1200
  // Lower skills for gold combos don't count toward aptitude score
  const APTITUDE_TEST_SCORE_NORMAL = 400;
  const APTITUDE_TEST_SCORE_GOLD = 1200;

  function getAptitudeTestScore(category, isLowerForGold = false) {
    if (isLowerForGold) return 0; // Lower skills don't count
    return isGoldCategory(category) ? APTITUDE_TEST_SCORE_GOLD : APTITUDE_TEST_SCORE_NORMAL;
  }

  function getEffectiveRatingScore(skill, categoryOverride = '') {
    const rawScore = evaluateSkillScore(skill || {});
    if (!Number.isFinite(rawScore)) return 0;
    const canon = canonicalCategory(categoryOverride || skill?.category || '');
    // Purple debuffs remove rating when left unpurchased; buying them removes the penalty.
    if (canon === 'purple') return 0;
    return rawScore;
  }

  function getPurplePenaltyValue(skill, categoryOverride = '') {
    const rawScore = evaluateSkillScore(skill || {});
    if (!Number.isFinite(rawScore)) return 0;
    const canon = canonicalCategory(categoryOverride || skill?.category || '');
    if (canon !== 'purple') return 0;
    return rawScore < 0 ? Math.abs(rawScore) : 0;
  }

  function getTotalPurplePenalty(items) {
    return (items || []).reduce((sum, it) => sum + (Number(it?.purplePenalty) || 0), 0);
  }

  function getHintDiscountPct(lvl) {
    const discount = Object.prototype.hasOwnProperty.call(HINT_DISCOUNTS, lvl)
      ? HINT_DISCOUNTS[lvl]
      : HINT_DISCOUNT_STEP * lvl;
    return Math.round(discount * 100);
  }

  function getTotalHintDiscountPct(lvl) {
    const base = Object.prototype.hasOwnProperty.call(HINT_DISCOUNTS, lvl)
      ? HINT_DISCOUNTS[lvl]
      : HINT_DISCOUNT_STEP * lvl;
    return Math.round((base + getFastLearnerDiscount()) * 100);
  }
  const skillCostMapNormalized = new Map(); // punctuation-stripped key -> meta
  const skillCostMapExact = new Map(); // exact lowercased name -> meta
  const skillCostMapByJP = new Map(); // normalize(jpname) -> meta (always unique)
  const skillCostById = new Map(); // skillId -> base cost
  const skillMetaById = new Map(); // skillId -> { cost, versions, parents }
  const externalAliasLookup = new Map(); // normalized name -> Set(other known aliases)
  let officialEnglishNameSet = new Set();
  let officialEnglishNameMap = new Map(); // normalized name -> official EN name
  let skillsCsvCache = '';
  let loadedSkillLibraryLanguage = '';
  let lastCSVLoadStats = {
    loaded: 0,
    filteredOut: 0,
    officialFilterApplied: false,
  };
  let lastTTChosen = null; // store last TT result for live predicted score updates
  const TEAM_TRIALS_MODE = 'team_trials';
  const teamTrialsSkillMetaById = new Map();
  const teamTrialsSkillMetaByName = new Map();
  const teamTrialsTierById = new Map();
  const teamTrialsTierByName = new Map();
  let cachedRawSkillsList = null;
  let loadedFullSkillData = false;

  function normalizeCostKey(str) {
    return normalize(str)
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeLooseSkillKey(value) {
    const base = normalize(value);
    if (!base) return '';
    const normalized = typeof base.normalize === 'function' ? base.normalize('NFKC') : base;
    try {
      return normalized.replace(/[\p{P}\p{S}\s]+/gu, '');
    } catch {
      return normalized.replace(/[^a-z0-9\u00c0-\u024f\u3040-\u30ff\u3400-\u9fff]+/g, '');
    }
  }

  function normalizeSiteLanguage(value) {
    return (value || '').toString().trim().toLowerCase() === 'jp' ? 'jp' : 'en';
  }

  function getSkillLanguage() {
    try {
      return (localStorage.getItem(SERVER_PREF_KEY) || '').trim().toLowerCase() === 'jp'
        ? 'jp'
        : 'en';
    } catch {
      return 'en';
    }
  }

  function getSiteLanguage() {
    const attr = (document?.documentElement?.dataset?.siteLanguage || '').toString().trim();
    if (attr) return normalizeSiteLanguage(attr);
    try {
      return normalizeSiteLanguage(localStorage.getItem('umatoolsSiteLanguage'));
    } catch {
      return 'en';
    }
  }

  function hasJapaneseScript(value) {
    return /[\u3040-\u30ff\u3400-\u9fff]/.test((value || '').toString());
  }

  function hasLatinLetters(value) {
    return /[a-z]/i.test((value || '').toString());
  }

  function getPrimaryAliasName(skill, { preferEnglish = false } = {}) {
    if (!skill || !Array.isArray(skill.aliasNames)) return '';
    const aliases = [];
    const seen = new Set();
    skill.aliasNames.forEach((entry) => {
      const trimmed = (entry || '').trim();
      const key = normalize(trimmed);
      if (!trimmed || !key || seen.has(key)) return;
      seen.add(key);
      aliases.push(trimmed);
    });
    if (!aliases.length) return '';
    if (preferEnglish) {
      const blocked = new Set();
      const canonical = normalize(skill.name);
      const localized = normalize(skill.localizedName);
      if (canonical) blocked.add(canonical);
      if (localized) blocked.add(localized);
      const findPreferred = (predicate, { allowBlocked = false } = {}) =>
        aliases.find((entry) => {
          const key = normalize(entry);
          if (!allowBlocked && key && blocked.has(key)) return false;
          return predicate(entry);
        });
      const latinNoJP = findPreferred(
        (entry) => hasLatinLetters(entry) && !hasJapaneseScript(entry)
      );
      if (latinNoJP) return latinNoJP;
      const nonJP = findPreferred((entry) => !hasJapaneseScript(entry));
      if (nonJP) return nonJP;
      const latinNoJPFallback = findPreferred(
        (entry) => hasLatinLetters(entry) && !hasJapaneseScript(entry),
        { allowBlocked: true }
      );
      if (latinNoJPFallback) return latinNoJPFallback;
      const nonJPFallback = findPreferred((entry) => !hasJapaneseScript(entry), {
        allowBlocked: true,
      });
      if (nonJPFallback) return nonJPFallback;
    }
    return aliases[0];
  }

  function getPreferredSkillInputName(skill, fallback = '') {
    if (!skill) return (fallback || '').trim();
    const server = getSkillLanguage();
    if (server !== 'jp') return (skill.name || fallback || '').trim();
    if (getSiteLanguage() === 'jp') return (skill.jpName || skill.name || fallback || '').trim();
    const alias = getPrimaryAliasName(skill, { preferEnglish: true });
    if (alias) return alias;
    const localized = (skill.localizedName || '').trim();
    if (localized && !hasJapaneseScript(localized)) return localized;
    if (localized) return localized;
    return (skill.name || fallback || '').trim();
  }

  function updateOfficialEnglishToggleState() {
    if (!officialEnglishToggle) return;
    officialEnglishToggle.disabled = getSkillLanguage() !== 'en';
  }

  function isOfficialEnglishOnlyEnabled() {
    return getSkillLanguage() === 'en' && (!officialEnglishToggle || officialEnglishToggle.checked);
  }

  function normalizeOfficialSkillName(name) {
    return normalize(name).replace(/\s+/g, ' ');
  }

  async function tryWriteClipboard(text) {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  }

  async function copyViaFallback(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) throw new Error('execCommand copy failed');
  }

  function calculateDiscountedCost(baseCost, hintLevel) {
    if (typeof baseCost !== 'number' || isNaN(baseCost)) return NaN;
    const lvl = Math.max(0, Math.min(5, parseInt(hintLevel, 10) || 0));
    const discount = Object.prototype.hasOwnProperty.call(HINT_DISCOUNTS, lvl)
      ? HINT_DISCOUNTS[lvl]
      : HINT_DISCOUNT_STEP * lvl;
    const multiplier = Math.max(0, 1 - discount - getFastLearnerDiscount());
    const rawCost = baseCost * multiplier;
    const epsilon = 1e-9;
    return Math.max(0, Math.floor(rawCost + epsilon));
  }

  function updateHintOptionLabels() {
    const selects = rowsEl ? rowsEl.querySelectorAll('.hint-level') : [];
    selects.forEach((select) => {
      Array.from(select.options).forEach((opt) => {
        const lvl = parseInt(opt.value, 10);
        if (isNaN(lvl)) return;
        opt.textContent = t('optimizer.hintLvFormat', {
          lvl: lvl,
          pct: getTotalHintDiscountPct(lvl),
        });
      });
    });
  }

  function refreshAllRowCosts() {
    const dataRows = rowsEl ? rowsEl.querySelectorAll('.optimizer-row') : [];
    // Iterate in reverse DOM order: linked children (lower/circle/evo rows) always
    // appear after their parent gold row, and a gold row's displayed cost is derived
    // from the lower row's current cost input. Refreshing children first ensures the
    // gold row reads up-to-date lower costs (fixes Fast Learner not discounting gold).
    for (let i = dataRows.length - 1; i >= 0; i--) {
      const row = dataRows[i];
      if (typeof row.syncSkillCategory === 'function') {
        row.syncSkillCategory({ triggerOptimize: false, allowLinking: false, updateCost: true });
      }
    }
  }

  async function loadSkillCostsJSON() {
    const candidates = [
      '/assets/skills_core.json',
      './assets/skills_core.json',
      '/assets/skills_all.json',
      './assets/skills_all.json',
    ];
    for (const url of candidates) {
      try {
        // Use default caching - Vercel headers control TTL
        const res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = await res.json();
        if (!Array.isArray(list) || !list.length) continue;
        cachedRawSkillsList = list;
        const isFullData = url.includes('skills_all');
        loadedFullSkillData = isFullData;
        const nextOfficialEnglishNames = new Set();
        externalAliasLookup.clear();
        const collectNames = (source) => {
          if (!source || typeof source !== 'object') return [];
          const raw = [source?.name_en, source?.enname, source?.jpname, source?.name];
          const names = [];
          const seen = new Set();
          raw.forEach((value) => {
            const trimmed = (value || '').trim();
            const key = normalize(trimmed);
            if (!trimmed || !key || seen.has(key)) return;
            seen.add(key);
            names.push(trimmed);
          });
          return names;
        };
        // Map each name → skill ID so alias enrichment stays within the same skill
        const nameToSkillId = new Map(); // normalized name -> skill ID
        const registerAliasNames = (names, skillId) => {
          if (!Array.isArray(names) || !names.length) return;
          names.forEach((name) => {
            const key = normalize(name);
            if (!key) return;
            // Only register aliases within the same skill; don't merge across skills
            const existingOwner = nameToSkillId.get(key);
            if (existingOwner != null && existingOwner !== skillId) return;
            nameToSkillId.set(key, skillId);
            if (!externalAliasLookup.has(key)) externalAliasLookup.set(key, new Set());
            const bucket = externalAliasLookup.get(key);
            names.forEach((candidate) => {
              const candidateKey = normalize(candidate);
              if (!candidateKey || candidateKey === key) return;
              bucket.add(candidate);
            });
          });
        };
        const nextOfficialNameMap = new Map();
        list.forEach((entry) => {
          const officialName = (entry?.name_en || '').trim();
          const geneOfficialName = (entry?.gene_version?.name_en || '').trim();
          if (officialName) nextOfficialEnglishNames.add(normalizeOfficialSkillName(officialName));
          if (geneOfficialName)
            nextOfficialEnglishNames.add(normalizeOfficialSkillName(geneOfficialName));
          // Map all known names for this skill to its official EN name
          const names = collectNames(entry);
          const geneNames = collectNames(entry?.gene_version);
          if (officialName) {
            names.forEach((n) => {
              const k = normalize(n);
              if (k) nextOfficialNameMap.set(k, officialName);
            });
          }
          if (geneOfficialName) {
            geneNames.forEach((n) => {
              const k = normalize(n);
              if (k) nextOfficialNameMap.set(k, geneOfficialName);
            });
          }
          const entryId = entry?.id != null ? entry.id : null;
          const geneId = entry?.gene_version?.id != null ? entry.gene_version.id : entryId;
          registerAliasNames(names, entryId);
          registerAliasNames(geneNames, geneId);
          const indexNames = names.length ? names : [];
          const geneIndexNames = geneNames.length ? geneNames : [];
          const allIndexNames = Array.from(new Set(indexNames.concat(geneIndexNames)));
          const cost = (() => {
            if (entry?.gene_version && typeof entry.gene_version.cost === 'number')
              return entry.gene_version.cost;
            if (typeof entry?.cost === 'number') return entry.cost;
            return null;
          })();
          const parents = Array.isArray(entry?.gene_version?.parent_skills)
            ? entry.gene_version.parent_skills
            : Array.isArray(entry?.parent_skills)
              ? entry.parent_skills
              : [];
          const versions = Array.isArray(entry?.versions) ? entry.versions : [];
          const id = entry?.id;
          if (cost !== null) {
            const meta = { cost, id, parents, versions };
            if (id !== undefined && id !== null) {
              const sid = String(id);
              if (!skillCostById.has(sid)) skillCostById.set(sid, cost);
              if (!skillMetaById.has(sid)) skillMetaById.set(sid, { cost, parents, versions });
            }
            allIndexNames.forEach((indexName) => {
              const exactKey = normalize(indexName);
              const key = normalizeCostKey(indexName);
              if (exactKey && !skillCostMapExact.has(exactKey))
                skillCostMapExact.set(exactKey, meta);
              if (key && !skillCostMapNormalized.has(key)) skillCostMapNormalized.set(key, meta);
            });
            // Index by JP name for collision-safe CSV join (JP names are always unique)
            const jpn = (entry?.jpname || '').trim();
            if (jpn) {
              const jpKey = normalize(jpn);
              if (jpKey && !skillCostMapByJP.has(jpKey)) skillCostMapByJP.set(jpKey, meta);
            }
            const gvJpn = (entry?.gene_version?.jpname || '').trim();
            if (gvJpn) {
              const gvJpKey = normalize(gvJpn);
              if (gvJpKey && !skillCostMapByJP.has(gvJpKey)) skillCostMapByJP.set(gvJpKey, meta);
            }
          }
        });
        officialEnglishNameSet = nextOfficialEnglishNames;
        officialEnglishNameMap = nextOfficialNameMap;
        if (typeof window.buildJPSkillNameMap === 'function') window.buildJPSkillNameMap(list);
        if (isFullData && window.TeamTrialsOptimizer?.buildEnglishSkillIndex) {
          const teamIndex = window.TeamTrialsOptimizer.buildEnglishSkillIndex(list);
          teamTrialsSkillMetaById.clear();
          teamTrialsSkillMetaByName.clear();
          if (teamIndex?.byId?.forEach) {
            teamIndex.byId.forEach((v, k) => teamTrialsSkillMetaById.set(String(k), v));
          }
          if (teamIndex?.byName?.forEach) {
            teamIndex.byName.forEach((v, k) => teamTrialsSkillMetaByName.set(String(k), v));
          }
        }
        console.log(
          `Loaded skill costs from ${url}: ${skillCostMapExact.size} exact, ${skillCostMapNormalized.size} normalized`
        );
        return true;
      } catch (err) {
        console.warn('Failed loading skill costs', url, err);
      }
    }
    return false;
  }

  function getScoringWeights() {
    var defaults = window.SkillScorer?.DEFAULT_SCORING_WEIGHTS || {
      consistency: 0.6,
      costEfficiency: 0.4,
    };
    var el = function (id) {
      var inp = document.getElementById(id);
      return inp ? Number(inp.value) : null;
    };
    var ce = el('weight-cost-efficiency');
    var co = el('weight-consistency');
    if (ce == null || co == null) return defaults;
    var sum = ce + co;
    if (sum <= 0) return defaults;
    return {
      consistency: co / sum,
      costEfficiency: ce / sum,
    };
  }

  async function loadTeamTrialsScoring() {
    if (!window.SkillScorer || !cachedRawSkillsList || !loadedFullSkillData) return false;
    const weights = getScoringWeights();
    const lookup = window.SkillScorer.scoreAllSkills(cachedRawSkillsList, weights);
    teamTrialsTierById.clear();
    teamTrialsTierByName.clear();
    if (lookup?.byId?.forEach) {
      lookup.byId.forEach((v, k) => teamTrialsTierById.set(String(k), v));
    }
    if (lookup?.byName?.forEach) {
      lookup.byName.forEach((v, k) => teamTrialsTierByName.set(String(k), v));
    }
    console.log(`Scored ${teamTrialsTierById.size} skills for Team Trials tiers`);
    return true;
  }

  function setAutoStatus(message, isError = false) {
    if (!autoBuilderStatus) return;
    autoBuilderStatus.textContent = message || '';
    autoBuilderStatus.dataset.state = isError ? 'error' : 'info';
  }

  function getSelectedAutoTargets() {
    if (!autoTargetInputs || !autoTargetInputs.length) return [];
    return Array.from(autoTargetInputs)
      .filter((input) => input.checked)
      .map((input) => normalize(input.value))
      .filter(Boolean);
  }

  function setAutoTargetSelections(list) {
    if (!autoTargetInputs || !autoTargetInputs.length) return;
    const normalized = Array.isArray(list) ? new Set(list.map((v) => normalize(v))) : null;
    autoTargetInputs.forEach((input) => {
      if (!normalized || !normalized.size) {
        input.checked = true;
      } else {
        input.checked = normalized.has(normalize(input.value));
      }
    });
  }

  let autoHighlightTimer = null;

  function matchesAutoTargets(item, targetSet, includeGeneral) {
    const check = normalize(item.checkType);
    if (!check) return includeGeneral;
    if (!targetSet.has(check)) return false;
    return getBucketForSkill(item.checkType) === 'good';
  }

  function replaceRowsWithItems(items) {
    if (!rowsEl) return;
    clearAutoHighlights();
    Array.from(rowsEl.querySelectorAll('.optimizer-row')).forEach((n) => n.remove());
    items.forEach((it) => {
      const row = makeRow();
      rowsEl.appendChild(row);
      const nameInput = row.querySelector('.skill-name');
      if (nameInput) nameInput.value = it.name;
      const costInput = row.querySelector('.cost');
      if (costInput) costInput.value = it.cost;
      row.dataset.skillCategory = it.category || '';
      if (typeof row.syncSkillCategory === 'function') {
        row.syncSkillCategory({ triggerOptimize: false, allowLinking: false, updateCost: false });
      } else {
        applyCategoryAccent(row, it.category || '');
      }
    });
    ensureOneEmptyRow();
    saveState();
    autoOptimizeDebounced();
  }

  function clearAutoHighlights() {
    if (autoHighlightTimer) {
      clearTimeout(autoHighlightTimer);
      autoHighlightTimer = null;
    }
    if (!rowsEl) return;
    Array.from(rowsEl.querySelectorAll('.optimizer-row')).forEach((row) => {
      row.classList.remove('auto-picked');
      row.classList.remove('auto-excluded');
    });
  }

  function applyAutoHighlights(selectedIds = [], candidateIds = []) {
    clearTimeout(autoHighlightTimer);
    const selected = new Set(selectedIds);
    const candidates = new Set(candidateIds);
    Array.from(rowsEl.querySelectorAll('.optimizer-row')).forEach((row) => {
      const id = row.dataset.rowId;
      if (!id) return;
      row.classList.remove('auto-picked', 'auto-excluded');
      if (!candidates.size || !candidates.has(id)) return;
      if (selected.has(id)) row.classList.add('auto-picked');
      else row.classList.add('auto-excluded');
    });
    autoHighlightTimer = setTimeout(() => clearAutoHighlights(), 4000);
  }

  function serializeRows() {
    const rows = [];
    rowsEl.querySelectorAll('.optimizer-row').forEach((row) => {
      // Skip auto-generated sub-rows
      if (row.dataset.parentCircleId || row.dataset.parentEvoId) return;
      const name = row.querySelector('.skill-name')?.value?.trim();
      const costVal = row.querySelector('.cost')?.value;
      const cost = typeof costVal === 'string' && costVal.length ? parseInt(costVal, 10) : NaN;
      const hintVal = row.querySelector('.hint-level')?.value;
      const hintLevel = parseInt(hintVal, 10);
      const required = row.querySelector('.required-skill')?.checked;
      if (!name || isNaN(cost)) return;
      const hintSuffix = !isNaN(hintLevel) ? `|H${hintLevel}` : '';
      const reqSuffix = required ? '|R' : '';
      const evoNames = Array.from(row.querySelectorAll('.evo-checkbox:checked'))
        .map((cb) => cb.dataset.evoName)
        .filter(Boolean);
      const evoSuffix = evoNames.map((n) => `|E${n}`).join('');
      rows.push(`${name}=${cost}${hintSuffix}${reqSuffix}${evoSuffix}`);
    });
    return rows.join('\n');
  }

  function loadRowsFromString(str) {
    const normalized = (str || '').replace(/\r\n?/g, '\n');
    const entries = normalized
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!entries.length) throw new Error('No rows detected.');
    _restoringState = true;
    try {
      Array.from(rowsEl.querySelectorAll('.optimizer-row')).forEach((n) => n.remove());
      clearAutoHighlights();
      entries.forEach((entry) => {
        const [nameRaw, costRaw] = entry.split('=');
        const name = (nameRaw || '').trim();
        let costText = (costRaw || '').trim();
        let hintLevel = 0;
        let required = false;
        // Parse evo suffixes
        const evoMatches = costText.match(/\|E([^|]+)/g) || [];
        const checkedEvos = evoMatches.map((m) => m.slice(2).trim()).filter(Boolean);
        costText = costText.replace(/\|E[^|]*/g, '').trim();
        if (/\|R\b/i.test(costText)) {
          required = true;
          costText = costText.replace(/\|R\b/gi, '').trim();
        }
        const hintMatch = costText.match(/\|H?\s*([0-5])\s*$/i);
        if (hintMatch) {
          hintLevel = parseInt(hintMatch[1], 10) || 0;
          costText = costText.slice(0, hintMatch.index).trim();
        }
        const cost = parseInt(costText, 10);
        if (!name || isNaN(cost)) return;
        const row = makeRow();
        rowsEl.appendChild(row);
        const nameInput = row.querySelector('.skill-name');
        const costInput = row.querySelector('.cost');
        const hintSelect = row.querySelector('.hint-level');
        const requiredToggle = row.querySelector('.required-skill');
        if (nameInput) nameInput.value = name;
        if (costInput) costInput.value = cost;
        if (hintSelect) hintSelect.value = String(hintLevel);
        if (requiredToggle) {
          requiredToggle.checked = required;
          row.classList.toggle('required', required);
        }
        // Store pending evo selections on the row for later restoration
        if (checkedEvos.length) {
          row.dataset.pendingEvos = JSON.stringify(checkedEvos);
        }
        if (typeof row.syncSkillCategory === 'function') {
          row.syncSkillCategory({ triggerOptimize: false, allowLinking: false, updateCost: false });
        } else {
          applyCategoryAccent(row, row.dataset.skillCategory || '');
        }
      });
      // After all rows are created, link gold skills to existing or auto-created lower rows.
      const allRows = Array.from(rowsEl.querySelectorAll('.optimizer-row'));
      const rowsBySkillId = new Map();
      allRows.forEach((row) => {
        const name = (row.querySelector('.skill-name')?.value || '').trim();
        const skill = findSkillByName(name);
        if (skill?.skillId !== undefined && skill?.skillId !== null) {
          rowsBySkillId.set(String(skill.skillId), row);
        }
      });
      allRows.forEach((row) => {
        if (row.dataset.parentGoldId) return;
        const name = (row.querySelector('.skill-name')?.value || '').trim();
        const skill = findSkillByName(name);
        if (!skill) return;
        if (!isGoldCategory(skill.category)) return;
        if (row.dataset.lowerRowId) return;
        const candidateIds = [];
        if (skill.lowerSkillId) candidateIds.push(skill.lowerSkillId);
        if (Array.isArray(skill.parentIds) && skill.parentIds.length) {
          candidateIds.push(...skill.parentIds);
        }
        let linkedRow = null;
        candidateIds.some((cid) => {
          const found = rowsBySkillId.get(String(cid));
          if (found && found !== row) {
            linkedRow = found;
            return true;
          }
          return false;
        });
        if (linkedRow) {
          const lowerId = linkedRow.dataset.rowId || '';
          row.dataset.lowerRowId = lowerId;
          linkedRow.dataset.parentGoldId = row.dataset.rowId || '';
          linkedRow.classList.add('linked-lower');
          const linkedInput = linkedRow.querySelector('.skill-name');
          if (linkedInput) linkedInput.placeholder = t('optimizer.lowerSkill');
          const linkedRemove = linkedRow.querySelector('.remove');
          if (linkedRemove) {
            linkedRemove.disabled = true;
            linkedRemove.title = t('optimizer.removeGoldToUnlink');
            linkedRemove.style.pointerEvents = 'none';
            linkedRemove.style.opacity = '0.4';
          }
          if (typeof linkedRow.syncSkillCategory === 'function') {
            linkedRow.syncSkillCategory({
              triggerOptimize: false,
              allowLinking: false,
              updateCost: true,
            });
          }
          if (typeof row.syncSkillCategory === 'function') {
            row.syncSkillCategory({
              triggerOptimize: false,
              allowLinking: false,
              updateCost: true,
            });
          }
        } else if (typeof row.syncSkillCategory === 'function') {
          row.syncSkillCategory({ triggerOptimize: false, allowLinking: true, updateCost: true });
        }
      });
      // Recreate circle upgrade and evo sub-rows for non-gold rows
      // (the gold linking pass above only handles gold rows; circle skills need allowLinking too)
      // Also include gold's lower rows (parentGoldId) so their ◎ circle sub-rows are recreated
      // (circle sub-rows are auto-generated, not saved to state)
      Array.from(rowsEl.querySelectorAll('.optimizer-row')).forEach((row) => {
        if (row.dataset.parentCircleId || row.dataset.parentEvoId) return;
        // Skip rows already handled by the gold linking pass (those with lowerRowId set)
        // but NOT gold's lower rows which need circle linking
        if (row.dataset.lowerRowId && !row.dataset.parentGoldId) return;
        const name = (row.querySelector('.skill-name')?.value || '').trim();
        if (!name) return;
        const skill = findSkillByName(name);
        if (!skill) return;
        if (isGoldCategory(skill.category)) return; // Already handled above
        if (typeof row.syncSkillCategory === 'function') {
          row.syncSkillCategory({ triggerOptimize: false, allowLinking: true, updateCost: true });
        }
      });
      // Restore evo checkbox selections from serialized |E suffixes
      Array.from(rowsEl.querySelectorAll('.optimizer-row')).forEach((row) => {
        if (!row.dataset.pendingEvos) return;
        let evos;
        try {
          evos = JSON.parse(row.dataset.pendingEvos);
        } catch {
          return;
        }
        delete row.dataset.pendingEvos;
        if (!Array.isArray(evos) || !evos.length) return;
        // Ensure evo checkboxes are populated (syncSkillCategory with linking creates them)
        if (typeof row.syncSkillCategory === 'function') {
          row.syncSkillCategory({ triggerOptimize: false, allowLinking: true, updateCost: false });
        }
        evos.forEach((evoName) => {
          const cb = row.querySelector(`.evo-checkbox[data-evo-name="${CSS.escape(evoName)}"]`);
          if (cb && !cb.checked) {
            cb.checked = true;
            cb.dispatchEvent(new Event('change'));
          }
        });
      });
    } finally {
      _restoringState = false;
    }
    ensureOneEmptyRow();
    saveState();
    autoOptimizeDebounced();
  }

  // --- URL state ---
  function encodeBuildToURL(buildString) {
    try {
      if (typeof LZString !== 'undefined' && LZString.compressToEncodedURIComponent) {
        return LZString.compressToEncodedURIComponent(buildString);
      }
      const encoded = btoa(unescape(encodeURIComponent(buildString)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      return encoded;
    } catch (err) {
      console.error('Failed to encode build', err);
      return '';
    }
  }

  function decodeBuildFromURL(encoded) {
    try {
      if (typeof LZString !== 'undefined' && LZString.decompressFromEncodedURIComponent) {
        const decoded = LZString.decompressFromEncodedURIComponent(encoded);
        if (decoded) return decoded;
      }
      const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      const padding = '='.repeat((4 - (base64.length % 4)) % 4);
      const decoded = decodeURIComponent(escape(atob(base64 + padding)));
      return decoded;
    } catch (err) {
      console.error('Failed to decode build', err);
      return '';
    }
  }

  // Minimal LZ-String (compressToEncodedURIComponent + decompressFromEncodedURIComponent)
  // Keeps share URLs much shorter without a backend.
  const LZString = (function () {
    const f = String.fromCharCode;
    const keyStrUriSafe = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$';
    const getBaseValue = (alphabet, character) => alphabet.indexOf(character);
    function compressToEncodedURIComponent(input) {
      if (input == null) return '';
      return _compress(input, 6, (a) => keyStrUriSafe.charAt(a));
    }
    function decompressFromEncodedURIComponent(input) {
      if (input == null) return '';
      if (input === '') return null;
      return _decompress(input.length, 32, (index) =>
        getBaseValue(keyStrUriSafe, input.charAt(index))
      );
    }
    function _compress(uncompressed, bitsPerChar, getCharFromInt) {
      if (uncompressed == null) return '';
      let i, value;
      const context_dictionary = {};
      const context_dictionaryToCreate = {};
      let context_c = '';
      let context_wc = '';
      let context_w = '';
      let context_enlargeIn = 2;
      let context_dictSize = 3;
      let context_numBits = 2;
      let context_data = [];
      let context_data_val = 0;
      let context_data_position = 0;
      for (let ii = 0; ii < uncompressed.length; ii += 1) {
        context_c = uncompressed.charAt(ii);
        if (!Object.prototype.hasOwnProperty.call(context_dictionary, context_c)) {
          context_dictionary[context_c] = context_dictSize++;
          context_dictionaryToCreate[context_c] = true;
        }
        context_wc = context_w + context_c;
        if (Object.prototype.hasOwnProperty.call(context_dictionary, context_wc)) {
          context_w = context_wc;
        } else {
          if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
            if (context_w.charCodeAt(0) < 256) {
              for (i = 0; i < context_numBits; i++) {
                context_data_val = context_data_val << 1;
                if (context_data_position === bitsPerChar - 1) {
                  context_data_position = 0;
                  context_data.push(getCharFromInt(context_data_val));
                  context_data_val = 0;
                } else {
                  context_data_position++;
                }
              }
              value = context_w.charCodeAt(0);
              for (i = 0; i < 8; i++) {
                context_data_val = (context_data_val << 1) | (value & 1);
                if (context_data_position === bitsPerChar - 1) {
                  context_data_position = 0;
                  context_data.push(getCharFromInt(context_data_val));
                  context_data_val = 0;
                } else {
                  context_data_position++;
                }
                value = value >> 1;
              }
            } else {
              value = 1;
              for (i = 0; i < context_numBits; i++) {
                context_data_val = (context_data_val << 1) | value;
                if (context_data_position === bitsPerChar - 1) {
                  context_data_position = 0;
                  context_data.push(getCharFromInt(context_data_val));
                  context_data_val = 0;
                } else {
                  context_data_position++;
                }
                value = 0;
              }
              value = context_w.charCodeAt(0);
              for (i = 0; i < 16; i++) {
                context_data_val = (context_data_val << 1) | (value & 1);
                if (context_data_position === bitsPerChar - 1) {
                  context_data_position = 0;
                  context_data.push(getCharFromInt(context_data_val));
                  context_data_val = 0;
                } else {
                  context_data_position++;
                }
                value = value >> 1;
              }
            }
            context_enlargeIn--;
            if (context_enlargeIn === 0) {
              context_enlargeIn = Math.pow(2, context_numBits);
              context_numBits++;
            }
            delete context_dictionaryToCreate[context_w];
          } else {
            value = context_dictionary[context_w];
            for (i = 0; i < context_numBits; i++) {
              context_data_val = (context_data_val << 1) | (value & 1);
              if (context_data_position === bitsPerChar - 1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
              value = value >> 1;
            }
          }
          context_enlargeIn--;
          if (context_enlargeIn === 0) {
            context_enlargeIn = Math.pow(2, context_numBits);
            context_numBits++;
          }
          context_dictionary[context_wc] = context_dictSize++;
          context_w = String(context_c);
        }
      }
      if (context_w !== '') {
        if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
          if (context_w.charCodeAt(0) < 256) {
            for (i = 0; i < context_numBits; i++) {
              context_data_val = context_data_val << 1;
              if (context_data_position === bitsPerChar - 1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
            }
            value = context_w.charCodeAt(0);
            for (i = 0; i < 8; i++) {
              context_data_val = (context_data_val << 1) | (value & 1);
              if (context_data_position === bitsPerChar - 1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
              value = value >> 1;
            }
          } else {
            value = 1;
            for (i = 0; i < context_numBits; i++) {
              context_data_val = (context_data_val << 1) | value;
              if (context_data_position === bitsPerChar - 1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
              value = 0;
            }
            value = context_w.charCodeAt(0);
            for (i = 0; i < 16; i++) {
              context_data_val = (context_data_val << 1) | (value & 1);
              if (context_data_position === bitsPerChar - 1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
              value = value >> 1;
            }
          }
          context_enlargeIn--;
          if (context_enlargeIn === 0) {
            context_enlargeIn = Math.pow(2, context_numBits);
            context_numBits++;
          }
          delete context_dictionaryToCreate[context_w];
        } else {
          value = context_dictionary[context_w];
          for (i = 0; i < context_numBits; i++) {
            context_data_val = (context_data_val << 1) | (value & 1);
            if (context_data_position === bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = value >> 1;
          }
        }
        context_enlargeIn--;
        if (context_enlargeIn === 0) {
          context_enlargeIn = Math.pow(2, context_numBits);
          context_numBits++;
        }
      }
      value = 2;
      for (i = 0; i < context_numBits; i++) {
        context_data_val = (context_data_val << 1) | (value & 1);
        if (context_data_position === bitsPerChar - 1) {
          context_data_position = 0;
          context_data.push(getCharFromInt(context_data_val));
          context_data_val = 0;
        } else {
          context_data_position++;
        }
        value = value >> 1;
      }
      while (true) {
        context_data_val = context_data_val << 1;
        if (context_data_position === bitsPerChar - 1) {
          context_data.push(getCharFromInt(context_data_val));
          break;
        } else context_data_position++;
      }
      return context_data.join('');
    }
    function _decompress(length, resetValue, getNextValue) {
      const dictionary = [];
      let next;
      let enlargeIn = 4;
      let dictSize = 4;
      let numBits = 3;
      let entry = '';
      const result = [];
      let i;
      let w;
      let bits, resb, maxpower, power;
      const data = { val: getNextValue(0), position: resetValue, index: 1 };
      for (i = 0; i < 3; i += 1) dictionary[i] = i;
      bits = 0;
      maxpower = Math.pow(2, 2);
      power = 1;
      while (power !== maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position === 0) {
          data.position = resetValue;
          data.val = getNextValue(data.index++);
        }
        bits |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }
      switch ((next = bits)) {
        case 0:
          bits = 0;
          maxpower = Math.pow(2, 8);
          power = 1;
          while (power !== maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position === 0) {
              data.position = resetValue;
              data.val = getNextValue(data.index++);
            }
            bits |= (resb > 0 ? 1 : 0) * power;
            power <<= 1;
          }
          w = f(bits);
          break;
        case 1:
          bits = 0;
          maxpower = Math.pow(2, 16);
          power = 1;
          while (power !== maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position === 0) {
              data.position = resetValue;
              data.val = getNextValue(data.index++);
            }
            bits |= (resb > 0 ? 1 : 0) * power;
            power <<= 1;
          }
          w = f(bits);
          break;
        case 2:
          return '';
        default:
          return '';
      }
      dictionary[3] = w;
      result.push(w);
      while (true) {
        if (data.index > length) return '';
        bits = 0;
        maxpower = Math.pow(2, numBits);
        power = 1;
        while (power !== maxpower) {
          resb = data.val & data.position;
          data.position >>= 1;
          if (data.position === 0) {
            data.position = resetValue;
            data.val = getNextValue(data.index++);
          }
          bits |= (resb > 0 ? 1 : 0) * power;
          power <<= 1;
        }
        switch ((next = bits)) {
          case 0:
            bits = 0;
            maxpower = Math.pow(2, 8);
            power = 1;
            while (power !== maxpower) {
              resb = data.val & data.position;
              data.position >>= 1;
              if (data.position === 0) {
                data.position = resetValue;
                data.val = getNextValue(data.index++);
              }
              bits |= (resb > 0 ? 1 : 0) * power;
              power <<= 1;
            }
            dictionary[dictSize++] = f(bits);
            next = dictSize - 1;
            enlargeIn--;
            break;
          case 1:
            bits = 0;
            maxpower = Math.pow(2, 16);
            power = 1;
            while (power !== maxpower) {
              resb = data.val & data.position;
              data.position >>= 1;
              if (data.position === 0) {
                data.position = resetValue;
                data.val = getNextValue(data.index++);
              }
              bits |= (resb > 0 ? 1 : 0) * power;
              power <<= 1;
            }
            dictionary[dictSize++] = f(bits);
            next = dictSize - 1;
            enlargeIn--;
            break;
          case 2:
            return result.join('');
        }
        if (enlargeIn === 0) {
          enlargeIn = Math.pow(2, numBits);
          numBits++;
        }
        if (dictionary[next]) {
          entry = dictionary[next];
        } else {
          if (next === dictSize) {
            entry = w + w.charAt(0);
          } else {
            return '';
          }
        }
        result.push(entry);
        dictionary[dictSize++] = w + entry.charAt(0);
        enlargeIn--;
        w = entry;
        if (enlargeIn === 0) {
          enlargeIn = Math.pow(2, numBits);
          numBits++;
        }
      }
    }
    return { compressToEncodedURIComponent, decompressFromEncodedURIComponent };
  })();

  function getURLParams() {
    const hash = (location.hash || '').replace(/^#/, '');
    return new URLSearchParams(hash || location.search);
  }

  function normalizeSkillLanguage(value) {
    return (value || '').toString().trim().toLowerCase() === 'jp' ? 'jp' : 'en';
  }

  function applyLanguageFromURLParams(params) {
    if (!params) return false;
    const raw = params.get('sl') || params.get('lang');
    if (!raw) return false;
    const nextLang = normalizeSkillLanguage(raw);
    const changed = getSkillLanguage() !== nextLang;
    try {
      localStorage.setItem(SERVER_PREF_KEY, nextLang);
    } catch {}
    updateOfficialEnglishToggleState();
    return changed;
  }

  function readFromURL() {
    const p = getURLParams();
    const buildParam = p.get('b') || p.get('build');
    // Accept URLs with any meaningful param, not just skills
    const hasAnyParam =
      buildParam ||
      p.get('r') ||
      p.get('rating') ||
      p.get('c') ||
      p.get('cfg') ||
      p.get('k') ||
      p.get('budget');
    if (!hasAnyParam) return false;
    try {
      applyLanguageFromURLParams(p);

      // Restore budget
      const budget = p.get('k') || p.get('budget');
      if (budget) budgetInput.value = parseInt(budget, 10) || 0;

      // Restore fast learner
      const fl = p.get('f') || p.get('fl');
      if (fastLearnerToggle && fl !== null) {
        fastLearnerToggle.checked = fl === '1' || fl === 'true';
      }

      // Restore official English filter
      const officialOnly = p.get('oe') || p.get('official');
      if (officialEnglishToggle && officialOnly !== null) {
        officialEnglishToggle.checked = !(officialOnly === '0' || officialOnly === 'false');
      }
      updateOfficialEnglishToggleState();

      // Restore optimize mode
      const mode = p.get('m') || p.get('mode');
      if (optimizeModeSelect && mode) {
        optimizeModeSelect.value = mode;
      }

      // Restore race config
      const cfgParam = p.get('c') || p.get('cfg');
      if (cfgParam) {
        const cfgParts = cfgParam.split(',');
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
        cfgParts.forEach((val, i) => {
          if (i < cfgKeys.length && cfg[cfgKeys[i]]) {
            cfg[cfgKeys[i]].value = val || 'A';
          }
        });
      }

      // Restore rating stats
      const ratingParam = p.get('r') || p.get('rating');
      if (ratingParam) {
        try {
          const ratingData = JSON.parse(decodeURIComponent(ratingParam));
          ratingEngine.applyRatingState(ratingData);
        } catch (err) {
          console.warn('Failed to parse rating data from URL', err);
        }
      }

      // Restore auto targets
      const targetsParam = p.get('t') || p.get('targets');
      if (targetsParam) {
        const targets = targetsParam
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        if (targets.length) {
          setAutoTargetSelections(targets);
        }
      }

      // Rebuild skill library if filter changed via URL.
      rebuildSkillLibraryFromCache();

      // Load skills (if present)
      if (buildParam) {
        const decoded = decodeBuildFromURL(buildParam);
        if (decoded) loadRowsFromString(decoded);
      }

      // Update UI to reflect loaded state
      updateAffinityStyles();
      updateHintOptionLabels();
      ratingEngine.updateRatingDisplay();

      return true;
    } catch (err) {
      console.error('Failed to load build from URL', err);
      return false;
    }
  }

  function writeToURL() {
    const buildString = serializeRows();

    const p = new URLSearchParams();
    if (buildString) {
      const encoded = encodeBuildToURL(buildString);
      if (encoded) p.set('b', encoded);
    }

    // Add budget
    const budget = parseInt(budgetInput.value, 10) || 0;
    if (budget) p.set('k', String(budget));

    // Add fast learner
    if (fastLearnerToggle?.checked) {
      p.set('f', '1');
    }

    if (getSkillLanguage() === 'en' && officialEnglishToggle && !officialEnglishToggle.checked) {
      p.set('oe', '0');
    }
    if (getSkillLanguage() === 'jp') {
      p.set('sl', 'jp');
    }

    // Add optimize mode
    const mode = getOptimizeMode();
    if (mode && mode !== 'rating') {
      p.set('m', mode);
    }

    // Add race config (compact comma-separated)
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
    const cfgValues = cfgKeys.map((k) => (cfg[k] ? cfg[k].value : 'A'));
    const cfgString = cfgValues.join(',');
    if (cfgString && cfgString !== 'A,A,A,A,A,A,A,A,A,A') {
      p.set('c', cfgString);
    }

    // Add rating stats
    const ratingData = ratingEngine.readRatingState();
    if (
      ratingData &&
      (ratingData.stats?.speed ||
        ratingData.stats?.stamina ||
        ratingData.stats?.power ||
        ratingData.stats?.guts ||
        ratingData.stats?.wisdom ||
        ratingData.star ||
        ratingData.unique)
    ) {
      p.set('r', encodeURIComponent(JSON.stringify(ratingData)));
    }

    // Add auto targets
    if (autoTargetInputs && autoTargetInputs.length) {
      const targets = Array.from(autoTargetInputs)
        .filter((input) => input.checked)
        .map((input) => input.value);
      if (targets.length) {
        p.set('t', targets.join(','));
      }
    }

    const qs = p.toString();
    history.replaceState(null, '', qs ? `${location.pathname}#${qs}` : location.pathname);
  }

  function autoBuildIdealSkills() {
    if (!categories.length || !Object.keys(skillsByCategory).length) {
      setAutoStatus(t('optimizer.libraryStillLoading'), true);
      return;
    }
    const targets = getSelectedAutoTargets();
    if (!targets.length) {
      setAutoStatus(t('optimizer.selectTargetFirst'), true);
      return;
    }
    const budget = parseInt(budgetInput.value, 10);
    if (isNaN(budget) || budget <= 0) {
      setAutoStatus(t('optimizer.enterValidBudget'), true);
      budgetInput && budgetInput.focus();
      return;
    }
    const { items, rowsMeta } = collectItems();
    if (!items.length) {
      setAutoStatus(t('optimizer.addRecognizedSkill'), true);
      return;
    }
    const requiredSummary = expandRequired(items);
    if (requiredSummary.requiredCost > budget) {
      setAutoStatus(t('optimizer.requiredExceedBudget'), true);
      renderResults(
        {
          best: 0,
          chosen: [],
          used: 0,
          error: 'required_unreachable',
          purpleTotalPenalty: getTotalPurplePenalty(items),
        },
        budget
      );
      return;
    }
    const includeGeneral = targets.includes('general');
    const targetSet = new Set(targets.filter((t) => t !== 'general'));
    let optionalCandidates = items.filter(
      (it) =>
        !requiredSummary.requiredIds.has(it.id) && matchesAutoTargets(it, targetSet, includeGeneral)
    );
    // Include linked counterparts (gold lower, circle upgrade) so buildGroups can
    // form proper combo groups — otherwise the optimizer treats them standalone.
    const candidateIds = new Set(optionalCandidates.map((it) => it.id));
    const itemById = new Map(items.map((it) => [it.id, it]));
    for (const it of optionalCandidates) {
      // Pull in gold linked lower
      if (it.lowerRowId && !candidateIds.has(it.lowerRowId) && itemById.has(it.lowerRowId)) {
        candidateIds.add(it.lowerRowId);
        // Also pull in the lower's ◎ circle upgrade (grandchild of gold)
        const lower = itemById.get(it.lowerRowId);
        if (
          lower.circleRowId &&
          !candidateIds.has(lower.circleRowId) &&
          itemById.has(lower.circleRowId)
        ) {
          candidateIds.add(lower.circleRowId);
        }
      }
      // Pull in circle upgrade
      if (it.circleRowId && !candidateIds.has(it.circleRowId) && itemById.has(it.circleRowId)) {
        candidateIds.add(it.circleRowId);
      }
    }
    // Also pull in parents when the child was matched but parent wasn't
    for (const it of items) {
      if (requiredSummary.requiredIds.has(it.id)) continue;
      if (candidateIds.has(it.id)) continue;
      // If this item's linked child is already a candidate, include the parent too
      if (it.lowerRowId && candidateIds.has(it.lowerRowId)) candidateIds.add(it.id);
      if (it.circleRowId && candidateIds.has(it.circleRowId)) candidateIds.add(it.id);
    }
    optionalCandidates = adjustCircleOptionalScores(
      items.filter((it) => candidateIds.has(it.id)),
      requiredSummary
    );
    const candidates = optionalCandidates.concat(requiredSummary.requiredItems);
    if (!candidates.length) {
      setAutoStatus(t('optimizer.noMatchingRows'), true);
      return;
    }
    if (getOptimizeMode() === TEAM_TRIALS_MODE) {
      const teamResult = optimizeTeamTrialsCandidates(candidates, budget);
      if (teamResult.error) {
        setAutoStatus(t('optimizer.teamTrialsFailed'), true);
        renderResults({ ...teamResult, purpleTotalPenalty: getTotalPurplePenalty(items) }, budget);
        return;
      }
      if (!teamResult.chosen?.length) {
        setAutoStatus(t('optimizer.budgetTooLow'), true);
        renderResults({ ...teamResult, purpleTotalPenalty: getTotalPurplePenalty(items) }, budget);
        return;
      }
      applyAutoHighlights(
        teamResult.chosen.map((it) => it.id),
        candidates.map((it) => it.id)
      );
      renderResults({ ...teamResult, purpleTotalPenalty: getTotalPurplePenalty(items) }, budget);
      setAutoStatus(
        t('optimizer.highlightedSkills', {
          chosen: teamResult.chosen.length,
          total: candidates.length,
          used: teamResult.used,
          budget: budget,
        })
      );
      return;
    }
    const groups = buildGroups(optionalCandidates, rowsMeta);
    const result = optimizeGrouped(
      groups,
      optionalCandidates,
      budget - requiredSummary.requiredCost
    );
    if (result.error === 'required_unreachable') {
      setAutoStatus(t('optimizer.requiredExceedBudget'), true);
      renderResults({ ...result, purpleTotalPenalty: getTotalPurplePenalty(items) }, budget);
      return;
    }
    if (!result.chosen.length) {
      setAutoStatus(t('optimizer.budgetTooLowSkills'), true);
      return;
    }
    const mergedResult = {
      ...result,
      chosen: requiredSummary.requiredItems.concat(result.chosen),
      used: result.used + requiredSummary.requiredCost,
      best: result.best + requiredSummary.requiredScore,
      purpleTotalPenalty: getTotalPurplePenalty(items),
    };
    applyAutoHighlights(
      mergedResult.chosen.map((it) => it.id),
      candidates.map((it) => it.id)
    );
    renderResults(mergedResult, budget);
    setAutoStatus(
      t('optimizer.highlightedSkills', {
        chosen: mergedResult.chosen.length,
        total: candidates.length,
        used: mergedResult.used,
        budget: budget,
      })
    );
  }

  function clearResults() {
    if (resultsEl) resultsEl.hidden = true;
    if (bestScoreEl) bestScoreEl.textContent = '0';
    if (usedPointsEl) usedPointsEl.textContent = '0';
    if (totalPointsEl)
      totalPointsEl.textContent = String(parseInt(budgetInput.value || '0', 10) || 0);
    if (remainingPointsEl) remainingPointsEl.textContent = totalPointsEl.textContent;
    if (selectedListEl) selectedListEl.innerHTML = '';
    if (aptitudeScorePill) aptitudeScorePill.style.display = 'none';
    if (teamConsistencyPill) teamConsistencyPill.style.display = 'none';
    if (teamExpectedPill) teamExpectedPill.style.display = 'none';
    if (teamSVPill) teamSVPill.style.display = 'none';
    if (teamActivationsPill) teamActivationsPill.style.display = 'none';
    if (teamSVPerSPPill) teamSVPerSPPill.style.display = 'none';
    if (teamDensityPill) teamDensityPill.style.display = 'none';
    if (teamPredictedScorePill) teamPredictedScorePill.style.display = 'none';
    if (teamExplainPanel) teamExplainPanel.style.display = 'none';
    lastSkillScore = 0;
    ratingEngine.updateRatingDisplay(0);
  }

  // ---------- Live optimize helpers ----------
  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function tryAutoOptimize() {
    const budget = parseInt(budgetInput.value, 10);
    if (isNaN(budget) || budget < 0) {
      clearResults();
      return;
    }
    const { items, rowsMeta } = collectItems();
    if (!items.length) {
      clearResults();
      return;
    }
    if (getOptimizeMode() === TEAM_TRIALS_MODE) {
      const teamResult = optimizeTeamTrialsCandidates(items, budget);
      renderResults({ ...teamResult, purpleTotalPenalty: getTotalPurplePenalty(items) }, budget);
      return;
    }
    const requiredSummary = expandRequired(items);
    if (requiredSummary.requiredCost > budget) {
      renderResults(
        {
          best: 0,
          chosen: [],
          used: 0,
          error: 'required_unreachable',
          purpleTotalPenalty: getTotalPurplePenalty(items),
        },
        budget
      );
      return;
    }
    const optionalItems = adjustCircleOptionalScores(
      items.filter((it) => !requiredSummary.requiredIds.has(it.id)),
      requiredSummary
    );
    const groups = buildGroups(optionalItems, rowsMeta);
    const result = optimizeGrouped(groups, optionalItems, budget - requiredSummary.requiredCost);
    const mergedResult = {
      ...result,
      chosen: requiredSummary.requiredItems.concat(result.chosen),
      used: result.used + requiredSummary.requiredCost,
      best: result.best + requiredSummary.requiredScore,
      purpleTotalPenalty: getTotalPurplePenalty(items),
    };
    renderResults(mergedResult, budget);
  }
  let autoOptimizeIdleHandle = null;
  function scheduleAutoOptimize() {
    if (autoOptimizeIdleHandle != null) {
      if (typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(autoOptimizeIdleHandle);
      } else {
        window.clearTimeout(autoOptimizeIdleHandle);
      }
      autoOptimizeIdleHandle = null;
    }
    if (typeof window.requestIdleCallback === 'function') {
      autoOptimizeIdleHandle = window.requestIdleCallback(
        () => {
          autoOptimizeIdleHandle = null;
          tryAutoOptimize();
        },
        { timeout: 400 }
      );
      return;
    }
    autoOptimizeIdleHandle = window.setTimeout(() => {
      autoOptimizeIdleHandle = null;
      tryAutoOptimize();
    }, 0);
  }
  const autoOptimizeDebounced = debounce(scheduleAutoOptimize, 140);
  const saveStateDebounced = debounce(() => saveState(), 220);

  function rebuildSkillCaches() {
    const nextIndex = new Map();
    const nextIdIndex = new Map();
    const nextLooseLookup = new Map();
    const names = [];
    const seenSuggestions = new Set();
    const isJPServer = getSkillLanguage() === 'jp';
    const siteLanguage = getSiteLanguage();
    const officialOnlyActive = isOfficialEnglishOnlyEnabled() && officialEnglishNameSet.size > 0;

    const addLooseLookup = (value, skill) => {
      const key = normalizeLooseSkillKey(value);
      if (key && !nextLooseLookup.has(key)) nextLooseLookup.set(key, skill);
    };

    const addSuggestionName = (value) => {
      const label = (value || '').trim();
      if (!label) return;
      const key = normalize(label);
      if (!key || seenSuggestions.has(key)) return;
      seenSuggestions.add(key);
      names.push(label);
    };

    // Track EN name collisions for disambiguation
    const enNameCollisions = new Map(); // normalizedKey -> [enriched, ...]
    // Track which keys in nextIndex were claimed by a skill's primary name so
    // that cross-contaminated alias lists (e.g. a legacy `enname` shared with
    // another skill's `name_en`) can't displace a primary name.
    const primaryKeys = new Set();
    const enrichedBySkill = new Map(); // skill -> enriched (shared across passes)

    // Pass 1: claim primary-name keys and build enriched records.
    Object.entries(skillsByCategory).forEach(([category, list = []]) => {
      list.forEach((skill) => {
        if (!skill || !skill.name) return;
        const key = normalize(skill.name);
        const enriched = { ...skill, category };
        enrichedBySkill.set(skill, enriched);

        if (!nextIndex.has(key) || !primaryKeys.has(key)) {
          nextIndex.set(key, enriched);
          primaryKeys.add(key);
          enNameCollisions.set(key, [enriched]);
        } else {
          // Collision: store under disambiguated key using JP name
          if (!enNameCollisions.has(key)) enNameCollisions.set(key, [nextIndex.get(key)]);
          enNameCollisions.get(key).push(enriched);
          const jpSuffix = (enriched.jpName || '').trim();
          if (jpSuffix) {
            const disambigKey = normalize(skill.name + ' (' + jpSuffix + ')');
            if (disambigKey && !nextIndex.has(disambigKey)) {
              nextIndex.set(disambigKey, enriched);
              addLooseLookup(skill.name + ' (' + jpSuffix + ')', enriched);
            }
          }
          const firstEnriched = nextIndex.get(key);
          const firstJpSuffix = (firstEnriched?.jpName || '').trim();
          if (firstJpSuffix) {
            const firstDisambigKey = normalize(firstEnriched.name + ' (' + firstJpSuffix + ')');
            if (!nextIndex.has(firstDisambigKey)) {
              nextIndex.set(firstDisambigKey, firstEnriched);
              addLooseLookup(firstEnriched.name + ' (' + firstJpSuffix + ')', firstEnriched);
            }
          }
        }
        addLooseLookup(skill.name, enriched);
      });
    });

    // Pass 2: index aliases, localized names, and circle base names — but
    // never overwrite a key already claimed by a primary name.
    Object.entries(skillsByCategory).forEach(([category, list = []]) => {
      list.forEach((skill) => {
        if (!skill || !skill.name) return;
        const enriched = enrichedBySkill.get(skill);
        if (!enriched) return;

        // ◎ skills with a paired ○: index under full name but skip from datalist
        // ○ skills with a paired ◎: also index under base name, show base name in datalist
        const isDoubleCircle = !!skill.circleUpgradeOf; // ◎ with paired ○
        const isPairedSingle = !!skill.circleUpgrade; // ○ with paired ◎

        if (Array.isArray(skill.aliasNames) && skill.aliasNames.length) {
          skill.aliasNames.forEach((alias) => {
            const aliasKey = normalize(alias);
            if (aliasKey && !nextIndex.has(aliasKey)) nextIndex.set(aliasKey, enriched);
            addLooseLookup(alias, enriched);
          });
        }
        if (skill.localizedName) {
          const localizedKey = normalize(skill.localizedName);
          if (localizedKey && !nextIndex.has(localizedKey)) nextIndex.set(localizedKey, enriched);
          addLooseLookup(skill.localizedName, enriched);
        }
        if (isPairedSingle && skill.circleBaseName) {
          // Also index under the bare base name → resolves to ○ variant
          const baseKey = normalize(skill.circleBaseName);
          if (!nextIndex.has(baseKey)) nextIndex.set(baseKey, enriched);
          addLooseLookup(skill.circleBaseName, enriched);
        }

        if (!isDoubleCircle && !skill.isEvo) {
          // Show base name in datalist for paired ○, full name otherwise
          const displayName = isPairedSingle ? skill.circleBaseName : skill.name;

          if (siteLanguage === 'jp') {
            // JP site language: show only JP name in datalist
            let jpDisplay;
            if (isJPServer) {
              jpDisplay =
                isPairedSingle && skill.jpCircleBaseName ? skill.jpCircleBaseName : skill.jpName;
            }
            if (!jpDisplay && typeof window.getLocalizedSkillName === 'function') {
              const jp = window.getLocalizedSkillName(displayName);
              if (jp !== displayName) jpDisplay = jp;
            }
            addSuggestionName(jpDisplay || displayName);
          } else {
            // EN site language: show only English name(s) in datalist
            addSuggestionName(displayName);
            if (Array.isArray(skill.aliasNames) && skill.aliasNames.length) {
              skill.aliasNames.forEach((alias) => {
                // Skip Japanese aliases when showing English
                if (hasJapaneseScript(alias)) return;
                // Strip ○/◎ suffix from aliases for paired circle skills
                const clean =
                  isPairedSingle && (alias.endsWith(' ○') || alias.endsWith(' ◎'))
                    ? alias.slice(0, -2)
                    : alias;
                // Skip non-official aliases when Official English Only is active
                if (
                  officialOnlyActive &&
                  !officialEnglishNameSet.has(normalizeOfficialSkillName(clean))
                )
                  return;
                addSuggestionName(clean);
              });
            }
            if (skill.localizedName && !hasJapaneseScript(skill.localizedName)) {
              const clean =
                isPairedSingle &&
                (skill.localizedName.endsWith(' ○') || skill.localizedName.endsWith(' ◎'))
                  ? skill.localizedName.slice(0, -2)
                  : skill.localizedName;
              if (
                !officialOnlyActive ||
                officialEnglishNameSet.has(normalizeOfficialSkillName(clean))
              ) {
                addSuggestionName(clean);
              }
            }
          }
        }

        if (skill.skillId) {
          const sid = String(skill.skillId);
          if (!nextIdIndex.has(sid)) nextIdIndex.set(sid, enriched);
        }
      });
    });
    // Post-process: disambiguate datalist suggestions for colliding EN names
    enNameCollisions.forEach((group, key) => {
      if (group.length < 2) return;
      // Remove the single clean-name suggestion
      const cleanLabel = group[0].name;
      const cleanIdx = names.indexOf(cleanLabel);
      if (cleanIdx !== -1) {
        names.splice(cleanIdx, 1);
        seenSuggestions.delete(normalize(cleanLabel));
      }
      // Add disambiguated entries for each skill in the collision group
      group.forEach((s) => {
        const jpSuffix = (s.jpName || '').trim();
        if (jpSuffix) {
          addSuggestionName(s.name + ' (' + jpSuffix + ')');
        } else {
          addSuggestionName(s.name);
        }
      });
    });

    skillIndex = nextIndex;
    skillLookupLoose = nextLooseLookup;
    skillIdIndex = nextIdIndex;
    names.sort((a, b) => a.localeCompare(b));
    allSkillNames = names;
    allSkillNamesNormalized = names.map((n) => normalize(n));
    datalistPrefix1Index = new Map();
    datalistPrefix2Index = new Map();
    for (let i = 0; i < allSkillNamesNormalized.length; i++) {
      const normalizedName = allSkillNamesNormalized[i];
      if (!normalizedName) continue;
      const p1 = normalizedName.slice(0, 1);
      if (p1) {
        if (!datalistPrefix1Index.has(p1)) datalistPrefix1Index.set(p1, []);
        datalistPrefix1Index.get(p1).push(i);
      }
      const p2 = normalizedName.slice(0, 2);
      if (p2.length === 2) {
        if (!datalistPrefix2Index.has(p2)) datalistPrefix2Index.set(p2, []);
        datalistPrefix2Index.get(p2).push(i);
      }
    }
    datalistSuggestionCache.clear();
    lastDatalistPrefix = null;
    skillLibraryRevision += 1;
    rebuildSharedDatalist();
    refreshAllRows();
  }

  function findSkillByName(name) {
    const key = normalize(name);
    if (!key) return null;
    const direct = skillIndex.get(key);
    if (direct) return direct;
    const looseKey = normalizeLooseSkillKey(name);
    if (!looseKey) return null;
    return skillLookupLoose.get(looseKey) || null;
  }

  function formatSkillDisplayName(skillOrName) {
    const skill =
      typeof skillOrName === 'string' ? findSkillByName(skillOrName) : skillOrName || null;
    if (!skill) return typeof skillOrName === 'string' ? skillOrName : '';
    let displayName;
    if (getSkillLanguage() !== 'jp') {
      const official = officialEnglishNameMap.get(normalize(skill.name));
      displayName = official || skill.name;
    } else {
      displayName = getPreferredSkillInputName(skill, skill.name);
    }
    if (typeof window.getLocalizedSkillName === 'function')
      return window.getLocalizedSkillName(displayName);
    return displayName;
  }

  function getEvosForSkill(skillName) {
    const key = normalize(skillName);
    const direct = key ? evosByParentName.get(key) : null;
    if (direct?.length) return direct;
    // JP CSV: evo_parents are in JP but skill.name may be EN (swapped to localized_name).
    // Try all name variants to find the match.
    const skill = findSkillByName(skillName);
    if (!skill) return [];
    for (const alias of skill.aliasNames || []) {
      const ak = normalize(alias);
      const found = ak ? evosByParentName.get(ak) : null;
      if (found?.length) return found;
    }
    if (skill.localizedName) {
      const lk = normalize(skill.localizedName);
      const found = lk ? evosByParentName.get(lk) : null;
      if (found?.length) return found;
    }
    return [];
  }

  function appendLocalizedDisplayName(displayName, fallbackSkillName = '') {
    if (getSkillLanguage() !== 'jp') return displayName;
    if (getSiteLanguage() === 'jp') return displayName;
    const skill =
      findSkillByName(displayName) ||
      (fallbackSkillName ? findSkillByName(fallbackSkillName) : null);
    if (!skill) return displayName;
    const preferred = getPreferredSkillInputName(skill, displayName);
    if (!preferred) return displayName;
    const markerMatch = (displayName || '').match(/\s([○◎])$/);
    const marker = markerMatch ? markerMatch[1] : '';
    if (marker && !preferred.endsWith(marker)) return `${preferred} ${marker}`;
    return preferred;
  }

  function formatCategoryLabel(cat) {
    if (!cat) return t('optimizer.auto');
    const canon = canonicalCategory(cat);
    if (canon === 'gold') return t('optimizer.catGold');
    if (canon === 'purple') return t('optimizer.catPurple');
    if (canon === 'evo') return t('optimizer.catEvo');
    if (canon === 'ius') return t('optimizer.catUnique');
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  }

  function applyFallbackSkills(reason) {
    skillsByCategory = {
      golden: [
        {
          name: 'Concentration',
          score: { base: 508, good: 508, average: 415, bad: 369, terrible: 323 },
          baseCost: 508,
          checkType: 'End',
        },
        {
          name: 'Professor of Curvature',
          score: { base: 508, good: 508, average: 415, bad: 369, terrible: 323 },
          baseCost: 508,
          checkType: 'Medium',
        },
      ],
      yellow: [
        {
          name: 'Groundwork',
          score: { base: 217, good: 217, average: 177, bad: 158, terrible: 138 },
          baseCost: 217,
          checkType: 'Front',
        },
        {
          name: 'Corner Recovery',
          score: { base: 217, good: 217, average: 177, bad: 158, terrible: 138 },
          baseCost: 217,
          checkType: 'Late',
        },
      ],
      blue: [
        {
          name: 'Stealth Mode',
          score: { base: 195, good: 195, average: 159, bad: 142, terrible: 124 },
          baseCost: 195,
          checkType: 'Late',
        },
      ],
    };
    categories = Object.keys(skillsByCategory);
    rebuildSkillCaches();
    libStatus.textContent = t('optimizer.usingFallback', { reason: reason });
  }

  function parseCSV(text) {
    const rows = [];
    let i = 0,
      field = '',
      row = [],
      inQuotes = false;
    while (i < text.length) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') {
          row.push(field);
          field = '';
        } else if (c === '\r') {
        } else if (c === '\n') {
          row.push(field);
          rows.push(row);
          row = [];
          field = '';
        } else {
          field += c;
        }
      }
      i++;
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function loadFromCSVContent(csvText) {
    const rows = parseCSV(csvText);
    if (!rows.length) return false;
    const header = rows[0].map((h) => (h || '').toString().trim().toLowerCase());
    const idx = {
      type: header.indexOf('skill_type'),
      name: header.indexOf('name'),
      alias: header.indexOf('alias_name'),
      localized: header.indexOf('localized_name'),
      base: header.indexOf('base_value'),
      baseCost: header.indexOf('base'), // new CSV uses `base` for raw cost
      sa: header.indexOf('s_a'),
      bc: header.indexOf('b_c'),
      def: header.indexOf('d_e_f'),
      g: header.indexOf('g'),
      apt1: header.indexOf('apt_1'),
      apt2: header.indexOf('apt_2'),
      apt3: header.indexOf('apt_3'),
      apt4: header.indexOf('apt_4'),
      check: header.indexOf('affinity_role'),
      checkAlt: header.indexOf('affinity'),
      isEvo: header.indexOf('is_evo'),
      evoParents: header.indexOf('evo_parents'),
    };
    if (idx.name === -1) return false;
    const officialFilterRequested = getSkillLanguage() === 'en' && isOfficialEnglishOnlyEnabled();
    const officialFilterActive = officialFilterRequested && officialEnglishNameSet.size > 0;
    let filteredOut = 0;
    let loaded = 0;
    const catMap = {};
    // First pass: collect names that have official localized translations
    const officiallyLocalizedNames = new Set();
    if (getSkillLanguage() !== 'jp') {
      for (let r = 1; r < rows.length; r++) {
        const cols = rows[r];
        if (!cols || !cols.length) continue;
        const n = (cols[idx.name] || '').trim();
        const loc = idx.localized !== -1 ? (cols[idx.localized] || '').trim() : '';
        if (n && loc) officiallyLocalizedNames.add(normalize(n));
      }
    }
    for (let r = 1; r < rows.length; r++) {
      const cols = rows[r];
      if (!cols || !cols.length) continue;
      const rawName = (cols[idx.name] || '').trim();
      const aliasRaw = idx.alias !== -1 ? (cols[idx.alias] || '').trim() : '';
      const localizedName = idx.localized !== -1 ? (cols[idx.localized] || '').trim() : '';
      const aliasNames = aliasRaw
        .split('|')
        .map((entry) => entry.trim())
        .filter(Boolean);
      // JP CSV: use localized_name (official EN) as primary, then first alias; keep JP name as alias
      const isJPCSV = getSkillLanguage() === 'jp';
      const jpOriginalName = isJPCSV ? rawName : '';
      const jpSwapName = isJPCSV ? localizedName || aliasNames[0] || '' : '';
      const name = jpSwapName || rawName;
      if (isJPCSV && jpSwapName && rawName !== name) {
        const rawKey = normalize(rawName);
        if (rawKey && !aliasNames.some((a) => normalize(a) === rawKey)) {
          aliasNames.push(rawName);
        }
      }
      const seenAliases = new Set(aliasNames.map((entry) => normalize(entry)));
      const enrichLookupNames = [name, ...aliasNames];
      if (localizedName && localizedName !== name) enrichLookupNames.push(localizedName);
      if (rawName !== name) enrichLookupNames.push(rawName);
      enrichLookupNames.forEach((lookupName) => {
        const extras = externalAliasLookup.get(normalize(lookupName));
        if (!extras || !extras.size) return;
        extras.forEach((candidate) => {
          const trimmed = (candidate || '').trim();
          const key = normalize(trimmed);
          if (!trimmed || !key || key === normalize(name) || seenAliases.has(key)) return;
          seenAliases.add(key);
          aliasNames.push(trimmed);
        });
      });
      if (!name) continue;
      if (officialFilterActive && !officialEnglishNameSet.has(normalizeOfficialSkillName(name))) {
        filteredOut++;
        continue;
      }
      const type = idx.type !== -1 ? (cols[idx.type] || '').trim().toLowerCase() : 'misc';
      const baseCost = idx.baseCost !== -1 ? parseInt(cols[idx.baseCost] || '', 10) : NaN;
      const rawBase = idx.base !== -1 ? parseInt(cols[idx.base] || '', 10) : NaN;
      const base = RatingShared.normalizeSkillRatingValue(rawBase, type, name);
      const sa = idx.sa !== -1 ? parseInt(cols[idx.sa] || '', 10) : NaN;
      const bc = idx.bc !== -1 ? parseInt(cols[idx.bc] || '', 10) : NaN;
      const def = idx.def !== -1 ? parseInt(cols[idx.def] || '', 10) : NaN;
      const g = idx.g !== -1 ? parseInt(cols[idx.g] || '', 10) : NaN;
      // Alt columns used by the shipped CSV (apt_1..apt_4 for bucketed values)
      const apt1 = idx.apt1 !== -1 ? parseInt(cols[idx.apt1] || '', 10) : NaN;
      const apt2 = idx.apt2 !== -1 ? parseInt(cols[idx.apt2] || '', 10) : NaN;
      const apt3 = idx.apt3 !== -1 ? parseInt(cols[idx.apt3] || '', 10) : NaN;
      const apt4 = idx.apt4 !== -1 ? parseInt(cols[idx.apt4] || '', 10) : NaN;
      const checkTypeRaw =
        idx.check !== -1
          ? (cols[idx.check] || '').trim()
          : idx.checkAlt !== -1
            ? (cols[idx.checkAlt] || '').trim()
            : '';
      const evoParentsRaw = idx.evoParents !== -1 ? (cols[idx.evoParents] || '').trim() : '';
      const evoParentNames = evoParentsRaw
        .split('|')
        .map((entry) => entry.trim())
        .filter(Boolean);
      const isEvo =
        idx.isEvo !== -1
          ? ['1', 'true', 'yes'].includes(
              String(cols[idx.isEvo] || '')
                .trim()
                .toLowerCase()
            )
          : type === 'evo';
      const score = {};
      const baseBucket = !isNaN(base) ? base : !isNaN(baseCost) ? baseCost : NaN;
      const goodVal = !isNaN(sa) ? sa : !isNaN(apt1) ? apt1 : baseBucket;
      const avgVal = !isNaN(bc) ? bc : !isNaN(apt2) ? apt2 : goodVal;
      const badVal = !isNaN(def) ? def : !isNaN(apt3) ? apt3 : avgVal;
      const terrVal = !isNaN(g) ? g : !isNaN(apt4) ? apt4 : badVal;
      if (!isNaN(baseBucket)) score.base = baseBucket;
      if (!isNaN(goodVal)) score.good = goodVal;
      if (!isNaN(avgVal)) score.average = avgVal;
      if (!isNaN(badVal)) score.bad = badVal;
      if (!isNaN(terrVal)) score.terrible = terrVal;
      let meta = null;
      // Try JP name first (unique) to avoid collisions when EN names are duplicated
      const jpLookupName = isJPCSV ? rawName : aliasNames.find((a) => hasJapaneseScript(a)) || '';
      if (jpLookupName) {
        const jpKey = normalize(jpLookupName);
        if (jpKey) meta = skillCostMapByJP.get(jpKey) || null;
      }
      // Fallback to EN name lookup
      if (!meta) {
        const lookupNames = [name, ...aliasNames];
        if (localizedName) lookupNames.push(localizedName);
        for (const lookupName of lookupNames) {
          const exactKey = normalize(lookupName);
          const lookupKey = normalizeCostKey(lookupName);
          meta = skillCostMapExact.get(exactKey) || skillCostMapNormalized.get(lookupKey) || null;
          if (meta) break;
        }
      }
      const resolvedCost =
        meta && typeof meta.cost === 'number' ? meta.cost : isNaN(baseCost) ? undefined : baseCost;
      const isUnique = type === 'ius' || type.includes('ius');
      const parents = !isUnique && Array.isArray(meta?.parents) ? meta.parents : [];
      const lowerSkillId =
        !isUnique && Array.isArray(meta?.versions) && meta.versions.length
          ? String(meta.versions[0])
          : '';
      const skillId = meta?.id;
      // On EN server: skip fan-only skills whose name collides with an officially translated skill
      if (!isJPCSV && !localizedName && officiallyLocalizedNames.has(normalize(name))) {
        filteredOut++;
        continue;
      }
      if (!catMap[type]) catMap[type] = [];
      const resolvedJpName = isJPCSV
        ? jpOriginalName
        : aliasNames.find((a) => hasJapaneseScript(a)) || '';
      catMap[type].push({
        name,
        jpName: resolvedJpName,
        aliasNames,
        localizedName,
        score,
        baseCost: resolvedCost,
        checkType: checkTypeRaw,
        parentIds: parents,
        skillId,
        lowerSkillId,
        isEvo,
        evoParentNames,
      });
      loaded++;
    }
    // ── Link ◎/○ circle skill pairs ──
    // Build a map of base names (without ◎/○ suffix) to their variants
    const circleMap = new Map(); // baseName -> { single: skill, double: skill }
    for (const list of Object.values(catMap)) {
      for (const skill of list) {
        if (skill.name.endsWith(' ◎') || skill.name.endsWith(' ○')) {
          const baseName = skill.name.slice(0, -2); // strip " ◎" or " ○"
          if (!circleMap.has(baseName)) circleMap.set(baseName, {});
          const entry = circleMap.get(baseName);
          if (skill.name.endsWith(' ○')) entry.single = skill;
          else entry.double = skill;
        }
      }
    }
    for (const [baseName, pair] of circleMap) {
      if (pair.single && pair.double) {
        pair.single.circleBaseName = baseName;
        pair.single.circleUpgrade = pair.double.name;
        pair.double.circleBaseName = baseName;
        pair.double.circleUpgradeOf = pair.single.name;
        // Clear lowerSkillId on paired circle skills — their `versions` arrays
        // cross-reference each other, which would create a false parent-child
        // grouping in buildGroups before the circle-specific logic runs.
        pair.single.lowerSkillId = '';
        pair.double.lowerSkillId = '';
        // Store JP circle base names for localized display
        if (pair.single.jpName) {
          pair.single.jpCircleBaseName =
            pair.single.jpName.endsWith(' ○') || pair.single.jpName.endsWith(' ◎')
              ? pair.single.jpName.slice(0, -2)
              : pair.single.jpName;
        }
        if (pair.double.jpName) {
          pair.double.jpCircleBaseName =
            pair.double.jpName.endsWith(' ○') || pair.double.jpName.endsWith(' ◎')
              ? pair.double.jpName.slice(0, -2)
              : pair.double.jpName;
        }
      }
    }

    // ── Build reverse evo lookup: parent name → evo skills ──
    const nextEvosByParent = new Map();
    for (const list of Object.values(catMap)) {
      for (const skill of list) {
        if (!skill.isEvo || !Array.isArray(skill.evoParentNames)) continue;
        skill.evoParentNames.forEach((parentName) => {
          const key = normalize(parentName);
          if (!key) return;
          if (!nextEvosByParent.has(key)) nextEvosByParent.set(key, []);
          nextEvosByParent.get(key).push(skill);
        });
      }
    }
    evosByParentName = nextEvosByParent;

    skillsByCategory = catMap;
    categories = Object.keys(catMap).sort((a, b) => {
      const ia = preferredOrder.indexOf(a),
        ib = preferredOrder.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return a.localeCompare(b);
    });
    lastCSVLoadStats = {
      loaded,
      filteredOut,
      officialFilterApplied: officialFilterActive,
    };
    rebuildSkillCaches();
    return true;
  }

  function getSkillsCSVCandidates(lang) {
    return lang === 'jp'
      ? ['/assets/uma_skills_jp.csv', './assets/uma_skills_jp.csv', '/assets/uma_skills.csv']
      : ['/assets/uma_skills.csv', './assets/uma_skills.csv'];
  }

  function preloadSkillsCSV() {
    const lang = getSkillLanguage();
    const url = getSkillsCSVCandidates(lang)[0];
    return fetch(url, { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((text) => ({ lang, url, text, error: null }))
      .catch((error) => ({ lang, url, text: '', error }));
  }

  async function loadSkillsCSV(preloadedCSV = null) {
    const lang = getSkillLanguage();
    const candidates = getSkillsCSVCandidates(lang);
    let lastErr = null;
    for (const url of candidates) {
      try {
        let text = '';
        if (preloadedCSV && url === candidates[0]) {
          const preloaded = await preloadedCSV;
          preloadedCSV = null;
          if (preloaded.lang === lang && preloaded.url === url) {
            if (preloaded.text) text = preloaded.text;
            else if (preloaded.error) throw preloaded.error;
          }
        }
        if (!text) {
          // Use default caching - Vercel headers control TTL
          const res = await fetch(url, { cache: 'force-cache' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          text = await res.text();
        }
        skillsCsvCache = text;
        const ok = loadFromCSVContent(text);
        if (ok) {
          loadedSkillLibraryLanguage = lang;
          updateSkillLibraryStatus();
          return true;
        }
      } catch (e) {
        lastErr = e;
      }
    }
    console.error('Failed to load CSV from known locations', lastErr);
    libStatus.textContent = t('optimizer.csvFallback');
    applyFallbackSkills('CSV not found / blocked');
    return false;
  }

  function updateSkillLibraryStatus() {
    if (!libStatus) return;
    const totalSkills = Object.values(skillsByCategory).reduce((acc, arr) => acc + arr.length, 0);
    const parts = [t('optimizer.loadedSkills', { count: totalSkills })];
    if (lastCSVLoadStats.officialFilterApplied) {
      parts.push(t('optimizer.officialEnFiltered', { count: lastCSVLoadStats.filteredOut }));
    } else if (isOfficialEnglishOnlyEnabled() && officialEnglishNameSet.size === 0) {
      parts.push(t('optimizer.officialEnUnavailable'));
    }
    libStatus.textContent = parts.join(' • ');
  }

  function rebuildSkillLibraryFromCache() {
    if (!skillsCsvCache) return false;
    const ok = loadFromCSVContent(skillsCsvCache);
    if (!ok) return false;
    updateSkillLibraryStatus();
    return true;
  }

  function isGoldCategory(cat) {
    const v = (cat || '').toLowerCase();
    return v === 'golden' || v === 'gold' || v.includes('gold');
  }

  function canonicalCategory(cat) {
    const v = (cat || '').toLowerCase();
    if (!v) return '';
    if (v === 'golden' || v === 'gold' || v.includes('gold')) return 'gold';
    if (v === 'purple' || v === 'violet') return 'purple';
    if (v === 'evo' || v === 'evolution' || v.includes('evo')) return 'evo';
    if (v === 'ius' || v.includes('ius')) return 'ius';
    if (v === 'yellow' || v === 'blue' || v === 'green' || v === 'red') return v;
    return v;
  }

  function getBaseCategoryFromSkill(skill) {
    if (!skill || !isGoldCategory(skill.category)) return '';
    const candidateId =
      skill.lowerSkillId ||
      (Array.isArray(skill.parentIds) && skill.parentIds.length ? skill.parentIds[0] : '');
    if (!candidateId) return '';
    const lower = skillIdIndex.get(String(candidateId));
    if (!lower) return '';
    const base = canonicalCategory(lower.category);
    return base && base !== 'gold' ? base : '';
  }

  function setBaseCategory(row, skill) {
    if (!row) return;
    delete row.dataset.baseCategory;
    const base = getBaseCategoryFromSkill(skill);
    if (base) row.dataset.baseCategory = base;
  }

  function getBaseCategoryForResult(item) {
    if (!item || !isGoldCategory(item.category)) return '';
    const candidateId =
      item.lowerSkillId ||
      (Array.isArray(item.parentIds) && item.parentIds.length ? item.parentIds[0] : '');
    if (candidateId) {
      const lower = skillIdIndex.get(String(candidateId));
      if (lower) {
        const base = canonicalCategory(lower.category);
        return base && base !== 'gold' ? base : '';
      }
    }
    if (item.skillId !== undefined && item.skillId !== null) {
      const skill = skillIdIndex.get(String(item.skillId));
      return getBaseCategoryFromSkill(skill);
    }
    return '';
  }

  function applyCategoryAccent(row, category) {
    const cls = [
      'cat-gold',
      'cat-yellow',
      'cat-blue',
      'cat-green',
      'cat-red',
      'cat-purple',
      'cat-evo',
      'cat-ius',
      'cat-orange',
    ];
    row.classList.remove(...cls);
    const c = canonicalCategory(category);
    if (!c) return;
    if (c === 'gold') row.classList.add('cat-gold');
    else if (c === 'yellow') row.classList.add('cat-yellow');
    else if (c === 'blue') row.classList.add('cat-blue');
    else if (c === 'green') row.classList.add('cat-green');
    else if (c === 'red') row.classList.add('cat-red');
    else if (c === 'purple') row.classList.add('cat-purple');
    else if (c === 'evo') row.classList.add('cat-evo');
    else if (c === 'ius') row.classList.add('cat-ius');
  }

  // Performance optimization: create shared datalist once instead of per-row
  function getOrCreateSharedDatalist() {
    if (sharedSkillDatalist) return sharedSkillDatalist;
    sharedSkillDatalist = document.createElement('datalist');
    sharedSkillDatalist.id = 'skills-datalist-shared';
    document.body.appendChild(sharedSkillDatalist);
    rebuildSharedDatalist();
    return sharedSkillDatalist;
  }

  function rebuildSharedDatalist(prefix = '') {
    if (!sharedSkillDatalist) return;
    const normalizedPrefix = normalize(prefix);
    if (normalizedPrefix === lastDatalistPrefix) return;
    lastDatalistPrefix = normalizedPrefix;

    const suggestionLimit = normalizedPrefix
      ? MAX_SKILL_SUGGESTIONS_WITH_PREFIX
      : MAX_SKILL_SUGGESTIONS;

    const cacheKey = `${normalizedPrefix}|${suggestionLimit}`;
    let suggestionNames = datalistSuggestionCache.get(cacheKey);
    if (!suggestionNames) {
      suggestionNames = [];
      let candidateIndexes = null;
      if (normalizedPrefix) {
        if (normalizedPrefix.length >= 2) {
          candidateIndexes = datalistPrefix2Index.get(normalizedPrefix.slice(0, 2)) || [];
        } else {
          candidateIndexes = datalistPrefix1Index.get(normalizedPrefix.slice(0, 1)) || [];
        }
      }
      // Phase 1: prefix matches (fast, via index)
      var prefixSet = new Set();
      if (candidateIndexes) {
        for (let j = 0; j < candidateIndexes.length; j++) {
          if (suggestionNames.length >= suggestionLimit) break;
          const idx = candidateIndexes[j];
          const normalizedName = allSkillNamesNormalized[idx];
          if (!normalizedName || !normalizedName.startsWith(normalizedPrefix)) continue;
          suggestionNames.push(allSkillNames[idx]);
          prefixSet.add(idx);
        }
      } else if (!normalizedPrefix) {
        for (let i = 0; i < allSkillNames.length; i++) {
          if (suggestionNames.length >= suggestionLimit) break;
          suggestionNames.push(allSkillNames[i]);
          prefixSet.add(i);
        }
      }
      // Phase 2: substring matches (scan all, skip already-added prefix matches)
      if (normalizedPrefix && suggestionNames.length < suggestionLimit) {
        for (let i = 0; i < allSkillNamesNormalized.length; i++) {
          if (suggestionNames.length >= suggestionLimit) break;
          if (prefixSet.has(i)) continue;
          const normalizedName = allSkillNamesNormalized[i];
          if (!normalizedName || !normalizedName.includes(normalizedPrefix)) continue;
          suggestionNames.push(allSkillNames[i]);
        }
      }
      if (datalistSuggestionCache.size >= DATALIST_CACHE_MAX_KEYS) {
        datalistSuggestionCache.clear();
      }
      datalistSuggestionCache.set(cacheKey, suggestionNames);
    }

    sharedSkillDatalist.innerHTML = '';
    const frag = document.createDocumentFragment();
    suggestionNames.forEach((name) => {
      const normalizedName = normalize(name);
      const opt = document.createElement('option');
      opt.value = name;
      const skill = findSkillByName(name);
      const isCanonical = !!skill && normalizedName === normalize(skill.name);
      const display = isCanonical ? formatSkillDisplayName(skill) : name;
      if (display && display !== name) {
        opt.label = display;
        opt.textContent = display;
      }
      frag.appendChild(opt);
    });
    sharedSkillDatalist.appendChild(frag);
  }

  function refreshAllRows() {
    const dataRows = rowsEl.querySelectorAll('.optimizer-row');
    dataRows.forEach((row) => {
      if (typeof row.syncSkillCategory === 'function') {
        row.syncSkillCategory({ triggerOptimize: false, allowLinking: false, updateCost: false });
      }
    });
  }

  function isTopLevelRow(row) {
    return !row.dataset.parentGoldId && !row.dataset.parentCircleId && !row.dataset.parentEvoId;
  }
  function isRowFilled(row) {
    const name = (row.querySelector('.skill-name')?.value || '').trim();
    const costVal = row.querySelector('.cost')?.value;
    const cost = typeof costVal === 'string' && costVal.length ? parseInt(costVal, 10) : NaN;
    const skillKnown = !!findSkillByName(name);
    return skillKnown && !isNaN(cost) && cost >= 0;
  }
  function scrollRowIntoView(row, { focus = true } = {}) {
    if (!row) return;
    const input = row.querySelector('.skill-name');
    const target = input || row;
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (focus && input) input.focus({ preventScroll: true });
    });
  }
  function shouldAutoScrollNewRow() {
    return rowsEl && rowsEl.contains(document.activeElement);
  }
  function ensureOneEmptyRow() {
    const rows = Array.from(rowsEl.querySelectorAll('.optimizer-row')).filter(isTopLevelRow);
    if (!rows.length) {
      rowsEl.appendChild(makeRow());
      return;
    }
    const last = rows[rows.length - 1];
    const lastFilled = isRowFilled(last);
    if (lastFilled) {
      const newRow = makeRow();
      rowsEl.appendChild(newRow);
      if (shouldAutoScrollNewRow()) scrollRowIntoView(newRow);
    } else {
      // Remove extra trailing empty top-level rows, keep exactly one empty
      for (let i = rows.length - 2; i >= 0; i--) {
        if (!isRowFilled(rows[i])) {
          rows[i].remove();
        } else break;
      }
    }
  }

  function clearAllRows() {
    // Clean up skill key tracking and remove all rows
    Array.from(rowsEl.querySelectorAll('.optimizer-row')).forEach((n) => {
      if (typeof n.cleanupSkillTracking === 'function') {
        n.cleanupSkillTracking();
      }
      n.remove();
    });
    // add a fresh empty row and reset UI
    rowsEl.appendChild(makeRow());
    ensureOneEmptyRow();
    clearResults();
    saveState();
  }

  function makeRow() {
    getOrCreateSharedDatalist(); // Ensure shared datalist exists
    const row = document.createElement('div');
    row.className = 'optimizer-row';
    const id = Math.random().toString(36).slice(2);
    row.dataset.rowId = id;
    row.innerHTML = `
      <div class="type-cell">
        <label data-i18n="optimizer.type">${t('optimizer.type')}</label>
        <div class="category-chip" data-empty="true">${t('optimizer.auto')}</div>
      </div>
      <div class="skill-cell">
        <label data-i18n="optimizer.skill">${t('optimizer.skill')}</label>
        <input type="text" class="skill-name field-control" list="skills-datalist-shared" data-i18n-placeholder="optimizer.startTyping" placeholder="${t('optimizer.startTyping')}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
        <div class="skill-name-meta" data-empty="true"></div>
        <div class="dup-warning" role="status" aria-live="polite"></div>
        <div class="evo-options" data-empty="true"></div>
      </div>
      <div class="hint-cell">
        <label for="hint-level-${id}" data-i18n="optimizer.hintDiscount">${t('optimizer.hintDiscount')}</label>
        <div class="hint-controls">
          <select id="hint-level-${id}" class="hint-level field-control">
            ${HINT_LEVELS.map((lvl) => `<option value="${lvl}">${t('optimizer.hintLvFormat', { lvl: lvl, pct: getTotalHintDiscountPct(lvl) })}</option>`).join('')}
          </select>
          <div class="base-cost" data-empty="true">Base ?</div>
        </div>
      </div>
      <div class="cost-cell">
        <label data-i18n="optimizer.cost">${t('optimizer.cost')}</label>
        <input type="number" min="0" step="1" class="cost field-control" data-i18n-placeholder="optimizer.cost" placeholder="${t('optimizer.cost')}" />
      </div>
      <div class="actions-cell">
        <div class="required-cell">
          <label data-i18n="optimizer.mustBuy">${t('optimizer.mustBuy')}</label>
          <label class="required-toggle">
            <input type="checkbox" class="required-skill" />
            <span data-i18n="optimizer.lock">${t('optimizer.lock')}</span>
          </label>
        </div>
        <div class="remove-cell">
          <label class="remove-label">&nbsp;</label>
          <button type="button" class="btn remove" data-i18n="optimizer.removeRow">${t('optimizer.removeRow')}</button>
        </div>
      </div>
    `;
    const removeBtn = row.querySelector('.remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        // Clean up skill key tracking for this row
        if (typeof row.cleanupSkillTracking === 'function') {
          row.cleanupSkillTracking();
        }
        if (row.dataset.lowerRowId) {
          const linked = rowsEl.querySelector(
            `.optimizer-row[data-row-id="${row.dataset.lowerRowId}"]`
          );
          if (linked) {
            // Also clean up the lower's ◎ circle upgrade row if it exists
            if (linked.dataset.circleRowId) {
              const circleRow = rowsEl.querySelector(
                `.optimizer-row[data-row-id="${linked.dataset.circleRowId}"]`
              );
              if (circleRow) {
                if (typeof circleRow.cleanupSkillTracking === 'function') {
                  circleRow.cleanupSkillTracking();
                }
                circleRow.remove();
              }
            }
            if (typeof linked.cleanupSkillTracking === 'function') {
              linked.cleanupSkillTracking();
            }
            linked.remove();
          }
          delete row.dataset.lowerRowId;
        }
        if (row.dataset.circleRowId) {
          const linked = rowsEl.querySelector(
            `.optimizer-row[data-row-id="${row.dataset.circleRowId}"]`
          );
          if (linked) {
            if (typeof linked.cleanupSkillTracking === 'function') {
              linked.cleanupSkillTracking();
            }
            linked.remove();
          }
          delete row.dataset.circleRowId;
        }
        if (row.dataset.evoRowIds) cleanupEvoRows();
        row.remove();
        saveState();
        ensureOneEmptyRow();
        autoOptimizeDebounced();
      });
    }
    const skillInput = row.querySelector('.skill-name');
    const categoryChip = row.querySelector('.category-chip');
    const hintSelect = row.querySelector('.hint-level');
    const dupWarning = row.querySelector('.dup-warning');
    const skillNameMeta = row.querySelector('.skill-name-meta');
    let dupWarningTimer = null;
    const baseCostDisplay = row.querySelector('.base-cost');
    const costInput = row.querySelector('.cost');
    const requiredToggle = row.querySelector('.required-skill');
    let trackedSkillKey = '';

    function getHintLevel() {
      if (!hintSelect) return 0;
      const val = parseInt(hintSelect.value, 10);
      return isNaN(val) ? 0 : val;
    }

    function updateBaseCostDisplay(skill) {
      if (!baseCostDisplay) return;
      const baseCost =
        skill && typeof skill.baseCost === 'number' && !isNaN(skill.baseCost)
          ? skill.baseCost
          : NaN;
      const baseScore =
        skill && skill.score && typeof skill.score === 'object' ? skill.score.base : NaN;
      if (!isNaN(baseCost)) row.dataset.baseCost = String(baseCost);
      else delete row.dataset.baseCost;
      const displayScore = !isNaN(baseScore) ? baseScore : evaluateSkillScore(skill || {});
      if (!isNaN(displayScore)) {
        baseCostDisplay.textContent = t('optimizer.scoreDisplay', { score: displayScore });
        baseCostDisplay.dataset.empty = 'false';
      } else {
        baseCostDisplay.textContent = t('optimizer.scoreUnknown');
        baseCostDisplay.dataset.empty = 'true';
      }
    }

    function getLowerDiscountedCost(skill) {
      let lowerBaseCost = NaN;
      let lowerHintLevel = 0;
      if (row.dataset.lowerRowId) {
        const linked = rowsEl.querySelector(
          `.optimizer-row[data-row-id="${row.dataset.lowerRowId}"]`
        );
        if (linked) {
          const linkedCostEl = linked.querySelector('.cost');
          const linkedCostVal = parseInt(linkedCostEl?.value || '', 10);
          if (!isNaN(linkedCostVal)) {
            // Include the ◎ circle upgrade cost if the lower has a linked ◎ sub-row
            let circleCost = 0;
            if (linked.dataset.circleRowId) {
              const circleRow = rowsEl.querySelector(
                `.optimizer-row[data-row-id="${linked.dataset.circleRowId}"]`
              );
              if (circleRow) {
                const cVal = parseInt(circleRow.querySelector('.cost')?.value || '', 10);
                if (!isNaN(cVal)) circleCost = cVal;
              }
            }
            return linkedCostVal + circleCost;
          }
          const hintEl = linked.querySelector('.hint-level');
          const hintVal = parseInt(hintEl?.value || '0', 10);
          lowerHintLevel = isNaN(hintVal) ? 0 : hintVal;
          if (linked.dataset.baseCost) {
            const parsed = parseInt(linked.dataset.baseCost, 10);
            if (!isNaN(parsed)) lowerBaseCost = parsed;
          }
        }
      }
      if (isNaN(lowerBaseCost)) {
        const candidateId =
          skill.lowerSkillId || (Array.isArray(skill.parentIds) ? skill.parentIds[0] : '');
        if (candidateId) {
          const lower = skillIdIndex.get(String(candidateId));
          if (lower && typeof lower.baseCost === 'number') lowerBaseCost = lower.baseCost;
          if (isNaN(lowerBaseCost)) {
            const metaCost = skillCostById.get(String(candidateId));
            if (typeof metaCost === 'number') lowerBaseCost = metaCost;
          }
        }
      }
      if (isNaN(lowerBaseCost)) return NaN;
      return calculateDiscountedCost(lowerBaseCost, lowerHintLevel);
    }

    function applyHintedCost(skill) {
      if (!costInput) return;
      const baseCost = (() => {
        if (skill && typeof skill.baseCost === 'number' && !isNaN(skill.baseCost))
          return skill.baseCost;
        if (row.dataset.baseCost) {
          const parsed = parseInt(row.dataset.baseCost, 10);
          return isNaN(parsed) ? NaN : parsed;
        }
        return NaN;
      })();
      if (isNaN(baseCost)) return;
      const discounted = calculateDiscountedCost(baseCost, getHintLevel());
      if (isNaN(discounted)) return;
      const isGoldRow = isGoldCategory(row.dataset.skillCategory || '');
      if (isGoldRow && skill) {
        const lowerDiscounted = getLowerDiscountedCost(skill);
        if (!isNaN(lowerDiscounted)) {
          costInput.value = discounted + lowerDiscounted;
          return;
        }
      }
      costInput.value = discounted;
    }

    function setCategoryDisplay(category) {
      row.dataset.skillCategory = category || '';
      if (categoryChip) {
        if (category) {
          categoryChip.textContent = formatCategoryLabel(category);
          categoryChip.dataset.empty = 'false';
        } else {
          categoryChip.textContent = t('optimizer.auto');
          categoryChip.dataset.empty = 'true';
        }
      }
      applyCategoryAccent(row, category);
    }

    function updateSkillNameMeta(skill) {
      if (!skillNameMeta) return;
      if (!skill || getSkillLanguage() !== 'jp') {
        skillNameMeta.textContent = '';
        skillNameMeta.dataset.empty = 'true';
        return;
      }
      const localized = (skill.localizedName || '').trim();
      const unofficial = getPrimaryAliasName(skill, { preferEnglish: getSiteLanguage() !== 'jp' });
      const parts = [];
      if (unofficial) parts.push(`Unofficial: ${unofficial}`);
      if (localized && normalize(localized) !== normalize(unofficial)) {
        parts.push(`Localized: ${localized}`);
      }
      skillNameMeta.textContent = parts.join('  |  ');
      skillNameMeta.dataset.empty = parts.length ? 'false' : 'true';
    }

    function getSkillIdentity(name) {
      let skill = findSkillByName(name);
      // For any circle variant (○ or ◎), resolve to ○ and use base name
      if (skill?.circleBaseName) {
        if (skill.circleUpgradeOf) {
          // This is a ◎ skill — resolve to its ○ counterpart instead
          const singleSkill = findSkillByName(skill.circleUpgradeOf);
          if (singleSkill) skill = singleSkill;
        }
        const id = skill?.skillId ?? skill?.id ?? '';
        // Use base name (without ○/◎ suffix) — matches datalist display
        let displayName = getPreferredSkillInputName(skill, skill.circleBaseName || name);
        if (displayName && (displayName.endsWith(' ○') || displayName.endsWith(' ◎'))) {
          displayName = displayName.slice(0, -2);
        }
        return { id: id ? String(id) : '', name: displayName || skill.circleBaseName, skill };
      }
      const id = skill?.skillId ?? skill?.id ?? '';
      const canonicalName = skill ? getPreferredSkillInputName(skill, name) : name;
      return { id: id ? String(id) : '', name: canonicalName, skill };
    }

    function getSkillKey(identity) {
      if (!identity || !identity.name) return '';
      if (identity.id) return identity.id;
      // For circle skills, use the base name as the key so ○/◎/base all collide
      const skill = identity.skill;
      if (skill?.circleBaseName) return normalize(skill.circleBaseName);
      return normalize(identity.name);
    }

    // O(1) duplicate check using activeSkillKeys map
    function isDuplicateSkill(identity) {
      const primaryKey = getSkillKey(identity);
      if (!primaryKey) return false;
      const existingRowId = activeSkillKeys.get(primaryKey);
      return existingRowId !== undefined && existingRowId !== id;
    }

    // Update the activeSkillKeys map when this row's skill changes
    function updateSkillKeyTracking(newIdentity) {
      if (trackedSkillKey && activeSkillKeys.get(trackedSkillKey) === id) {
        activeSkillKeys.delete(trackedSkillKey);
      }
      // Add new key if valid
      const newKey = getSkillKey(newIdentity);
      if (newKey) {
        activeSkillKeys.set(newKey, id);
        trackedSkillKey = newKey;
      } else {
        trackedSkillKey = '';
      }
    }

    // Clean up when row is removed
    function removeSkillKeyTracking() {
      if (trackedSkillKey && activeSkillKeys.get(trackedSkillKey) === id) {
        activeSkillKeys.delete(trackedSkillKey);
      }
      trackedSkillKey = '';
    }

    function showDupWarning(message) {
      if (!dupWarning) return;
      dupWarning.textContent = message;
      dupWarning.classList.add('visible');
      row.dataset.dupWarningHold = '1';
      if (dupWarningTimer) window.clearTimeout(dupWarningTimer);
      dupWarningTimer = window.setTimeout(() => {
        if (dupWarning) {
          dupWarning.textContent = '';
          dupWarning.classList.remove('visible');
        }
        delete row.dataset.dupWarningHold;
        dupWarningTimer = null;
      }, 2500);
    }

    function clearDupWarning() {
      if (!dupWarning) return;
      if (row.dataset.dupWarningHold) return;
      if (dupWarningTimer) {
        window.clearTimeout(dupWarningTimer);
        dupWarningTimer = null;
      }
      dupWarning.textContent = '';
      dupWarning.classList.remove('visible');
    }

    function ensureLinkedLowerForGold(category, { allowCreate = true } = {}) {
      if (row.dataset.parentGoldId) return;
      const isGold = isGoldCategory(category);
      const currentLinkedId = row.dataset.lowerRowId;
      if (!isGold) {
        if (currentLinkedId) {
          const linked = rowsEl.querySelector(`.optimizer-row[data-row-id="${currentLinkedId}"]`);
          if (linked) {
            // Also clean up the lower's ◎ circle upgrade row if it exists
            if (linked.dataset.circleRowId) {
              const circleRow = rowsEl.querySelector(
                `.optimizer-row[data-row-id="${linked.dataset.circleRowId}"]`
              );
              if (circleRow) {
                if (typeof circleRow.cleanupSkillTracking === 'function') {
                  circleRow.cleanupSkillTracking();
                }
                circleRow.remove();
              }
            }
            linked.remove();
          }
          delete row.dataset.lowerRowId;
        }
        return;
      }
      if (!allowCreate || currentLinkedId) return;
      // Guard: before creating a new lower row, check if one already exists in the DOM
      // (e.g., restored from saved state but link wasn't fully re-established)
      const rowId = row.dataset.rowId || id;
      let existingLower =
        rowsEl.querySelector(`.optimizer-row[data-parent-gold-id="${CSS.escape(rowId)}"]`) ||
        (rowId !== id
          ? rowsEl.querySelector(`.optimizer-row[data-parent-gold-id="${CSS.escape(id)}"]`)
          : null);
      // Also check by skill ID: find an unlinked row whose skill matches the expected lower
      if (!existingLower && skillInput) {
        const goldSkill = findSkillByName(skillInput.value);
        if (goldSkill) {
          const candidateIds = [];
          if (goldSkill.lowerSkillId) candidateIds.push(String(goldSkill.lowerSkillId));
          if (Array.isArray(goldSkill.parentIds)) {
            goldSkill.parentIds.forEach((pid) => candidateIds.push(String(pid)));
          }
          if (candidateIds.length) {
            const allRows = Array.from(rowsEl.querySelectorAll('.optimizer-row'));
            for (const candidate of allRows) {
              if (candidate === row || candidate.dataset.parentGoldId) continue;
              const cName = (candidate.querySelector('.skill-name')?.value || '').trim();
              if (!cName) continue;
              const cSkill = findSkillByName(cName);
              if (cSkill?.skillId && candidateIds.includes(String(cSkill.skillId))) {
                existingLower = candidate;
                break;
              }
            }
          }
        }
      }
      if (existingLower) {
        const lid = existingLower.dataset.rowId || '';
        row.dataset.lowerRowId = lid;
        existingLower.dataset.parentGoldId = rowId;
        existingLower.classList.add('linked-lower');
        const linkedInput = existingLower.querySelector('.skill-name');
        if (linkedInput) linkedInput.placeholder = t('optimizer.lowerSkill');
        const linkedRemove = existingLower.querySelector('.remove');
        if (linkedRemove) {
          linkedRemove.disabled = true;
          linkedRemove.title = t('optimizer.removeGoldToUnlink');
          linkedRemove.style.pointerEvents = 'none';
          linkedRemove.style.opacity = '0.4';
        }
        autofillLinkedLower(existingLower);
        return;
      }
      const linked = makeRow();
      linked.classList.add('linked-lower');
      linked.dataset.parentGoldId = id;
      const lid = linked.dataset.rowId;
      const linkedInput = linked.querySelector('.skill-name');
      if (linkedInput) linkedInput.placeholder = t('optimizer.lowerSkill');
      const linkedRemove = linked.querySelector('.remove');
      if (linkedRemove) {
        linkedRemove.disabled = true;
        linkedRemove.title = t('optimizer.removeGoldToUnlink');
        linkedRemove.style.pointerEvents = 'none';
        linkedRemove.style.opacity = '0.4';
      }
      rowsEl.insertBefore(linked, row.nextSibling);
      row.dataset.lowerRowId = lid;
      if (typeof linked.syncSkillCategory === 'function') {
        linked.syncSkillCategory({
          triggerOptimize: false,
          allowLinking: false,
          updateCost: false,
        });
      }
      autofillLinkedLower(linked);
    }

    function ensureLinkedLowerForParent(skill, { allowCreate = true } = {}) {
      if (!skill || !Array.isArray(skill.parentIds) || !skill.parentIds.length) return;
      if (row.dataset.lowerRowId) {
        const linked = rowsEl.querySelector(
          `.optimizer-row[data-row-id="${row.dataset.lowerRowId}"]`
        );
        autofillLinkedLower(linked);
        return;
      }
      if (!allowCreate) return;
      const linked = makeRow();
      linked.classList.add('linked-lower');
      linked.dataset.parentSkillLink = id;
      const lid = linked.dataset.rowId;
      const linkedInput = linked.querySelector('.skill-name');
      if (linkedInput) linkedInput.placeholder = t('optimizer.lowerSkill');
      const linkedRemove = linked.querySelector('.remove');
      if (linkedRemove) {
        linkedRemove.disabled = true;
        linkedRemove.title = t('optimizer.removeParentToUnlink');
        linkedRemove.style.pointerEvents = 'none';
        linkedRemove.style.opacity = '0.4';
      }
      rowsEl.insertBefore(linked, row.nextSibling);
      row.dataset.lowerRowId = lid;
      autofillLinkedLower(linked);
    }

    function ensureLinkedCircleUpgrade(skill, { allowCreate = true } = {}) {
      // Don't create upgrade rows for rows that are themselves circle children
      if (row.dataset.parentCircleId) return;
      const hasCircleUpgrade = skill && skill.circleUpgrade;
      const currentLinkedId = row.dataset.circleRowId;
      // Clean up if skill changed away from a circle skill
      if (!hasCircleUpgrade) {
        if (currentLinkedId) {
          const linked = rowsEl.querySelector(`.optimizer-row[data-row-id="${currentLinkedId}"]`);
          if (linked) {
            if (typeof linked.cleanupSkillTracking === 'function') linked.cleanupSkillTracking();
            linked.remove();
          }
          delete row.dataset.circleRowId;
        }
        return;
      }
      if (!allowCreate || currentLinkedId) return;
      const doubleSkill = findSkillByName(skill.circleUpgrade);
      if (!doubleSkill) return;
      const linked = makeRow();
      linked.classList.add('linked-lower');
      linked.dataset.parentCircleId = id;
      const lid = linked.dataset.rowId;
      const linkedInput = linked.querySelector('.skill-name');
      if (linkedInput) linkedInput.placeholder = t('optimizer.circleUpgrade');
      const linkedRemove = linked.querySelector('.remove');
      if (linkedRemove) {
        linkedRemove.disabled = true;
        linkedRemove.title = t('optimizer.removeCircleToUnlink');
        linkedRemove.style.pointerEvents = 'none';
        linkedRemove.style.opacity = '0.4';
      }
      linked.style.display = 'none'; // Hidden — optimizer reads it, user doesn't see it
      rowsEl.insertBefore(linked, row.nextSibling);
      row.dataset.circleRowId = lid;
      // Auto-fill the ◎ upgrade row, mirroring parent hint level
      const lInput = linked.querySelector('.skill-name');
      const lCost = linked.querySelector('.cost');
      const lHint = linked.querySelector('.hint-level');
      if (lInput) lInput.value = doubleSkill.name;
      // Mirror hint level from parent ○ row
      const parentHint = hintSelect ? parseInt(hintSelect.value || '0', 10) || 0 : 0;
      if (lHint) lHint.value = parentHint;
      if (typeof doubleSkill.baseCost === 'number') {
        linked.dataset.baseCost = String(doubleSkill.baseCost);
        const discounted = calculateDiscountedCost(doubleSkill.baseCost, parentHint);
        if (lCost && !isNaN(discounted)) lCost.value = discounted;
      }
      if (typeof linked.syncSkillCategory === 'function') {
        linked.syncSkillCategory({ triggerOptimize: false, allowLinking: false, updateCost: true });
      }
    }

    // ── Evo skill checkboxes on gold rows ──
    function cleanupEvoRows() {
      const ids = (row.dataset.evoRowIds || '').split(',').filter(Boolean);
      ids.forEach((eid) => {
        const evoRow = rowsEl.querySelector(`.optimizer-row[data-row-id="${eid}"]`);
        if (evoRow) {
          if (typeof evoRow.cleanupSkillTracking === 'function') evoRow.cleanupSkillTracking();
          evoRow.remove();
        }
      });
      delete row.dataset.evoRowIds;
    }

    function createHiddenEvoRow(evoSkill) {
      const evoRow = makeRow();
      evoRow.classList.add('linked-lower');
      evoRow.dataset.parentEvoId = id;
      const evoInput = evoRow.querySelector('.skill-name');
      if (evoInput) evoInput.value = evoSkill.name;
      const evoCostEl = evoRow.querySelector('.cost');
      if (evoCostEl) evoCostEl.value = 0;
      if (typeof evoSkill.baseCost === 'number') {
        evoRow.dataset.baseCost = String(evoSkill.baseCost);
      }
      const evoRemove = evoRow.querySelector('.remove');
      if (evoRemove) {
        evoRemove.disabled = true;
        evoRemove.title = t('optimizer.uncheckEvo');
        evoRemove.style.pointerEvents = 'none';
        evoRemove.style.opacity = '0.4';
      }
      evoRow.style.display = 'none';
      // Insert after gold's lower/circle/existing evo rows
      let insertAfter = row;
      const tryAdvance = (selector) => {
        const el = rowsEl.querySelector(`.optimizer-row[data-row-id="${selector}"]`);
        if (el) insertAfter = el;
      };
      if (row.dataset.lowerRowId) tryAdvance(row.dataset.lowerRowId);
      if (row.dataset.circleRowId) tryAdvance(row.dataset.circleRowId);
      (row.dataset.evoRowIds || '').split(',').filter(Boolean).forEach(tryAdvance);
      rowsEl.insertBefore(evoRow, insertAfter.nextSibling);
      // Track evo row ID
      const ids = (row.dataset.evoRowIds || '').split(',').filter(Boolean);
      ids.push(evoRow.dataset.rowId);
      row.dataset.evoRowIds = ids.join(',');
      if (typeof evoRow.syncSkillCategory === 'function') {
        evoRow.syncSkillCategory({
          triggerOptimize: false,
          allowLinking: false,
          updateCost: false,
        });
      }
      // Evolution checkboxes are an ownership choice, not another skill purchase.
      // Keep the synthetic row at zero cost even when a same-named regular skill exists.
      if (evoCostEl) evoCostEl.value = 0;
      evoRow.dataset.skillCategory = 'evo';
      applyCategoryAccent(evoRow, 'evo');
    }

    function removeHiddenEvoRow(evoName) {
      const ids = (row.dataset.evoRowIds || '').split(',').filter(Boolean);
      const remaining = [];
      ids.forEach((eid) => {
        const evoRow = rowsEl.querySelector(`.optimizer-row[data-row-id="${eid}"]`);
        if (evoRow) {
          const name = evoRow.querySelector('.skill-name')?.value || '';
          if (normalize(name) === normalize(evoName)) {
            if (typeof evoRow.cleanupSkillTracking === 'function') evoRow.cleanupSkillTracking();
            evoRow.remove();
            return;
          }
        }
        remaining.push(eid);
      });
      row.dataset.evoRowIds = remaining.join(',');
      if (!remaining.length) delete row.dataset.evoRowIds;
    }

    function ensureEvoOptions(skill, { allowCreate = true } = {}) {
      const evoContainer = row.querySelector('.evo-options');
      if (!evoContainer) return;
      // Don't show evo options on linked sub-rows
      if (row.dataset.parentGoldId || row.dataset.parentCircleId || row.dataset.parentEvoId) {
        cleanupEvoRows();
        evoContainer.innerHTML = '';
        evoContainer.dataset.empty = 'true';
        return;
      }
      const isGold = skill && isGoldCategory(skill.category);
      const evos = isGold ? getEvosForSkill(skill.name) : [];
      if (!evos.length) {
        cleanupEvoRows();
        evoContainer.innerHTML = '';
        evoContainer.dataset.empty = 'true';
        return;
      }
      // Track which evos are currently checked (preserve across re-renders)
      const currentChecked = new Set();
      (row.dataset.evoRowIds || '')
        .split(',')
        .filter(Boolean)
        .forEach((eid) => {
          const evoRow = rowsEl.querySelector(`.optimizer-row[data-row-id="${eid}"]`);
          if (evoRow) {
            const n = evoRow.querySelector('.skill-name')?.value || '';
            if (n) currentChecked.add(normalize(n));
          }
        });
      // Remove evo rows whose skill no longer matches available evos
      const availableKeys = new Set(evos.map((e) => normalize(e.name)));
      (row.dataset.evoRowIds || '')
        .split(',')
        .filter(Boolean)
        .forEach((eid) => {
          const evoRow = rowsEl.querySelector(`.optimizer-row[data-row-id="${eid}"]`);
          if (!evoRow) return;
          const n = normalize(evoRow.querySelector('.skill-name')?.value || '');
          if (n && !availableKeys.has(n)) {
            if (typeof evoRow.cleanupSkillTracking === 'function') evoRow.cleanupSkillTracking();
            evoRow.remove();
            currentChecked.delete(n);
          }
        });
      // Rebuild evoRowIds to remove stale entries
      const freshIds = (row.dataset.evoRowIds || '').split(',').filter((eid) => {
        return eid && rowsEl.querySelector(`.optimizer-row[data-row-id="${eid}"]`);
      });
      if (freshIds.length) row.dataset.evoRowIds = freshIds.join(',');
      else delete row.dataset.evoRowIds;

      evoContainer.innerHTML = '';
      evoContainer.dataset.empty = 'false';
      const label = document.createElement('span');
      label.className = 'evo-label';
      label.textContent = t('optimizer.evo');
      evoContainer.appendChild(label);
      evos.forEach((evoSkill) => {
        const displayName = getPreferredSkillInputName(evoSkill, evoSkill.name);
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'evo-checkbox';
        cb.dataset.evoName = evoSkill.name;
        cb.checked = currentChecked.has(normalize(evoSkill.name));
        const wrapper = document.createElement('label');
        wrapper.className = 'evo-checkbox-label';
        wrapper.title = displayName;
        wrapper.appendChild(cb);
        wrapper.appendChild(document.createTextNode(displayName));
        evoContainer.appendChild(wrapper);
        cb.addEventListener('change', () => {
          if (cb.checked) createHiddenEvoRow(evoSkill);
          else removeHiddenEvoRow(evoSkill.name);
          if (!_restoringState) {
            saveState();
            autoOptimizeDebounced();
          }
        });
      });
    }

    function syncSkillCategory({
      triggerOptimize = false,
      allowLinking = true,
      updateCost = false,
    } = {}) {
      if (!skillInput) return;
      const rawName = (skillInput.value || '').trim();
      if (!rawName) {
        delete row.dataset.lastSkillName;
        if (!row.dataset.dupWarningHold) clearDupWarning();
        updateSkillKeyTracking(null); // Clear tracking when skill is removed
      }
      // For circle sub-rows (◎ upgrade), use findSkillByName directly to preserve the ◎
      // skill data (higher score, correct baseCost). getSkillIdentity normalizes to the ○
      // variant which would clobber the ◎-specific values.
      const isCircleSubRow = !!row.dataset.parentCircleId;
      const identity = isCircleSubRow ? null : getSkillIdentity(rawName);
      const skill = isCircleSubRow ? findSkillByName(rawName) : identity?.skill;
      if (rawName) {
        const canonical = isCircleSubRow ? rawName : identity?.name || rawName;
        // Rewrite input to base name for circle skills (strip ○/◎ suffixes)
        // But NOT for circle sub-rows — they must keep their ◎ name for correct scoring
        if (!isCircleSubRow && skill?.circleBaseName && rawName !== canonical) {
          skillInput.value = canonical;
        }
        const isLinkedChild = !!(
          row.dataset.parentGoldId ||
          row.dataset.parentCircleId ||
          row.dataset.parentEvoId ||
          row.dataset.parentSkillLink
        );
        if (!isLinkedChild && isDuplicateSkill(identity)) {
          showDupWarning('This skill has already been added.');
          const fallback = row.dataset.lastSkillName || '';
          if (fallback) {
            skillInput.value = fallback;
            const prev = findSkillByName(fallback);
            const prevCategory = prev ? prev.category : '';
            updateSkillNameMeta(prev || null);
            setCategoryDisplay(prevCategory);
            updateBaseCostDisplay(prev);
            if (updateCost) applyHintedCost(prev);
          } else {
            skillInput.value = '';
            updateSkillNameMeta(null);
            setCategoryDisplay('');
            updateBaseCostDisplay(null);
            if (costInput) costInput.value = '';
            delete row.dataset.baseCost;
          }
          return;
        }
        row.dataset.lastSkillName = canonical;
        if (!isLinkedChild) updateSkillKeyTracking(identity); // Update tracking with new skill
      }
      clearDupWarning();
      const category = skill ? skill.category : '';
      updateSkillNameMeta(skill || null);
      setCategoryDisplay(category);
      setBaseCategory(row, skill);
      updateBaseCostDisplay(skill);
      ensureLinkedLowerForGold(category, { allowCreate: allowLinking });
      ensureLinkedLowerForParent(skill, { allowCreate: allowLinking });
      ensureLinkedCircleUpgrade(skill, { allowCreate: allowLinking });
      ensureEvoOptions(skill, { allowCreate: allowLinking });
      if (updateCost) applyHintedCost(skill);
      if (triggerOptimize) {
        saveStateDebounced();
        ensureOneEmptyRow();
        autoOptimizeDebounced();
      }
    }

    function autofillLinkedLower(linkedRow) {
      if (!linkedRow || !skillInput) return;
      const skill = findSkillByName(skillInput.value);
      if (!skill) return;
      // Prefer explicit lowerSkillId; otherwise, try parentIds (common for gold -> lower)
      const candidateId =
        skill.lowerSkillId || (Array.isArray(skill.parentIds) ? skill.parentIds[0] : '');
      if (!candidateId) return;
      const lower = skillIdIndex.get(String(candidateId));
      if (!lower) return;
      const lowerInput = linkedRow.querySelector('.skill-name');
      const lowerCostInput = linkedRow.querySelector('.cost');
      const lowerHint = linkedRow.querySelector('.hint-level');
      if (lowerInput && !lowerInput.value) lowerInput.value = lower.name;
      const baseCost =
        typeof lower.baseCost === 'number'
          ? lower.baseCost
          : skillCostById.get(String(candidateId));
      if (lowerCostInput && typeof baseCost === 'number') {
        linkedRow.dataset.baseCost = String(baseCost);
        const hintLevel = lowerHint
          ? parseInt(lowerHint.value || '0', 10) || 0
          : hintSelect
            ? parseInt(hintSelect.value || '0', 10) || 0
            : 0;
        const discounted = calculateDiscountedCost(baseCost, hintLevel);
        if (!isNaN(discounted)) lowerCostInput.value = discounted;
      }
      if (typeof linkedRow.syncSkillCategory === 'function') {
        linkedRow.syncSkillCategory({
          triggerOptimize: false,
          allowLinking: true,
          updateCost: true,
        });
      }
    }

    row.syncSkillCategory = syncSkillCategory;
    row.cleanupSkillTracking = removeSkillKeyTracking;
    setCategoryDisplay(row.dataset.skillCategory || '');
    if (skillInput) {
      // Full sync: rebuild datalist + sync skill category
      const syncFromInput = ({
        triggerOptimize = false,
        allowLinking = true,
        refreshSuggestions = true,
      } = {}) => {
        if (refreshSuggestions) {
          rebuildSharedDatalist(skillInput.value || '');
        }
        syncSkillCategory({ triggerOptimize, allowLinking, updateCost: true });
      };
      // Debounced version for typing — avoids expensive work on every keystroke
      const syncFromTyping = () => {
        const query = skillInput.value || '';
        const normalizedQuery = normalize(query);
        // Avoid costly list churn on the exact mobile worst-case path:
        // empty input and first-character edits.
        if (!normalizedQuery || normalizedQuery.length < 2) return;
        const refresh = () => rebuildSharedDatalist(query);
        if (typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(refresh, { timeout: 250 });
        } else {
          window.setTimeout(refresh, 0);
        }
      };
      let lastCommittedValue = '';
      let lastCommittedRevision = -1;
      const syncFromCommit = () => {
        const currentValue = skillInput.value || '';
        if (
          normalize(currentValue) === normalize(lastCommittedValue) &&
          lastCommittedRevision === skillLibraryRevision
        ) {
          return;
        }
        lastCommittedValue = currentValue;
        lastCommittedRevision = skillLibraryRevision;
        syncFromInput({ triggerOptimize: true, allowLinking: true, refreshSuggestions: false });
      };
      // Typing updates metadata/costs without creating/removing linked rows.
      const debouncedSync = debounce(syncFromTyping, 320);
      // While typing, debounce to avoid per-keystroke DOM thrashing
      skillInput.addEventListener('input', debouncedSync);
      // On commit actions (datalist pick, leave field, Enter), sync immediately
      skillInput.addEventListener('change', syncFromCommit);
      skillInput.addEventListener('blur', syncFromCommit);
      skillInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') syncFromCommit();
      });
      // On focus, rebuild datalist suggestions (no polling needed)
      skillInput.addEventListener('focus', () => {
        rebuildSharedDatalist(skillInput.value || '');
      });
    }
    if (hintSelect) {
      hintSelect.addEventListener('change', () => {
        const skill = skillInput ? findSkillByName(skillInput.value) : null;
        applyHintedCost(skill);
        // Mirror hint level to linked ◎ upgrade row BEFORE updating gold parent
        // so the gold's cost recalculation includes the updated ◎ cost
        if (row.dataset.circleRowId) {
          const circleRow = rowsEl.querySelector(
            `.optimizer-row[data-row-id="${row.dataset.circleRowId}"]`
          );
          if (circleRow) {
            const cHint = circleRow.querySelector('.hint-level');
            const cCost = circleRow.querySelector('.cost');
            const newHint = parseInt(hintSelect.value || '0', 10) || 0;
            if (cHint) cHint.value = newHint;
            const cBaseCost = circleRow.dataset.baseCost
              ? parseInt(circleRow.dataset.baseCost, 10)
              : NaN;
            if (!isNaN(cBaseCost) && cCost) {
              cCost.value = calculateDiscountedCost(cBaseCost, newHint);
            }
          }
        }
        // Update gold parent's cost (after ◎ mirror so gold includes updated ◎ cost)
        if (row.dataset.parentGoldId) {
          const parent = rowsEl.querySelector(
            `.optimizer-row[data-row-id="${row.dataset.parentGoldId}"]`
          );
          if (parent && typeof parent.syncSkillCategory === 'function') {
            parent.syncSkillCategory({
              triggerOptimize: false,
              allowLinking: false,
              updateCost: true,
            });
          }
        }
        saveState();
        ensureOneEmptyRow();
        autoOptimizeDebounced();
      });
    }
    if (requiredToggle) {
      requiredToggle.addEventListener('change', () => {
        row.classList.toggle('required', requiredToggle.checked);
        if (requiredToggle.checked) {
          const isGoldRow = isGoldCategory(row.dataset.skillCategory || '');
          if (isGoldRow) {
            let linked = null;
            if (row.dataset.lowerRowId) {
              linked = rowsEl.querySelector(
                `.optimizer-row[data-row-id="${row.dataset.lowerRowId}"]`
              );
            }
            if (!linked) {
              linked = rowsEl.querySelector(`.optimizer-row[data-parent-gold-id="${id}"]`);
            }
            if (linked) {
              const linkedToggle = linked.querySelector('.required-skill');
              if (linkedToggle) {
                linkedToggle.checked = true;
                linked.classList.add('required');
              }
            }
          }
        }
        saveState();
        ensureOneEmptyRow();
        autoOptimizeDebounced();
      });
    }
    return row;
  }

  function collectItems() {
    const items = [];
    const rowsMeta = [];
    const rows = rowsEl.querySelectorAll('.optimizer-row');
    const mode = getOptimizeMode();
    rows.forEach((row) => {
      const nameInput = row.querySelector('.skill-name');
      const costEl = row.querySelector('.cost');
      const hintEl = row.querySelector('.hint-level');
      const requiredEl = row.querySelector('.required-skill');
      if (!nameInput || !costEl) return;
      const name = (nameInput.value || '').trim();
      const rawCost = parseInt(costEl.value, 10);
      const hintLevel = parseInt(hintEl?.value || '', 10) || 0;
      const required = !!requiredEl?.checked;
      const baseCostStored = row.dataset.baseCost ? parseInt(row.dataset.baseCost, 10) : NaN;
      const parentGoldId = row.dataset.parentGoldId || '';
      const parentCircleId = row.dataset.parentCircleId || '';
      const parentEvoId = row.dataset.parentEvoId || '';
      const cost = parentEvoId
        ? 0
        : !isNaN(rawCost)
          ? rawCost
          : !isNaN(baseCostStored)
            ? calculateDiscountedCost(baseCostStored, hintLevel)
            : NaN;
      if (!name || isNaN(cost)) return;
      let skill = findSkillByName(name);
      if (parentEvoId) {
        const parentRow = rowsEl.querySelector(
          `.optimizer-row[data-row-id="${CSS.escape(parentEvoId)}"]`
        );
        const parentName = (parentRow?.querySelector('.skill-name')?.value || '').trim();
        const exactEvo = getEvosForSkill(parentName).find(
          (candidate) => normalize(candidate.name) === normalize(name)
        );
        if (exactEvo) skill = exactEvo;
      }
      if (!skill) return;
      const category = skill.category || '';
      const isLowerForGold = !!parentGoldId; // This row is a lower skill linked to a gold

      // Always calculate both scores
      const ratingScore = getEffectiveRatingScore(skill, category);
      const purplePenalty = getPurplePenaltyValue(skill, category);
      const optimizeRatingScore = ratingScore + purplePenalty;
      const aptitudeScore = getAptitudeTestScore(category, isLowerForGold);

      // For optimization: in aptitude mode, use combined score (aptitude * large multiplier + rating as tiebreaker)
      // This ensures aptitude is maximized first, then rating among equal aptitude options
      const score =
        mode === 'aptitude-test'
          ? aptitudeScore * 100000 + optimizeRatingScore // Aptitude primary, rating secondary
          : optimizeRatingScore;

      const rowId = row.dataset.rowId || Math.random().toString(36).slice(2);
      const lowerRowId = row.dataset.lowerRowId || '';
      const circleRowId = row.dataset.circleRowId || '';
      const evoRowIds = row.dataset.evoRowIds || '';
      const parentSkillIds =
        Array.isArray(skill.parentIds) && skill.parentIds.length ? skill.parentIds : [];
      const lowerSkillId = skill.lowerSkillId || '';
      const skillId = skill.skillId || skill.id || '';
      const isEvo = canonicalCategory(category) === 'evo' || !!skill.isEvo;
      const evoParentNames =
        Array.isArray(skill.evoParentNames) && skill.evoParentNames.length
          ? skill.evoParentNames
          : [];
      items.push({
        id: rowId,
        name: skill.name,
        cost,
        score,
        ratingScore,
        purplePenalty,
        aptitudeScore, // Track both scores
        baseCost: baseCostStored,
        category,
        isEvo,
        evoParentNames,
        parentGoldId,
        parentCircleId,
        parentEvoId,
        lowerRowId,
        circleRowId,
        evoRowIds,
        checkType: skill.checkType || '',
        parentSkillIds,
        lowerSkillId,
        skillId,
        hintLevel,
        required,
      });
      rowsMeta.push({
        id: rowId,
        category,
        parentGoldId,
        parentCircleId,
        parentEvoId,
        lowerRowId,
        circleRowId,
        evoRowIds,
      });
    });
    return { items, rowsMeta };
  }

  function buildGroups(items, rowsMeta) {
    const idToIndex = new Map(items.map((it, i) => [it.id, i]));
    const skillIdToIndex = new Map();
    const indicesByName = new Map();
    const evoParentCache = new Map();
    items.forEach((it, i) => {
      if (it.skillId) skillIdToIndex.set(String(it.skillId), i);
      if (it.lowerSkillId) skillIdToIndex.set(String(it.lowerSkillId), i);
      const key = normalize(it.name);
      if (key) {
        if (!indicesByName.has(key)) indicesByName.set(key, []);
        indicesByName.get(key).push(i);
      }
    });
    function getEvoParentIndexes(itemIdx) {
      if (evoParentCache.has(itemIdx)) return evoParentCache.get(itemIdx);
      const src = items[itemIdx] || {};
      const indexes = new Set();
      if (Array.isArray(src.evoParentNames) && src.evoParentNames.length) {
        src.evoParentNames.forEach((parentName) => {
          const matches = indicesByName.get(normalize(parentName)) || [];
          matches.forEach((idx) => indexes.add(idx));
        });
      }
      if (Array.isArray(src.parentSkillIds) && src.parentSkillIds.length) {
        src.parentSkillIds.forEach((pid) => {
          if (skillIdToIndex.has(String(pid))) indexes.add(skillIdToIndex.get(String(pid)));
        });
      }
      evoParentCache.set(itemIdx, indexes);
      return indexes;
    }
    const used = new Array(items.length).fill(false);
    const groups = [];
    for (let i = 0; i < items.length; i++) {
      if (used[i]) continue;
      const it = items[i];
      let handled = false;

      // Evolution skills replace a parent gold at no extra SP.
      // Skip checkbox-linked evos (parentEvoId) — they're handled by the gold block.
      const isEvo = canonicalCategory(it.category) === 'evo' || !!it.isEvo;
      if (isEvo && !it.parentEvoId) {
        const evoParentIndexes = getEvoParentIndexes(i);
        const evoParentKey = Array.from(evoParentIndexes)
          .sort((a, b) => a - b)
          .join(',');
        const siblingEvoIndexes = [];
        for (let j = 0; j < items.length; j++) {
          if (used[j]) continue;
          const candidate = items[j];
          const candidateIsEvo =
            canonicalCategory(candidate.category) === 'evo' || !!candidate.isEvo;
          if (!candidateIsEvo) continue;
          const key = Array.from(getEvoParentIndexes(j))
            .sort((a, b) => a - b)
            .join(',');
          if (key === evoParentKey) siblingEvoIndexes.push(j);
        }
        const availableParents = Array.from(evoParentIndexes).filter((idx) => !used[idx]);
        if (availableParents.length) {
          const options = [{ none: true, items: [] }];
          const linkedLowerRows = new Set();
          availableParents.forEach((parentIdx) => {
            const parent = items[parentIdx];
            const parentLowerIdx =
              parent.lowerRowId && idToIndex.has(parent.lowerRowId)
                ? idToIndex.get(parent.lowerRowId)
                : -1;
            const hasLinkedLower = parentLowerIdx >= 0 && !used[parentLowerIdx];
            if (hasLinkedLower) {
              linkedLowerRows.add(parentLowerIdx);
              const lower = items[parentLowerIdx];
              options.push({
                pick: parentLowerIdx,
                cost: lower.cost,
                score: lower.score,
                ratingScore: lower.ratingScore || 0,
                aptitudeScore: lower.aptitudeScore || 0,
                items: [parentLowerIdx],
              });
            }
            options.push({
              pick: parentIdx,
              cost: parent.cost,
              score: parent.score,
              ratingScore: parent.ratingScore || 0,
              aptitudeScore: parent.aptitudeScore || 0,
              items: hasLinkedLower ? [parentLowerIdx, parentIdx] : [parentIdx],
            });
            siblingEvoIndexes.forEach((evoIdx) => {
              const evoItem = items[evoIdx];
              options.push({
                combo: hasLinkedLower ? [parentLowerIdx, parentIdx, evoIdx] : [parentIdx, evoIdx],
                cost: parent.cost, // evo replaces parent skill at no extra SP
                score: evoItem.score,
                ratingScore: evoItem.ratingScore || 0,
                aptitudeScore: evoItem.aptitudeScore || 0,
                items: hasLinkedLower ? [parentLowerIdx, parentIdx, evoIdx] : [parentIdx, evoIdx],
              });
            });
          });
          groups.push(options);
          siblingEvoIndexes.forEach((idx) => {
            used[idx] = true;
          });
          availableParents.forEach((idx) => {
            used[idx] = true;
          });
          linkedLowerRows.forEach((idx) => {
            used[idx] = true;
          });
          continue;
        }
        // Cannot purchase evo without a matching parent in the current rows.
        groups.push([{ none: true, items: [] }]);
        siblingEvoIndexes.forEach((idx) => {
          used[idx] = true;
        });
        if (!siblingEvoIndexes.length) used[i] = true;
        continue;
      }

      // Dependency: if item has a parent (single-circle) present, offer choices (none, parent only, parent+child).
      const parentCandidates = [];
      if (Array.isArray(it.parentSkillIds) && it.parentSkillIds.length)
        parentCandidates.push(...it.parentSkillIds);
      if (it.lowerSkillId) parentCandidates.push(it.lowerSkillId);
      const pid = parentCandidates.find((pid) => skillIdToIndex.has(String(pid)));
      if (pid !== undefined && !isGoldCategory(it.category)) {
        const j = skillIdToIndex.get(String(pid));
        if (!used[j]) {
          const parent = items[j];
          const childIsGold = isGoldCategory(it.category);
          const parentId = parent.id;
          const parentMatchesLower = it.lowerRowId && it.lowerRowId === parentId;
          const comboCost = childIsGold && parentMatchesLower ? it.cost : parent.cost + it.cost;
          groups.push([
            { none: true, items: [] },
            {
              pick: j,
              cost: parent.cost,
              score: parent.score,
              ratingScore: parent.ratingScore || 0,
              aptitudeScore: parent.aptitudeScore || 0,
              items: [j],
            },
            // Upgraded (double-circle): pay both costs, only upgraded score counts.
            // For aptitude: gold skill gets full aptitude, lower doesn't count
            {
              combo: [j, i],
              cost: comboCost,
              score: it.score,
              ratingScore: it.ratingScore || 0,
              aptitudeScore: it.aptitudeScore || 0,
              items: [j, i],
            },
          ]);
          used[j] = used[i] = true;
          handled = true;
        }
      }
      if (handled) continue;

      const isGold = isGoldCategory(it.category);
      if (isGold && it.lowerRowId && idToIndex.has(it.lowerRowId)) {
        const j = idToIndex.get(it.lowerRowId);
        if (!used[j]) {
          // Check if lower has a ◎ circle upgrade that must also be purchased
          const lowerItem = items[j];
          const hasCircle = lowerItem.circleRowId && idToIndex.has(lowerItem.circleRowId);
          const k = hasCircle ? idToIndex.get(lowerItem.circleRowId) : -1;
          const circleItem = k >= 0 && !used[k] ? items[k] : null;

          // gold requires lower (and its ◎ upgrade if present)
          // For aptitude: lower skill alone counts, gold combo only counts the gold
          const goldOptions = [
            { none: true, items: [] },
            // Lower ○ only
            {
              pick: j,
              cost: items[j].cost,
              score: items[j].score,
              ratingScore: items[j].ratingScore || 0,
              aptitudeScore: items[j].aptitudeScore || 0,
              items: [j],
            },
          ];
          if (circleItem) {
            // Lower ○ + ◎ upgrade (no gold)
            goldOptions.push({
              combo: [j, k],
              cost: items[j].cost + circleItem.cost,
              score: circleItem.score,
              ratingScore: circleItem.ratingScore || 0,
              aptitudeScore: circleItem.aptitudeScore || 0,
              items: [j, k],
            });
            // Gold combo: it.cost already includes gold + ○ + ◎ (via getLowerDiscountedCost)
            goldOptions.push({
              combo: [j, k, i],
              cost: it.cost,
              score: it.score,
              ratingScore: it.ratingScore || 0,
              aptitudeScore: it.aptitudeScore || 0,
              items: [j, k, i],
            });
          } else {
            // Gold combo without circle: ○ + gold
            goldOptions.push({
              combo: [j, i],
              cost: it.cost,
              score: it.score,
              ratingScore: it.ratingScore || 0,
              aptitudeScore: it.aptitudeScore || 0,
              items: [j, i],
            });
          }
          // Evo options from checkbox-linked evo rows (replace gold at same cost)
          const evoIds = (it.evoRowIds || '').split(',').filter(Boolean);
          evoIds.forEach((eid) => {
            const evoIdx = idToIndex.get(eid);
            if (evoIdx !== undefined && !used[evoIdx]) {
              const evoItem = items[evoIdx];
              const evoItems = circleItem ? [j, k, i, evoIdx] : [j, i, evoIdx];
              const evoCost = it.cost; // already includes ◎ if present
              goldOptions.push({
                combo: evoItems,
                cost: evoCost,
                score: evoItem.score,
                ratingScore: evoItem.ratingScore || 0,
                aptitudeScore: evoItem.aptitudeScore || 0,
                items: evoItems,
              });
              used[evoIdx] = true;
            }
          });
          groups.push(goldOptions);
          used[i] = used[j] = true;
          if (k >= 0) used[k] = true;
          continue;
        }
      }
      // Gold without linked lower but with checkbox-linked evos
      if (isGold && it.evoRowIds) {
        const goldEvoOptions = [
          { none: true, items: [] },
          {
            pick: i,
            cost: it.cost,
            score: it.score,
            ratingScore: it.ratingScore || 0,
            aptitudeScore: it.aptitudeScore || 0,
            items: [i],
          },
        ];
        const evoIds = (it.evoRowIds || '').split(',').filter(Boolean);
        evoIds.forEach((eid) => {
          const evoIdx = idToIndex.get(eid);
          if (evoIdx !== undefined && !used[evoIdx]) {
            const evoItem = items[evoIdx];
            goldEvoOptions.push({
              combo: [i, evoIdx],
              cost: it.cost,
              score: evoItem.score,
              ratingScore: evoItem.ratingScore || 0,
              aptitudeScore: evoItem.aptitudeScore || 0,
              items: [i, evoIdx],
            });
            used[evoIdx] = true;
          }
        });
        groups.push(goldEvoOptions);
        used[i] = true;
        continue;
      }
      // ◎/○ circle pair: ○ parent with linked ◎ upgrade row (additive cost)
      if (it.circleRowId && idToIndex.has(it.circleRowId)) {
        const j = idToIndex.get(it.circleRowId);
        if (!used[j]) {
          const upgrade = items[j];
          groups.push([
            { none: true, items: [] },
            {
              pick: i,
              cost: it.cost,
              score: it.score,
              ratingScore: it.ratingScore || 0,
              aptitudeScore: it.aptitudeScore || 0,
              items: [i],
            },
            {
              combo: [i, j],
              cost: it.cost + upgrade.cost,
              score: upgrade.score,
              ratingScore: upgrade.ratingScore || 0,
              aptitudeScore: upgrade.aptitudeScore || 0,
              items: [i, j],
            },
          ]);
          used[i] = used[j] = true;
          continue;
        }
      }
      // Orphaned evo sub-row (parent gold missing/invalid) — skip silently
      if (it.parentEvoId) {
        used[i] = true;
        continue;
      }
      // If this is a linked sub-row (circle or gold), its parent will group it.
      groups.push([
        { none: true, items: [] },
        {
          pick: i,
          cost: it.cost,
          score: it.score,
          ratingScore: it.ratingScore || 0,
          aptitudeScore: it.aptitudeScore || 0,
          items: [i],
        },
      ]);
      used[i] = true;
    }
    return groups;
  }

  function optimizeGrouped(groups, items, budget) {
    const B = Math.max(0, Math.floor(budget));
    const requiredSet = new Set();
    items.forEach((it, idx) => {
      if (it.required) requiredSet.add(idx);
    });
    const filteredGroups = groups.map((opts) => {
      const reqInGroup = new Set();
      opts.forEach((o) => {
        (o.items || []).forEach((idx) => {
          if (requiredSet.has(idx)) reqInGroup.add(idx);
        });
      });
      if (!reqInGroup.size) return opts;
      return opts.filter((o) => {
        const present = o.items || [];
        for (const reqIdx of reqInGroup) {
          if (!present.includes(reqIdx)) return false;
        }
        return true;
      });
    });
    if (filteredGroups.some((opts) => !opts.length)) {
      return { best: 0, chosen: [], used: 0, error: 'required_unreachable' };
    }
    const G = filteredGroups.length;
    const NEG = -1e15;
    // Performance optimization: use rolling array for dp (only need prev and curr rows)
    // This reduces memory from O(G × B) to O(2 × B) for dp array
    let dpPrev = new Array(B + 1).fill(0); // dp[0] starts at 0
    let dpCurr = new Array(B + 1).fill(NEG);
    // We still need full choice array for reconstruction
    const choice = Array.from({ length: G + 1 }, () => new Array(B + 1).fill(-1));
    for (let g = 1; g <= G; g++) {
      const opts = filteredGroups[g - 1];
      const hasNone = opts.some((o) => o.none);
      for (let b = 0; b <= B; b++) {
        if (hasNone) {
          dpCurr[b] = dpPrev[b];
          choice[g][b] = -1;
        } else {
          dpCurr[b] = NEG;
          choice[g][b] = -1;
        }
        for (let k = 0; k < opts.length; k++) {
          const o = opts[k];
          if (o.none) continue;
          const w = Math.max(0, Math.floor(o.cost));
          const v = Math.max(0, Math.floor(o.score));
          if (w <= b && dpPrev[b - w] > NEG / 2) {
            const cand = dpPrev[b - w] + v;
            if (cand > dpCurr[b]) {
              dpCurr[b] = cand;
              choice[g][b] = k;
            }
          }
        }
      }
      // Swap arrays for next iteration
      const temp = dpPrev;
      dpPrev = dpCurr;
      dpCurr = temp;
      dpCurr.fill(NEG); // Reset for next iteration
    }
    // After loop, dpPrev contains dp[G]
    if (dpPrev[B] <= NEG / 2) {
      return { best: 0, chosen: [], used: 0, error: 'required_unreachable' };
    }
    // reconstruct
    let b = B;
    const chosen = [];
    for (let g = G; g >= 1; g--) {
      const opts = filteredGroups[g - 1];
      const k = choice[g][b];
      if (k > 0) {
        const o = opts[k];
        const picks = o.combo || (typeof o.pick === 'number' ? [o.pick] : []);
        if (o.combo) {
          const lastIdx = picks[picks.length - 1];
          const baseItem = items[lastIdx];
          chosen.push({
            ...baseItem,
            id: baseItem.id,
            cost: o.cost,
            score: o.score,
            combo: true,
            components: picks.map((idx) => items[idx]?.id).filter(Boolean),
          });
          const comboParentName = baseItem.name;
          picks.slice(0, -1).forEach((idx) => {
            const comp = items[idx];
            if (!comp) return;
            chosen.push({
              ...comp,
              cost: 0,
              score: 0,
              comboComponent: true,
              comboParentName,
            });
          });
        } else {
          picks.forEach((idx) => chosen.push(items[idx]));
        }
        b -= Math.max(0, Math.floor(o.cost));
      }
    }
    chosen.reverse();
    const idToIndex = new Map(items.map((it, idx) => [it.id, idx]));
    const chosenIds = new Set(chosen.map((it) => it.id));
    let addedScore = 0;
    let addedCost = 0;
    requiredSet.forEach((idx) => {
      const it = items[idx];
      if (!it || chosenIds.has(it.id)) return;
      chosen.push({ ...it, forced: true });
      chosenIds.add(it.id);
      addedScore += Math.max(0, Math.floor(it.score || 0));
      addedCost += Math.max(0, Math.floor(it.cost || 0));
      if (it.lowerRowId && idToIndex.has(it.lowerRowId)) {
        const lower = items[idToIndex.get(it.lowerRowId)];
        if (lower && !chosenIds.has(lower.id)) {
          chosen.push({ ...lower, forced: true });
          chosenIds.add(lower.id);
          addedScore += Math.max(0, Math.floor(lower.score || 0));
          addedCost += Math.max(0, Math.floor(lower.cost || 0));
          // Also include the lower's ◎ circle upgrade if it exists
          if (lower.circleRowId && idToIndex.has(lower.circleRowId)) {
            const circle = items[idToIndex.get(lower.circleRowId)];
            if (circle && !chosenIds.has(circle.id)) {
              chosen.push({ ...circle, forced: true });
              chosenIds.add(circle.id);
              addedScore += Math.max(0, Math.floor(circle.score || 0));
              addedCost += Math.max(0, Math.floor(circle.cost || 0));
            }
          }
        }
      }
    });
    const used = chosen.reduce(
      (sum, it) => (it.comboComponent ? sum : sum + Math.max(0, Math.floor(it.cost))),
      0
    );
    const best = dpPrev[B] + addedScore;
    if (used > B) {
      return { best: 0, chosen: [], used: 0, error: 'required_unreachable' };
    }
    return { best, chosen, used };
  }

  function expandRequired(items) {
    const idToIndex = new Map(items.map((it, idx) => [it.id, idx]));
    const skillIdToIndex = new Map();
    const parentGoldToChild = new Map();
    items.forEach((it, idx) => {
      if (it.skillId !== undefined && it.skillId !== null) {
        skillIdToIndex.set(String(it.skillId), idx);
      }
      if (it.parentGoldId) {
        parentGoldToChild.set(it.parentGoldId, idx);
      }
    });
    const requiredIds = new Set(items.filter((it) => it.required).map((it) => it.id));
    let changed = true;
    while (changed) {
      changed = false;
      Array.from(requiredIds).forEach((id) => {
        const idx = idToIndex.get(id);
        if (idx === undefined) return;
        const it = items[idx];
        if (it.lowerRowId && idToIndex.has(it.lowerRowId) && !requiredIds.has(it.lowerRowId)) {
          requiredIds.add(it.lowerRowId);
          changed = true;
        }
        // If this ○ skill is a lower for a gold and has a ◎ circle upgrade, require it too
        if (
          it.parentGoldId &&
          it.circleRowId &&
          idToIndex.has(it.circleRowId) &&
          !requiredIds.has(it.circleRowId)
        ) {
          requiredIds.add(it.circleRowId);
          changed = true;
        }
        if (it.lowerSkillId !== undefined && it.lowerSkillId !== null) {
          const lowerIdx = skillIdToIndex.get(String(it.lowerSkillId));
          if (lowerIdx !== undefined) {
            const lowerId = items[lowerIdx]?.id;
            if (lowerId && !requiredIds.has(lowerId)) {
              requiredIds.add(lowerId);
              changed = true;
            }
          }
        }
        const parents = Array.isArray(it.parentSkillIds) ? it.parentSkillIds : [];
        parents.forEach((pid) => {
          const pidx = skillIdToIndex.get(String(pid));
          if (pidx === undefined) return;
          const pidId = items[pidx]?.id;
          if (pidId && !requiredIds.has(pidId)) {
            requiredIds.add(pidId);
            changed = true;
          }
        });
        if (it.id && parentGoldToChild.has(it.id)) {
          const childIdx = parentGoldToChild.get(it.id);
          const childId = items[childIdx]?.id;
          if (childId && !requiredIds.has(childId)) {
            requiredIds.add(childId);
            changed = true;
          }
        }
      });
    }
    const requiredItems = items.filter((it) => requiredIds.has(it.id));
    const requiredGoldIds = new Set(
      requiredItems.filter((it) => isGoldCategory(it.category)).map((it) => it.id)
    );
    const lowerIncludedIds = new Set();
    requiredItems.forEach((it) => {
      if (!requiredGoldIds.has(it.id)) return;
      if (it.lowerRowId && requiredIds.has(it.lowerRowId)) lowerIncludedIds.add(it.lowerRowId);
      if (it.lowerSkillId !== undefined && it.lowerSkillId !== null) {
        const lowerIdx = skillIdToIndex.get(String(it.lowerSkillId));
        if (lowerIdx !== undefined) {
          const lowerId = items[lowerIdx]?.id;
          if (lowerId && requiredIds.has(lowerId)) lowerIncludedIds.add(lowerId);
        }
      }
      if (it.id && parentGoldToChild.has(it.id)) {
        const childIdx = parentGoldToChild.get(it.id);
        const childId = items[childIdx]?.id;
        if (childId && requiredIds.has(childId)) lowerIncludedIds.add(childId);
      }
    });
    const requiredCost = requiredItems.reduce((sum, it) => {
      if (lowerIncludedIds.has(it.id)) return sum;
      return sum + Math.max(0, Math.floor(it.cost));
    }, 0);
    // Circle pairs: when ○ (base) and ◎ (upgrade) are both required,
    // skip ○'s score since ◎ replaces it. Keep ○'s cost (circle costs are additive).
    const circleBaseScoreSkipIds = new Set();
    requiredItems.forEach((it) => {
      if (it.circleRowId && requiredIds.has(it.circleRowId)) {
        circleBaseScoreSkipIds.add(it.id);
      }
    });
    const requiredScore = requiredItems.reduce((sum, it) => {
      if (lowerIncludedIds.has(it.id)) return sum;
      if (circleBaseScoreSkipIds.has(it.id)) return sum;
      return sum + Math.max(0, Math.floor(it.score));
    }, 0);
    return { requiredIds, requiredItems, requiredCost, requiredScore };
  }

  // When ○ is required but ◎ is optional, adjust ◎'s optimization score to
  // be incremental (◎ - ○) so the optimizer correctly evaluates the upgrade value
  // instead of double-counting the base score.
  function adjustCircleOptionalScores(optionalItems, requiredSummary) {
    const requiredById = new Map(requiredSummary.requiredItems.map((it) => [it.id, it]));
    return optionalItems.map((it) => {
      if (it.parentCircleId && requiredById.has(it.parentCircleId)) {
        const parent = requiredById.get(it.parentCircleId);
        return {
          ...it,
          score: Math.max(0, it.score - parent.score),
        };
      }
      return it;
    });
  }

  function optimizeTeamTrialsCandidates(items, budget) {
    const api = window.TeamTrialsOptimizer;
    if (!api?.optimizeTeamTrialsBuild) {
      return {
        error: 'team_trials_unavailable',
        chosen: [],
        used: 0,
        best: 0,
        warnings: ['Team Trials optimizer module is unavailable.'],
      };
    }
    const result = api.optimizeTeamTrialsBuild(
      {
        budget,
        items,
        wisdom: Number(ratingInputs.wisdom?.value) || 900,
        raceConfig: getRaceConfigSnapshot(),
        autoTargets: getSelectedAutoTargets(),
        skillMetaById: teamTrialsSkillMetaById,
        skillMetaByName: teamTrialsSkillMetaByName,
        tierById: teamTrialsTierById,
        tierByName: teamTrialsTierByName,
      },
      {
        weights: api.DEFAULT_WEIGHTS || undefined,
      }
    );
    if (!result || typeof result !== 'object') {
      return {
        error: 'team_trials_failed',
        chosen: [],
        used: 0,
        best: 0,
        warnings: ['Team Trials optimizer did not return a valid result.'],
      };
    }
    return result;
  }

  function renderResults(result, budget) {
    resultsEl.hidden = false;
    usedPointsEl.textContent = String(result.used);
    totalPointsEl.textContent = String(budget);
    remainingPointsEl.textContent = String(Math.max(0, budget - result.used));
    selectedListEl.innerHTML = '';

    const mode = getOptimizeMode();
    const chosen = Array.isArray(result.chosen) ? result.chosen : [];
    const teamBreakdownMap = new Map(
      Array.isArray(result.perSkillBreakdown)
        ? result.perSkillBreakdown.map((entry) => [entry.id, entry])
        : []
    );

    // Calculate actual rating and aptitude scores from chosen items
    // For aptitude: don't count lower skills that are part of gold combos
    let totalRatingScore = 0;
    let totalAptitudeScore = 0;
    const totalPurplePenalty = Math.max(0, Number(result.purpleTotalPenalty) || 0);
    let removedPurplePenalty = 0;
    const lowerIdsInGoldCombos = new Set();
    const chosenById = new Map(chosen.map((it) => [it.id, it]));
    const chosenBySkillId = new Map();
    chosen.forEach((it) => {
      if (it.skillId !== undefined && it.skillId !== null) {
        chosenBySkillId.set(String(it.skillId), it);
      }
    });

    // First pass: identify lower skills that are part of gold combos
    chosen.forEach((it) => {
      if (!isGoldCategory(it.category)) return;
      if (it.lowerRowId && chosenById.has(it.lowerRowId)) {
        lowerIdsInGoldCombos.add(it.lowerRowId);
      }
      if (it.lowerSkillId !== undefined && it.lowerSkillId !== null) {
        const lower = chosenBySkillId.get(String(it.lowerSkillId));
        if (lower) lowerIdsInGoldCombos.add(lower.id);
      }
    });
    chosen.forEach((it) => {
      if (it.parentGoldId && chosenById.has(it.parentGoldId)) {
        lowerIdsInGoldCombos.add(it.id);
      }
    });

    // Identify circle ○ base skills whose ◎ upgrade is also chosen
    const circleBaseIdsInCombos = new Set();
    chosen.forEach((it) => {
      if (it.parentCircleId && chosenById.has(it.parentCircleId)) {
        circleBaseIdsInCombos.add(it.parentCircleId);
      }
      if (it.circleRowId && chosenById.has(it.circleRowId)) {
        circleBaseIdsInCombos.add(it.id);
      }
    });

    // Second pass: calculate scores
    // Lower skills in gold combos don't count (gold score includes the upgrade)
    // Circle ○ base skills don't count when ◎ upgrade is also chosen (◎ replaces ○)
    chosen.forEach((it) => {
      if (
        !it.comboComponent &&
        !lowerIdsInGoldCombos.has(it.id) &&
        !circleBaseIdsInCombos.has(it.id)
      ) {
        totalRatingScore += it.ratingScore || 0;
        totalAptitudeScore += it.aptitudeScore || 0;
        if (canonicalCategory(it.category || '') === 'purple') {
          removedPurplePenalty += Math.max(0, Number(it.purplePenalty) || 0);
        }
      }
    });

    const outstandingPurplePenalty = Math.max(0, totalPurplePenalty - removedPurplePenalty);

    if (mode === TEAM_TRIALS_MODE && Number.isFinite(result.totalRatingScore)) {
      totalRatingScore = Math.max(0, Math.floor(result.totalRatingScore));
    }

    totalRatingScore -= outstandingPurplePenalty;

    // Display the appropriate score in "Best Score"
    if (mode === 'aptitude-test') {
      // In aptitude mode, show rating score as best (aptitude shown separately)
      bestScoreEl.textContent = String(totalRatingScore);
    } else {
      bestScoreEl.textContent = String(totalRatingScore);
    }

    // Show/hide aptitude test score based on mode
    if (aptitudeScorePill && aptitudeScoreEl) {
      if (mode === 'aptitude-test') {
        aptitudeScorePill.style.display = '';
        aptitudeScoreEl.textContent = String(totalAptitudeScore);
      } else {
        aptitudeScorePill.style.display = 'none';
      }
    }

    if (teamConsistencyPill && teamConsistencyEl) {
      if (mode === TEAM_TRIALS_MODE) {
        const consistency = Number.isFinite(result.consistencyScore)
          ? Math.max(0, Math.min(1, result.consistencyScore))
          : 0;
        teamConsistencyPill.style.display = '';
        teamConsistencyEl.textContent = `${Math.round(consistency * 100)}%`;
      } else {
        teamConsistencyPill.style.display = 'none';
      }
    }
    if (teamExpectedPill && teamExpectedEl) {
      if (mode === TEAM_TRIALS_MODE) {
        const expected = Number.isFinite(result.totalExpectedValue) ? result.totalExpectedValue : 0;
        teamExpectedPill.style.display = '';
        teamExpectedEl.textContent = expected.toFixed(2);
      } else {
        teamExpectedPill.style.display = 'none';
      }
    }
    if (teamSVPill && teamSVEl) {
      if (mode === TEAM_TRIALS_MODE) {
        teamSVPill.style.display = '';
        teamSVEl.textContent = String(result.totalSV || 0);
      } else {
        teamSVPill.style.display = 'none';
      }
    }
    if (teamActivationsPill && teamActivationsEl) {
      if (mode === TEAM_TRIALS_MODE) {
        teamActivationsPill.style.display = '';
        teamActivationsEl.textContent = String(result.expectedActivations || '0.0');
      } else {
        teamActivationsPill.style.display = 'none';
      }
    }
    if (teamSVPerSPPill && teamSVPerSPEl) {
      if (mode === TEAM_TRIALS_MODE) {
        teamSVPerSPPill.style.display = '';
        teamSVPerSPEl.textContent = (result.svPerSP || 0).toFixed(3);
      } else {
        teamSVPerSPPill.style.display = 'none';
      }
    }
    if (teamDensityPill && teamDensityEl) {
      if (mode === TEAM_TRIALS_MODE) {
        teamDensityPill.style.display = '';
        teamDensityEl.textContent = String(result.skillDensity || 0);
      } else {
        teamDensityPill.style.display = 'none';
      }
    }
    if (teamPredictedScorePill && teamPredictedScoreEl) {
      if (mode === TEAM_TRIALS_MODE && window.TeamTrialsOptimizer?.predictActivationScore) {
        lastTTChosen = result.chosen || [];
        const wisdomEl = document.getElementById('stat-wisdom');
        const wisdom = wisdomEl ? Number(wisdomEl.value) || 900 : 900;
        const predicted = window.TeamTrialsOptimizer.predictActivationScore(lastTTChosen, wisdom);
        teamPredictedScorePill.style.display = '';
        teamPredictedScoreEl.textContent = String(predicted);
      } else {
        lastTTChosen = null;
        teamPredictedScorePill.style.display = 'none';
      }
    }

    if (teamExplainPanel && teamExplainStrengthsEl && teamExplainRisksEl && teamWarningsEl) {
      if (mode === TEAM_TRIALS_MODE) {
        teamExplainPanel.style.display = '';
        teamExplainStrengthsEl.innerHTML = '';
        teamExplainRisksEl.innerHTML = '';
        teamWarningsEl.innerHTML = '';
        const strengths = Array.isArray(result?.explain?.strengths) ? result.explain.strengths : [];
        const risks = Array.isArray(result?.explain?.risks) ? result.explain.risks : [];
        const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
        if (!strengths.length) {
          const li = document.createElement('li');
          li.textContent = t('optimizer.noStrengths');
          teamExplainStrengthsEl.appendChild(li);
        } else {
          strengths.forEach((text) => {
            const li = document.createElement('li');
            li.textContent = text;
            teamExplainStrengthsEl.appendChild(li);
          });
        }
        if (!risks.length) {
          const li = document.createElement('li');
          li.textContent = t('optimizer.noRisks');
          teamExplainRisksEl.appendChild(li);
        } else {
          risks.forEach((text) => {
            const li = document.createElement('li');
            li.textContent = text;
            teamExplainRisksEl.appendChild(li);
          });
        }
        if (!warnings.length) {
          const li = document.createElement('li');
          li.textContent = t('optimizer.noWarnings');
          teamWarningsEl.appendChild(li);
        } else {
          warnings.forEach((text) => {
            const li = document.createElement('li');
            li.textContent = text;
            teamWarningsEl.appendChild(li);
          });
        }
      } else {
        teamExplainPanel.style.display = 'none';
      }
    }

    if (result.error) {
      let message = t('optimizer.requiredCannotFit');
      if (result.error === 'team_trials_unavailable')
        message = t('optimizer.teamTrialsUnavailable');
      else if (result.error === 'team_trials_failed') message = t('optimizer.teamTrialsNoResult');
      else if (result.error === 'no_items') message = t('optimizer.noCandidates');
      else if (result.error === 'no_applicable_skills') message = t('optimizer.noMatchTargets');
      else if (result.error !== 'required_unreachable') message = t('optimizer.optimizationFailed');
      const li = document.createElement('li');
      li.className = 'result-item';
      li.textContent = message;
      selectedListEl.appendChild(li);
      ratingEngine.updateRatingDisplay(0);
      return;
    }
    const ordered = [...chosen];
    const indexMap = new Map(ordered.map((it, idx) => [it.id, idx]));
    const inputOrderMap = new Map();
    const selectedEvosByParentId = new Map();
    if (rowsEl) {
      Array.from(rowsEl.querySelectorAll('.optimizer-row')).forEach((row, idx) => {
        const rowId = row?.dataset?.rowId;
        if (rowId && !inputOrderMap.has(rowId)) inputOrderMap.set(rowId, idx);
        if (!rowId || row.dataset.parentEvoId) return;
        const selectedEvos = Array.from(row.querySelectorAll('.evo-checkbox:checked'))
          .map((checkbox) => checkbox.dataset.evoName)
          .filter(Boolean);
        if (selectedEvos.length) selectedEvosByParentId.set(rowId, selectedEvos);
      });
    }
    const byId = new Map(ordered.map((it) => [it.id, it]));
    const bySkillId = new Map();
    ordered.forEach((it) => {
      if (it.skillId !== undefined && it.skillId !== null) {
        bySkillId.set(String(it.skillId), it);
      }
    });
    const evoByParentId = new Map();
    ordered.forEach((it) => {
      if (!it?.isEvo || !it.parentEvoId || !it.combo) return;
      evoByParentId.set(it.parentEvoId, it);
    });
    const lowerToGold = new Map();
    const goldToLower = new Map();
    ordered.forEach((it) => {
      if (!isGoldCategory(it.category)) return;
      if (it.lowerRowId && byId.has(it.lowerRowId)) {
        lowerToGold.set(it.lowerRowId, it);
        goldToLower.set(it.id, byId.get(it.lowerRowId));
        return;
      }
      if (it.lowerSkillId !== undefined && it.lowerSkillId !== null) {
        const lower = bySkillId.get(String(it.lowerSkillId));
        if (lower) {
          lowerToGold.set(lower.id, it);
          goldToLower.set(it.id, lower);
        }
      }
    });
    // Build circle pair mapping for display
    // In combos, ◎ is the base item (combo: true), ○ is the component (comboComponent: true)
    const circleComboBaseIds = new Set(); // ◎ items that are circle combo bases
    const circleComponentIds = new Set(); // ○ items that are circle combo components
    ordered.forEach((it) => {
      if (!it.combo) return;
      const skill = findSkillByName(it.name);
      if (skill?.circleUpgradeOf) {
        // This is a ◎ base item in a circle combo
        circleComboBaseIds.add(it.id);
        (it.components || []).forEach((cid) => {
          const comp = byId.get(cid);
          const compSkill = comp ? findSkillByName(comp.name) : null;
          if (compSkill?.circleUpgrade) circleComponentIds.add(cid);
        });
      }
    });
    ordered.sort((a, b) => {
      const aOrderId = a.isEvo && a.parentEvoId ? a.parentEvoId : a.id;
      const bOrderId = b.isEvo && b.parentEvoId ? b.parentEvoId : b.id;
      const aInputOrder = inputOrderMap.has(aOrderId)
        ? inputOrderMap.get(aOrderId)
        : Number.MAX_SAFE_INTEGER;
      const bInputOrder = inputOrderMap.has(bOrderId)
        ? inputOrderMap.get(bOrderId)
        : Number.MAX_SAFE_INTEGER;
      if (aInputOrder !== bInputOrder) return aInputOrder - bInputOrder;
      if (a.isEvo && a.parentEvoId === b.id) return -1;
      if (b.isEvo && b.parentEvoId === a.id) return 1;
      const ag = lowerToGold.get(a.id);
      const bg = lowerToGold.get(b.id);
      if (ag && ag.id === b.id) return 1;
      if (bg && bg.id === a.id) return -1;
      return (indexMap.get(a.id) || 0) - (indexMap.get(b.id) || 0);
    });
    const formatCircleDisplayName = (name, marker) => {
      const base = (name || '').replace(/\s[○◎]$/, '');
      return base ? `${base} ${marker}` : marker;
    };
    ordered.forEach((it) => {
      // Skip ○ components of circle combos — the ◎ base shows the combined result
      if (circleComponentIds.has(it.id)) return;
      if (it.comboComponent && evoByParentId.has(it.id)) return;
      const li = document.createElement('li');
      li.className = 'result-item';
      // Mark standalone/parent items vs "included with" children for visual grouping
      const isChild = it.comboComponent || lowerToGold.has(it.id);
      if (isChild) li.classList.add('result-child');
      else li.classList.add('result-primary');
      if (mode === TEAM_TRIALS_MODE) li.classList.add('team-trials');
      const cat = it.category || 'unknown';
      const canon = (function (v) {
        v = (v || '').toLowerCase();
        if (v.includes('gold')) return 'gold';
        if (v === 'ius' || v.includes('ius')) return 'ius';
        return v;
      })(cat);
      if (canon) li.classList.add(`cat-${canon}`);
      const baseCategory = getBaseCategoryForResult(it);
      if (baseCategory) li.dataset.baseCategory = baseCategory;
      const linkedGold = lowerToGold.get(it.id);
      const linkedEvo = linkedGold ? evoByParentId.get(linkedGold.id) : null;
      const linkedSelectedEvos = linkedGold ? selectedEvosByParentId.get(linkedGold.id) || [] : [];
      const includedWithRaw = it.comboComponent
        ? it.comboParentName
        : linkedEvo
          ? linkedEvo.name
          : linkedSelectedEvos[0]
            ? linkedSelectedEvos[0]
            : linkedGold?.name || '';
      const includedWith = includedWithRaw ? formatSkillDisplayName(includedWithRaw) : '';
      if (mode === TEAM_TRIALS_MODE) {
        const breakdown = teamBreakdownMap.get(it.id) || {};
        if (includedWith) {
          li.innerHTML = `<span class="res-name" data-skill-name="${attrEsc(it.name)}"${it.skillId ? ` data-skill-id="${attrEsc(String(it.skillId))}"` : ''} tabindex="0" role="button">${formatSkillDisplayName(it.name)}</span> <span class="res-meta">${t('optimizer.includedWith', { name: includedWith })}</span>`;
        } else {
          const rating = Number.isFinite(breakdown.ratingScore)
            ? breakdown.ratingScore
            : it.ratingScore || 0;
          const cost = Number.isFinite(breakdown.cost) ? breakdown.cost : it.cost || 0;
          const ratio = Number.isFinite(breakdown.scorePerSP) ? breakdown.scorePerSP : 0;
          const consistency = Number.isFinite(breakdown.consistencyScore)
            ? Math.round(Math.max(0, Math.min(1, breakdown.consistencyScore)) * 100)
            : 0;
          const metrics = `cost ${cost}, rating ${rating}, score/SP ${ratio.toFixed(2)}, consistency ${consistency}%`;
          const nameEl = document.createElement('span');
          nameEl.className = 'res-name';
          nameEl.setAttribute('data-skill-name', it.name);
          if (it.skillId) nameEl.setAttribute('data-skill-id', String(it.skillId));
          nameEl.setAttribute('tabindex', '0');
          nameEl.setAttribute('role', 'button');
          nameEl.textContent = formatSkillDisplayName(it.name);
          const metricsEl = document.createElement('span');
          metricsEl.className = 'res-metrics';
          metricsEl.textContent = metrics;
          li.appendChild(nameEl);
          li.appendChild(metricsEl);

          const tierNote = typeof breakdown.tierNote === 'string' ? breakdown.tierNote.trim() : '';
          const reasons = Array.isArray(breakdown.reasons) ? breakdown.reasons.filter(Boolean) : [];
          if (tierNote || reasons.length) {
            const detailsEl = document.createElement('details');
            detailsEl.className = 'res-explain';
            const summaryEl = document.createElement('summary');
            summaryEl.textContent = t('optimizer.viewExplanation');
            detailsEl.appendChild(summaryEl);

            if (tierNote) {
              const noteEl = document.createElement('p');
              noteEl.className = 'res-explain-note';
              noteEl.textContent = tierNote;
              detailsEl.appendChild(noteEl);
            }
            if (reasons.length) {
              const listEl = document.createElement('ul');
              listEl.className = 'res-explain-reasons';
              reasons.forEach((reason) => {
                const reasonEl = document.createElement('li');
                reasonEl.textContent = reason;
                listEl.appendChild(reasonEl);
              });
              detailsEl.appendChild(listEl);
            }
            li.appendChild(detailsEl);
          }
        }
      } else {
        // Show rating score in the meta, not the combined optimization score
        const displayScore = it.ratingScore !== undefined ? it.ratingScore : it.score;
        // For circle skills, show which tier was chosen
        let displayName = formatSkillDisplayName(it.name);
        const skill = findSkillByName(it.name);
        const evoParent = it.isEvo && it.parentEvoId ? byId.get(it.parentEvoId) : null;
        const selectedEvos = selectedEvosByParentId.get(it.id) || [];
        if (evoParent) {
          displayName = `${formatSkillDisplayName(evoParent.name)} [Evo: ${formatSkillDisplayName(it.name)}]`;
          li.classList.add('result-evo-upgrade');
          li.dataset.evoName = formatSkillDisplayName(it.name);
        } else if (circleComboBaseIds.has(it.id) && skill?.circleBaseName) {
          // ◎ upgrade was chosen (combo) — show localized base name with ◎
          displayName = formatCircleDisplayName(formatSkillDisplayName(skill.circleBaseName), '◎');
        } else if (skill?.circleUpgrade) {
          // ○ only was chosen (no upgrade) — show localized base name with ○
          displayName = formatCircleDisplayName(formatSkillDisplayName(skill.circleBaseName), '○');
        }
        if (skill?.isEvo && !evoParent) displayName += ' (evo)';
        if (!evoParent && selectedEvos.length) {
          const evoLabels = selectedEvos.map((name) => formatSkillDisplayName(name)).join(' / ');
          displayName += ` [Evo: ${evoLabels}]`;
          li.classList.add('result-evo-upgrade');
          li.dataset.evoName = evoLabels;
        }
        const meta = includedWith
          ? t('optimizer.includedWith', { name: includedWith })
          : t('optimizer.costScoreDisplay', { cost: it.cost, score: displayScore });
        li.innerHTML = `<span class="res-name" data-skill-name="${attrEsc(it.name)}"${it.skillId ? ` data-skill-id="${attrEsc(String(it.skillId))}"` : ''} tabindex="0" role="button">${displayName}</span> <span class="res-meta">${meta}</span>`;
      }
      selectedListEl.appendChild(li);
    });
    // Always use the rating score for the rating display
    ratingEngine.updateRatingDisplay(totalRatingScore);
  }

  // persistence
  function saveState() {
    if (_restoringState || !_initComplete) return;
    const state = {
      budget: parseInt(budgetInput.value, 10) || 0,
      cfg: {},
      rows: [],
      autoTargets: [],
      rating: ratingEngine.readRatingState(),
      fastLearner: !!fastLearnerToggle?.checked,
      officialEnglishOnly: officialEnglishToggle ? !!officialEnglishToggle.checked : true,
      skillLanguage: getSkillLanguage(),
      optimizeMode: getOptimizeMode(),
    };
    Object.entries(cfg).forEach(([k, el]) => {
      state.cfg[k] = el ? el.value : 'A';
    });
    if (autoTargetInputs && autoTargetInputs.length) {
      state.autoTargets = Array.from(autoTargetInputs)
        .filter((input) => input.checked)
        .map((input) => input.value);
    }
    const rows = rowsEl.querySelectorAll('.optimizer-row');
    rows.forEach((row) => {
      // Skip circle upgrade and evo sub-rows — they're auto-generated
      if (row.dataset.parentCircleId) return;
      if (row.dataset.parentEvoId) return;
      const nameInput = row.querySelector('.skill-name');
      const costEl = row.querySelector('.cost');
      const hintEl = row.querySelector('.hint-level');
      const requiredEl = row.querySelector('.required-skill');
      if (!nameInput || !costEl) return;
      state.rows.push({
        id: row.dataset.rowId || '',
        category: row.dataset.skillCategory || '',
        name: nameInput.value || '',
        cost: parseInt(costEl.value, 10) || 0,
        hintLevel: parseInt(hintEl?.value, 10) || 0,
        required: !!requiredEl?.checked,
        baseCost: row.dataset.baseCost || '',
        parentGoldId: row.dataset.parentGoldId || row.dataset.parentSkillLink || '',
        lowerRowId: row.dataset.lowerRowId || '',
        checkedEvos: Array.from(row.querySelectorAll('.evo-checkbox:checked'))
          .map((cb) => cb.dataset.evoName)
          .filter(Boolean),
      });
    });
    try {
      localStorage.setItem('optimizerState', JSON.stringify(state));
    } catch {}
  }

  function loadState() {
    _restoringState = true;
    try {
      const raw = localStorage.getItem('optimizerState');
      if (!raw) {
        _restoringState = false;
        return false;
      }
      const state = JSON.parse(raw);
      if (!state || !Array.isArray(state.rows)) {
        _restoringState = false;
        return false;
      }
      budgetInput.value = state.budget || 0;
      if (fastLearnerToggle) fastLearnerToggle.checked = !!state.fastLearner;
      if (optimizeModeSelect && state.optimizeMode) optimizeModeSelect.value = state.optimizeMode;
      if (
        officialEnglishToggle &&
        Object.prototype.hasOwnProperty.call(state, 'officialEnglishOnly')
      ) {
        officialEnglishToggle.checked = !!state.officialEnglishOnly;
      }
      if (Object.prototype.hasOwnProperty.call(state, 'skillLanguage') && state.skillLanguage) {
        const lang = normalizeSkillLanguage(state.skillLanguage);
        try {
          localStorage.setItem(SERVER_PREF_KEY, lang);
        } catch {}
      }
      updateOfficialEnglishToggleState();
      rebuildSkillLibraryFromCache();
      Object.entries(state.cfg || {}).forEach(([k, v]) => {
        if (cfg[k]) cfg[k].value = v;
      });
      if (Array.isArray(state.autoTargets) && state.autoTargets.length) {
        setAutoTargetSelections(state.autoTargets);
      } else {
        setAutoTargetSelections(null);
      }
      if (state.rating) {
        ratingEngine.applyRatingState(state.rating);
        ratingEngine.updateRatingDisplay();
      } else {
        ratingEngine.updateRatingDisplay();
      }
      Array.from(rowsEl.querySelectorAll('.optimizer-row')).forEach((n) => n.remove());
      const created = new Map();
      let createdAny = false;
      state.rows.forEach((r) => {
        const row = makeRow();
        rowsEl.appendChild(row);
        createdAny = true;
        if (r.id) row.dataset.rowId = r.id;
        if (r.parentGoldId) {
          row.dataset.parentGoldId = r.parentGoldId;
          row.classList.add('linked-lower');
          const linkedInput = row.querySelector('.skill-name');
          if (linkedInput) linkedInput.placeholder = t('optimizer.lowerSkill');
        }
        const skillInput = row.querySelector('.skill-name');
        if (skillInput) skillInput.value = r.name || '';
        const costEl = row.querySelector('.cost');
        if (costEl) costEl.value = typeof r.cost === 'number' && !isNaN(r.cost) ? r.cost : 0;
        const hintEl = row.querySelector('.hint-level');
        if (hintEl)
          hintEl.value = typeof r.hintLevel === 'number' && !isNaN(r.hintLevel) ? r.hintLevel : 0;
        const requiredEl = row.querySelector('.required-skill');
        if (requiredEl) {
          requiredEl.checked = !!r.required;
          row.classList.toggle('required', !!r.required);
        }
        if (r.baseCost) row.dataset.baseCost = r.baseCost;
        else delete row.dataset.baseCost;
        if (r.category) row.dataset.skillCategory = r.category;
        if (typeof row.syncSkillCategory === 'function') {
          row.syncSkillCategory({ triggerOptimize: false, allowLinking: false, updateCost: true });
        } else {
          applyCategoryAccent(row, r.category || '');
        }
        created.set(row.dataset.rowId, row);
      });
      state.rows.forEach((r) => {
        if (r.parentGoldId && created.has(r.parentGoldId)) {
          const parent = created.get(r.parentGoldId);
          parent.dataset.lowerRowId = r.id || '';
          const child = created.get(r.id);
          if (child && child.previousSibling !== parent) {
            rowsEl.removeChild(child);
            rowsEl.insertBefore(child, parent.nextSibling);
          }
        }
      });
      // Also restore lowerRowId from saved state for gold rows whose lower row
      // may lack parentGoldId (e.g., created via ensureLinkedLowerForParent)
      state.rows.forEach((r) => {
        if (!r.lowerRowId || r.parentGoldId) return;
        const row = created.get(r.id);
        if (!row || row.dataset.lowerRowId) return;
        if (created.has(r.lowerRowId)) {
          row.dataset.lowerRowId = r.lowerRowId;
          const child = created.get(r.lowerRowId);
          if (child && !child.dataset.parentGoldId) {
            child.dataset.parentGoldId = r.id;
            child.classList.add('linked-lower');
            const linkedInput = child.querySelector('.skill-name');
            if (linkedInput) linkedInput.placeholder = t('optimizer.lowerSkill');
          }
        }
      });
      if (!createdAny) return false;
      // Recreate circle upgrade and evo sub-rows (they aren't saved, only auto-generated)
      created.forEach((row) => {
        if (row.dataset.parentGoldId || row.dataset.parentCircleId) return;
        if (typeof row.syncSkillCategory === 'function') {
          row.syncSkillCategory({ triggerOptimize: false, allowLinking: true, updateCost: true });
        }
      });
      // Restore evo checkbox selections from saved state
      state.rows.forEach((r) => {
        if (!Array.isArray(r.checkedEvos) || !r.checkedEvos.length) return;
        const row = created.get(r.id);
        if (!row) return;
        r.checkedEvos.forEach((evoName) => {
          const cb = row.querySelector(`.evo-checkbox[data-evo-name="${CSS.escape(evoName)}"]`);
          if (cb && !cb.checked) {
            cb.checked = true;
            cb.dispatchEvent(new Event('change'));
          }
        });
      });
      updateHintOptionLabels();
      refreshAllRowCosts();
      _restoringState = false;
      return true;
    } catch {
      _restoringState = false;
      return false;
    }
  }

  // ── Skill Browser Modal ──
  (function initSkillBrowser() {
    if (!skillBrowserBackdrop) return;

    const CATEGORY_ORDER = ['gold', 'yellow', 'blue', 'green', 'red', 'purple', 'evo', 'ius'];
    const CATEGORY_LABELS = {
      gold: 'Gold',
      yellow: 'Yellow',
      blue: 'Blue',
      green: 'Green',
      red: 'Red',
      purple: 'Purple',
      evo: 'Evo',
      ius: 'IUS',
    };
    const TYPE_GROUPS = {
      surface: { label: 'Surface', types: ['turf', 'dirt'] },
      distance: { label: 'Distance', types: ['sprint', 'mile', 'medium', 'long'] },
      strategy: { label: 'Strategy', types: ['front', 'pace', 'late', 'end'] },
    };

    let activeColorFilters = new Set();
    let activeTypeFilters = new Set();
    let searchQuery = '';
    let selectedSkills = new Map(); // name -> { hint, lowerHint }
    let allCards = [];
    let browserMode = 'append';
    let targetRow = null;
    let renderedGridRevision = -1;
    let filterFrameId = 0;
    const applyFiltersDebounced = debounce(() => applyFilters(), 90);

    function resetCardState() {
      allCards.forEach((entry) => {
        if (typeof entry.resetState === 'function') {
          entry.resetState();
        }
      });
      selectedSkills.clear();
      updateSelectedCount();
    }

    function ensureGridReady() {
      const shouldRebuild = renderedGridRevision !== skillLibraryRevision || !allCards.length;
      if (shouldRebuild) {
        buildGrid();
        renderedGridRevision = skillLibraryRevision;
      } else {
        resetCardState();
      }
    }

    function openBrowser(mode = 'append', row = null) {
      browserMode = mode;
      targetRow = row;
      selectedSkills.clear();
      activeColorFilters.clear();
      activeTypeFilters.clear();
      searchQuery = '';
      if (skillBrowserSearch) skillBrowserSearch.value = '';
      buildFilterChips();
      ensureGridReady();
      applyFilters();
      updateSelectedCount();
      skillBrowserBackdrop.classList.add('open');
      document.body.style.overflow = 'hidden';
      if (skillBrowserSearch) skillBrowserSearch.focus();
    }

    function closeBrowser() {
      if (filterFrameId) {
        cancelAnimationFrame(filterFrameId);
        filterFrameId = 0;
      }
      skillBrowserBackdrop.classList.remove('open');
      document.body.style.overflow = '';
      targetRow = null;
    }

    function buildFilterChips() {
      if (skillBrowserColorChips) {
        skillBrowserColorChips.innerHTML = '';
        CATEGORY_ORDER.forEach((cat) => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'filter-chip';
          chip.dataset.category = cat;
          chip.innerHTML = `<span class="chip-dot dot-${cat}"></span>${CATEGORY_LABELS[cat] || cat}`;
          chip.addEventListener('click', () => {
            if (activeColorFilters.has(cat)) {
              activeColorFilters.delete(cat);
              chip.classList.remove('active');
            } else {
              activeColorFilters.add(cat);
              chip.classList.add('active');
            }
            applyFilters();
          });
          skillBrowserColorChips.appendChild(chip);
        });
      }

      if (skillBrowserTypeChips) {
        skillBrowserTypeChips.innerHTML = '';
        Object.entries(TYPE_GROUPS).forEach(([groupKey, group]) => {
          const wrapper = document.createElement('div');
          wrapper.className = 'filter-chip-group';

          const parentChip = document.createElement('button');
          parentChip.type = 'button';
          parentChip.className = 'filter-chip';
          parentChip.innerHTML = `${group.label} <span class="filter-chip-arrow">&#9660;</span>`;
          parentChip.addEventListener('click', () => {
            wrapper.classList.toggle('expanded');
          });
          wrapper.appendChild(parentChip);

          const subContainer = document.createElement('div');
          subContainer.className = 'filter-chip-sub';
          group.types.forEach((typ) => {
            const sub = document.createElement('button');
            sub.type = 'button';
            sub.className = 'filter-chip';
            sub.dataset.type = typ;
            sub.textContent = typ.charAt(0).toUpperCase() + typ.slice(1);
            sub.addEventListener('click', () => {
              if (activeTypeFilters.has(typ)) {
                activeTypeFilters.delete(typ);
                sub.classList.remove('active');
              } else {
                activeTypeFilters.add(typ);
                sub.classList.add('active');
              }
              applyFilters();
            });
            subContainer.appendChild(sub);
          });
          wrapper.appendChild(subContainer);
          skillBrowserTypeChips.appendChild(wrapper);
        });

        const generalChip = document.createElement('button');
        generalChip.type = 'button';
        generalChip.className = 'filter-chip';
        generalChip.dataset.type = 'general';
        generalChip.textContent = 'General';
        generalChip.addEventListener('click', () => {
          if (activeTypeFilters.has('general')) {
            activeTypeFilters.delete('general');
            generalChip.classList.remove('active');
          } else {
            activeTypeFilters.add('general');
            generalChip.classList.add('active');
          }
          applyFilters();
        });
        skillBrowserTypeChips.appendChild(generalChip);
      }
    }

    function buildGrid() {
      if (!skillBrowserGrid) return;
      skillBrowserGrid.innerHTML = '';
      allCards = [];

      const skills = [];
      // Also check raw category keys in case canonicalization differs
      const catKeys = new Set(Object.keys(skillsByCategory));
      CATEGORY_ORDER.forEach((cat) => {
        const list =
          skillsByCategory[cat] ||
          (cat === 'gold' ? skillsByCategory['golden'] : null) ||
          (cat === 'purple' ? skillsByCategory['violet'] : null) ||
          [];
        const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
        sorted.forEach((s) => {
          // Skip evo skills and ◎ upgrades (same filtering as the datalist)
          if (s.isEvo) return;
          if (s.circleUpgradeOf) return; // ◎ with paired ○
          skills.push({ ...s, category: canonicalCategory(s.category || cat) });
        });
      });
      // Catch any categories not in CATEGORY_ORDER
      catKeys.forEach((key) => {
        const canon = canonicalCategory(key);
        if (CATEGORY_ORDER.includes(canon) || CATEGORY_ORDER.includes(key)) return;
        const list = skillsByCategory[key] || [];
        list.forEach((s) => {
          if (s.isEvo) return;
          if (s.circleUpgradeOf) return;
          skills.push({ ...s, category: canon || key });
        });
      });

      const isJPDisplay = getSiteLanguage() === 'jp';
      const frag = document.createDocumentFragment();
      skills.forEach((skill) => {
        const cat = canonicalCategory(skill.category);
        const isGold = isGoldCategory(cat);
        const isPairedSingle = !!skill.circleUpgrade;
        const displayName =
          isPairedSingle && skill.circleBaseName
            ? isJPDisplay && skill.jpCircleBaseName
              ? skill.jpCircleBaseName
              : isJPDisplay && typeof window.getLocalizedSkillName === 'function'
                ? window.getLocalizedSkillName(skill.circleBaseName)
                : skill.circleBaseName
            : formatSkillDisplayName(skill);
        const addName = isPairedSingle && skill.circleBaseName ? skill.circleBaseName : skill.name;

        // Resolve lower skill for gold skills
        let lowerSkill = null;
        let circleUpgradeSkill = null; // ◎ upgrade of the lower, if lower is a ○
        if (isGold) {
          const lowerId =
            skill.lowerSkillId ||
            (Array.isArray(skill.parentIds) && skill.parentIds.length ? skill.parentIds[0] : '');
          if (lowerId) lowerSkill = skillIdIndex.get(String(lowerId)) || null;
          // If the resolved lower is a ◎ (upgrade), find the ○ (base) counterpart
          // so we include both ○ + ◎ costs in the gold total
          if (lowerSkill?.circleUpgradeOf) {
            circleUpgradeSkill = lowerSkill; // keep ◎ reference
            const singleSkill = findSkillByName(lowerSkill.circleUpgradeOf);
            if (singleSkill) lowerSkill = singleSkill; // replace with ○
          } else if (lowerSkill?.circleUpgrade) {
            // Lower is a ○ with a ◎ upgrade
            circleUpgradeSkill = findSkillByName(lowerSkill.circleUpgrade) || null;
          }
        }

        const goldCost = typeof skill.baseCost === 'number' ? skill.baseCost : NaN;
        const lowerCost =
          lowerSkill && typeof lowerSkill.baseCost === 'number' ? lowerSkill.baseCost : NaN;
        const circleCost =
          circleUpgradeSkill && typeof circleUpgradeSkill.baseCost === 'number'
            ? circleUpgradeSkill.baseCost
            : NaN;
        const typeText = skill.checkType
          ? skill.checkType.charAt(0).toUpperCase() + skill.checkType.slice(1)
          : '';

        // Cost text (gold total = gold + ○ lower + ◎ upgrade if present)
        let costText;
        const totalCircleCost = !isNaN(circleCost) ? circleCost : 0;
        if (isGold && !isNaN(goldCost) && !isNaN(lowerCost)) {
          costText = `${goldCost + lowerCost + totalCircleCost} pt`;
        } else if (!isNaN(goldCost)) {
          costText = `${goldCost} pt`;
        } else {
          costText = '? pt';
        }

        // Lower skill HTML
        let lowerHtml = '';
        let lowerCat = '';
        if (isGold && lowerSkill) {
          lowerCat = canonicalCategory(lowerSkill.category);
          const lowerName = formatSkillDisplayName(lowerSkill);
          lowerHtml = `<div class="card-lower lower-${lowerCat}" data-skill-name="${attrEsc(lowerSkill.name)}"${lowerSkill.skillId ? ` data-skill-id="${attrEsc(String(lowerSkill.skillId))}"` : ''} tabindex="0" role="button">${attrEsc(lowerName)}</div>`;
        }

        const card = document.createElement('div');
        const tintCat = isGold && lowerCat ? lowerCat : cat;
        card.className = `skill-card cat-${cat}${isGold ? ' is-gold' : ''} tint-${tintCat}`;
        card.innerHTML =
          `<div class="card-check"></div>` +
          `<div class="card-name" data-skill-name="${attrEsc(skill.name)}"${skill.skillId ? ` data-skill-id="${attrEsc(String(skill.skillId))}"` : ''} tabindex="0" role="button" title="${attrEsc(skill.name)}">${attrEsc(displayName)}</div>` +
          lowerHtml +
          `<div class="card-meta"><span class="card-cost-value">${costText}</span>${typeText ? `<span>${typeText}</span>` : ''}</div>` +
          `<div class="card-hints">` +
          `<button type="button" class="card-hint-btn" title="${attrEsc(t('optimizer.hintDiscount'))}">` +
          (isGold ? `<span class="hint-dot dot-gold"></span>` : '') +
          `Lv0</button>` +
          (isGold && lowerSkill
            ? `<button type="button" class="card-hint-btn card-hint-lower" title="${attrEsc(t('optimizer.hintDiscount'))}"><span class="hint-dot dot-${lowerCat}"></span>Lv0</button>`
            : '') +
          `</div>`;

        // State for this card
        let hintLevel = 0;
        let lowerHintLevel = 0;
        const costEl = card.querySelector('.card-cost-value');
        const hintBtn = card.querySelector('.card-hint-btn');
        const lowerHintBtn = card.querySelector('.card-hint-lower');

        function updateCostDisplay() {
          const discGold = !isNaN(goldCost) ? calculateDiscountedCost(goldCost, hintLevel) : NaN;
          const discLower = !isNaN(lowerCost)
            ? calculateDiscountedCost(lowerCost, lowerHintLevel)
            : NaN;
          const discCircle = !isNaN(circleCost)
            ? calculateDiscountedCost(circleCost, lowerHintLevel)
            : 0;
          if (isGold && !isNaN(discGold) && !isNaN(discLower)) {
            costEl.textContent = `${discGold + discLower + discCircle} pt`;
          } else if (!isNaN(discGold)) {
            costEl.textContent = `${discGold} pt`;
          }
        }

        // Update hint button text without clobbering the color dot
        function setHintText(btn, level) {
          const textNode = Array.from(btn.childNodes).find((n) => n.nodeType === 3);
          if (textNode) textNode.textContent = `Lv${level}`;
          else btn.appendChild(document.createTextNode(`Lv${level}`));
        }

        function resetState() {
          hintLevel = 0;
          lowerHintLevel = 0;
          setHintText(hintBtn, hintLevel);
          hintBtn.classList.remove('active');
          if (lowerHintBtn) {
            setHintText(lowerHintBtn, lowerHintLevel);
            lowerHintBtn.classList.remove('active');
          }
          card.classList.remove('selected');
          updateCostDisplay();
        }

        hintBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          hintLevel = (hintLevel + 1) % 6;
          setHintText(hintBtn, hintLevel);
          hintBtn.classList.toggle('active', hintLevel > 0);
          updateCostDisplay();
          if (selectedSkills.has(addName)) selectedSkills.get(addName).hint = hintLevel;
        });

        if (lowerHintBtn) {
          lowerHintBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            lowerHintLevel = (lowerHintLevel + 1) % 6;
            setHintText(lowerHintBtn, lowerHintLevel);
            lowerHintBtn.classList.toggle('active', lowerHintLevel > 0);
            updateCostDisplay();
            if (selectedSkills.has(addName)) selectedSkills.get(addName).lowerHint = lowerHintLevel;
          });
        }

        // Card click toggles selection (not on name/lower/hint)
        card.addEventListener('click', (e) => {
          if (e.target.closest('.card-name, .card-lower, .card-hint-btn')) return;
          if (selectedSkills.has(addName)) {
            selectedSkills.delete(addName);
            card.classList.remove('selected');
          } else {
            selectedSkills.set(addName, { hint: hintLevel, lowerHint: lowerHintLevel });
            card.classList.add('selected');
          }
          updateSelectedCount();
        });

        frag.appendChild(card);
        // Split multi-valued checkType (e.g. "Sprint/Mile") into individual types
        const rawType = (skill.checkType || '').toLowerCase();
        const checkTypes = rawType ? rawType.split('/').map((t) => t.trim()) : [];
        allCards.push({
          el: card,
          name: addName,
          nameLower: addName.toLowerCase(),
          category: cat,
          checkTypes,
          aliases: (skill.aliasNames || []).map((a) => a.toLowerCase()),
          visible: true,
          resetState,
        });
      });
      skillBrowserGrid.appendChild(frag);
      if (!skills.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'grid-column:1/-1;text-align:center;padding:2rem;color:var(--muted)';
        empty.textContent = 'No skills loaded yet. Try closing and reopening.';
        skillBrowserGrid.appendChild(empty);
      }
    }

    function applyFilters() {
      if (filterFrameId) cancelAnimationFrame(filterFrameId);
      filterFrameId = requestAnimationFrame(() => {
        filterFrameId = 0;
        const query = searchQuery.toLowerCase();
        let shown = 0;

        allCards.forEach((entry) => {
          const { el, nameLower, category, checkTypes, aliases } = entry;
          let visible = true;

          if (activeColorFilters.size > 0 && !activeColorFilters.has(category)) {
            visible = false;
          }

          if (visible && activeTypeFilters.size > 0) {
            const isGeneral = checkTypes.length === 0;
            if (isGeneral) {
              visible = activeTypeFilters.has('general');
            } else {
              visible = checkTypes.some((ct) => activeTypeFilters.has(ct));
            }
          }

          if (visible && query) {
            const nameMatch = nameLower.includes(query);
            const aliasMatch = aliases.some((a) => a.includes(query));
            if (!nameMatch && !aliasMatch) visible = false;
          }

          if (entry.visible !== visible) {
            entry.visible = visible;
            el.style.display = visible ? '' : 'none';
          }
          if (visible) shown++;
        });

        if (skillBrowserCount) {
          skillBrowserCount.textContent = t('optimizer.showingCount', {
            count: shown,
            total: allCards.length,
          });
        }
      });
    }

    function updateSelectedCount() {
      const count = selectedSkills.size;
      if (skillBrowserSelectedCount) skillBrowserSelectedCount.textContent = count;
      if (skillBrowserAdd) skillBrowserAdd.disabled = count === 0;
    }

    function addSelectedSkills() {
      if (selectedSkills.size === 0) return;

      const entries = Array.from(selectedSkills.entries());
      let usedTarget = false;

      entries.forEach(([name, opts]) => {
        let row;
        if (!usedTarget && browserMode === 'fill' && targetRow) {
          row = targetRow;
          usedTarget = true;
        } else {
          const topRows = Array.from(rowsEl.querySelectorAll('.optimizer-row')).filter(
            isTopLevelRow
          );
          const lastRow = topRows[topRows.length - 1];
          if (lastRow && !isRowFilled(lastRow)) {
            row = lastRow;
          } else {
            row = makeRow();
            rowsEl.appendChild(row);
          }
        }

        const nameInput = row.querySelector('.skill-name');
        if (nameInput) nameInput.value = name;

        // Apply hint level from browser
        const hintSelect = row.querySelector('.hint-level');
        if (hintSelect && opts.hint > 0) {
          hintSelect.value = String(opts.hint);
        }

        if (typeof row.syncSkillCategory === 'function') {
          row.syncSkillCategory({
            triggerOptimize: false,
            allowLinking: true,
            updateCost: true,
          });
        }

        // Apply lower hint level to linked row (gold skills)
        if (opts.lowerHint > 0) {
          const linked = row.nextElementSibling;
          if (linked && linked.classList.contains('linked-lower')) {
            const linkedHint = linked.querySelector('.hint-level');
            if (linkedHint) {
              linkedHint.value = String(opts.lowerHint);
              if (typeof linked.syncSkillCategory === 'function') {
                linked.syncSkillCategory({
                  triggerOptimize: false,
                  allowLinking: false,
                  updateCost: true,
                });
              }
            }
          }
        }
      });

      ensureOneEmptyRow();
      saveState();
      autoOptimizeDebounced();
      closeBrowser();
    }

    if (skillBrowserSearch) {
      skillBrowserSearch.addEventListener('input', () => {
        searchQuery = skillBrowserSearch.value;
        applyFiltersDebounced();
      });
    }

    if (skillBrowserClose) skillBrowserClose.addEventListener('click', closeBrowser);
    if (skillBrowserCancel) skillBrowserCancel.addEventListener('click', closeBrowser);
    if (skillBrowserAdd) skillBrowserAdd.addEventListener('click', addSelectedSkills);

    skillBrowserBackdrop.addEventListener('click', (e) => {
      if (e.target === skillBrowserBackdrop) closeBrowser();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && skillBrowserBackdrop.classList.contains('open')) {
        closeBrowser();
      }
    });

    if (browseSkillsBtn) {
      browseSkillsBtn.addEventListener('click', () => openBrowser('append'));
    }

    window._openSkillBrowser = openBrowser;
  })();

  // events
  if (addRowBtn)
    addRowBtn.addEventListener('click', () => {
      const newRow = makeRow();
      rowsEl.appendChild(newRow);
      scrollRowIntoView(newRow);
      saveState();
    });

  if (optimizeBtn)
    optimizeBtn.addEventListener('click', () => {
      const budget = parseInt(budgetInput.value, 10);
      if (isNaN(budget) || budget < 0) {
        alert(t('optimizer.invalidBudget'));
        return;
      }
      const { items, rowsMeta } = collectItems();
      if (!items.length) {
        alert(t('optimizer.addAtLeastOne'));
        return;
      }
      if (getOptimizeMode() === TEAM_TRIALS_MODE) {
        const teamResult = optimizeTeamTrialsCandidates(items, budget);
        renderResults({ ...teamResult, purpleTotalPenalty: getTotalPurplePenalty(items) }, budget);
        saveState();
        return;
      }
      const requiredSummary = expandRequired(items);
      if (requiredSummary.requiredCost > budget) {
        renderResults(
          {
            best: 0,
            chosen: [],
            used: 0,
            error: 'required_unreachable',
            purpleTotalPenalty: getTotalPurplePenalty(items),
          },
          budget
        );
        saveState();
        return;
      }
      const optionalItems = adjustCircleOptionalScores(
        items.filter((it) => !requiredSummary.requiredIds.has(it.id)),
        requiredSummary
      );
      const groups = buildGroups(optionalItems, rowsMeta);
      const result = optimizeGrouped(groups, optionalItems, budget - requiredSummary.requiredCost);
      const mergedResult = {
        ...result,
        chosen: requiredSummary.requiredItems.concat(result.chosen),
        used: result.used + requiredSummary.requiredCost,
        best: result.best + requiredSummary.requiredScore,
        purpleTotalPenalty: getTotalPurplePenalty(items),
      };
      renderResults(mergedResult, budget);
      saveState();
    });
  if (clearAllBtn)
    clearAllBtn.addEventListener('click', () => {
      clearAllRows();
    });
  if (shareBuildBtn) {
    shareBuildBtn.addEventListener('click', async () => {
      try {
        writeToURL();
        const shareURL = location.href;
        let copied = false;
        try {
          copied = await tryWriteClipboard(shareURL);
        } catch (err) {
          console.warn('Clipboard API write failed', err);
        }
        if (!copied) {
          await copyViaFallback(shareURL);
        }
        setAutoStatus(t('optimizer.linkCopied'));
      } catch (err) {
        console.error('Share failed', err);
        alert(t('optimizer.copyError'));
      }
    });
  }
  if (saveBuildBtn) {
    saveBuildBtn.addEventListener('click', () => {
      saveBuildNameInput.value = '';
      saveBuildDescInput.value = '';
      openModal(saveBuildModal);
      if (saveBuildNameInput && saveBuildNameInput.focus) {
        saveBuildNameInput.focus({ preventScroll: true });
      }
    });
  }

  if (viewBuildsBtn) {
    viewBuildsBtn.addEventListener('click', () => {
      renderBuildsList();
      openModal(buildsListModal);
    });
  }

  let activeModal = null;
  let lastFocusedEl = null;
  let modalRoot = null;
  let scrollLockY = 0;

  function getModalRoot() {
    if (modalRoot && document.body.contains(modalRoot)) return modalRoot;
    modalRoot = document.getElementById('modal-root');
    if (!modalRoot) {
      modalRoot = document.createElement('div');
      modalRoot.id = 'modal-root';
      document.body.appendChild(modalRoot);
    }
    return modalRoot;
  }

  function getFocusableWithin(root) {
    if (!root) return [];
    const nodes = root.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );
    return Array.from(nodes).filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
    );
  }

  function handleModalKeydown(e) {
    if (!activeModal) return;
    if (e.key === 'Escape') {
      closeModal(activeModal);
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = getFocusableWithin(activeModal);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function attachModalToRoot(modalEl) {
    const root = getModalRoot();
    if (modalEl && modalEl.parentElement !== root) {
      root.appendChild(modalEl);
    }
  }

  function openModal(modalEl) {
    if (!modalEl) return;
    attachModalToRoot(modalEl);
    lastFocusedEl = document.activeElement;
    activeModal = modalEl;
    modalEl.style.display = 'flex';
    modalEl.classList.add('open');
    modalEl.setAttribute('aria-hidden', 'false');
    if (!document.body.classList.contains('modal-open')) {
      scrollLockY = window.scrollY || window.pageYOffset || 0;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollLockY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
    }
    document.body.classList.add('modal-open');
    document.addEventListener('keydown', handleModalKeydown);
    const focusable = getFocusableWithin(modalEl);
    if (focusable.length) {
      focusable[0].focus({ preventScroll: true });
    }
  }

  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('open');
    modalEl.setAttribute('aria-hidden', 'true');
    modalEl.style.display = 'none';
    document.body.classList.remove('modal-open');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    window.scrollTo(0, scrollLockY);
    document.removeEventListener('keydown', handleModalKeydown);
    activeModal = null;
    if (lastFocusedEl && lastFocusedEl.focus) {
      lastFocusedEl.focus({ preventScroll: true });
    }
    lastFocusedEl = null;
  }

  function closeSaveBuildModal() {
    closeModal(saveBuildModal);
  }

  function closeBuildsListModal() {
    closeModal(buildsListModal);
  }

  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getSavedBuilds() {
    try {
      const stored = localStorage.getItem('umatools-saved-builds');
      if (stored) {
        const builds = JSON.parse(stored);
        if (Array.isArray(builds)) {
          const validated = builds.filter((b) => {
            return b && typeof b === 'object' && b.id && b.name && typeof b.timestamp === 'number';
          });
          return validated.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        }
      }
    } catch (err) {
      console.error('Failed to load saved builds', err);
      try {
        localStorage.removeItem('umatools-saved-builds');
      } catch {}
    }
    return [];
  }

  function deleteBuild(buildId) {
    try {
      let builds = getSavedBuilds();
      builds = builds.filter((b) => b.id !== buildId);
      localStorage.setItem('umatools-saved-builds', JSON.stringify(builds));
      return true;
    } catch (err) {
      console.error('Failed to delete build', err);
      return false;
    }
  }

  async function loadBuildFromSaved(build) {
    if (!build) {
      alert(t('optimizer.invalidBuild'));
      return;
    }
    try {
      if (
        officialEnglishToggle &&
        Object.prototype.hasOwnProperty.call(build, 'officialEnglishOnly')
      ) {
        officialEnglishToggle.checked = !!build.officialEnglishOnly;
      }
      if (build.skillLanguage) {
        const nextLang = normalizeSkillLanguage(build.skillLanguage);
        const changed = getSkillLanguage() !== nextLang;
        try {
          localStorage.setItem(SERVER_PREF_KEY, nextLang);
        } catch {}
        updateOfficialEnglishToggleState();
        if (changed) {
          await loadSkillsCSV();
        } else {
          rebuildSkillLibraryFromCache();
        }
      } else {
        rebuildSkillLibraryFromCache();
      }
      if (build.data) {
        loadRowsFromString(build.data);
      } else {
        Array.from(rowsEl.querySelectorAll('.optimizer-row')).forEach((n) => n.remove());
      }
      if (build.budget !== undefined) budgetInput.value = build.budget;
      if (build.fastLearner !== undefined && fastLearnerToggle) {
        fastLearnerToggle.checked = build.fastLearner;
      }
      if (build.optimizeMode !== undefined && optimizeModeSelect) {
        optimizeModeSelect.value = build.optimizeMode;
      }
      if (build.config) {
        Object.entries(build.config).forEach(([k, v]) => {
          if (cfg[k]) cfg[k].value = v;
        });
      }
      if (Array.isArray(build.autoTargets)) {
        setAutoTargetSelections(build.autoTargets);
      }
      if (build.rating) {
        ratingEngine.applyRatingState(build.rating);
        ratingEngine.updateRatingDisplay();
      } else {
        ratingEngine.updateRatingDisplay();
      }
      updateAffinityStyles();
      updateHintOptionLabels();
      refreshAllRowCosts();
      saveState();
      autoOptimizeDebounced();
      setAutoStatus(t('optimizer.buildLoaded', { name: build.name }));
      closeBuildsListModal();
    } catch (err) {
      console.error('Failed to load build', err);
      alert(t('optimizer.failedLoadBuild'));
    }
  }

  async function shareBuildFromSaved(build) {
    if (!build) {
      alert(t('optimizer.invalidBuild'));
      return;
    }
    try {
      const p = new URLSearchParams();
      if (build.data) {
        const encoded = encodeBuildToURL(build.data);
        if (encoded) p.set('b', encoded);
      }

      if (build.budget) p.set('k', String(build.budget));
      if (build.fastLearner) p.set('f', '1');
      if (
        Object.prototype.hasOwnProperty.call(build, 'officialEnglishOnly') &&
        !build.officialEnglishOnly
      ) {
        p.set('oe', '0');
      }
      if (normalizeSkillLanguage(build.skillLanguage) === 'jp') {
        p.set('sl', 'jp');
      }
      if (build.optimizeMode && build.optimizeMode !== 'rating') {
        p.set('m', build.optimizeMode);
      }

      if (build.config) {
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
        const cfgValues = cfgKeys.map((k) => build.config[k] || 'A');
        const cfgString = cfgValues.join(',');
        if (cfgString && cfgString !== 'A,A,A,A,A,A,A,A,A,A') {
          p.set('c', cfgString);
        }
      }
      if (build.rating) {
        p.set('r', encodeURIComponent(JSON.stringify(build.rating)));
      }
      if (Array.isArray(build.autoTargets) && build.autoTargets.length) {
        p.set('t', build.autoTargets.join(','));
      }

      const shareURL = `${window.location.origin}${window.location.pathname}#${p.toString()}`;
      let copied = false;
      try {
        copied = await tryWriteClipboard(shareURL);
      } catch (err) {
        console.warn('Clipboard API write failed', err);
      }
      if (!copied) {
        await copyViaFallback(shareURL);
      }
      setAutoStatus(t('optimizer.buildLinkCopied', { name: build.name }));
    } catch (err) {
      console.error('Share failed', err);
      alert(t('optimizer.failedCreateLink'));
    }
  }

  function renderBuildsList() {
    if (!buildsListContainer) return;
    buildsListContainer.innerHTML = '';
    const builds = getSavedBuilds();
    if (builds.length === 0) {
      buildsListContainer.innerHTML =
        '<div class="empty-builds">' + t('optimizer.noSavedBuilds') + '</div>';
      return;
    }
    builds.forEach((build) => {
      const item = document.createElement('div');
      item.className = 'build-item';
      const header = document.createElement('div');
      header.className = 'build-item-header';
      const titleDiv = document.createElement('div');
      const title = document.createElement('h4');
      title.className = 'build-item-title';
      title.textContent = build.name || 'Untitled Build';
      const timestamp = document.createElement('div');
      timestamp.className = 'build-item-timestamp';
      timestamp.textContent = formatTimestamp(build.timestamp);
      titleDiv.appendChild(title);
      titleDiv.appendChild(timestamp);
      header.appendChild(titleDiv);
      item.appendChild(header);
      if (build.description) {
        const desc = document.createElement('div');
        desc.className = 'build-item-description';
        desc.textContent = build.description;
        item.appendChild(desc);
      }
      const meta = document.createElement('div');
      meta.className = 'build-item-meta';
      const metaParts = [];
      if (build.budget) metaParts.push(`Budget: ${build.budget}`);
      if (build.fastLearner) metaParts.push('Fast Learner');
      if (build.optimizeMode) {
        const modeLabel = getOptimizeModeLabel(build.optimizeMode);
        metaParts.push(`Mode: ${modeLabel}`);
      }
      meta.textContent = metaParts.join(' • ');
      item.appendChild(meta);
      const actions = document.createElement('div');
      actions.className = 'build-item-actions';
      const loadBtn = document.createElement('button');
      loadBtn.className = 'btn btn-secondary';
      loadBtn.textContent = t('optimizer.load');
      loadBtn.addEventListener('click', () => loadBuildFromSaved(build));
      const shareBtn = document.createElement('button');
      shareBtn.className = 'btn btn-secondary';
      shareBtn.textContent = t('optimizer.share');
      shareBtn.addEventListener('click', () => shareBuildFromSaved(build));
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-secondary';
      deleteBtn.textContent = t('optimizer.delete');
      deleteBtn.style.color = 'var(--error-color, #d32f2f)';
      deleteBtn.addEventListener('click', () => {
        if (confirm(t('optimizer.confirmDelete', { name: build.name }))) {
          if (deleteBuild(build.id)) {
            renderBuildsList();
            setAutoStatus(t('optimizer.buildDeleted', { name: build.name }));
          } else {
            alert(t('optimizer.failedDeleteBuild'));
          }
        }
      });
      actions.appendChild(loadBtn);
      actions.appendChild(shareBtn);
      actions.appendChild(deleteBtn);
      item.appendChild(actions);
      buildsListContainer.appendChild(item);
    });
  }

  if (saveModalClose) {
    saveModalClose.addEventListener('click', closeSaveBuildModal);
  }
  if (saveModalCancel) {
    saveModalCancel.addEventListener('click', closeSaveBuildModal);
  }

  if (saveBuildModal) {
    saveBuildModal.addEventListener('click', (e) => {
      if (e.target === saveBuildModal) closeSaveBuildModal();
    });
  }

  if (buildsListModalClose) {
    buildsListModalClose.addEventListener('click', closeBuildsListModal);
  }
  if (buildsListModalCloseBtn) {
    buildsListModalCloseBtn.addEventListener('click', closeBuildsListModal);
  }

  if (buildsListModal) {
    buildsListModal.addEventListener('click', (e) => {
      if (e.target === buildsListModal) closeBuildsListModal();
    });
  }

  if (saveModalSave) {
    saveModalSave.addEventListener('click', () => {
      const name = saveBuildNameInput?.value?.trim();
      if (!name) {
        alert(t('optimizer.enterBuildName'));
        if (saveBuildNameInput && saveBuildNameInput.focus) {
          saveBuildNameInput.focus({ preventScroll: true });
        }
        return;
      }

      const buildData = serializeRows();
      const description = saveBuildDescInput?.value?.trim() || '';
      const build = {
        id: Date.now().toString(),
        name,
        description,
        data: buildData,
        timestamp: Date.now(),
        budget: budgetInput?.value || '0',
        fastLearner: fastLearnerToggle?.checked || false,
        officialEnglishOnly: officialEnglishToggle ? !!officialEnglishToggle.checked : true,
        skillLanguage: getSkillLanguage(),
        optimizeMode: optimizeModeSelect?.value || 'rating',
        rating: ratingEngine.readRatingState(),
        autoTargets:
          autoTargetInputs && autoTargetInputs.length
            ? Array.from(autoTargetInputs)
                .filter((input) => input.checked)
                .map((input) => input.value)
            : [],
        config: {
          turf: cfg.turf?.value || 'A',
          dirt: cfg.dirt?.value || 'G',
          sprint: cfg.sprint?.value || 'D',
          mile: cfg.mile?.value || 'C',
          medium: cfg.medium?.value || 'A',
          long: cfg.long?.value || 'B',
          front: cfg.front?.value || 'A',
          pace: cfg.pace?.value || 'B',
          late: cfg.late?.value || 'C',
          end: cfg.end?.value || 'B',
        },
      };

      try {
        let builds = getSavedBuilds();
        builds.push(build);
        builds.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        const MAX_SAVED_BUILDS = 50;
        if (builds.length > MAX_SAVED_BUILDS) {
          builds = builds.slice(0, MAX_SAVED_BUILDS);
        }
        try {
          localStorage.setItem('umatools-saved-builds', JSON.stringify(builds));
          setAutoStatus(t('optimizer.buildSaved', { name: name }));
          closeSaveBuildModal();
        } catch (storageErr) {
          if (storageErr.name === 'QuotaExceededError' || storageErr.code === 22) {
            if (builds.length > 10) {
              builds = builds.slice(0, 10);
              try {
                localStorage.setItem('umatools-saved-builds', JSON.stringify(builds));
                alert(t('optimizer.buildSavedTrimmed', { name: name }));
                closeSaveBuildModal();
                return;
              } catch {}
            }
            alert(t('optimizer.storageQuota'));
          } else {
            throw storageErr;
          }
        }
      } catch (err) {
        console.error('Failed to save build', err);
        alert(t('optimizer.saveFailed'));
      }
    });
  }

  if (autoBuildBtn) autoBuildBtn.addEventListener('click', autoBuildIdealSkills);
  if (fastLearnerToggle) {
    fastLearnerToggle.addEventListener('change', () => {
      updateHintOptionLabels();
      refreshAllRowCosts();
      saveState();
      autoOptimizeDebounced();
    });
  }
  if (optimizeModeSelect) {
    optimizeModeSelect.addEventListener('change', () => {
      const weightsPanel = document.getElementById('scoring-weights-panel');
      if (weightsPanel) {
        weightsPanel.style.display = optimizeModeSelect.value === TEAM_TRIALS_MODE ? '' : 'none';
      }
      // On-demand hydration: if user switches to Team Trials on a low-memory device
      // where background hydration was skipped, load full data now
      if (optimizeModeSelect.value === TEAM_TRIALS_MODE && hydrationDeferred) {
        doHydrateFullData().catch(() => {});
      }
      saveState();
      autoOptimizeDebounced();
    });
  }

  // Scoring weight sliders — re-score tiers on change
  const scoringWeightIds = ['weight-consistency', 'weight-cost-efficiency'];
  let scoringWeightDebounce = null;
  scoringWeightIds.forEach((id) => {
    const slider = document.getElementById(id);
    if (!slider) return;
    slider.addEventListener('input', () => {
      const display = slider.parentElement?.querySelector('.weight-value');
      if (display) display.textContent = slider.value + '%';
      clearTimeout(scoringWeightDebounce);
      scoringWeightDebounce = setTimeout(() => {
        loadTeamTrialsScoring()
          .then(() => {
            if (optimizeModeSelect?.value === TEAM_TRIALS_MODE) autoOptimizeDebounced();
          })
          .catch(() => {});
      }, 300);
    });
  });
  const resetWeightsBtn = document.getElementById('reset-scoring-weights');
  if (resetWeightsBtn) {
    resetWeightsBtn.addEventListener('click', () => {
      const defaults = window.SkillScorer?.DEFAULT_SCORING_WEIGHTS || {
        consistency: 0.6,
        costEfficiency: 0.4,
      };
      const mapping = {
        'weight-consistency': defaults.consistency,
        'weight-cost-efficiency': defaults.costEfficiency,
      };
      Object.entries(mapping).forEach(([id, val]) => {
        const slider = document.getElementById(id);
        if (slider) {
          slider.value = Math.round(val * 100);
          const display = slider.parentElement?.querySelector('.weight-value');
          if (display) display.textContent = Math.round(val * 100) + '%';
        }
      });
      loadTeamTrialsScoring()
        .then(() => {
          if (optimizeModeSelect?.value === TEAM_TRIALS_MODE) autoOptimizeDebounced();
        })
        .catch(() => {});
    });
  }

  // Wisdom stat listener — update predicted activation score live
  const wisdomStatInput = document.getElementById('stat-wisdom');
  if (wisdomStatInput) {
    wisdomStatInput.addEventListener('input', () => {
      if (
        !lastTTChosen ||
        !teamPredictedScoreEl ||
        !window.TeamTrialsOptimizer?.predictActivationScore
      )
        return;
      const wisdom = Number(wisdomStatInput.value) || 900;
      teamPredictedScoreEl.textContent = String(
        window.TeamTrialsOptimizer.predictActivationScore(lastTTChosen, wisdom)
      );
    });
  }

  // CSV loader
  const csvFileInput = document.getElementById('csv-file');
  const loadCsvBtn = document.getElementById('load-csv');
  if (loadCsvBtn && csvFileInput) {
    loadCsvBtn.addEventListener('click', () => csvFileInput.click());
    csvFileInput.addEventListener('change', () => {
      const file = csvFileInput.files && csvFileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const ok = loadFromCSVContent(reader.result || '');
        if (!ok) alert(t('optimizer.csvNotRecognized'));
        saveState();
      };
      reader.readAsText(file);
    });
  }

  function initRatingFloat() {
    const floatRoot = document.getElementById('rating-float');
    const ratingHero = document.querySelector('.rating-hero');
    if (!floatRoot || !ratingHero) return;

    let heroState = 'visible';

    if (floatRoot.parentElement !== document.body) {
      document.body.appendChild(floatRoot);
    }

    const getHeroState = (rect) => {
      if (!rect) return 'visible';
      if (rect.bottom < 0) return 'above';
      if (rect.top > window.innerHeight) return 'below';
      return 'visible';
    };

    const updateVisibility = () => {
      const shouldShow = heroState === 'above';
      floatRoot.classList.toggle('is-visible', shouldShow);
    };

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.target === ratingHero) {
              if (entry.isIntersecting) {
                heroState = 'visible';
              } else {
                heroState = entry.boundingClientRect.top < 0 ? 'above' : 'below';
              }
              updateVisibility();
            }
          });
        },
        { threshold: 0.1 }
      );
      observer.observe(ratingHero);
    } else {
      const check = () => {
        heroState = getHeroState(ratingHero.getBoundingClientRect());
        updateVisibility();
      };
      check();
      window.addEventListener('scroll', check, { passive: true });
      window.addEventListener('resize', check);
    }

    heroState = getHeroState(ratingHero.getBoundingClientRect());
    updateVisibility();
  }

  let ratingSpriteLoaded = false;
  function scheduleRatingSpriteLoad() {
    if (ratingSpriteLoaded) return;
    const load = () => {
      if (ratingSpriteLoaded) return;
      ratingSpriteLoaded = true;
      ratingEngine.loadRatingSprite();
    };
    const card = document.getElementById('rating-card');
    if ('IntersectionObserver' in window && card) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            load();
          }
        },
        { rootMargin: '200px' }
      );
      observer.observe(card);
      return;
    }

    // Older browsers without IntersectionObserver still get the decorative
    // sprite after the critical page work has settled.
    if ('requestIdleCallback' in window) {
      requestIdleCallback(load, { timeout: 2000 });
    } else {
      setTimeout(load, 1200);
    }
  }

  function initTutorial() {
    if (!window.UmaTutorial || !document.getElementById('tutorial-open')) return;
    const tutorial = window.UmaTutorial.create({
      pageKey: 'optimizer',
      openButton: '#tutorial-open',
      panelTitle: t('optimizer.tutorialTitle'),
      getTokens: () => ({
        goalLabel: optimizeModeSelect?.selectedOptions?.[0]?.textContent?.trim() || 'Rating',
      }),
      steps: [
        {
          title: t('optimizer.tutStep1'),
          shortTitle: t('optimizer.tutStep1'),
          text: t('optimizer.tutStep1Text'),
          target: '#tutorial-open',
        },
        {
          title: t('optimizer.tutStep2'),
          shortTitle: t('optimizer.tutStep2Short'),
          text: t('optimizer.tutStep2Text'),
          target: '#budget',
        },
        {
          title: t('optimizer.tutStep3'),
          shortTitle: t('optimizer.tutStep3Short'),
          text: t('optimizer.tutStep3Text'),
          target: '#fast-learner',
        },
        {
          title: t('optimizer.tutStep4'),
          shortTitle: t('optimizer.tutStep4Short'),
          text: t('optimizer.tutStep4Text'),
          target: '#optimize-mode',
        },
        {
          title: t('optimizer.tutStep5'),
          shortTitle: t('optimizer.tutStep5Short'),
          text: t('optimizer.tutStep5Text'),
          target: '#optimizer-race-config .race-config-pane',
        },
        {
          title: t('optimizer.tutStep6'),
          shortTitle: t('optimizer.tutStep6Short'),
          text: t('optimizer.tutStep6Text'),
          target: '#optimizer-skill-builder',
        },
        {
          title: t('optimizer.tutStep7'),
          shortTitle: t('optimizer.tutStep7Short'),
          text: t('optimizer.tutStep7Text'),
          target: '#rating-card',
        },
        {
          title: t('optimizer.tutStep8'),
          shortTitle: t('optimizer.tutStep8Short'),
          text: t('optimizer.tutStep8Text'),
          target: '#rows',
        },
        {
          title: t('optimizer.tutStep9'),
          shortTitle: t('optimizer.tutStep9Short'),
          text: t('optimizer.tutStep9Text'),
          target: '#skills-to-buy-section',
        },
      ],
    });
    tutorial.init();
  }

  function finishInit() {
    if (rowsEl) rowsEl.querySelectorAll('[aria-hidden]').forEach((el) => el.remove());
    const hadURL = readFromURL();
    if (!hadURL) {
      const had = loadState();
      if (!had) {
        rowsEl.appendChild(makeRow());
      }
    }
    if (libStatus && /loading/i.test(libStatus.textContent || '')) {
      libStatus.textContent = t('optimizer.skillReady');
    }
    ratingEngine.initRatingInputs();
    scheduleRatingSpriteLoad();
    initRatingFloat();
    updateAffinityStyles();
    updateHintOptionLabels();
    refreshAllRowCosts();
    _initComplete = true;
    saveState();
    ensureOneEmptyRow();
    autoOptimizeDebounced();
    initTutorial();
  }

  function isLowMemoryDevice() {
    // navigator.deviceMemory: Chrome/Edge/Opera/Samsung Internet (GB of RAM)
    // Low-memory: <= 2 GB (common on budget tablets/phones)
    if (typeof navigator !== 'undefined' && navigator.deviceMemory != null) {
      return navigator.deviceMemory <= 2;
    }
    // Fallback heuristic: mobile devices with limited hardware concurrency
    // Most budget Android devices: 4 cores + no deviceMemory API = likely low-memory
    if (typeof navigator !== 'undefined' && /Mobi|Android|Tablet/i.test(navigator.userAgent)) {
      const cores = navigator.hardwareConcurrency || 0;
      if (cores > 0 && cores <= 4) return true;
    }
    return false;
  }

  let hydrationDeferred = false;

  async function backgroundHydrateFullData() {
    if (loadedFullSkillData) {
      // Already loaded full data (core file was missing, fell back to full)
      // Just run team trials scoring
      try {
        await loadTeamTrialsScoring();
      } catch (err) {
        console.warn('Team Trials scoring failed', err);
      }
      return;
    }
    // On low-memory devices, skip eager background hydration to prevent OOM crashes.
    // Full data will load on-demand when user switches to Team Trials mode or opens a skill popup.
    if (isLowMemoryDevice()) {
      hydrationDeferred = true;
      console.log('Background hydration skipped: low-memory device detected');
      return;
    }
    await doHydrateFullData();
  }

  async function doHydrateFullData() {
    const candidates = ['/assets/skills_all.json', './assets/skills_all.json'];
    for (const url of candidates) {
      try {
        const res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = await res.json();
        if (!Array.isArray(list) || !list.length) continue;
        cachedRawSkillsList = list;
        loadedFullSkillData = true;
        hydrationDeferred = false;
        window.__skillsAllData = list;
        if (typeof window.buildJPSkillNameMap === 'function') {
          window.buildJPSkillNameMap(list);
        }
        if (window.TeamTrialsOptimizer?.buildEnglishSkillIndex) {
          const teamIndex = window.TeamTrialsOptimizer.buildEnglishSkillIndex(list);
          teamTrialsSkillMetaById.clear();
          teamTrialsSkillMetaByName.clear();
          if (teamIndex?.byId?.forEach) {
            teamIndex.byId.forEach((v, k) => teamTrialsSkillMetaById.set(String(k), v));
          }
          if (teamIndex?.byName?.forEach) {
            teamIndex.byName.forEach((v, k) => teamTrialsSkillMetaByName.set(String(k), v));
          }
        }
        await loadTeamTrialsScoring();
        // If user is already in Team Trials mode, re-run optimization with full scoring data
        if (optimizeModeSelect?.value === TEAM_TRIALS_MODE) {
          autoOptimizeDebounced();
        }
        console.log(`Background hydration complete from ${url}`);
        return;
      } catch (err) {
        console.warn('Background hydration failed for', url, err);
      }
    }
  }

  applyLanguageFromURLParams(getURLParams());

  // Fetch both startup datasets together. CSV parsing still waits for the core
  // JSON because it depends on the official-English name index built there.
  const skillsCSVPreload = preloadSkillsCSV();
  loadSkillCostsJSON()
    .catch((err) => {
      console.warn('Skill cost JSON load failed', err);
    })
    .then(() => loadSkillsCSV(skillsCSVPreload))
    .then(() => finishInit())
    .then(() => backgroundHydrateFullData())
    .catch((err) => {
      console.error('Initialization failed', err);
      finishInit();
    });

  if (officialEnglishToggle) {
    officialEnglishToggle.addEventListener('change', () => {
      try {
        localStorage.setItem(OFFICIAL_EN_PREF_KEY, officialEnglishToggle.checked ? '1' : '0');
      } catch {}
      if (!rebuildSkillLibraryFromCache()) return;
      updateHintOptionLabels();
      refreshAllRowCosts();
      ensureOneEmptyRow();
      clearAutoHighlights();
      autoOptimizeDebounced();
      saveState();
    });
  }
  window.addEventListener('umatools:server-change', async (event) => {
    const nextLang = normalizeSkillLanguage(event?.detail?.server);
    const currentLang = loadedSkillLibraryLanguage || getSkillLanguage();
    const forceReload = !!event?.detail?.forceReload;
    updateOfficialEnglishToggleState();
    if (nextLang === currentLang) return;
    await loadSkillsCSV();
    updateHintOptionLabels();
    refreshAllRowCosts();
    ensureOneEmptyRow();
    clearAutoHighlights();
    autoOptimizeDebounced();
    saveState();
  });
  window.addEventListener('umatools:site-language-change', () => {
    rebuildSkillCaches();
    updateHintOptionLabels();
    refreshAllRowCosts();
    ensureOneEmptyRow();
    clearAutoHighlights();
    updateSkillLibraryStatus();
    autoOptimizeDebounced();
    saveState();
  });

  const persistRowStateImmediate = () => {
    saveStateDebounced();
    clearAutoHighlights();
    autoOptimizeDebounced();
  };
  const persistRowStateDebounced = debounce(persistRowStateImmediate, 220);

  const persistIfRelevant = (e) => {
    const t = e.target;
    if (!t) return;
    const isInputEvent = e.type === 'input';
    const isSkillName = !!(t.classList && t.classList.contains('skill-name'));
    const isCostField = !!(t.classList && t.classList.contains('cost'));
    if (t.closest('.race-config-container')) updateAffinityStyles();
    if (t.closest('.auto-targets')) {
      if (isInputEvent) {
        persistRowStateDebounced();
      } else {
        persistRowStateImmediate();
      }
      return;
    }
    if (t.closest('.optimizer-row') || t.id === 'budget' || t.closest('.race-config-container')) {
      // Skill-name inputs already run row-local sync/optimize handlers.
      if (isSkillName) return;
      if (!isInputEvent && isCostField) ensureOneEmptyRow();
      if (isInputEvent) {
        persistRowStateDebounced();
      } else {
        persistRowStateImmediate();
      }
    }
  };
  document.addEventListener('change', persistIfRelevant);
  document.addEventListener('input', persistIfRelevant, { passive: true });

  function getOCRSkillKey(skillName, resolvedSkill) {
    const name = (skillName || '').trim();
    if (!name) return '';
    const resolved = resolvedSkill || findSkillByName(name);
    return normalize(resolved?.circleBaseName || name);
  }

  // OCR Integration: Apply detected skills to optimizer rows
  function applyOCRSkills(skills) {
    if (!skills || !Array.isArray(skills) || skills.length === 0) {
      return;
    }

    // Build a map of existing skills (all rows including linked lower/circle)
    const allRows = Array.from(rowsEl.querySelectorAll('.optimizer-row'));
    const existingByKey = new Map(); // normalize(name) → row
    allRows.forEach((row) => {
      const name = (row.querySelector('.skill-name')?.value || '').trim();
      if (!name) return;
      const skill = findSkillByName(name);
      const key = getOCRSkillKey(name, skill);
      if (!existingByKey.has(key)) existingByKey.set(key, row);
    });

    const topRows = allRows.filter(isTopLevelRow);
    const lastRow = topRows[topRows.length - 1];
    const lastRowEmpty = lastRow && !isRowFilled(lastRow);
    let usedLastRow = false;

    skills.forEach((skill) => {
      if (!skill || !skill.name) return;

      const resolved = findSkillByName(skill.name);
      const key = getOCRSkillKey(skill.name, resolved);
      const existingRow = existingByKey.get(key);

      if (existingRow) {
        // Skill already exists — preserve non-zero hints when OCR falls back to 0.
        if (typeof skill.hint === 'number' && skill.hint >= 0 && skill.hint <= 5) {
          const hintEl = existingRow.querySelector('.hint-level');
          if (hintEl) {
            const currentHint = parseInt(hintEl.value || '0', 10) || 0;
            const incomingHint = skill.hint;
            const shouldApplyHint = incomingHint > 0 || currentHint <= 0;
            if (shouldApplyHint && incomingHint !== currentHint) {
              hintEl.value = incomingHint;
              hintEl.dispatchEvent(new Event('change'));
            }
          }
        }
        return; // Don't add a duplicate row
      }

      let targetRow = null;
      if (!usedLastRow && lastRowEmpty) {
        targetRow = lastRow;
        usedLastRow = true;
      } else {
        targetRow = makeRow();
        rowsEl.appendChild(targetRow);
      }

      const nameInput = targetRow.querySelector('.skill-name');
      if (nameInput) {
        nameInput.value = skill.name;
      }

      const hintSelect = targetRow.querySelector('.hint-level');
      if (hintSelect && typeof skill.hint === 'number' && skill.hint >= 0 && skill.hint <= 5) {
        hintSelect.value = skill.hint;
      }

      if (typeof targetRow.syncSkillCategory === 'function') {
        targetRow.syncSkillCategory({
          triggerOptimize: false,
          allowLinking: true,
          updateCost: true,
        });
      }

      // Track the newly added row so subsequent OCR scans don't re-add it
      existingByKey.set(key, targetRow);

      // Also track any auto-linked rows (gold→lower, circle→◎) that syncSkillCategory created,
      // so later OCR skills don't re-add them as duplicates
      for (const linkedId of [targetRow.dataset.lowerRowId, targetRow.dataset.circleRowId]) {
        if (!linkedId) continue;
        const linkedRow = rowsEl.querySelector(`.optimizer-row[data-row-id="${linkedId}"]`);
        if (!linkedRow) continue;
        const linkedName = (linkedRow.querySelector('.skill-name')?.value || '').trim();
        if (!linkedName) continue;
        const linkedSkill = findSkillByName(linkedName);
        const linkedKey = getOCRSkillKey(linkedName, linkedSkill);
        if (!existingByKey.has(linkedKey)) existingByKey.set(linkedKey, linkedRow);
      }
    });

    ensureOneEmptyRow();
    saveState();
    autoOptimizeDebounced();
  }

  // Expose as window.applyOCRSkills (matches what ocr.js expects)
  if (typeof window !== 'undefined') {
    window.applyOCRSkills = applyOCRSkills;
  }

  // JSON Import: Load skill tree from exported JSON file
  const jsonImportBtn = document.getElementById('json-import-btn');
  const jsonImportInput = document.getElementById('json-import-input');
  const jsonImportHelpBtn = document.getElementById('json-import-help-btn');
  const jsonImportHelpModal = document.getElementById('json-import-help-modal');
  const jsonImportHelpClose = document.getElementById('json-import-help-close');
  const jsonImportHelpDone = document.getElementById('json-import-help-done');

  if (jsonImportHelpBtn && jsonImportHelpModal) {
    jsonImportHelpBtn.addEventListener('click', () => openModal(jsonImportHelpModal));
    jsonImportHelpClose?.addEventListener('click', () => closeModal(jsonImportHelpModal));
    jsonImportHelpDone?.addEventListener('click', () => closeModal(jsonImportHelpModal));
    jsonImportHelpModal.addEventListener('click', (e) => {
      if (e.target === jsonImportHelpModal) closeModal(jsonImportHelpModal);
    });
  }

  if (jsonImportBtn && jsonImportInput) {
    jsonImportBtn.addEventListener('click', () => jsonImportInput.click());
    jsonImportInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          applyJSONImport(data);
        } catch (err) {
          console.error('JSON import failed:', err);
          alert('Invalid JSON file.');
        }
      };
      reader.readAsText(file);
      // Reset so re-importing the same file triggers change
      jsonImportInput.value = '';
    });
  }

  function applyJSONImport(data) {
    const skills = [];

    // acquired_skills: first entry is the unique (innate) skill — skip it.
    // Remaining entries are skills the player already purchased during training.
    if (Array.isArray(data.acquired_skills)) {
      data.acquired_skills.slice(1).forEach((s) => {
        if (s.name) {
          skills.push({
            name: s.name,
            hint: 0,
            purchased: true,
          });
        }
      });
    }

    // buyable_skills: available to purchase → use hint level
    if (Array.isArray(data.buyable_skills)) {
      data.buyable_skills.forEach((s) => {
        if (s.name) {
          skills.push({
            name: s.name,
            hint: typeof s.hintLevel === 'number' ? Math.min(Math.max(s.hintLevel, 0), 5) : 0,
          });
        }
      });
    }

    if (skills.length === 0) return;

    // Build existing skill map for dedup
    const allRows = Array.from(rowsEl.querySelectorAll('.optimizer-row'));
    const existingByKey = new Map();
    allRows.forEach((row) => {
      const name = (row.querySelector('.skill-name')?.value || '').trim();
      if (!name) return;
      const skill = findSkillByName(name);
      const key = getOCRSkillKey(name, skill);
      if (!existingByKey.has(key)) existingByKey.set(key, row);
    });

    const topRows = allRows.filter(isTopLevelRow);
    const lastRow = topRows[topRows.length - 1];
    const lastRowEmpty = lastRow && !isRowFilled(lastRow);
    let usedLastRow = false;

    skills.forEach((skill) => {
      const resolved = findSkillByName(skill.name);
      const key = getOCRSkillKey(skill.name, resolved);
      const existingRow = existingByKey.get(key);

      if (existingRow) {
        // Already-purchased skill matched an existing row: zero cost and require it
        if (skill.purchased) {
          const costEl = existingRow.querySelector('.cost');
          if (costEl) costEl.value = '0';
          const reqEl = existingRow.querySelector('.required-skill');
          if (reqEl) {
            reqEl.checked = true;
            existingRow.classList.add('required');
          }
        } else if (typeof skill.hint === 'number' && skill.hint > 0) {
          // Update hint if incoming is better
          const hintEl = existingRow.querySelector('.hint-level');
          if (hintEl) {
            const currentHint = parseInt(hintEl.value || '0', 10) || 0;
            if (skill.hint > currentHint) {
              hintEl.value = skill.hint;
              hintEl.dispatchEvent(new Event('change'));
            }
          }
        }
        return;
      }

      let targetRow = null;
      if (!usedLastRow && lastRowEmpty) {
        targetRow = lastRow;
        usedLastRow = true;
      } else {
        targetRow = makeRow();
        rowsEl.appendChild(targetRow);
      }

      const nameInput = targetRow.querySelector('.skill-name');
      if (nameInput) nameInput.value = skill.name;

      const hintSelect = targetRow.querySelector('.hint-level');
      if (hintSelect && typeof skill.hint === 'number') {
        hintSelect.value = skill.hint;
      }

      if (typeof targetRow.syncSkillCategory === 'function') {
        targetRow.syncSkillCategory({
          triggerOptimize: false,
          allowLinking: true,
          updateCost: true,
        });
      }

      // Already-purchased skills: cost 0, required, with linked sub-rows also zeroed
      if (skill.purchased) {
        const costEl = targetRow.querySelector('.cost');
        if (costEl) costEl.value = '0';
        const reqEl = targetRow.querySelector('.required-skill');
        if (reqEl) {
          reqEl.checked = true;
          targetRow.classList.add('required');
        }
        for (const linkedId of [targetRow.dataset.lowerRowId, targetRow.dataset.circleRowId]) {
          if (!linkedId) continue;
          const linkedRow = rowsEl.querySelector(`.optimizer-row[data-row-id="${linkedId}"]`);
          if (!linkedRow) continue;
          const linkedCost = linkedRow.querySelector('.cost');
          if (linkedCost) linkedCost.value = '0';
        }
      }

      existingByKey.set(key, targetRow);

      // Track auto-linked rows to prevent duplicates
      for (const linkedId of [targetRow.dataset.lowerRowId, targetRow.dataset.circleRowId]) {
        if (!linkedId) continue;
        const linkedRow = rowsEl.querySelector(`.optimizer-row[data-row-id="${linkedId}"]`);
        if (!linkedRow) continue;
        const linkedName = (linkedRow.querySelector('.skill-name')?.value || '').trim();
        if (!linkedName) continue;
        const linkedSkill = findSkillByName(linkedName);
        const linkedKey = getOCRSkillKey(linkedName, linkedSkill);
        if (!existingByKey.has(linkedKey)) existingByKey.set(linkedKey, linkedRow);
      }
    });

    ensureOneEmptyRow();
    saveState();
    autoOptimizeDebounced();
  }

  // OCR Results Panel: Close button handler
  const ocrResultsCloseBtn = document.getElementById('ocr-results-close');
  if (ocrResultsCloseBtn) {
    ocrResultsCloseBtn.addEventListener('click', () => {
      const panel = document.getElementById('ocr-results-panel');
      if (panel) panel.style.display = 'none';
    });
  }
})();
