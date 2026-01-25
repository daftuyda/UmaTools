// Rating Calculator Page Script
// Simplified version of optimizer - just skill selection and rating calculation
// No optimization, budget, hints, or cost management

(function () {
  const rowsEl = document.getElementById('rows');
  const clearAllBtn = document.getElementById('clear-all');
  const libStatus = document.getElementById('lib-status');

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
    unique: document.getElementById('unique-level')
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
    progressBar: document.querySelector('.rating-progress-bar')
  };

  const MAX_STAT_VALUE = 2000;
  const STAT_BLOCK_SIZE = 50;
  const STAT_MULTIPLIERS = [
    0.5, 0.8, 1, 1.3, 1.6, 1.8, 2.1, 2.4, 2.6, 2.8, 2.9, 3, 3.1, 3.3, 3.4,
    3.5, 3.9, 4.1, 4.2, 4.3, 5.2, 5.5, 6.6, 6.8, 6.9
  ];
  let lastSkillScore = 0;

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

  let skillsByCategory = {};
  let categories = [];
  const preferredOrder = ['golden', 'yellow', 'blue', 'green', 'red', 'purple', 'ius'];
  let skillIndex = new Map();
  let allSkillNames = [];

  // Track active skill keys for duplicate detection
  const activeSkillKeys = new Map();

  // Shared datalist for all skill inputs
  let sharedSkillDatalist = null;

  function normalize(str) { return (str || '').toString().trim().toLowerCase(); }

  function getBucketForGrade(grade) {
    switch ((grade || '').toUpperCase()) {
      case 'S':
      case 'A': return 'good';
      case 'B':
      case 'C': return 'average';
      case 'D':
      case 'E':
      case 'F': return 'bad';
      default: return 'terrible';
    }
  }

  function updateAffinityStyles() {
    const grades = ['good', 'average', 'bad', 'terrible'];
    Object.values(cfg).forEach(sel => {
      if (!sel) return;
      const bucket = getBucketForGrade(sel.value);
      grades.forEach(g => sel.classList.remove(`aff-grade-${g}`));
      sel.classList.add(`aff-grade-${bucket}`);
    });
  }

  function getBucketForSkill(checkType) {
    const ct = normalize(checkType);
    const map = {
      'turf': cfg.turf,
      'dirt': cfg.dirt,
      'sprint': cfg.sprint,
      'mile': cfg.mile,
      'medium': cfg.medium,
      'long': cfg.long,
      'front': cfg.front,
      'pace': cfg.pace,
      'late': cfg.late,
      'end': cfg.end,
    };
    const sel = map[ct];
    if (!sel) return 'base';
    return getBucketForGrade(sel.value);
  }

  function evaluateSkillScore(skill) {
    if (typeof skill.score === 'number') return skill.score;
    if (!skill.score || typeof skill.score !== 'object') return 0;
    const bucket = getBucketForSkill(skill.checkType);
    const val = skill.score[bucket];
    return typeof val === 'number' ? val : 0;
  }

  function clampStatValue(value) {
    if (typeof value !== 'number' || isNaN(value)) return 0;
    return Math.max(0, Math.min(MAX_STAT_VALUE, value));
  }

  function getCurrentStarLevel() {
    const raw = ratingInputs.star ? parseInt(ratingInputs.star.value, 10) : 0;
    return isNaN(raw) ? 0 : raw;
  }

  function getCurrentUniqueLevel() {
    const raw = ratingInputs.unique ? parseInt(ratingInputs.unique.value, 10) : 0;
    return isNaN(raw) ? 0 : raw;
  }

  function calcUniqueBonus(starLevel, uniqueLevel) {
    const lvl = typeof uniqueLevel === 'number' && uniqueLevel > 0 ? uniqueLevel : 0;
    if (!lvl) return 0;
    const multiplier = starLevel === 1 || starLevel === 2 ? 120 : 170;
    return lvl * multiplier;
  }

  const RATING_SPRITE = {
    url: 'assets/rank_badges.png',
    columns: 6,
    rows: 6,
    tileWidth: 125,
    tileHeight: 125,
    loaded: false
  };

  const RATING_BADGES = [
    { threshold: 300, label: 'G', sprite: { col: 0, row: 0 } },
    { threshold: 600, label: 'G+', sprite: { col: 0, row: 1 } },
    { threshold: 900, label: 'F', sprite: { col: 0, row: 2 } },
    { threshold: 1300, label: 'F+', sprite: { col: 0, row: 3 } },
    { threshold: 1800, label: 'E', sprite: { col: 0, row: 4 } },
    { threshold: 2300, label: 'E+', sprite: { col: 0, row: 5 } },
    { threshold: 2900, label: 'D', sprite: { col: 1, row: 0 } },
    { threshold: 3500, label: 'D+', sprite: { col: 1, row: 1 } },
    { threshold: 4900, label: 'C', sprite: { col: 1, row: 2 } },
    { threshold: 6500, label: 'C+', sprite: { col: 1, row: 3 } },
    { threshold: 8200, label: 'B', sprite: { col: 1, row: 4 } },
    { threshold: 10000, label: 'B+', sprite: { col: 1, row: 5 } },
    { threshold: 12100, label: 'A', sprite: { col: 2, row: 0 } },
    { threshold: 14500, label: 'A+', sprite: { col: 2, row: 1 } },
    { threshold: 15900, label: 'S', sprite: { col: 2, row: 2 } },
    { threshold: 17500, label: 'S+', sprite: { col: 2, row: 3 } },
    { threshold: 19200, label: 'SS', sprite: { col: 2, row: 4 } },
    { threshold: 19600, label: 'SS+', sprite: { col: 2, row: 5 } },
    { threshold: 20000, label: 'UG', sprite: { col: 3, row: 0 } },
    { threshold: 20400, label: 'UG1', sprite: { col: 3, row: 1 } },
    { threshold: 20800, label: 'UG2', sprite: { col: 3, row: 2 } },
    { threshold: 21200, label: 'UG3', sprite: { col: 3, row: 3 } },
    { threshold: 21600, label: 'UG4', sprite: { col: 3, row: 4 } },
    { threshold: 22100, label: 'UG5', sprite: { col: 3, row: 5 } },
    { threshold: 22500, label: 'UG6', sprite: { col: 4, row: 0 } },
    { threshold: 23000, label: 'UG7', sprite: { col: 4, row: 1 } },
    { threshold: 23400, label: 'UG8', sprite: { col: 4, row: 2 } },
    { threshold: 23900, label: 'UG9', sprite: { col: 4, row: 3 } },
    { threshold: 24300, label: 'UF', sprite: { col: 4, row: 4 } },
    { threshold: 24800, label: 'UF1', sprite: { col: 4, row: 5 } },
    { threshold: 25300, label: 'UF2', sprite: { col: 5, row: 0 } },
    { threshold: 25800, label: 'UF3', sprite: { col: 5, row: 1 } },
    { threshold: 26300, label: 'UF4', sprite: { col: 5, row: 2 } },
    { threshold: 26800, label: 'UF5', sprite: { col: 5, row: 3 } },
    { threshold: 27300, label: 'UF6', sprite: { col: 5, row: 4 } },
    { threshold: 27800, label: 'UF7', sprite: { col: 5, row: 5 } },
    { threshold: Infinity, label: 'UF7', sprite: { col: 5, row: 5 } },
  ];

  function getRatingBadge(totalScore) {
    for (const badge of RATING_BADGES) {
      if (totalScore < badge.threshold) return badge;
    }
    return RATING_BADGES[RATING_BADGES.length - 1];
  }

  function getRatingBadgeIndex(totalScore) {
    for (let i = 0; i < RATING_BADGES.length; i++) {
      if (totalScore < RATING_BADGES[i].threshold) return i;
    }
    return RATING_BADGES.length - 1;
  }

  function applyBadgeSpriteStyles(target, spriteUrl, sheetWidth, sheetHeight) {
    if (!target) return;
    const badgeWidth = target.clientWidth || RATING_SPRITE.tileWidth;
    const badgeHeight = target.clientHeight || RATING_SPRITE.tileHeight;
    const scaleX = badgeWidth / RATING_SPRITE.tileWidth;
    const scaleY = badgeHeight / RATING_SPRITE.tileHeight;
    const bgWidth = sheetWidth * scaleX;
    const bgHeight = sheetHeight * scaleY;
    target.style.backgroundImage = `url(${spriteUrl})`;
    target.style.backgroundSize = `${bgWidth}px ${bgHeight}px`;
  }

  function loadRatingSprite() {
    if (!ratingDisplays.badgeSprite && !ratingDisplays.floatBadgeSprite) return;
    const spriteUrl = `${RATING_SPRITE.url}?v=${Date.now()}`;
    const img = new Image();
    img.onload = () => {
      const sheetWidth = img.naturalWidth;
      const sheetHeight = img.naturalHeight;
      RATING_SPRITE.tileWidth = sheetWidth / RATING_SPRITE.columns;
      RATING_SPRITE.tileHeight = sheetHeight / RATING_SPRITE.rows;
      RATING_SPRITE.loaded = true;
      applyBadgeSpriteStyles(ratingDisplays.badgeSprite, spriteUrl, sheetWidth, sheetHeight);
      applyBadgeSpriteStyles(ratingDisplays.floatBadgeSprite, spriteUrl, sheetWidth, sheetHeight);
      updateRatingDisplay();
    };
    img.onerror = () => {
      RATING_SPRITE.loaded = false;
      if (ratingDisplays.badgeSprite) ratingDisplays.badgeSprite.textContent = '';
      if (ratingDisplays.floatBadgeSprite) ratingDisplays.floatBadgeSprite.textContent = '';
    };
    img.src = spriteUrl;
  }

  function readRatingStats() {
    return {
      speed: clampStatValue(parseInt(ratingInputs.speed?.value, 10)),
      stamina: clampStatValue(parseInt(ratingInputs.stamina?.value, 10)),
      power: clampStatValue(parseInt(ratingInputs.power?.value, 10)),
      guts: clampStatValue(parseInt(ratingInputs.guts?.value, 10)),
      wisdom: clampStatValue(parseInt(ratingInputs.wisdom?.value, 10))
    };
  }

  function getMultiplierForBlock(blockIndex) {
    if (blockIndex < STAT_MULTIPLIERS.length) {
      return STAT_MULTIPLIERS[blockIndex];
    }
    return STAT_MULTIPLIERS[STAT_MULTIPLIERS.length - 1];
  }

  function calcStatScore(statValue) {
    const value = clampStatValue(statValue);
    const blocks = Math.floor(value / STAT_BLOCK_SIZE);
    let blockSum = 0;
    for (let i = 0; i < blocks && i < STAT_MULTIPLIERS.length; i++) {
      blockSum += STAT_MULTIPLIERS[i] * STAT_BLOCK_SIZE;
    }
    const remainder = value % STAT_BLOCK_SIZE;
    const multiplier = getMultiplierForBlock(blocks);
    const remainderSum = multiplier * (remainder + 1);
    return Math.floor(blockSum + remainderSum);
  }

  function calculateRatingBreakdown(skillScoreOverride) {
    if (typeof skillScoreOverride === 'number' && !isNaN(skillScoreOverride)) {
      lastSkillScore = Math.max(0, Math.round(skillScoreOverride));
    }
    const stats = readRatingStats();
    const statsScore = Object.values(stats).reduce((sum, val) => sum + calcStatScore(val), 0);
    const starLevel = getCurrentStarLevel();
    const uniqueLevel = getCurrentUniqueLevel();
    const uniqueBonus = calcUniqueBonus(starLevel, uniqueLevel);
    const total = statsScore + uniqueBonus + lastSkillScore;
    return { statsScore, uniqueBonus, skillScore: lastSkillScore, total };
  }

  function updateBadgeSprite(target, badge) {
    if (!target) return;
    if (RATING_SPRITE.loaded && badge.sprite) {
      const badgeWidth = target.clientWidth || RATING_SPRITE.tileWidth;
      const badgeHeight = target.clientHeight || RATING_SPRITE.tileHeight;
      const offsetX = badge.sprite.col * badgeWidth;
      const offsetY = badge.sprite.row * badgeHeight;
      target.style.backgroundPosition = `-${offsetX}px -${offsetY}px`;
      target.textContent = '';
    } else {
      target.style.backgroundImage = 'none';
      target.textContent = badge.label;
    }
  }

  function updateRatingDisplay(skillScoreOverride) {
    const breakdown = calculateRatingBreakdown(skillScoreOverride);
    if (ratingDisplays.stats) ratingDisplays.stats.textContent = breakdown.statsScore.toString();
    if (ratingDisplays.skills) ratingDisplays.skills.textContent = breakdown.skillScore.toString();
    if (ratingDisplays.unique) ratingDisplays.unique.textContent = breakdown.uniqueBonus.toString();
    if (ratingDisplays.total) ratingDisplays.total.textContent = breakdown.total.toString();
    if (ratingDisplays.floatTotal) ratingDisplays.floatTotal.textContent = breakdown.total.toString();
    const badge = getRatingBadge(breakdown.total);
    updateBadgeSprite(ratingDisplays.badgeSprite, badge);
    updateBadgeSprite(ratingDisplays.floatBadgeSprite, badge);
    if (ratingDisplays.progressFill && ratingDisplays.nextLabel && ratingDisplays.nextNeeded) {
      const idx = getRatingBadgeIndex(breakdown.total);
      const current = RATING_BADGES[idx];
      const prevThreshold = idx === 0 ? 0 : RATING_BADGES[idx - 1].threshold;
      const nextThreshold = current.threshold;
      const hasNext = Number.isFinite(nextThreshold);
      const range = hasNext ? Math.max(1, nextThreshold - prevThreshold) : 1;
      const clampedTotal = Math.max(prevThreshold, breakdown.total);
      const progress = hasNext
        ? Math.min(1, Math.max(0, (clampedTotal - prevThreshold) / range))
        : 1;
      const nextBadge = hasNext ? RATING_BADGES[idx + 1] : current;
      const needed = hasNext ? Math.max(0, nextThreshold - breakdown.total) : 0;
      ratingDisplays.progressFill.style.width = `${Math.round(progress * 100)}%`;
      ratingDisplays.nextLabel.textContent = hasNext
        ? `Next: ${nextBadge?.label || current.label} at ${nextThreshold}`
        : 'Max rank reached';
      ratingDisplays.nextNeeded.textContent = hasNext ? `+${needed}` : '';
      if (ratingDisplays.progressBar) {
        ratingDisplays.progressBar.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
      }
    }
  }

  function readRatingState() {
    const stats = readRatingStats();
    return {
      stats,
      star: getCurrentStarLevel(),
      unique: getCurrentUniqueLevel()
    };
  }

  function applyRatingState(data) {
    if (!data || typeof data !== 'object') return;
    const stats = data.stats || {};
    if (ratingInputs.speed && typeof stats.speed === 'number') ratingInputs.speed.value = stats.speed;
    if (ratingInputs.stamina && typeof stats.stamina === 'number') ratingInputs.stamina.value = stats.stamina;
    if (ratingInputs.power && typeof stats.power === 'number') ratingInputs.power.value = stats.power;
    if (ratingInputs.guts && typeof stats.guts === 'number') ratingInputs.guts.value = stats.guts;
    if (ratingInputs.wisdom && typeof stats.wisdom === 'number') ratingInputs.wisdom.value = stats.wisdom;
    if (ratingInputs.star && typeof data.star === 'number') ratingInputs.star.value = String(data.star);
    if (ratingInputs.unique && typeof data.unique === 'number') ratingInputs.unique.value = String(data.unique);
  }

  function handleRatingInputChange() {
    updateRatingDisplay();
    saveState();
  }

  function initRatingInputs() {
    Object.values(ratingInputs).forEach(input => {
      if (!input) return;
      input.addEventListener('input', handleRatingInputChange);
      input.addEventListener('change', handleRatingInputChange);
    });
    updateRatingDisplay();
  }

  // Debounce helper
  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // Collect selected skills and calculate total score
  function collectSkills() {
    const skills = [];
    const rows = rowsEl.querySelectorAll('.calculator-row');
    rows.forEach(row => {
      const nameInput = row.querySelector('.skill-name');
      if (!nameInput) return;
      const name = (nameInput.value || '').trim();
      if (!name) return;
      const skill = findSkillByName(name);
      if (!skill) return;
      const score = evaluateSkillScore(skill);
      skills.push({
        name: skill.name,
        score,
        category: skill.category || '',
        checkType: skill.checkType || ''
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
        selectedListEl.innerHTML = '<span class="muted">No skills selected yet.</span>';
      } else {
        selectedListEl.innerHTML = skills.map(s => {
          const catClass = getCategoryClass(s.category);
          return `<span class="skill-chip ${catClass}">${s.name} <small>(+${s.score})</small></span>`;
        }).join(' ');
      }
    }

    updateRatingDisplay(totalScore);
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
    if (c === 'ius') return 'cat-ius';
    return '';
  }

  function rebuildSkillCaches() {
    const nextIndex = new Map();
    const names = [];
    Object.entries(skillsByCategory).forEach(([category, list = []]) => {
      list.forEach(skill => {
        if (!skill || !skill.name) return;
        const key = normalize(skill.name);
        const enriched = { ...skill, category };
        if (!nextIndex.has(key)) {
          names.push(skill.name);
        }
        nextIndex.set(key, enriched);
      });
    });
    skillIndex = nextIndex;
    const uniqueNames = Array.from(new Set(names));
    uniqueNames.sort((a, b) => a.localeCompare(b));
    allSkillNames = uniqueNames;
    rebuildSharedDatalist();
    refreshAllRows();
  }

  function findSkillByName(name) {
    const key = normalize(name);
    return skillIndex.get(key) || null;
  }

  function formatCategoryLabel(cat) {
    if (!cat) return 'Auto';
    const canon = canonicalCategory(cat);
    if (canon === 'gold') return 'Gold';
    if (canon === 'ius') return 'Unique';
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  }

  function applyFallbackSkills(reason) {
    skillsByCategory = {
      golden: [
        { name: 'Concentration', score: { base: 508, good: 508, average: 415, bad: 369, terrible: 323 }, checkType: 'End' },
        { name: 'Professor of Curvature', score: { base: 508, good: 508, average: 415, bad: 369, terrible: 323 }, checkType: 'Medium' }
      ],
      yellow: [
        { name: 'Groundwork', score: { base: 217, good: 217, average: 177, bad: 158, terrible: 138 }, checkType: 'Front' },
        { name: 'Corner Recovery', score: { base: 217, good: 217, average: 177, bad: 158, terrible: 138 }, checkType: 'Late' }
      ],
      blue: [{ name: 'Stealth Mode', score: { base: 195, good: 195, average: 159, bad: 142, terrible: 124 }, checkType: 'Late' }]
    };
    categories = Object.keys(skillsByCategory);
    rebuildSkillCaches();
    libStatus.textContent = `Using fallback skills (${reason})`;
  }

  function parseCSV(text) {
    const rows = []; let i = 0, field = '', row = [], inQuotes = false;
    while (i < text.length) {
      const c = text[i];
      if (inQuotes) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; } } else { field += c; } }
      else { if (c === '"') inQuotes = true; else if (c === ',') { row.push(field); field = ''; } else if (c === '\r') { } else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; } else { field += c; } }
      i++;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function loadFromCSVContent(csvText) {
    const rows = parseCSV(csvText); if (!rows.length) return false;
    const header = rows[0].map(h => (h || '').toString().trim().toLowerCase());
    const idx = {
      type: header.indexOf('skill_type'),
      name: header.indexOf('name'),
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
      checkAlt: header.indexOf('affinity')
    };
    if (idx.name === -1) return false;
    const catMap = {};
    for (let r = 1; r < rows.length; r++) {
      const cols = rows[r]; if (!cols || !cols.length) continue;
      const name = (cols[idx.name] || '').trim(); if (!name) continue;
      const type = idx.type !== -1 ? (cols[idx.type] || '').trim().toLowerCase() : 'misc';
      const base = idx.base !== -1 ? parseInt(cols[idx.base] || '', 10) : NaN;
      const sa = idx.sa !== -1 ? parseInt(cols[idx.sa] || '', 10) : NaN;
      const bc = idx.bc !== -1 ? parseInt(cols[idx.bc] || '', 10) : NaN;
      const def = idx.def !== -1 ? parseInt(cols[idx.def] || '', 10) : NaN;
      const g = idx.g !== -1 ? parseInt(cols[idx.g] || '', 10) : NaN;
      const apt1 = idx.apt1 !== -1 ? parseInt(cols[idx.apt1] || '', 10) : NaN;
      const apt2 = idx.apt2 !== -1 ? parseInt(cols[idx.apt2] || '', 10) : NaN;
      const apt3 = idx.apt3 !== -1 ? parseInt(cols[idx.apt3] || '', 10) : NaN;
      const apt4 = idx.apt4 !== -1 ? parseInt(cols[idx.apt4] || '', 10) : NaN;
      const checkTypeRaw = idx.check !== -1 ? (cols[idx.check] || '').trim() : (idx.checkAlt !== -1 ? (cols[idx.checkAlt] || '').trim() : '');
      const score = {};
      const baseBucket = !isNaN(base) ? base : NaN;
      const goodVal = !isNaN(sa) ? sa : (!isNaN(apt1) ? apt1 : baseBucket);
      const avgVal = !isNaN(bc) ? bc : (!isNaN(apt2) ? apt2 : goodVal);
      const badVal = !isNaN(def) ? def : (!isNaN(apt3) ? apt3 : avgVal);
      const terrVal = !isNaN(g) ? g : (!isNaN(apt4) ? apt4 : badVal);
      if (!isNaN(baseBucket)) score.base = baseBucket;
      if (!isNaN(goodVal)) score.good = goodVal;
      if (!isNaN(avgVal)) score.average = avgVal;
      if (!isNaN(badVal)) score.bad = badVal;
      if (!isNaN(terrVal)) score.terrible = terrVal;
      if (!catMap[type]) catMap[type] = [];
      catMap[type].push({ name, score, checkType: checkTypeRaw });
    }
    skillsByCategory = catMap;
    categories = Object.keys(catMap).sort((a, b) => {
      const ia = preferredOrder.indexOf(a), ib = preferredOrder.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return a.localeCompare(b);
    });
    rebuildSkillCaches();
    return true;
  }

  async function loadSkillsCSV() {
    const candidates = ['/assets/uma_skills.csv', './assets/uma_skills.csv'];
    let lastErr = null;
    for (const url of candidates) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const ok = loadFromCSVContent(text);
        if (ok) {
          const totalSkills = Object.values(skillsByCategory).reduce((acc, arr) => acc + arr.length, 0);
          libStatus.textContent = `Loaded ${totalSkills} skills`;
          return true;
        }
      } catch (e) {
        lastErr = e;
      }
    }
    console.error('Failed to load CSV from known locations', lastErr);
    libStatus.textContent = 'Failed to load CSV (using fallback)';
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
    if (v === 'ius' || v.includes('ius')) return 'ius';
    if (v === 'yellow' || v === 'blue' || v === 'green' || v === 'red') return v;
    return v;
  }

  function applyCategoryAccent(row, category) {
    const cls = ['cat-gold', 'cat-yellow', 'cat-blue', 'cat-green', 'cat-red', 'cat-ius', 'cat-orange'];
    row.classList.remove(...cls);
    const c = canonicalCategory(category);
    if (!c) return;
    if (c === 'gold') row.classList.add('cat-gold');
    else if (c === 'yellow') row.classList.add('cat-yellow');
    else if (c === 'blue') row.classList.add('cat-blue');
    else if (c === 'green') row.classList.add('cat-green');
    else if (c === 'red') row.classList.add('cat-red');
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

  function rebuildSharedDatalist() {
    if (!sharedSkillDatalist) return;
    sharedSkillDatalist.innerHTML = '';
    const frag = document.createDocumentFragment();
    allSkillNames.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      frag.appendChild(opt);
    });
    sharedSkillDatalist.appendChild(frag);
  }

  function refreshAllRows() {
    const dataRows = rowsEl.querySelectorAll('.calculator-row');
    dataRows.forEach(row => {
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
    if (!rows.length) { rowsEl.appendChild(makeRow()); return; }
    const last = rows[rows.length - 1];
    const lastFilled = isRowFilled(last);
    if (lastFilled) {
      const newRow = makeRow();
      rowsEl.appendChild(newRow);
      if (shouldAutoScrollNewRow()) scrollRowIntoView(newRow);
    } else {
      // Remove extra trailing empty rows, keep exactly one empty
      for (let i = rows.length - 2; i >= 0; i--) {
        if (!isRowFilled(rows[i])) { rows[i].remove(); }
        else break;
      }
    }
  }

  function clearAllRows() {
    Array.from(rowsEl.querySelectorAll('.calculator-row')).forEach(n => {
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
        <input type="text" class="skill-name" list="skills-datalist-shared" placeholder="Start typing..." />
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
    const dupWarning = row.querySelector('.dup-warning');
    let dupWarningTimer = null;

    function getSkillIdentity(name) {
      const skill = findSkillByName(name);
      const id = skill?.skillId ?? skill?.id ?? '';
      const canonicalName = skill?.name || name;
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

    function updateScoreDisplay(skill) {
      if (!scoreDisplay) return;
      if (skill) {
        const score = evaluateSkillScore(skill);
        scoreDisplay.textContent = `+${score}`;
        scoreDisplay.dataset.empty = 'false';
      } else {
        scoreDisplay.textContent = '-';
        scoreDisplay.dataset.empty = 'true';
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
            setCategoryDisplay(prevCategory);
            updateScoreDisplay(prev);
          } else {
            skillInput.value = '';
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
      const syncFromInput = () => syncSkillCategory({ triggerUpdate: true });
      skillInput.addEventListener('input', syncFromInput);
      skillInput.addEventListener('change', syncFromInput);
      skillInput.addEventListener('blur', syncFromInput);
      skillInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') syncFromInput();
      });
      let monitorId = null;
      const startMonitor = () => {
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

  function saveState() {
    try {
      const skills = [];
      rowsEl.querySelectorAll('.calculator-row').forEach(row => {
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
        rating: readRatingState()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save calculator state', e);
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state.raceConfig) {
        Object.entries(state.raceConfig).forEach(([key, val]) => {
          if (cfg[key]) cfg[key].value = val;
        });
        updateAffinityStyles();
      }
      if (state.rating) {
        applyRatingState(state.rating);
      }
      if (Array.isArray(state.skills) && state.skills.length) {
        Array.from(rowsEl.querySelectorAll('.calculator-row')).forEach(n => n.remove());
        state.skills.forEach(skillName => {
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
    }
  }

  // Initialize
  async function init() {
    // Load skills library
    await loadSkillsCSV();

    // Initialize UI
    updateAffinityStyles();
    Object.values(cfg).forEach(sel => {
      if (sel) {
        sel.addEventListener('change', () => {
          updateAffinityStyles();
          updateSelectedSkillsDebounced();
          saveState();
        });
      }
    });

    // Load saved state
    loadState();

    // Ensure at least one row
    if (!rowsEl.querySelector('.calculator-row')) {
      rowsEl.appendChild(makeRow());
    }
    ensureOneEmptyRow();

    // Init rating inputs
    initRatingInputs();
    loadRatingSprite();

    // Clear all button
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', clearAllRows);
    }

    // Initial display update
    updateSelectedSkillsDisplay();
  }

  init();
})();