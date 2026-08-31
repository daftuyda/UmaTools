(function () {
  'use strict';

  var SERVER_PREF_KEY = 'umatoolsServer';
  var PREFERRED_ORDER = [
    'golden',
    'gold',
    'yellow',
    'blue',
    'green',
    'red',
    'purple',
    'evo',
    'ius',
  ];
  var CATEGORY_LABELS = {
    golden: 'Gold',
    gold: 'Gold',
    yellow: 'Yellow',
    blue: 'Blue',
    green: 'Green',
    red: 'Red',
    purple: 'Purple',
    evo: 'Evo',
    ius: 'Unique',
    orange: 'Unique',
  };
  var CATEGORY_CSS = {
    golden: 'cat-golden',
    gold: 'cat-gold',
    yellow: 'cat-yellow',
    blue: 'cat-blue',
    green: 'cat-green',
    red: 'cat-red',
    purple: 'cat-purple',
    evo: 'cat-evo',
    ius: 'cat-ius',
    orange: 'cat-orange',
  };

  // ── State ──
  var allSkills = [];
  var filteredSkills = [];
  var categories = [];
  var activeCategory = 'all';
  var searchQuery = '';
  var sortCol = 'efficiency';
  var sortDir = 'desc';
  var costMap = new Map(); // normalized name -> cost
  var officialEnglishNameSet = new Set();
  var officialSkillIds = new Set(); // IDs of skills with name_en (officially translated)
  var jpNameToId = new Map(); // normalized jpname -> skill ID string
  var skillCostById = new Map(); // skill ID string -> cost
  var skillLowerIdById = new Map(); // skill ID string -> lower skill ID string (versions[0])
  var skillMetaByName = new Map(); // normalized name -> { cost, id, lowerId }
  var fullSkillData = []; // Full GameTora skills_all.json payload
  var csvSkillMetaByName = new Map(); // CSV-derived score/category overlay, keyed by name variant

  // ── Lazy Loading State ──
  var rawCSVText = null; // Store raw CSV for lazy parsing
  var loadedCategories = new Set(); // Track which categories have been parsed
  var skillsByCategory = new Map(); // category -> skills array

  // ── DOM refs ──
  var searchInput = null;
  var filtersEl = null;
  var countEl = null;
  var tableWrap = null;
  var loadingEl = null;

  // ── Virtual Scroll ──
  var virtualScroll = null;
  var DESKTOP_ROW_HEIGHT = 48;
  var MOBILE_ROW_HEIGHT = 104;

  function getRowHeight() {
    return window.matchMedia && window.matchMedia('(max-width: 640px)').matches
      ? MOBILE_ROW_HEIGHT
      : DESKTOP_ROW_HEIGHT;
  }

  // ── Helpers ──
  function normalize(str) {
    return (str || '').toString().trim().toLowerCase();
  }

  function normalizeCostKey(str) {
    return normalize(str)
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function t(key, vars) {
    return typeof window.t === 'function' ? window.t(key, vars) : key;
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

  function debounce(fn, ms) {
    var timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    };
  }

  function sortCategorySet(catSet) {
    return Array.from(catSet).sort(function (a, b) {
      var ia = PREFERRED_ORDER.indexOf(a),
        ib = PREFERRED_ORDER.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return a.localeCompare(b);
    });
  }

  // ── CSV Parser (same as optimizer.js) ──
  function parseCSV(text) {
    var rows = [];
    var i = 0,
      field = '',
      row = [],
      inQuotes = false;
    while (i < text.length) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else inQuotes = false;
        } else {
          field += c;
        }
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') {
          row.push(field);
          field = '';
        } else if (c === '\r') {
          /* skip */
        } else if (c === '\n') {
          row.push(field);
          rows.push(row);
          row = [];
          field = '';
        } else field += c;
      }
      i++;
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function normalizeOfficialName(name) {
    return normalize(name).replace(/\s+/g, ' ');
  }

  function rebuildDerivedSkillFields() {
    allSkills.forEach(function (skill) {
      if (!skill || !skill.name) return;
      var displayName =
        typeof window.getLocalizedSkillName === 'function'
          ? window.getLocalizedSkillName(skill.name)
          : skill.name;
      var aliasText = Array.isArray(skill.aliasNames) ? skill.aliasNames.join(' ') : '';
      skill._displayName = displayName;
      skill._searchName = normalize(skill.name);
      skill._searchDisplay = normalize(displayName);
      skill._searchAliases = normalize([skill.jpName, aliasText].filter(Boolean).join(' '));
      skill._sortName = normalize(displayName || skill.name);
    });
  }

  // ── Load JSON cost data + build official EN name set ──
  async function loadCostJSON() {
    var urls = ['/assets/skills_all.json', './assets/skills_all.json'];
    for (var u = 0; u < urls.length; u++) {
      try {
        var res = await fetch(urls[u], { cache: 'force-cache' });
        if (!res.ok) continue;
        var list = await res.json();
        if (!Array.isArray(list) || !list.length) continue;
        fullSkillData = list;
        window.__skillsAllData = list;
        if (typeof window.buildJPSkillNameMap === 'function') window.buildJPSkillNameMap(list);
        var nextOfficialNames = new Set();
        var nextOfficialIds = new Set();
        var nextJpNameToId = new Map();
        list.forEach(function (entry) {
          // Collect official EN names and IDs for filtering
          var officialName = ((entry && entry.name_en) || '').trim();
          var geneOfficialName = (
            (entry && entry.gene_version && entry.gene_version.name_en) ||
            ''
          ).trim();
          if (officialName) nextOfficialNames.add(normalizeOfficialName(officialName));
          if (geneOfficialName) nextOfficialNames.add(normalizeOfficialName(geneOfficialName));

          var id = entry && entry.id;
          // Track official skill IDs
          if (officialName && id != null) nextOfficialIds.add(String(id));
          if (geneOfficialName && entry.gene_version && entry.gene_version.id != null)
            nextOfficialIds.add(String(entry.gene_version.id));

          // Map JP names to skill IDs for accurate identification
          var jpName = ((entry && entry.jpname) || '').trim();
          if (jpName && id != null) nextJpNameToId.set(normalize(jpName), String(id));
          if (entry && entry.gene_version) {
            var geneJpName = (entry.gene_version.jpname || '').trim();
            var geneId = entry.gene_version.id;
            if (geneJpName && geneId != null)
              nextJpNameToId.set(normalize(geneJpName), String(geneId));
          }

          var cost = null;
          if (entry && entry.gene_version && typeof entry.gene_version.cost === 'number')
            cost = entry.gene_version.cost;
          else if (entry && typeof entry.cost === 'number') cost = entry.cost;

          var versions = entry && Array.isArray(entry.versions) ? entry.versions : [];
          var lowerId = versions.length ? String(versions[0]) : null;

          // Build ID-based lookups for gold->lower cost linking
          if (id != null && cost !== null) {
            skillCostById.set(String(id), cost);
          }
          if (id != null && lowerId) {
            skillLowerIdById.set(String(id), lowerId);
          }

          if (cost === null) return;
          var names = [];
          [entry.name_en, entry.enname, entry.jpname, entry.name].forEach(function (v) {
            var trimmed = (v || '').trim();
            if (trimmed && names.indexOf(trimmed) === -1) names.push(trimmed);
          });
          if (entry.gene_version) {
            [
              entry.gene_version.name_en,
              entry.gene_version.enname,
              entry.gene_version.jpname,
              entry.gene_version.name,
            ].forEach(function (v) {
              var trimmed = (v || '').trim();
              if (trimmed && names.indexOf(trimmed) === -1) names.push(trimmed);
            });
          }
          var meta = { cost: cost, id: id != null ? String(id) : null, lowerId: lowerId };
          names.forEach(function (n) {
            var exact = normalize(n);
            var loose = normalizeCostKey(n);
            if (exact && !costMap.has(exact)) costMap.set(exact, cost);
            if (loose && !costMap.has(loose)) costMap.set(loose, cost);
            if (exact && !skillMetaByName.has(exact)) skillMetaByName.set(exact, meta);
            if (loose && !skillMetaByName.has(loose)) skillMetaByName.set(loose, meta);
          });
        });
        officialEnglishNameSet = nextOfficialNames;
        officialSkillIds = nextOfficialIds;
        jpNameToId = nextJpNameToId;
        return true;
      } catch {
        /* try next */
      }
    }
    return false;
  }

  // ── Load CSV skills ──
  async function loadSkillsCSV() {
    var lang = getSkillLanguage();
    var candidates =
      lang === 'jp'
        ? ['/assets/uma_skills_jp.csv', './assets/uma_skills_jp.csv', '/assets/uma_skills.csv']
        : ['/assets/uma_skills.csv', './assets/uma_skills.csv'];
    csvSkillMetaByName = new Map();
    for (var c = 0; c < candidates.length; c++) {
      try {
        var res = await fetch(candidates[c], { cache: 'force-cache' });
        if (!res.ok) continue;
        var text = await res.text();
        rawCSVText = text;
        buildCSVSkillMetaIndex(text);
        if (lang === 'jp' && initializeCategoriesFromGameTora()) return true;
        // Parse header and collect categories without loading all data
        if (initializeCategories(text)) return true;
      } catch {
        /* try next */
      }
    }
    if (lang === 'jp' && initializeCategoriesFromGameTora()) return true;
    return false;
  }

  // ── Initialize categories from CSV without loading all skills ──
  function initializeCategories(csvText) {
    var rows = parseCSV(csvText);
    if (!rows.length) return false;
    var header = rows[0].map(function (h) {
      return (h || '').toString().trim().toLowerCase();
    });
    var idx = {
      type: header.indexOf('skill_type'),
      name: header.indexOf('name'),
    };
    if (idx.name === -1) return false;

    var catSet = new Set();
    // Scan through rows to collect categories
    for (var r = 1; r < rows.length; r++) {
      var cols = rows[r];
      if (!cols || !cols.length) continue;
      var type = idx.type !== -1 ? (cols[idx.type] || '').trim().toLowerCase() : 'misc';
      catSet.add(type);
    }

    categories = sortCategorySet(catSet);

    return true;
  }

  function initializeCategoriesFromGameTora() {
    if (!Array.isArray(fullSkillData) || !fullSkillData.length) return false;
    var catSet = new Set();
    fullSkillData.forEach(function (entry) {
      var csvMeta = getCSVSkillMetaForEntry(entry);
      var type = deriveGameToraCategory(entry, csvMeta);
      if (type) catSet.add(type);
    });
    categories = sortCategorySet(catSet);
    return true;
  }

  function addCSVMetaName(name, meta) {
    var key = normalize(name);
    if (key && !csvSkillMetaByName.has(key)) csvSkillMetaByName.set(key, meta);
    var loose = normalizeCostKey(name);
    if (loose && !csvSkillMetaByName.has(loose)) csvSkillMetaByName.set(loose, meta);
  }

  function buildCSVSkillMetaIndex(csvText) {
    csvSkillMetaByName = new Map();
    var rows = parseCSV(csvText || '');
    if (!rows.length) return;

    var header = rows[0].map(function (h) {
      return (h || '').toString().trim().toLowerCase();
    });
    var idx = {
      type: header.indexOf('skill_type'),
      name: header.indexOf('name'),
      alias: header.indexOf('alias_name'),
      localized: header.indexOf('localized_name'),
      base: header.indexOf('base_value'),
      baseCost: header.indexOf('base'),
      sa: header.indexOf('s_a'),
      apt1: header.indexOf('apt_1'),
      check: header.indexOf('affinity_role'),
    };
    if (idx.name === -1) return;

    for (var r = 1; r < rows.length; r++) {
      var cols = rows[r];
      if (!cols || !cols.length) continue;

      var rawName = (cols[idx.name] || '').trim();
      if (!rawName) continue;

      var type = idx.type !== -1 ? (cols[idx.type] || '').trim().toLowerCase() : '';
      var baseCostCSV = idx.baseCost !== -1 ? parseInt(cols[idx.baseCost] || '', 10) : NaN;
      var baseValue = idx.base !== -1 ? parseInt(cols[idx.base] || '', 10) : NaN;
      var sa = idx.sa !== -1 ? parseInt(cols[idx.sa] || '', 10) : NaN;
      var apt1 = idx.apt1 !== -1 ? parseInt(cols[idx.apt1] || '', 10) : NaN;
      var baseBucket = !isNaN(baseValue) ? baseValue : !isNaN(baseCostCSV) ? baseCostCSV : NaN;
      var score = !isNaN(sa) ? sa : !isNaN(apt1) ? apt1 : baseBucket;
      var meta = {
        category: type,
        score: !isNaN(score) ? score : 0,
        checkType: idx.check !== -1 ? (cols[idx.check] || '').trim() : '',
      };

      addCSVMetaName(rawName, meta);
      if (idx.localized !== -1) addCSVMetaName((cols[idx.localized] || '').trim(), meta);
      if (idx.alias !== -1) {
        (cols[idx.alias] || '').split('|').forEach(function (alias) {
          addCSVMetaName(alias.trim(), meta);
        });
      }
    }
  }

  function getCSVSkillMetaForEntry(entry) {
    if (!entry) return null;
    var candidates = [entry.name_en, entry.enname, entry.jpname, entry.name];
    for (var i = 0; i < candidates.length; i++) {
      var name = (candidates[i] || '').trim();
      if (!name) continue;
      var meta =
        csvSkillMetaByName.get(normalize(name)) || csvSkillMetaByName.get(normalizeCostKey(name));
      if (meta) return meta;
    }
    return null;
  }

  function getEffectTypes(entry) {
    var types = [];
    var groups = Array.isArray(entry && entry.condition_groups) ? entry.condition_groups : [];
    groups.forEach(function (group) {
      (group.effects || []).forEach(function (effect) {
        if (effect && effect.type != null && types.indexOf(effect.type) === -1)
          types.push(effect.type);
      });
    });
    return types;
  }

  function deriveGameToraCategory(entry, csvMeta) {
    if (csvMeta && csvMeta.category) return csvMeta.category;
    var rarity = Number(entry && entry.rarity);
    if (rarity === 6) return 'evo';
    if (rarity === 3 || rarity === 4 || rarity === 5) return 'ius';
    if (rarity === 2) return 'gold';

    var iconid = Number(entry && entry.iconid);
    if (Number.isFinite(iconid)) {
      if (iconid >= 30000 && iconid < 40000) return 'red';
      if (iconid % 10 === 4) return 'purple';
      if (iconid >= 10000 && iconid < 20000) return 'green';
      var tensDigit = Math.floor((iconid % 100) / 10);
      if (tensDigit === 2) return 'blue';
    }

    var effects = getEffectTypes(entry);
    if (effects.indexOf(9) !== -1) return 'blue';
    if (
      effects.some(function (type) {
        return (
          (type >= 1 && type <= 6) || type === 32 || type === 501 || type === 502 || type === 503
        );
      })
    ) {
      return 'green';
    }
    return 'yellow';
  }

  function getGameToraDisplayName(entry) {
    return (
      ((entry && entry.name_en) || '').trim() ||
      ((entry && entry.enname) || '').trim() ||
      ((entry && entry.name) || '').trim() ||
      ((entry && entry.jpname) || '').trim() ||
      (entry && entry.id != null ? 'Skill #' + entry.id : '')
    );
  }

  function getGameToraAliases(entry, displayName) {
    var aliases = [];
    [
      entry && entry.jpname,
      entry && entry.name_en,
      entry && entry.enname,
      entry && entry.name,
    ].forEach(function (name) {
      var trimmed = (name || '').trim();
      if (trimmed && trimmed !== displayName && aliases.indexOf(trimmed) === -1)
        aliases.push(trimmed);
    });
    return aliases;
  }

  function getFallbackScore(entry, category) {
    if (category === 'ius') return 180;
    if (entry && typeof entry.cost === 'number') return entry.cost;
    return 0;
  }

  function getGameToraCost(entry, category) {
    if (entry && typeof entry.cost === 'number') return entry.cost;
    if (category === 'ius') return 180;
    return undefined;
  }

  function buildGameToraSkill(entry) {
    var csvMeta = getCSVSkillMetaForEntry(entry);
    var category = deriveGameToraCategory(entry, csvMeta);
    var name = getGameToraDisplayName(entry);
    var cost = getGameToraCost(entry, category);
    var score = csvMeta ? csvMeta.score : getFallbackScore(entry, category);
    var aliases = getGameToraAliases(entry, name);
    var jpName = ((entry && entry.jpname) || '').trim();

    return {
      id: entry && entry.id != null ? String(entry.id) : null,
      name: name,
      jpName: jpName,
      aliasNames: aliases,
      category: category,
      cost: cost,
      score: score,
      efficiency: cost && cost > 0 ? score / cost : 0,
      checkType: csvMeta ? csvMeta.checkType : '',
    };
  }

  // ── Load skills for specific category ──
  async function loadCategorySkills(category) {
    // If already loaded, skip
    if (category !== 'all' && loadedCategories.has(category)) {
      return true;
    }

    if (getSkillLanguage() === 'jp' && Array.isArray(fullSkillData) && fullSkillData.length) {
      return loadGameToraCategorySkills(category);
    }

    if (!rawCSVText) return false;

    // Show loading indicator
    if (loadingEl) {
      loadingEl.style.display = '';
      loadingEl.textContent = t('skills.loadingCategory') || 'Loading category...';
    }

    // Parse category skills (with small delay to show loading state)
    await new Promise(function (resolve) {
      setTimeout(resolve, 10);
    });

    var rows = parseCSV(rawCSVText);
    if (!rows.length) return false;

    var header = rows[0].map(function (h) {
      return (h || '').toString().trim().toLowerCase();
    });
    var idx = {
      type: header.indexOf('skill_type'),
      name: header.indexOf('name'),
      alias: header.indexOf('alias_name'),
      localized: header.indexOf('localized_name'),
      base: header.indexOf('base_value'),
      baseCost: header.indexOf('base'),
      sa: header.indexOf('s_a'),
      apt1: header.indexOf('apt_1'),
      check: header.indexOf('affinity_role'),
    };
    if (idx.name === -1) return false;

    var filterByOfficialEN = getSkillLanguage() === 'en' && officialEnglishNameSet.size > 0;
    var categorySkills = [];

    for (var r = 1; r < rows.length; r++) {
      var cols = rows[r];
      if (!cols || !cols.length) continue;

      var type = idx.type !== -1 ? (cols[idx.type] || '').trim().toLowerCase() : 'misc';

      // Skip if not matching requested category (unless loading 'all')
      if (category !== 'all' && type !== category) continue;

      var rawName = (cols[idx.name] || '').trim();
      var localizedName = idx.localized !== -1 ? (cols[idx.localized] || '').trim() : '';
      var isJPCSV = getSkillLanguage() === 'jp';
      var aliasFirst = idx.alias !== -1 ? (cols[idx.alias] || '').split('|')[0].trim() : '';
      var jpSwapName = isJPCSV ? localizedName || aliasFirst || '' : '';
      var name = jpSwapName || rawName;
      if (!name) continue;

      if (filterByOfficialEN) {
        var jpAliasRaw = idx.alias !== -1 ? (cols[idx.alias] || '').trim() : '';
        if (jpAliasRaw) {
          var jpAliasParts = jpAliasRaw.split('|');
          var resolvedId = null;
          for (var ap = 0; ap < jpAliasParts.length && !resolvedId; ap++) {
            var part = jpAliasParts[ap].trim();
            if (part) resolvedId = jpNameToId.get(normalize(part));
          }
          if (!resolvedId || !officialSkillIds.has(resolvedId)) continue;
        } else {
          if (!officialEnglishNameSet.has(normalizeOfficialName(name))) continue;
        }
      }

      var baseCostCSV = idx.baseCost !== -1 ? parseInt(cols[idx.baseCost] || '', 10) : NaN;
      var baseValue = idx.base !== -1 ? parseInt(cols[idx.base] || '', 10) : NaN;
      var sa = idx.sa !== -1 ? parseInt(cols[idx.sa] || '', 10) : NaN;
      var apt1 = idx.apt1 !== -1 ? parseInt(cols[idx.apt1] || '', 10) : NaN;

      var baseBucket = !isNaN(baseValue) ? baseValue : !isNaN(baseCostCSV) ? baseCostCSV : NaN;
      var score = !isNaN(sa) ? sa : !isNaN(apt1) ? apt1 : baseBucket;
      if (isNaN(score)) score = 0;

      var isUnique = type === 'ius' || type.indexOf('ius') !== -1;
      var isGold = type === 'golden' || type === 'gold';
      var rowMeta = resolveSkillMeta(name, cols, idx);

      var cost;
      if (isUnique) {
        cost = 180;
      } else {
        var costFromJSON = costMap.get(normalize(name)) || costMap.get(normalizeCostKey(name));
        if (!costFromJSON && idx.alias !== -1) {
          var aliases = (cols[idx.alias] || '').split('|');
          for (var a = 0; a < aliases.length && !costFromJSON; a++) {
            var al = aliases[a].trim();
            if (al) costFromJSON = costMap.get(normalize(al)) || costMap.get(normalizeCostKey(al));
          }
        }
        if (!costFromJSON && idx.localized !== -1) {
          var loc = (cols[idx.localized] || '').trim();
          if (loc) costFromJSON = costMap.get(normalize(loc)) || costMap.get(normalizeCostKey(loc));
        }
        if (!costFromJSON && rawName !== name) {
          costFromJSON = costMap.get(normalize(rawName)) || costMap.get(normalizeCostKey(rawName));
        }
        cost = costFromJSON || (!isNaN(baseCostCSV) ? baseCostCSV : undefined);
      }

      if (isGold && cost != null) {
        var goldMeta = rowMeta || resolveSkillMeta(name, cols, idx);
        if (goldMeta && goldMeta.lowerId) {
          var lc = skillCostById.get(goldMeta.lowerId);
          if (typeof lc === 'number') cost += lc;
        }
      }

      var isCircleUpgrade = name.indexOf(' \u25ce') !== -1 || name.indexOf('\u25ce') !== -1;
      if (isCircleUpgrade && cost != null) {
        var circleMeta = rowMeta || resolveSkillMeta(name, cols, idx);
        if (circleMeta && circleMeta.lowerId) {
          var clc = skillCostById.get(circleMeta.lowerId);
          if (typeof clc === 'number') cost += clc;
        }
      }

      var checkType = idx.check !== -1 ? (cols[idx.check] || '').trim() : '';
      var aliasNames =
        idx.alias !== -1
          ? (cols[idx.alias] || '')
              .split('|')
              .map(function (alias) {
                return alias.trim();
              })
              .filter(Boolean)
          : [];
      [rawName, localizedName].forEach(function (extraName) {
        if (extraName && extraName !== name && aliasNames.indexOf(extraName) === -1) {
          aliasNames.push(extraName);
        }
      });

      var skill = {
        id: rowMeta && rowMeta.id ? rowMeta.id : null,
        name: name,
        jpName: rawName && rawName !== name ? rawName : '',
        aliasNames: aliasNames,
        category: type,
        cost: cost,
        score: score,
        efficiency: cost && cost > 0 ? score / cost : 0,
        checkType: checkType,
      };

      categorySkills.push(skill);
    }

    // Store category skills
    if (category === 'all') {
      allSkills = categorySkills;
    } else {
      skillsByCategory.set(category, categorySkills);
      loadedCategories.add(category);

      // Merge into allSkills (remove old category data, add new)
      allSkills = allSkills.filter(function (s) {
        return s.category !== category;
      });
      allSkills = allSkills.concat(categorySkills);
    }

    // Rebuild derived fields for loaded skills
    rebuildDerivedSkillFields();

    if (loadingEl) loadingEl.style.display = 'none';
    return true;
  }

  async function loadGameToraCategorySkills(category) {
    if (loadingEl) {
      loadingEl.style.display = '';
      loadingEl.textContent = t('skills.loadingCategory') || 'Loading category...';
    }

    await new Promise(function (resolve) {
      setTimeout(resolve, 10);
    });

    var categorySkills = [];
    fullSkillData.forEach(function (entry) {
      var skill = buildGameToraSkill(entry);
      if (!skill.name) return;
      if (category !== 'all' && skill.category !== category) return;
      categorySkills.push(skill);
    });

    if (category === 'all') {
      allSkills = categorySkills;
    } else {
      skillsByCategory.set(category, categorySkills);
      loadedCategories.add(category);
      allSkills = allSkills.filter(function (s) {
        return s.category !== category;
      });
      allSkills = allSkills.concat(categorySkills);
    }

    rebuildDerivedSkillFields();
    if (loadingEl) loadingEl.style.display = 'none';
    return true;
  }

  // Look up skill meta using name, alias, and localized_name from CSV
  function resolveSkillMeta(name, cols, idx) {
    var meta = skillMetaByName.get(normalize(name)) || skillMetaByName.get(normalizeCostKey(name));
    if (!meta && idx.alias !== -1) {
      var aliases = (cols[idx.alias] || '').split('|');
      for (var a = 0; a < aliases.length && !meta; a++) {
        var al = aliases[a].trim();
        if (al)
          meta = skillMetaByName.get(normalize(al)) || skillMetaByName.get(normalizeCostKey(al));
      }
    }
    if (!meta && idx.localized !== -1) {
      var loc = (cols[idx.localized] || '').trim();
      if (loc)
        meta = skillMetaByName.get(normalize(loc)) || skillMetaByName.get(normalizeCostKey(loc));
    }
    return meta || null;
  }

  // ── Filter & Sort ──
  function applyFilterAndSort() {
    var query = normalize(searchQuery);
    filteredSkills = allSkills.filter(function (s) {
      if (activeCategory !== 'all' && s.category !== activeCategory) return false;
      if (query) {
        var nameMatch = (s._searchName || '').indexOf(query) !== -1;
        var localizedMatch = (s._searchDisplay || '').indexOf(query) !== -1;
        var aliasMatch = (s._searchAliases || '').indexOf(query) !== -1;
        if (!nameMatch && !localizedMatch && !aliasMatch) return false;
      }
      return true;
    });
    filteredSkills.sort(function (a, b) {
      var va, vb;
      switch (sortCol) {
        case 'name':
          va = a._sortName || a.name.toLowerCase();
          vb = b._sortName || b.name.toLowerCase();
          return sortDir === 'asc'
            ? va < vb
              ? -1
              : va > vb
                ? 1
                : 0
            : vb < va
              ? -1
              : vb > va
                ? 1
                : 0;
        case 'type':
          va = a.category;
          vb = b.category;
          return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        case 'cost':
          va = a.cost || 0;
          vb = b.cost || 0;
          return sortDir === 'asc' ? va - vb : vb - va;
        case 'score':
          va = a.score;
          vb = b.score;
          return sortDir === 'asc' ? va - vb : vb - va;
        case 'efficiency':
          va = a.efficiency;
          vb = b.efficiency;
          return sortDir === 'asc' ? va - vb : vb - va;
        default:
          return 0;
      }
    });
  }

  // ── Render ──
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, '&quot;');
  }

  function renderFilters() {
    if (!filtersEl) return;
    var html =
      '<button class="skills-filter-btn' +
      (activeCategory === 'all' ? ' active' : '') +
      '" data-cat="all">' +
      t('skills.allTypes') +
      '</button>';
    categories.forEach(function (cat) {
      var label = CATEGORY_LABELS[cat] || cat;
      html +=
        '<button class="skills-filter-btn' +
        (activeCategory === cat ? ' active' : '') +
        '" data-cat="' +
        cat +
        '">' +
        escapeHtml(label) +
        '</button>';
    });
    filtersEl.innerHTML = html;
  }

  function renderSkillRow(skill, index) {
    var wrapper = document.createElement('div');
    var catCls = CATEGORY_CSS[skill.category] || '';
    wrapper.className = 'virtual-row' + (catCls ? ' ' + catCls : '');

    var catLabel = CATEGORY_LABELS[skill.category] || skill.category;
    var costStr = skill.cost != null ? String(skill.cost) : '\u2014';
    var effStr = skill.efficiency > 0 ? skill.efficiency.toFixed(2) : '\u2014';
    var effCls = skill.efficiency >= 2 ? 'eff-high' : skill.efficiency >= 1 ? 'eff-mid' : 'eff-low';
    var triggerAttr =
      skill.id != null && skill.id !== ''
        ? 'data-skill-id="' + escapeAttr(skill.id) + '"'
        : 'data-skill-name="' + escapeAttr(skill.name) + '"';

    wrapper.innerHTML =
      '<div class="virtual-row-inner">' +
      '<div class="col-name"><span ' +
      triggerAttr +
      ' tabindex="0" role="button">' +
      escapeHtml(skill._displayName || skill.name) +
      '</span></div>' +
      '<div class="col-type" data-label="' +
      escapeAttr(t('skills.type')) +
      '"><span class="skill-cat-pill ' +
      catCls +
      '">' +
      escapeHtml(catLabel) +
      '</span></div>' +
      '<div class="col-cost" data-label="' +
      escapeAttr(t('skills.cost')) +
      '">' +
      costStr +
      '</div>' +
      '<div class="col-score" data-label="' +
      escapeAttr(t('skills.score')) +
      '">' +
      skill.score +
      '</div>' +
      '<div class="col-eff ' +
      effCls +
      '" data-label="' +
      escapeAttr(t('skills.efficiency')) +
      '">' +
      effStr +
      '</div>' +
      '</div>';

    return wrapper;
  }

  function renderTable() {
    if (!tableWrap) return;
    if (loadingEl) loadingEl.style.display = 'none';

    var cols = [
      { key: 'name', label: t('skills.name'), cls: 'col-name' },
      { key: 'type', label: t('skills.type'), cls: 'col-type' },
      { key: 'cost', label: t('skills.cost'), cls: 'col-cost' },
      { key: 'score', label: t('skills.score'), cls: 'col-score' },
      { key: 'efficiency', label: t('skills.efficiency'), cls: 'col-eff' },
    ];

    if (!filteredSkills.length) {
      if (virtualScroll) {
        virtualScroll.destroy();
        virtualScroll = null;
      }
      tableWrap.innerHTML = '<div class="skills-empty">' + t('skills.noResults') + '</div>';
      if (countEl) countEl.textContent = t('skills.skillCount', { count: 0 });
      return;
    }

    // Build table header
    var html =
      '<div class="skills-table-container"><div class="skills-table-header"><div class="header-row">';
    cols.forEach(function (col) {
      var sortCls = '';
      if (sortCol === col.key) sortCls = sortDir === 'asc' ? ' sorted-asc' : ' sorted-desc';
      html +=
        '<div class="' +
        col.cls +
        sortCls +
        '" data-sort="' +
        col.key +
        '">' +
        escapeHtml(col.label) +
        '</div>';
    });
    html += '</div></div><div class="skills-table-body" id="skillTableBody"></div></div>';

    tableWrap.innerHTML = html;

    // Initialize virtual scroll
    var bodyEl = document.getElementById('skillTableBody');
    if (!bodyEl) return;

    // Destroy existing virtual scroll if any
    if (virtualScroll) {
      virtualScroll.destroy();
      virtualScroll = null;
    }

    // Use VirtualScroll only for large lists (>50 items)
    if (filteredSkills.length > 50 && typeof VirtualScroll === 'function') {
      virtualScroll = new VirtualScroll({
        container: bodyEl,
        items: filteredSkills,
        renderItem: renderSkillRow,
        itemHeight: getRowHeight(),
        bufferSize: 5,
      });
    } else {
      // For small lists, render all items directly
      bodyEl.style.position = 'relative';
      filteredSkills.forEach(function (skill, idx) {
        var row = renderSkillRow(skill, idx);
        row.style.position = 'relative';
        row.style.top = 'auto';
        bodyEl.appendChild(row);
      });
    }

    if (countEl) countEl.textContent = t('skills.skillCount', { count: filteredSkills.length });
  }

  function refresh() {
    applyFilterAndSort();
    renderTable();
  }

  // ── Event Handlers ──
  async function onSearch() {
    searchQuery = searchInput ? searchInput.value : '';

    // If searching across all categories, ensure all are loaded
    if (searchQuery && activeCategory === 'all') {
      for (var i = 0; i < categories.length; i++) {
        if (!loadedCategories.has(categories[i])) {
          await loadCategorySkills(categories[i]);
        }
      }
    }

    refresh();
  }

  async function onFilterClick(e) {
    var btn = e.target.closest('.skills-filter-btn');
    if (!btn) return;
    var newCategory = btn.getAttribute('data-cat') || 'all';

    // Don't reload if already on this category
    if (newCategory === activeCategory) return;

    activeCategory = newCategory;
    renderFilters();

    // Load category data if not already loaded
    if (activeCategory === 'all') {
      // Load all categories
      for (var i = 0; i < categories.length; i++) {
        if (!loadedCategories.has(categories[i])) {
          await loadCategorySkills(categories[i]);
        }
      }
    } else if (!loadedCategories.has(activeCategory)) {
      await loadCategorySkills(activeCategory);
    }

    refresh();
  }

  function onHeaderClick(e) {
    var th = e.target.closest('th[data-sort]');
    var headerDiv = e.target.closest('[data-sort]');
    var target = th || headerDiv;
    if (!target) return;
    var col = target.getAttribute('data-sort');
    if (sortCol === col) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortCol = col;
      sortDir = col === 'name' || col === 'type' ? 'asc' : 'desc';
    }
    refresh();
  }

  // ── Init ──
  async function init() {
    searchInput = document.getElementById('skillSearch');
    filtersEl = document.getElementById('skillFilters');
    countEl = document.getElementById('skillCount');
    tableWrap = document.getElementById('skillTableWrap');
    loadingEl = document.getElementById('skillLoading');

    if (searchInput) {
      searchInput.addEventListener('input', debounce(onSearch, 180));
    }
    if (filtersEl) {
      filtersEl.addEventListener('click', onFilterClick);
    }
    if (tableWrap) {
      tableWrap.addEventListener('click', onHeaderClick);
    }

    // Load data
    await loadCostJSON();
    await loadSkillsCSV();

    renderFilters();
    sortCol = 'efficiency';
    sortDir = 'desc';

    // Load initial category (first category or 'all')
    var initialCategory = categories.length > 0 ? categories[0] : 'all';
    activeCategory = initialCategory;
    await loadCategorySkills(activeCategory);
    renderFilters();
    refresh();

    // Rebuild the virtual list when rotating a device or crossing the mobile breakpoint,
    // because mobile skill cards intentionally use a taller row height.
    if (window.matchMedia) {
      var rowLayoutQuery = window.matchMedia('(max-width: 640px)');
      var handleRowLayoutChange = function () {
        renderTable();
      };
      if (typeof rowLayoutQuery.addEventListener === 'function') {
        rowLayoutQuery.addEventListener('change', handleRowLayoutChange);
      } else if (typeof rowLayoutQuery.addListener === 'function') {
        rowLayoutQuery.addListener(handleRowLayoutChange);
      }
    }

    // React to server changes
    window.addEventListener('umatools:server-change', async function () {
      if (virtualScroll) {
        virtualScroll.destroy();
        virtualScroll = null;
      }
      costMap.clear();
      skillCostById.clear();
      skillLowerIdById.clear();
      skillMetaByName.clear();
      jpNameToId.clear();
      csvSkillMetaByName.clear();
      officialEnglishNameSet = new Set();
      officialSkillIds = new Set();
      fullSkillData = [];
      allSkills = [];
      categories = [];
      loadedCategories.clear();
      skillsByCategory.clear();
      rawCSVText = null;
      if (loadingEl) {
        loadingEl.style.display = '';
        tableWrap.innerHTML = '';
        tableWrap.appendChild(loadingEl);
      }
      await loadCostJSON();
      await loadSkillsCSV();
      var newInitialCategory = categories.length > 0 ? categories[0] : 'all';
      activeCategory = newInitialCategory;
      await loadCategorySkills(activeCategory);
      renderFilters();
      refresh();
    });

    // React to language changes (re-render labels)
    window.addEventListener('i18n:changed', function () {
      rebuildDerivedSkillFields();
      renderFilters();
      refresh();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
