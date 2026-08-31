(function () {
  const APT_GRADES = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];

  const MOOD = {
    Great: 1.04,
    Good: 1.02,
    Normal: 1.0,
    Bad: 0.98,
    Awful: 0.96,
  };

  const TRACK_APT = {
    S: 1.05,
    A: 1.0,
    B: 0.9,
    C: 0.8,
    D: 0.7,
    E: 0.5,
    F: 0.3,
    G: 0.1,
  };

  const DIST_APT = {
    S: { speed: 1.05, accel: 1.0 },
    A: { speed: 1.0, accel: 1.0 },
    B: { speed: 0.9, accel: 1.0 },
    C: { speed: 0.8, accel: 1.0 },
    D: { speed: 0.6, accel: 1.0 },
    E: { speed: 0.4, accel: 0.6 },
    F: { speed: 0.2, accel: 0.5 },
    G: { speed: 0.1, accel: 0.4 },
  };

  const STYLE_APT = {
    S: 1.1,
    A: 1.0,
    B: 0.85,
    C: 0.75,
    D: 0.6,
    E: 0.4,
    F: 0.2,
    G: 0.1,
  };

  const STYLE_CORR = {
    Front: { hp: 0.95, u: 1.0, v: 0.98, w: 0.962, x: 1.0, y: 1.0, z: 0.996 },
    Pace: { hp: 0.89, u: 0.978, v: 0.991, w: 0.975, x: 0.985, y: 1.0, z: 0.996 },
    Late: { hp: 1.0, u: 0.938, v: 0.998, w: 0.994, x: 0.975, y: 1.0, z: 1.0 },
    End: { hp: 0.995, u: 0.931, v: 1.0, w: 1.0, x: 0.945, y: 1.0, z: 0.997 },
  };

  const SURFACE_COND = {
    Turf: {
      Firm: { speed: 0, power: 0, hp: 1 },
      Good: { speed: 0, power: -50, hp: 1 },
      Soft: { speed: 0, power: -50, hp: 1.02 },
      Heavy: { speed: -50, power: -50, hp: 1.02 },
    },
    Dirt: {
      Firm: { speed: 0, power: -100, hp: 1 },
      Good: { speed: 0, power: -50, hp: 1 },
      Soft: { speed: 0, power: -100, hp: 1.01 },
      Heavy: { speed: -50, power: -100, hp: 1.02 },
    },
  };

  const DISTANCE_BUCKETS = [
    { max: 1000, label: 'Sprint' },
    { max: 1200, label: 'Sprint' },
    { max: 1400, label: 'Sprint' },
    { max: 1500, label: 'Mile' },
    { max: 1600, label: 'Mile' },
    { max: 1800, label: 'Mile' },
    { max: 2000, label: 'Medium' },
    { max: 2200, label: 'Medium' },
    { max: 2300, label: 'Medium' },
    { max: 2400, label: 'Medium' },
    { max: 2500, label: 'Long' },
    { max: 2600, label: 'Long' },
    { max: 3000, label: 'Long' },
    { max: 3200, label: 'Long' },
    { max: 3400, label: 'Long' },
    { max: 3600, label: 'Long' },
  ];

  // Replace this list with your curated unique recovery skills.
  const UNIQUE_RECOVERY_SKILLS = [
    { id: 'unique_35', name: 'Unique (3.5%)', base: 0.035 },
    { id: 'unique_55', name: 'Unique (5.5%)', base: 0.055 },
    { id: 'unique_75', name: 'Unique (7.5%)', base: 0.075 },
  ];

  const els = {
    speed: document.getElementById('stat-speed'),
    stamina: document.getElementById('stat-stamina'),
    power: document.getElementById('stat-power'),
    guts: document.getElementById('stat-guts'),
    wisdom: document.getElementById('stat-wisdom'),
    distance: document.getElementById('race-distance'),
    surface: document.getElementById('race-surface'),
    condition: document.getElementById('race-condition'),
    style: document.getElementById('race-style'),
    mood: document.getElementById('race-mood'),
    considerProc: document.getElementById('consider-proc'),
    rushingMode: document.getElementById('rushing-mode'),
    aptTurf: document.getElementById('apt-turf'),
    aptDirt: document.getElementById('apt-dirt'),
    aptSprint: document.getElementById('apt-sprint'),
    aptMile: document.getElementById('apt-mile'),
    aptMedium: document.getElementById('apt-medium'),
    aptLong: document.getElementById('apt-long'),
    aptFront: document.getElementById('apt-front'),
    aptPace: document.getElementById('apt-pace'),
    aptLate: document.getElementById('apt-late'),
    aptEnd: document.getElementById('apt-end'),
    whiteCount: document.getElementById('white-count'),
    midCount: document.getElementById('mid-count'),
    goldCount: document.getElementById('gold-count'),
    uniqueSelect: document.getElementById('unique-select'),
    uniqueLevel: document.getElementById('unique-level'),
    uniqueAdd: document.getElementById('unique-add'),
    uniqueList: document.getElementById('unique-list'),
    distanceHint: document.getElementById('distanceHint'),
    statusPill: document.getElementById('statusPill'),
    neededStamina: document.getElementById('neededStamina'),
    actualStamina: document.getElementById('actualStamina'),
    bucketText: document.getElementById('bucketText'),
    procRate: document.getElementById('procRate'),
    rushingRate: document.getElementById('rushingRate'),
    recoveryTotal: document.getElementById('recoveryTotal'),
    extraNote: document.getElementById('extraNote'),
  };

  const uniqueSelections = [];
  const STORAGE_KEY = 'stamina-checker-state';
  let isHydrated = false;

  const AFF_GRADE_CLASSES = [
    'aff-grade-good',
    'aff-grade-average',
    'aff-grade-bad',
    'aff-grade-terrible',
  ];

  const REQUIRED_KEYS = [
    'speed',
    'stamina',
    'power',
    'guts',
    'wisdom',
    'distance',
    'surface',
    'condition',
    'style',
    'mood',
    'considerProc',
    'rushingMode',
    'aptTurf',
    'aptDirt',
    'aptSprint',
    'aptMile',
    'aptMedium',
    'aptLong',
    'aptFront',
    'aptPace',
    'aptLate',
    'aptEnd',
    'whiteCount',
    'midCount',
    'goldCount',
    'uniqueSelect',
    'uniqueLevel',
    'uniqueAdd',
    'uniqueList',
    'distanceHint',
    'statusPill',
    'neededStamina',
    'actualStamina',
    'bucketText',
    'procRate',
    'rushingRate',
    'recoveryTotal',
    'extraNote',
  ];

  function num(value, fallback) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function safeDiv(numerator, denominator, fallback) {
    return denominator === 0 ? fallback : numerator / denominator;
  }

  function safeSqrt(value) {
    return Math.sqrt(Math.max(0, value));
  }

  function log10(value) {
    return Math.log10(value);
  }

  function percent(value) {
    return `${(value * 100).toFixed(2)}%`;
  }

  function getBucketForGrade(grade) {
    switch ((grade || '').toUpperCase()) {
      case 'S':
      case 'A':
        return 'good';
      case 'B':
      case 'C':
        return 'average';
      case 'D':
      case 'E':
      case 'F':
        return 'bad';
      default:
        return 'terrible';
    }
  }

  function updateAptitudeStyles() {
    const selects = [
      els.aptTurf,
      els.aptDirt,
      els.aptSprint,
      els.aptMile,
      els.aptMedium,
      els.aptLong,
      els.aptFront,
      els.aptPace,
      els.aptLate,
      els.aptEnd,
    ];
    selects.forEach((select) => {
      if (!select) return;
      const bucket = getBucketForGrade(select.value);
      AFF_GRADE_CLASSES.forEach((cls) => select.classList.remove(cls));
      select.classList.add(`aff-grade-${bucket}`);
    });
  }

  function updateStyleSelect() {
    if (!els.style) return;
    const classes = ['style-front', 'style-pace', 'style-late', 'style-end'];
    classes.forEach((cls) => els.style.classList.remove(cls));
    const map = {
      Front: 'style-front',
      Pace: 'style-pace',
      Late: 'style-late',
      End: 'style-end',
    };
    els.style.classList.add(map[els.style.value] || 'style-pace');
  }

  function updateMoodSelect() {
    if (!els.mood) return;
    const classes = ['mood-awful', 'mood-bad', 'mood-normal', 'mood-good', 'mood-great'];
    classes.forEach((cls) => els.mood.classList.remove(cls));
    const map = {
      Awful: 'mood-awful',
      Bad: 'mood-bad',
      Normal: 'mood-normal',
      Good: 'mood-good',
      Great: 'mood-great',
    };
    els.mood.classList.add(map[els.mood.value] || 'mood-normal');
  }

  function refreshSelectStyles() {
    updateAptitudeStyles();
    updateStyleSelect();
    updateMoodSelect();
  }

  function readStoredState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function applyStoredState() {
    const state = readStoredState();
    if (!state || typeof state !== 'object') return;

    const values = state.values || {};
    Object.entries(values).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = Boolean(value);
      } else if (value !== null && value !== undefined) {
        el.value = String(value);
      }
    });

    if (Array.isArray(state.uniqueSelections)) {
      uniqueSelections.length = 0;
      state.uniqueSelections.forEach((item) => {
        const skill =
          item && item.id ? UNIQUE_RECOVERY_SKILLS.find((entry) => entry.id === item.id) : null;
        const base = skill?.base ?? item?.base;
        const name = skill?.name ?? item?.name;
        if (!Number.isFinite(base) || !name) return;
        const level = clamp(Math.round(num(item.level, 1)), 1, 6);
        uniqueSelections.push({
          key: `${item.id || name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          id: item.id || skill?.id || '',
          name,
          base,
          level,
        });
      });
    }
  }

  function persistState() {
    if (!isHydrated) return;
    try {
      const values = {};
      document.querySelectorAll('input, select').forEach((el) => {
        if (!el.id) return;
        values[el.id] = el.type === 'checkbox' ? el.checked : el.value;
      });
      const state = {
        values,
        uniqueSelections: uniqueSelections.map((item) => ({
          id: item.id,
          name: item.name,
          base: item.base,
          level: item.level,
        })),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      // ignore storage errors
    }
  }

  function distanceCategory(distance) {
    let label = DISTANCE_BUCKETS[0].label;
    for (const bucket of DISTANCE_BUCKETS) {
      if (distance >= bucket.max) {
        label = bucket.label;
      } else {
        break;
      }
    }
    return label;
  }

  function populateAptSelects() {
    const selects = document.querySelectorAll('[data-apt-select]');
    if (!selects.length) return;
    selects.forEach((select) => {
      select.innerHTML = '';
      APT_GRADES.forEach((grade) => {
        const option = document.createElement('option');
        option.value = grade;
        option.textContent = grade;
        select.appendChild(option);
      });
      const def = select.dataset.default || 'A';
      select.value = def;
    });
  }

  function populateUniqueSelect() {
    if (!els.uniqueSelect) return;
    els.uniqueSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = t('stamina.selectUnique');
    els.uniqueSelect.appendChild(placeholder);

    UNIQUE_RECOVERY_SKILLS.forEach((skill) => {
      const option = document.createElement('option');
      option.value = skill.id;
      option.textContent = `${skill.name}`;
      els.uniqueSelect.appendChild(option);
    });
  }

  function renderUniqueList() {
    if (!els.uniqueList) return;
    els.uniqueList.innerHTML = '';
    if (!uniqueSelections.length) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = t('stamina.noUnique');
      els.uniqueList.appendChild(empty);
      return;
    }

    uniqueSelections.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'unique-item';

      const label = document.createElement('span');
      label.textContent = `${item.name} (Lv ${item.level})`;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = t('common.remove');
      remove.addEventListener('click', () => {
        const index = uniqueSelections.findIndex((entry) => entry.key === item.key);
        if (index >= 0) {
          uniqueSelections.splice(index, 1);
          renderUniqueList();
          update();
        }
      });

      row.appendChild(label);
      row.appendChild(remove);
      els.uniqueList.appendChild(row);
    });
  }

  function addUniqueSkill() {
    if (!els.uniqueSelect || !els.uniqueLevel) return;
    const skillId = els.uniqueSelect.value;
    if (!skillId) return;

    const skill = UNIQUE_RECOVERY_SKILLS.find((entry) => entry.id === skillId);
    if (!skill) return;

    const level = clamp(Math.round(num(els.uniqueLevel.value, 1)), 1, 6);
    uniqueSelections.push({
      key: `${skill.id}-${Date.now()}`,
      id: skill.id,
      name: skill.name,
      base: skill.base,
      level,
    });

    els.uniqueSelect.value = '';
    els.uniqueLevel.value = '1';
    renderUniqueList();
    update();
  }

  function uniqueRecoveryTotal() {
    return uniqueSelections.reduce((sum, item) => {
      const levelFactor = 1 + 0.02 * (Math.max(item.level, 1) - 1);
      return sum + item.base * levelFactor;
    }, 0);
  }

  function setStatus(kind, text) {
    if (!els.statusPill) return;
    els.statusPill.classList.remove('ok', 'warn', 'bad');
    els.statusPill.classList.add(kind);
    els.statusPill.textContent = text;
  }

  function compute() {
    if (missing.length) {
      return { ok: false };
    }
    const speed = num(els.speed.value, 0);
    const stamina = num(els.stamina.value, 0);
    const power = num(els.power.value, 0);
    const guts = num(els.guts.value, 0);
    const wisdom = num(els.wisdom.value, 0);
    const distance = num(els.distance.value, 0);

    if (!Number.isFinite(distance) || distance <= 0) {
      return { ok: false };
    }

    const mood = els.mood.value;
    const style = els.style.value;
    const surface = els.surface.value;
    const condition = els.condition.value;

    const moodMultiplier = MOOD[mood] ?? 1.0;
    const styleCorr = STYLE_CORR[style] ?? STYLE_CORR.Pace;

    const styleAptGrade =
      style === 'Front'
        ? els.aptFront.value
        : style === 'Pace'
          ? els.aptPace.value
          : style === 'Late'
            ? els.aptLate.value
            : els.aptEnd.value;

    const wisdomMultiplier = STYLE_APT[styleAptGrade] ?? 1.0;

    const speedStat = speed * moodMultiplier;
    const staminaStat = stamina * moodMultiplier;
    const powerStat = power * moodMultiplier;
    const gutsStat = guts * moodMultiplier;
    const wisdomStat = wisdom * moodMultiplier * wisdomMultiplier;

    const conditionMods =
      (SURFACE_COND[surface] && SURFACE_COND[surface][condition]) || SURFACE_COND.Turf.Firm;

    const speedValue = speedStat + conditionMods.speed;
    const powerValue = powerStat + conditionMods.power;
    const staminaValue = staminaStat;
    const gutsValue = gutsStat;
    const wisdomValue = wisdomStat;

    const hpCoef = conditionMods.hp;
    const endHpCoef = 1 + 200 / safeSqrt(600 * Math.max(gutsValue, 1e-6));

    const wisdomSafe = Math.max(wisdomValue, 1e-6);
    const skillProcRate = Math.max(100 - 9000 / wisdomSafe, 20) / 100;

    const logValue = log10(0.1 * wisdomSafe + 1);
    const rushingRate = Math.min(logValue > 0 ? (6.5 / logValue) ** 2 / 100 : 1, 1);

    const category = distanceCategory(distance);
    const distAptGrade =
      category === 'Sprint'
        ? els.aptSprint.value
        : category === 'Mile'
          ? els.aptMile.value
          : category === 'Medium'
            ? els.aptMedium.value
            : els.aptLong.value;

    const distApt = DIST_APT[distAptGrade] ?? DIST_APT.A;
    const trackAptGrade = surface === 'Turf' ? els.aptTurf.value : els.aptDirt.value;
    const trackAptMultiplier = TRACK_APT[trackAptGrade] ?? 1.0;

    const baseSpeed = 20 - (distance - 2000) / 1000;
    const baseHp = distance + 0.8 * staminaValue * styleCorr.hp;

    const whiteCount = num(els.whiteCount.value, 0);
    const midCount = num(els.midCount.value, 0);
    const goldCount = num(els.goldCount.value, 0);

    const whitePct = 0.015;
    const midPct = 0.035;
    const goldPct = 0.055;

    const nonUniqueTotal = whitePct * whiteCount + midPct * midCount + goldPct * goldCount;
    const uniqueTotal = uniqueRecoveryTotal();

    const considerProc = els.considerProc.checked ? 1 : 0;
    const nonUniqueScaled = nonUniqueTotal * Math.pow(skillProcRate, considerProc);

    const K33 = 10000 * nonUniqueScaled;
    const K34 = 10000 * uniqueTotal;

    const hpWithRecovery = baseHp * (1 + (K33 + K34) / 10000);

    const wisdomSpeedFactor =
      ((wisdomValue / 5500) * log10(wisdomValue * 0.1) - 0.65 / 2) * 0.01 * baseSpeed;

    const L40 = baseSpeed * styleCorr.v + wisdomSpeedFactor;
    const L41 = safeDiv(distance / 24 / L40, distance / 24 / L40 + 3, 0);
    const L42 = 0.05;

    const B43 = baseSpeed * styleCorr.u + wisdomSpeedFactor;
    const speedBonus = safeSqrt(500 * speedValue) * distApt.speed * 0.002;
    const B47 = baseSpeed * styleCorr.w + speedBonus + wisdomSpeedFactor;
    const B49 = (baseSpeed * (styleCorr.w + 0.01) + speedBonus) * 1.05 + speedBonus;
    const B55 = B49;

    const accelBaseX =
      0.0006 * safeSqrt(500 * powerValue) * styleCorr.x * distApt.accel * trackAptMultiplier;
    const accelBaseY =
      0.0006 * safeSqrt(500 * powerValue) * styleCorr.y * distApt.accel * trackAptMultiplier;
    const accelBaseZ =
      0.0006 * safeSqrt(500 * powerValue) * styleCorr.z * distApt.accel * trackAptMultiplier;

    const B41 = 3.0;
    const C41 = baseSpeed * 0.85;
    const D41 = 24 + accelBaseX;
    const E41 = safeDiv(C41 - B41, D41, 0);
    const F41 = ((B41 + C41) / 2) * E41;
    const G41 = 20 * hpCoef * E41;

    const B42 = baseSpeed * 0.85;
    const C42 = B43;
    const D42 = accelBaseX;
    const termA = safeDiv(C42 - B42, D42, 0);
    const termB = safeDiv(-B42 + safeSqrt(B42 ** 2 + 2 * D42 * (distance / 6 - F41)), D42, 0);
    const E42 = Math.min(termA, termB);
    const F42 = (B42 + (D42 * E42) / 2) * E42;
    const G42 =
      (20 *
        hpCoef *
        (Math.pow(D42 * E42 + B42 - baseSpeed + 12, 3) - Math.pow(B42 - baseSpeed + 12, 3))) /
      (3 * D42) /
      144;

    const F43 = Math.max(distance / 6 - (F41 + F42), 0);
    const E43 = safeDiv(F43, B43, 0);
    const G43 = (20 * hpCoef * Math.pow(B43 - baseSpeed + 12, 2) * E43) / 144;

    const B44 = B42 + D42 * E42;
    const B45 =
      (baseSpeed * styleCorr.v + wisdomSpeedFactor) *
      (1 + L41 * (style === 'Front' ? 0.04 * 0.2 * log10(wisdomValue * 0.1) : -0.055 * L42));
    const C44 = B45;
    const D44 = B44 <= C44 ? accelBaseY : -0.8;
    const E44 = safeDiv(C44 - B44, D44, 0);
    const F44 = ((B44 + C44) / 2) * E44;
    const G44 =
      (20 * hpCoef * (Math.pow(C44 - baseSpeed + 12, 3) - Math.pow(B44 - baseSpeed + 12, 3))) /
      (3 * D44) /
      144;

    const F45 = distance / 2 - F44;
    const E45 = safeDiv(F45, B45, 0);
    const rushMode = els.rushingMode.value;
    const rushValue = rushMode === 'auto' ? rushingRate : num(rushMode, 0);
    const rushConst =
      3 * 0.55 + 6 * 0.45 * 0.55 + 9 * Math.pow(0.45, 2) * 0.55 + 12 * Math.pow(0.45, 3);
    const G45 =
      ((20 * hpCoef * Math.pow(B45 - baseSpeed + 12, 2) * E45) / 144) *
      (1 + (rushValue * rushConst * 0.6) / E45) *
      (style !== 'Front' ? 1 - 0.4 * L42 * L41 : 1);

    const sumG41_45 = G41 + G42 + G43 + G44 + G45;
    const term1 =
      ((distance / 3 - 60) * 20 * hpCoef * endHpCoef * Math.pow(B47 - baseSpeed + 12, 2)) /
      144 /
      B47;
    const term2 =
      20 *
      hpCoef *
      endHpCoef *
      (Math.pow(B49 - baseSpeed + 12, 2) / 144 / B49 -
        Math.pow(B47 - baseSpeed + 12, 2) / 144 / B47);
    const B31 = Math.min(safeDiv(hpWithRecovery - sumG41_45 - term1, term2, 0) + 60, distance / 3);

    const B46 = B45;
    const C46 = B47;
    const D46 = B46 <= C46 ? accelBaseZ : -0.8;
    const E46 = distance / 3 <= B31 ? 0 : safeDiv(C46 - B46, D46, 0);
    const F46 = ((B46 + C46) / 2) * E46;
    const G46 =
      (20 *
        hpCoef *
        endHpCoef *
        (Math.pow(B46 + D46 * E46 - baseSpeed + 12, 3) - Math.pow(B46 - baseSpeed + 12, 3))) /
      (3 * D46) /
      144;

    const F47 = Math.max(distance / 3 - B31 - F46, 0);
    const E47 = safeDiv(F47, B47, 0);
    const G47 = (20 * hpCoef * endHpCoef * Math.pow(B47 - baseSpeed + 12, 2) * E47) / 144;

    const B48 = F46 === 0 ? B45 : B47;
    const C48 = B49;
    const D48 = accelBaseZ;
    const E48 = safeDiv(C48 - B48, D48, 0);
    const F48 = ((B48 + C48) / 2) * E48;
    const G48 =
      (20 *
        hpCoef *
        endHpCoef *
        (Math.pow(B48 + D48 * E48 - baseSpeed + 12, 3) - Math.pow(B48 - baseSpeed + 12, 3))) /
      (3 * D48) /
      144;

    const sumF46_48 = F46 + F47 + F48;
    const sumG41_48 = sumG41_45 + G46 + G47 + G48;
    const G49 = Math.min(
      (((20 * hpCoef * endHpCoef * Math.pow(B49 - baseSpeed + 12, 2)) / 144) *
        (distance / 3 - sumF46_48)) /
        B49,
      hpWithRecovery - sumG41_48
    );
    const E49 = safeDiv(
      G49,
      (20 * hpCoef * endHpCoef * Math.pow(B49 - baseSpeed + 12, 2)) / 144,
      0
    );
    const F49 = B49 * E49;

    const F50 = distance / 3 - (F46 + F47 + F48 + F49);
    const E50 = (-B49 + safeSqrt(B49 ** 2 + 2 * -1.2 * F50)) / -1.2;

    const B54 = B45;
    const C54 = B55;
    const D54 = accelBaseZ;
    const E54 = safeDiv(C54 - B54, D54, 0);
    const F54 = ((B54 + C54) / 2) * E54;
    const G54 =
      (20 *
        hpCoef *
        endHpCoef *
        (Math.pow(B54 + D54 * E54 - baseSpeed + 12, 3) - Math.pow(B54 - baseSpeed + 12, 3))) /
      (3 * D54) /
      144;

    const F55 = distance / 3 - F54;
    const E55 = safeDiv(F55, B55, 0);
    const G55 = (20 * hpCoef * endHpCoef * Math.pow(B55 - baseSpeed + 12, 2) * E55) / 144;

    const G56 = sumG41_45 + (G54 + G55);
    const staminaNeeded =
      staminaValue + (G56 - hpWithRecovery) / 0.8 / styleCorr.hp / (1 + (K33 + K34) / 10000);

    const recoveryTotal = nonUniqueScaled + uniqueTotal;

    return {
      ok: true,
      staminaNeeded,
      staminaValue,
      skillProcRate,
      rushingRate,
      recoveryTotal,
      category,
      distance,
    };
  }

  function update() {
    refreshSelectStyles();
    const result = compute();
    if (!result.ok || !Number.isFinite(result.staminaNeeded)) {
      setStatus('warn', t('common.enterValues'));
      if (els.neededStamina) els.neededStamina.textContent = '-';
      if (els.actualStamina) els.actualStamina.textContent = '-';
      if (els.bucketText) els.bucketText.textContent = '-';
      if (els.procRate) els.procRate.textContent = '-';
      if (els.rushingRate) els.rushingRate.textContent = '-';
      if (els.recoveryTotal) els.recoveryTotal.textContent = '-';
      if (els.distanceHint) els.distanceHint.textContent = '';
      if (els.extraNote) els.extraNote.textContent = '';
      persistState();
      return;
    }

    const staminaNeeded = result.staminaNeeded;
    const staminaValue = result.staminaValue;

    if (els.neededStamina) els.neededStamina.textContent = staminaNeeded.toFixed(2);
    if (els.actualStamina) els.actualStamina.textContent = staminaValue.toFixed(2);
    if (els.bucketText) els.bucketText.textContent = result.category;
    if (els.procRate) els.procRate.textContent = percent(result.skillProcRate);
    if (els.rushingRate) els.rushingRate.textContent = percent(result.rushingRate);
    if (els.recoveryTotal) els.recoveryTotal.textContent = percent(result.recoveryTotal);

    if (els.distanceHint) {
      els.distanceHint.textContent = t('stamina.distanceBucketHint', { category: result.category });
    }

    if (staminaValue + 1 < staminaNeeded) {
      setStatus('bad', t('common.notEnough'));
      const short = Math.max(staminaNeeded - staminaValue, 0).toFixed(1);
      if (els.extraNote) {
        els.extraNote.textContent = t('stamina.needMore', { amount: short });
      }
      persistState();
      return;
    }

    if (staminaNeeded >= 0 && staminaValue / staminaNeeded < 1.1) {
      setStatus('warn', t('common.borderline'));
      if (els.extraNote) {
        els.extraNote.textContent = t('stamina.borderlineNote');
      }
      persistState();
      return;
    }

    setStatus('ok', t('common.enough'));
    if (els.extraNote) els.extraNote.textContent = '';
    persistState();
  }

  function wireEvents() {
    const inputs = document.querySelectorAll('input, select');
    inputs.forEach((el) => {
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, update);
    });

    if (els.uniqueAdd) {
      els.uniqueAdd.addEventListener('click', addUniqueSkill);
    }
  }

  const missing = REQUIRED_KEYS.filter((key) => !els[key]);
  if (missing.length) {
    console.warn('Stamina calc missing elements:', missing.join(', '));
  }

  function init() {
    populateAptSelects();
    populateUniqueSelect();
    applyStoredState();
    renderUniqueList();
    wireEvents();
    refreshSelectStyles();
    isHydrated = true;
    update();
    window.addEventListener('i18n:changed', function () {
      populateUniqueSelect();
      renderUniqueList();
      update();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
