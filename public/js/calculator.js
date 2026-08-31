// Rating Calculator Page Script
// Simplified version of optimizer - just skill selection and rating calculation
// No optimization, budget, hints, or cost management

(function () {
  function attrEsc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  const rowsEl = document.getElementById('rows');
  const clearAllBtn = document.getElementById('clear-all');
  const officialEnglishToggle = document.getElementById('official-en-only');
  const libStatus = document.getElementById('lib-status');
  if (libStatus)
    libStatus.innerHTML =
      '<span class="loading-indicator">' + t('calculator.loadingSkills') + '</span>';

  const skillCountEl = document.getElementById('skill-count');
  const totalSkillScoreEl = document.getElementById('total-skill-score');
  const selectedListEl = document.getElementById('selected-list');

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

  // Race config selects
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

  const { normalize, updateAffinityStyles, evaluateSkillScore } =
    RatingShared.createAffinityHelpers(cfg);
  const ratingEngine = RatingShared.createRatingEngine({
    ratingInputs,
    ratingDisplays,
    onChange: () => saveState(),
  });

  let skillsByCategory = {};
  let categories = [];
  const preferredOrder = ['golden', 'yellow', 'blue', 'green', 'red', 'purple', 'evo', 'ius'];
  let skillIndex = new Map();
  let skillLookupLoose = new Map();
  let allSkillNames = [];
  const MAX_SKILL_SUGGESTIONS = 300;
  const MAX_SKILL_SUGGESTIONS_WITH_PREFIX = 2000;

  // Track active skill keys for duplicate detection
  const activeSkillKeys = new Map();

  // Shared datalist for all skill inputs
  let sharedSkillDatalist = null;
  let officialEnglishNameSet = new Set();
  let localizedNameSet = new Set();
  const externalAliasLookup = new Map();
  let skillsCsvCache = '';
  let loadedSkillLibraryLanguage = '';
  let lastCSVLoadStats = {
    loaded: 0,
    filteredOut: 0,
    officialFilterApplied: false,
  };
  const OFFICIAL_EN_PREF_KEY = 'calculatorOfficialEnglishOnly';
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

  // Debounce helper
  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
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
    if (getSiteLanguage() === 'jp') {
      const jp =
        typeof window.getLocalizedSkillName === 'function'
          ? window.getLocalizedSkillName(skill.name)
          : skill.name;
      return (jp || skill.name || fallback || '').trim();
    }
    const alias = getPrimaryAliasName(skill, { preferEnglish: true });
    if (alias) return alias;
    const localized = (skill.localizedName || '').trim();
    if (localized && !hasJapaneseScript(localized)) return localized;
    if (localized) return localized;
    return (skill.name || fallback || '').trim();
  }

  function getEffectiveRatingScore(skill, categoryOverride = '') {
    const rawScore = evaluateSkillScore(skill || {});
    if (!Number.isFinite(rawScore)) return 0;
    const canon = canonicalCategory(categoryOverride || skill?.category || '');
    // Purple debuffs have negative scores — they reduce rating
    if (canon === 'purple') return Math.min(rawScore, 0);
    return rawScore;
  }

  // Collect selected skills and calculate total score
  function collectSkills() {
    const skills = [];
    const rows = rowsEl.querySelectorAll('.calculator-row');
    rows.forEach((row) => {
      const nameInput = row.querySelector('.skill-name');
      if (!nameInput) return;
      const name = (nameInput.value || '').trim();
      if (!name) return;
      const skill = findSkillByName(name);
      if (!skill) return;
      const score = getEffectiveRatingScore(skill, skill.category || '');
      skills.push({
        name: skill.name,
        displayName: formatSkillDisplayName(skill),
        score,
        category: skill.category || '',
        checkType: skill.checkType || '',
      });
    });
    return skills;
  }

  function updateSelectedSkillsDisplay() {
    const skills = collectSkills();
    const totalScore = skills.reduce((sum, s) => sum + s.score, 0);

    if (skillCountEl) skillCountEl.textContent = skills.length.toString();
    if (totalSkillScoreEl) totalSkillScoreEl.textContent = totalScore.toString();

    if (selectedListEl) {
      if (!skills.length) {
        selectedListEl.innerHTML = '<span class="muted">' + t('calculator.noSkills') + '</span>';
      } else {
        selectedListEl.innerHTML = skills
          .map((s) => {
            const catClass = getCategoryClass(s.category);
            const scoreLabel = s.score < 0 ? `(${s.score})` : `(+${s.score})`;
            return `<span class="skill-chip ${catClass}" data-skill-name="${attrEsc(s.name)}" tabindex="0" role="button">${s.displayName || s.name} <small>${scoreLabel}</small></span>`;
          })
          .join(' ');
      }
    }

    ratingEngine.updateRatingDisplay(totalScore);
    saveState();
  }

  const updateSelectedSkillsDebounced = debounce(updateSelectedSkillsDisplay, 100);

  function getCategoryClass(category) {
    const c = canonicalCategory(category);
    if (c === 'gold') return 'cat-gold';
    if (c === 'yellow') return 'cat-yellow';
    if (c === 'blue') return 'cat-blue';
    if (c === 'green') return 'cat-green';
    if (c === 'red') return 'cat-red';
    if (c === 'purple') return 'cat-purple';
    if (c === 'evo') return 'cat-evo';
    if (c === 'ius') return 'cat-ius';
    return '';
  }

  function rebuildSkillCaches() {
    const nextIndex = new Map();
    const nextLooseLookup = new Map();
    const names = [];
    const seenSuggestions = new Set();
    const isJPServer = getSkillLanguage() === 'jp';
    const siteLanguage = getSiteLanguage();

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

    Object.entries(skillsByCategory).forEach(([category, list = []]) => {
      list.forEach((skill) => {
        if (!skill || !skill.name) return;
        const key = normalize(skill.name);
        const enriched = { ...skill, category };
        if (!nextIndex.has(key)) {
          nextIndex.set(key, enriched);
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
        // Datalist suggestions: show only the display-language name
        if (siteLanguage === 'jp') {
          // JP site language: show only JP name in datalist
          let jpDisplay;
          if (isJPServer && skill.jpName) {
            jpDisplay = skill.jpName;
          } else if (typeof window.getLocalizedSkillName === 'function') {
            const jp = window.getLocalizedSkillName(skill.name);
            if (jp !== skill.name) jpDisplay = jp;
          }
          addSuggestionName(jpDisplay || skill.name);
        } else if (isJPServer) {
          // JP server + EN lang: show English name only
          addSuggestionName(getPreferredSkillInputName(enriched, skill.name));
        } else {
          // EN server + EN lang: show primary EN name only
          // (aliases still work when typed, just not shown as suggestions)
          addSuggestionName(skill.name);
        }
        // Always index JP names for search lookup (not in datalist)
        if (typeof window.getLocalizedSkillName === 'function') {
          const jp = window.getLocalizedSkillName(skill.name);
          if (jp !== skill.name) {
            const jpKey = normalize(jp);
            if (jpKey && !nextIndex.has(jpKey)) nextIndex.set(jpKey, enriched);
            addLooseLookup(jp, enriched);
          }
        }
      });
    });
    // Post-process: disambiguate datalist suggestions for colliding EN names
    enNameCollisions.forEach((group) => {
      if (group.length < 2) return;
      const cleanLabel = group[0].name;
      const cleanIdx = names.indexOf(cleanLabel);
      if (cleanIdx !== -1) {
        names.splice(cleanIdx, 1);
        seenSuggestions.delete(normalize(cleanLabel));
      }
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
    names.sort((a, b) => a.localeCompare(b));
    allSkillNames = names;
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
    const displayName =
      getSkillLanguage() !== 'jp' ? skill.name : getPreferredSkillInputName(skill, skill.name);
    if (typeof window.getLocalizedSkillName === 'function')
      return window.getLocalizedSkillName(displayName);
    return displayName;
  }

  function formatCategoryLabel(cat) {
    if (!cat) return 'Auto';
    const canon = canonicalCategory(cat);
    if (canon === 'gold') return 'Gold';
    if (canon === 'purple') return 'Purple';
    if (canon === 'evo') return 'Evo';
    if (canon === 'ius') return 'Unique';
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  }

  function applyFallbackSkills(reason) {
    skillsByCategory = {
      golden: [
        {
          name: 'Concentration',
          score: { base: 508, good: 508, average: 415, bad: 369, terrible: 323 },
          checkType: 'End',
        },
        {
          name: 'Professor of Curvature',
          score: { base: 508, good: 508, average: 415, bad: 369, terrible: 323 },
          checkType: 'Medium',
        },
      ],
      yellow: [
        {
          name: 'Groundwork',
          score: { base: 217, good: 217, average: 177, bad: 158, terrible: 138 },
          checkType: 'Front',
        },
        {
          name: 'Corner Recovery',
          score: { base: 217, good: 217, average: 177, bad: 158, terrible: 138 },
          checkType: 'Late',
        },
      ],
      blue: [
        {
          name: 'Stealth Mode',
          score: { base: 195, good: 195, average: 159, bad: 142, terrible: 124 },
          checkType: 'Late',
        },
      ],
    };
    categories = Object.keys(skillsByCategory);
    rebuildSkillCaches();
    libStatus.textContent = `Using fallback skills (${reason})`;
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
    const officialFilterRequested = isOfficialEnglishOnlyEnabled();
    const officialFilterActive = officialFilterRequested && officialEnglishNameSet.size > 0;
    let filteredOut = 0;
    let loaded = 0;
    const catMap = {};
    // First pass: collect names that have official localized translations,
    // and build a set of JP-localized English names to exclude from EN datalist
    const officiallyLocalizedNames = new Set();
    localizedNameSet = new Set();
    if (getSkillLanguage() !== 'jp') {
      for (let r = 1; r < rows.length; r++) {
        const cols = rows[r];
        if (!cols || !cols.length) continue;
        const n = (cols[idx.name] || '').trim();
        const loc = idx.localized !== -1 ? (cols[idx.localized] || '').trim() : '';
        if (n && loc) {
          officiallyLocalizedNames.add(normalize(n));
          localizedNameSet.add(normalize(loc));
        }
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
      // On EN server: skip fan-only skills whose name collides with an officially translated skill
      if (!isJPCSV && !localizedName && officiallyLocalizedNames.has(normalize(name))) {
        filteredOut++;
        continue;
      }
      if (officialFilterActive && !officialEnglishNameSet.has(normalizeOfficialSkillName(name))) {
        filteredOut++;
        continue;
      }
      const type = idx.type !== -1 ? (cols[idx.type] || '').trim().toLowerCase() : 'misc';
      const rawBase = idx.base !== -1 ? parseInt(cols[idx.base] || '', 10) : NaN;
      const base = RatingShared.normalizeSkillRatingValue(rawBase, type, name);
      const sa = idx.sa !== -1 ? parseInt(cols[idx.sa] || '', 10) : NaN;
      const bc = idx.bc !== -1 ? parseInt(cols[idx.bc] || '', 10) : NaN;
      const def = idx.def !== -1 ? parseInt(cols[idx.def] || '', 10) : NaN;
      const g = idx.g !== -1 ? parseInt(cols[idx.g] || '', 10) : NaN;
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
      const baseBucket = !isNaN(base) ? base : NaN;
      const goodVal = !isNaN(sa) ? sa : !isNaN(apt1) ? apt1 : baseBucket;
      const avgVal = !isNaN(bc) ? bc : !isNaN(apt2) ? apt2 : goodVal;
      const badVal = !isNaN(def) ? def : !isNaN(apt3) ? apt3 : avgVal;
      const terrVal = !isNaN(g) ? g : !isNaN(apt4) ? apt4 : badVal;
      if (!isNaN(baseBucket)) score.base = baseBucket;
      if (!isNaN(goodVal)) score.good = goodVal;
      if (!isNaN(avgVal)) score.average = avgVal;
      if (!isNaN(badVal)) score.bad = badVal;
      if (!isNaN(terrVal)) score.terrible = terrVal;
      if (!catMap[type]) catMap[type] = [];
      const resolvedJpName = isJPCSV
        ? jpOriginalName
        : (aliasNames.find((a) => hasJapaneseScript(a)) || '');
      catMap[type].push({
        name,
        jpName: resolvedJpName,
        aliasNames,
        localizedName,
        score,
        checkType: checkTypeRaw,
        isEvo,
        evoParentNames,
      });
      loaded++;
    }
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

  async function loadOfficialEnglishSkillSet() {
    const candidates = ['/assets/skills_all.json', './assets/skills_all.json'];
    let lastErr = null;
    for (const url of candidates) {
      try {
        const res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = await res.json();
        if (!Array.isArray(list) || !list.length) continue;
        const nextOfficialNames = new Set();
        const allNameEn = new Set(); // all valid EN name_en values
        const pendingLocalizedNames = []; // JP ennames to filter, finalized after loop
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
        const registerAliasNames = (names) => {
          if (!Array.isArray(names) || !names.length) return;
          names.forEach((name) => {
            const key = normalize(name);
            if (!key) return;
            if (!externalAliasLookup.has(key)) externalAliasLookup.set(key, new Set());
            const bucket = externalAliasLookup.get(key);
            names.forEach((candidate) => {
              const candidateKey = normalize(candidate);
              if (!candidateKey || candidateKey === key) return;
              bucket.add(candidate);
            });
          });
        };
        list.forEach((entry) => {
          const name = (entry?.name_en || '').trim();
          const geneName = (entry?.gene_version?.name_en || '').trim();
          if (name) { nextOfficialNames.add(normalizeOfficialSkillName(name)); allNameEn.add(normalize(name)); }
          if (geneName) { nextOfficialNames.add(normalizeOfficialSkillName(geneName)); allNameEn.add(normalize(geneName)); }
          // Collect JP-server English names (enname) that differ from EN name_en,
          // but only if the enname isn't also a valid name_en of any skill
          const jpEnName = (entry?.enname || '').trim();
          const jpEnGeneName = (entry?.gene_version?.enname || '').trim();
          if (jpEnName && name && normalize(jpEnName) !== normalize(name)) {
            pendingLocalizedNames.push(normalize(jpEnName));
          }
          if (jpEnGeneName && geneName && normalize(jpEnGeneName) !== normalize(geneName)) {
            pendingLocalizedNames.push(normalize(jpEnGeneName));
          }
          registerAliasNames(collectNames(entry));
          registerAliasNames(collectNames(entry?.gene_version));
        });
        // Finalize localizedNameSet: only exclude JP ennames that aren't a valid EN name_en
        pendingLocalizedNames.forEach(function (key) {
          if (!allNameEn.has(key)) localizedNameSet.add(key);
        });
        officialEnglishNameSet = nextOfficialNames;
        if (typeof window.buildJPSkillNameMap === 'function') window.buildJPSkillNameMap(list);
        return true;
      } catch (err) {
        lastErr = err;
      }
    }
    if (lastErr) {
      console.warn('Failed to load official English skill names', lastErr);
    }
    officialEnglishNameSet = new Set();
    return false;
  }

  function updateSkillLibraryStatus() {
    if (!libStatus) return;
    const totalSkills = Object.values(skillsByCategory).reduce((acc, arr) => acc + arr.length, 0);
    const parts = [`Loaded ${totalSkills} skills`];
    if (lastCSVLoadStats.officialFilterApplied) {
      parts.push(`Official EN only (${lastCSVLoadStats.filteredOut} filtered)`);
    } else if (isOfficialEnglishOnlyEnabled() && officialEnglishNameSet.size === 0) {
      parts.push('Official EN filter unavailable');
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

  async function loadSkillsCSV() {
    const lang = getSkillLanguage();
    const candidates =
      lang === 'jp'
        ? ['/assets/uma_skills_jp.csv', './assets/uma_skills_jp.csv', '/assets/uma_skills.csv']
        : ['/assets/uma_skills.csv', './assets/uma_skills.csv'];
    let lastErr = null;
    for (const url of candidates) {
      try {
        const res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
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
    libStatus.textContent = t('calculator.csvFallback');
    applyFallbackSkills('CSV not found / blocked');
    return false;
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
    sharedSkillDatalist.innerHTML = '';
    const normalizedPrefix = normalize(prefix);
    const suggestionLimit = normalizedPrefix
      ? MAX_SKILL_SUGGESTIONS_WITH_PREFIX
      : MAX_SKILL_SUGGESTIONS;
    const frag = document.createDocumentFragment();
    let added = 0;
    // Phase 1: prefix matches first
    var prefixSet = new Set();
    allSkillNames.forEach((name, i) => {
      if (added >= suggestionLimit) return;
      if (normalizedPrefix && !normalize(name).startsWith(normalizedPrefix)) return;
      const opt = document.createElement('option');
      opt.value = name;
      const skill = findSkillByName(name);
      const isCanonical = !!skill && normalize(name) === normalize(skill.name);
      const display = isCanonical ? formatSkillDisplayName(skill) : name;
      if (display && display !== name) {
        opt.label = display;
        opt.textContent = display;
      }
      frag.appendChild(opt);
      prefixSet.add(i);
      added++;
    });
    // Phase 2: substring matches (skip already-added prefix matches)
    if (normalizedPrefix && added < suggestionLimit) {
      allSkillNames.forEach((name, i) => {
        if (added >= suggestionLimit) return;
        if (prefixSet.has(i)) return;
        if (!normalize(name).includes(normalizedPrefix)) return;
        const opt = document.createElement('option');
        opt.value = name;
        const skill = findSkillByName(name);
        const isCanonical = !!skill && normalize(name) === normalize(skill.name);
        const display = isCanonical ? formatSkillDisplayName(skill) : name;
        if (display && display !== name) {
          opt.label = display;
          opt.textContent = display;
        }
        frag.appendChild(opt);
        added++;
      });
    }
    sharedSkillDatalist.appendChild(frag);
  }

  function refreshAllRows() {
    const dataRows = rowsEl.querySelectorAll('.calculator-row');
    dataRows.forEach((row) => {
      if (typeof row.syncSkillCategory === 'function') {
        row.syncSkillCategory({ triggerUpdate: false });
      }
    });
  }

  function isRowFilled(row) {
    const name = (row.querySelector('.skill-name')?.value || '').trim();
    return !!findSkillByName(name);
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
    const rows = Array.from(rowsEl.querySelectorAll('.calculator-row'));
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
      // Remove extra trailing empty rows, keep exactly one empty
      for (let i = rows.length - 2; i >= 0; i--) {
        if (!isRowFilled(rows[i])) {
          rows[i].remove();
        } else break;
      }
    }
  }

  function clearAllRows() {
    Array.from(rowsEl.querySelectorAll('.calculator-row')).forEach((n) => {
      if (typeof n.cleanupSkillTracking === 'function') {
        n.cleanupSkillTracking();
      }
      n.remove();
    });
    rowsEl.appendChild(makeRow());
    ensureOneEmptyRow();
    updateSelectedSkillsDisplay();
    saveState();
  }

  function makeRow() {
    getOrCreateSharedDatalist();
    const row = document.createElement('div');
    row.className = 'calculator-row';
    const id = Math.random().toString(36).slice(2);
    row.dataset.rowId = id;
    row.innerHTML = `
      <div class="type-cell">
        <label>Type</label>
        <div class="category-chip" data-empty="true">Auto</div>
      </div>
      <div class="skill-cell">
        <label>Skill</label>
        <input type="text" class="skill-name field-control" list="skills-datalist-shared" placeholder="${t('calculator.startTyping')}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
        <div class="skill-name-meta" data-empty="true"></div>
        <div class="dup-warning" role="status" aria-live="polite"></div>
      </div>
      <div class="score-cell">
        <label>Score</label>
        <div class="skill-score-display" data-empty="true">-</div>
      </div>
      <div class="actions-cell">
        <div class="remove-cell">
          <label class="remove-label">&nbsp;</label>
          <button type="button" class="btn remove">Remove</button>
        </div>
      </div>
    `;

    const removeBtn = row.querySelector('.remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        if (typeof row.cleanupSkillTracking === 'function') {
          row.cleanupSkillTracking();
        }
        row.remove();
        saveState();
        ensureOneEmptyRow();
        updateSelectedSkillsDebounced();
      });
    }

    const skillInput = row.querySelector('.skill-name');
    const categoryChip = row.querySelector('.category-chip');
    const scoreDisplay = row.querySelector('.skill-score-display');
    const skillNameMeta = row.querySelector('.skill-name-meta');
    const dupWarning = row.querySelector('.dup-warning');
    let dupWarningTimer = null;

    function getSkillIdentity(name) {
      const skill = findSkillByName(name);
      const id = skill?.skillId ?? skill?.id ?? '';
      const canonicalName = skill ? getPreferredSkillInputName(skill, name) : name;
      return { id: id ? String(id) : '', name: canonicalName, skill };
    }

    function getSkillKey(identity) {
      if (!identity || !identity.name) return '';
      return identity.id || normalize(identity.name);
    }

    function isDuplicateSkill(identity) {
      const primaryKey = getSkillKey(identity);
      if (!primaryKey) return false;
      const existingRowId = activeSkillKeys.get(primaryKey);
      return existingRowId !== undefined && existingRowId !== id;
    }

    function updateSkillKeyTracking(newIdentity) {
      for (const [key, rowId] of activeSkillKeys) {
        if (rowId === id) {
          activeSkillKeys.delete(key);
          break;
        }
      }
      const newKey = getSkillKey(newIdentity);
      if (newKey) {
        activeSkillKeys.set(newKey, id);
      }
    }

    function removeSkillKeyTracking() {
      for (const [key, rowId] of activeSkillKeys) {
        if (rowId === id) {
          activeSkillKeys.delete(key);
          break;
        }
      }
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

    function setCategoryDisplay(category) {
      row.dataset.skillCategory = category || '';
      if (categoryChip) {
        if (category) {
          categoryChip.textContent = formatCategoryLabel(category);
          categoryChip.dataset.empty = 'false';
        } else {
          categoryChip.textContent = 'Auto';
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

    function updateScoreDisplay(skill) {
      if (!scoreDisplay) return;
      if (skill) {
        const score = getEffectiveRatingScore(skill, skill.category || '');
        scoreDisplay.textContent = score < 0 ? `${score}` : `+${score}`;
        scoreDisplay.dataset.empty = 'false';
        scoreDisplay.dataset.negative = score < 0 ? 'true' : 'false';
      } else {
        scoreDisplay.textContent = '-';
        scoreDisplay.dataset.empty = 'true';
        scoreDisplay.dataset.negative = 'false';
      }
    }

    function syncSkillCategory({ triggerUpdate = false } = {}) {
      if (!skillInput) return;
      const rawName = (skillInput.value || '').trim();
      if (!rawName) {
        delete row.dataset.lastSkillName;
        if (!row.dataset.dupWarningHold) clearDupWarning();
        updateSkillKeyTracking(null);
      }
      const identity = getSkillIdentity(rawName);
      const skill = identity.skill;
      if (rawName) {
        const canonical = identity.name || rawName;
        if (isDuplicateSkill(identity)) {
          showDupWarning('This skill has already been added.');
          const fallback = row.dataset.lastSkillName || '';
          if (fallback) {
            skillInput.value = fallback;
            const prev = findSkillByName(fallback);
            const prevCategory = prev ? prev.category : '';
            updateSkillNameMeta(prev || null);
            setCategoryDisplay(prevCategory);
            updateScoreDisplay(prev);
          } else {
            skillInput.value = '';
            updateSkillNameMeta(null);
            setCategoryDisplay('');
            updateScoreDisplay(null);
          }
          return;
        }
        row.dataset.lastSkillName = canonical;
        updateSkillKeyTracking(identity);
      }
      clearDupWarning();
      const category = skill ? skill.category : '';
      updateSkillNameMeta(skill || null);
      setCategoryDisplay(category);
      updateScoreDisplay(skill);
      if (triggerUpdate) {
        saveState();
        ensureOneEmptyRow();
        updateSelectedSkillsDebounced();
      }
    }

    row.syncSkillCategory = syncSkillCategory;
    row.cleanupSkillTracking = removeSkillKeyTracking;
    setCategoryDisplay(row.dataset.skillCategory || '');

    if (skillInput) {
      const syncFromInput = () => {
        rebuildSharedDatalist(skillInput.value || '');
        syncSkillCategory({ triggerUpdate: true });
      };
      skillInput.addEventListener('input', syncFromInput);
      skillInput.addEventListener('change', syncFromInput);
      skillInput.addEventListener('blur', syncFromInput);
      skillInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') syncFromInput();
      });
      let monitorId = null;
      const startMonitor = () => {
        rebuildSharedDatalist(skillInput.value || '');
        if (monitorId) return;
        let lastValue = skillInput.value;
        monitorId = window.setInterval(() => {
          if (!document.body.contains(skillInput)) return;
          if (skillInput.value !== lastValue) {
            lastValue = skillInput.value;
            syncFromInput();
          }
        }, 120);
      };
      const stopMonitor = () => {
        if (!monitorId) return;
        window.clearInterval(monitorId);
        monitorId = null;
      };
      skillInput.addEventListener('focus', startMonitor);
      skillInput.addEventListener('blur', stopMonitor);
    }

    return row;
  }

  // State persistence
  const STORAGE_KEY = 'umatools-calculator';
  let _initComplete = false;
  let _restoringState = false;

  function saveState() {
    if (_restoringState || !_initComplete) return;
    try {
      const skills = [];
      rowsEl.querySelectorAll('.calculator-row').forEach((row) => {
        const name = row.querySelector('.skill-name')?.value?.trim();
        if (name) skills.push(name);
      });
      const raceConfig = {};
      Object.entries(cfg).forEach(([key, sel]) => {
        if (sel) raceConfig[key] = sel.value;
      });
      const state = {
        skills,
        raceConfig,
        rating: ratingEngine.readRatingState(),
        officialEnglishOnly: officialEnglishToggle ? !!officialEnglishToggle.checked : true,
        skillLanguage: getSkillLanguage(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save calculator state', e);
    }
  }

  function loadState() {
    _restoringState = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (
        officialEnglishToggle &&
        Object.prototype.hasOwnProperty.call(state, 'officialEnglishOnly')
      ) {
        officialEnglishToggle.checked = !!state.officialEnglishOnly;
      }
      if (Object.prototype.hasOwnProperty.call(state, 'skillLanguage') && state.skillLanguage) {
        const lang =
          (state.skillLanguage || '').toString().trim().toLowerCase() === 'jp' ? 'jp' : 'en';
        try {
          localStorage.setItem(SERVER_PREF_KEY, lang);
        } catch {}
      }
      updateOfficialEnglishToggleState();
      rebuildSkillLibraryFromCache();
      if (state.raceConfig) {
        Object.entries(state.raceConfig).forEach(([key, val]) => {
          if (cfg[key]) cfg[key].value = val;
        });
        updateAffinityStyles();
      }
      if (state.rating) {
        ratingEngine.applyRatingState(state.rating);
      }
      if (Array.isArray(state.skills) && state.skills.length) {
        Array.from(rowsEl.querySelectorAll('.calculator-row')).forEach((n) => n.remove());
        state.skills.forEach((skillName) => {
          const row = makeRow();
          rowsEl.appendChild(row);
          const nameInput = row.querySelector('.skill-name');
          if (nameInput) nameInput.value = skillName;
          if (typeof row.syncSkillCategory === 'function') {
            row.syncSkillCategory({ triggerUpdate: false });
          }
        });
        ensureOneEmptyRow();
        updateSelectedSkillsDisplay();
      }
    } catch (e) {
      console.warn('Failed to load calculator state', e);
    } finally {
      _restoringState = false;
    }
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
    }
    if ('requestIdleCallback' in window) {
      requestIdleCallback(load, { timeout: 2000 });
    } else {
      setTimeout(load, 1200);
    }
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

  function initTutorial() {
    if (!window.UmaTutorial || !document.getElementById('tutorial-open')) return;
    const tutorial = window.UmaTutorial.create({
      pageKey: 'calculator',
      openButton: '#tutorial-open',
      panelTitle: t('calculator.tutorialTitle'),
      steps: [
        {
          title: t('calculator.tutStep1'),
          shortTitle: t('calculator.tutStep1'),
          text: t('calculator.tutStep1Text'),
          target: '#tutorial-open',
        },
        {
          title: t('calculator.tutStep2'),
          shortTitle: t('calculator.tutStep2Short'),
          text: t('calculator.tutStep2Text'),
          target: '.race-config-pane',
        },
        {
          title: t('calculator.tutStep3'),
          shortTitle: t('calculator.tutStep3Short'),
          text: t('calculator.tutStep3Text'),
          target: '#rating-card',
        },
        {
          title: t('calculator.tutStep4'),
          shortTitle: t('calculator.tutStep4Short'),
          text: t('calculator.tutStep4Text'),
          target: '#rows',
        },
        {
          title: t('calculator.tutStep5'),
          shortTitle: t('calculator.tutStep5Short'),
          text: t('calculator.tutStep5Text'),
          target: '#selected-skills-section',
        },
      ],
    });
    tutorial.init();
  }

  // Initialize
  async function init() {
    // Load skills library
    await loadOfficialEnglishSkillSet();
    await loadSkillsCSV();
    if (libStatus && /loading/i.test(libStatus.textContent || '')) {
      libStatus.textContent = t('calculator.skillReady');
    }

    // Initialize UI
    updateAffinityStyles();
    Object.values(cfg).forEach((sel) => {
      if (sel) {
        sel.addEventListener('change', () => {
          updateAffinityStyles();
          updateSelectedSkillsDebounced();
          saveState();
        });
      }
    });

    // Clear skeleton loaders
    if (rowsEl) rowsEl.querySelectorAll('[aria-hidden]').forEach((el) => el.remove());

    // Load saved state
    loadState();

    // Ensure at least one row
    if (!rowsEl.querySelector('.calculator-row')) {
      rowsEl.appendChild(makeRow());
    }
    ensureOneEmptyRow();

    // Init rating inputs
    ratingEngine.initRatingInputs();
    scheduleRatingSpriteLoad();
    initRatingFloat();

    // Clear all button
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', clearAllRows);
    }
    if (officialEnglishToggle) {
      officialEnglishToggle.addEventListener('change', () => {
        try {
          localStorage.setItem(OFFICIAL_EN_PREF_KEY, officialEnglishToggle.checked ? '1' : '0');
        } catch {}
        if (!rebuildSkillLibraryFromCache()) return;
        ensureOneEmptyRow();
        updateSelectedSkillsDisplay();
      });
    }
    window.addEventListener('umatools:server-change', async (event) => {
      const nextLang =
        (event?.detail?.server || '').toString().trim().toLowerCase() === 'jp' ? 'jp' : 'en';
      const currentLang = loadedSkillLibraryLanguage || getSkillLanguage();
      updateOfficialEnglishToggleState();
      if (nextLang === currentLang) return;
      await loadSkillsCSV();
      ensureOneEmptyRow();
      updateSelectedSkillsDisplay();
    });
    window.addEventListener('umatools:site-language-change', () => {
      rebuildSkillCaches();
      ensureOneEmptyRow();
      updateSelectedSkillsDisplay();
    });

    // Initial display update
    _initComplete = true;
    updateSelectedSkillsDisplay();
    initTutorial();
  }

  window.addEventListener('i18n:changed', function () {
    if (typeof window.applyI18n === 'function') window.applyI18n();
    rebuildSkillCaches();
    updateSelectedSkillsDisplay();
  });

  init();
})();
