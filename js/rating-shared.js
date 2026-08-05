// Shared rating and affinity helpers for optimizer + calculator pages.
(function (global) {
  'use strict';

  function normalize(str) {
    return (str || '').toString().trim().toLowerCase();
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

  // GameTora exposes the skill-point cost for removing purple skills, not their
  // rating penalty. Convert those costs to the rating tiers used by the game and
  // by the older GameWith data. Already-normalized negative values are preserved.
  function normalizeSkillRatingValue(value, category, skillName = '') {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return numericValue;
    const normalizedCategory = normalize(category);
    if (normalizedCategory !== 'purple' && normalizedCategory !== 'violet') return numericValue;
    if (numericValue < 0) return numericValue;
    const zeroCostOverrides = {
      'creeping anxiety': 0,
      "feelin' a bit silly": -500,
      "you're not the boss of me!": -174,
      '99 problems': -174,
    };
    const normalizedName = normalize(skillName);
    if (Object.prototype.hasOwnProperty.call(zeroCostOverrides, normalizedName)) {
      return zeroCostOverrides[normalizedName];
    }
    if (numericValue >= 100) return -262;
    if (numericValue >= 70) return -174;
    if (numericValue <= 0) return 0;
    return -129;
  }

  function createAffinityHelpers(cfg) {
    const ROLE_GROUP = Object.freeze({
      turf: 'surface',
      dirt: 'surface',
      sprint: 'distance',
      mile: 'distance',
      medium: 'distance',
      long: 'distance',
      front: 'style',
      pace: 'style',
      late: 'style',
      end: 'style',
    });

    const BUCKET_MULTIPLIER = Object.freeze({
      good: 1.1,
      average: 0.9,
      bad: 0.8,
      terrible: 0.7,
      base: 1.0,
    });

    function updateAffinityStyles() {
      const grades = ['good', 'average', 'bad', 'terrible'];
      Object.values(cfg).forEach((sel) => {
        if (!sel) return;
        const bucket = getBucketForGrade(sel.value);
        grades.forEach((g) => sel.classList.remove(`aff-grade-${g}`));
        sel.classList.add(`aff-grade-${bucket}`);
      });
    }

    function getBucketForSkill(checkType) {
      const ct = normalize(checkType);
      const map = {
        turf: cfg.turf,
        dirt: cfg.dirt,
        sprint: cfg.sprint,
        mile: cfg.mile,
        medium: cfg.medium,
        long: cfg.long,
        front: cfg.front,
        pace: cfg.pace,
        late: cfg.late,
        end: cfg.end,
      };
      const sel = map[ct];
      if (!sel) return 'base';
      return getBucketForGrade(sel.value);
    }

    function getRoleMultiplier(roleKey) {
      const map = {
        turf: cfg.turf,
        dirt: cfg.dirt,
        sprint: cfg.sprint,
        mile: cfg.mile,
        medium: cfg.medium,
        long: cfg.long,
        front: cfg.front,
        pace: cfg.pace,
        late: cfg.late,
        end: cfg.end,
      };
      const sel = map[roleKey];
      if (!sel) return null;
      const bucket = getBucketForGrade(sel.value);
      return BUCKET_MULTIPLIER[bucket] ?? 1.0;
    }

    function evaluateSkillScore(skill) {
      if (typeof skill.score === 'number') return skill.score;
      if (!skill.score || typeof skill.score !== 'object') return 0;
      const baseScore =
        typeof skill.score.base === 'number'
          ? skill.score.base
          : typeof skill.score.good === 'number'
            ? skill.score.good
            : 0;
      const checkTypeRaw = normalize(skill.checkType);
      if (checkTypeRaw && checkTypeRaw.includes('/')) {
        const roles = checkTypeRaw
          .split('/')
          .map((part) => normalize(part))
          .filter(Boolean);
        const groupMax = new Map();
        roles.forEach((roleKey) => {
          const mult = getRoleMultiplier(roleKey);
          if (mult === null) return;
          const group = ROLE_GROUP[roleKey] || roleKey;
          const prev = groupMax.get(group);
          if (prev === undefined || mult > prev) groupMax.set(group, mult);
        });
        if (groupMax.size > 0) {
          let factor = 1.0;
          groupMax.forEach((mult) => {
            factor *= mult;
          });
          return Math.round(baseScore * factor);
        }
      }
      const bucket = getBucketForSkill(skill.checkType);
      const val = skill.score[bucket];
      if (typeof val === 'number') return val;
      return baseScore;
    }

    return {
      normalize,
      getBucketForGrade,
      updateAffinityStyles,
      getBucketForSkill,
      evaluateSkillScore,
    };
  }

  function createRatingEngine({ ratingInputs, ratingDisplays, onChange }) {
    const MAX_STAT_VALUE = 2500;
    // Stat score lookup table, pre-computed from the umakonga formula.
    // Three scoring ranges with different block granularities:
    //   0-1200: 50-pt blocks (25 rates)
    //   1201-2000: 10-pt blocks (81 rates, base 38413 at stat 1200)
    //   2001-2500: 25-pt blocks (rate 183+, base 142796 at stat 2000)
    // Raw per-point values are accumulated then: Math.round(raw / 10).
    const STAT_SCORES = (() => {
      /* eslint-disable no-nested-ternary */
      var R1 = [
        5, 8, 10, 13, 16, 18, 21, 24, 26, 28, 29, 30, 31, 33, 34, 35, 39, 41, 42, 43, 52, 55, 66,
        68, 68,
      ];
      var R2 = [
        79, 80, 81, 83, 84, 85, 86, 88, 89, 90, 92, 93, 94, 96, 97, 98, 100, 101, 102, 103, 105,
        106, 107, 109, 110, 111, 113, 114, 115, 117, 118, 119, 121, 122, 123, 124, 126, 127, 128,
        130, 131, 132, 134, 135, 136, 138, 139, 140, 141, 143, 144, 145, 147, 148, 149, 151, 152,
        153, 155, 156, 157, 159, 160, 161, 162, 164, 165, 166, 168, 169, 170, 172, 173, 174, 176,
        177, 178, 179, 181, 182, 182,
      ];
      var sc = [0],
        raw = 0,
        idx = 0,
        c;
      for (c = 1; c <= 1200; c++) {
        c <= 49 ? (idx = 0) : c <= 99 ? (idx = 1) : c % 50 === 0 && idx++;
        raw += R1[idx];
        sc[c] = Math.round(raw / 10);
      }
      raw = 38413;
      idx = 0;
      for (c = 1201; c <= 2000; c++) {
        c <= 1209 ? (idx = 0) : c <= 1219 ? (idx = 1) : c % 10 === 0 && idx++;
        raw += R2[idx];
        sc[c] = Math.round(raw / 10);
      }
      raw = 142796;
      idx = 0;
      var rate = 183;
      for (c = 2001; c <= MAX_STAT_VALUE; c++) {
        if (idx >= 25) {
          rate++;
          idx = 0;
        }
        raw += rate;
        idx++;
        sc[c] = Math.round(raw / 10);
      }
      /* eslint-enable no-nested-ternary */
      return sc;
    })();
    let lastSkillScore = 0;

    const RATING_SPRITE = {
      url: 'assets/Rank_tex.png',
      version: '20260225',
      sheetWidth: 0,
      sheetHeight: 0,
      activeUrl: '',
      loaded: false,
    };

    const BASE_GAME_RANK_SPRITE_MAP = Object.freeze({
      G: { x: 7, y: 1893, w: 148, h: 149 },
      'G+': { x: 7, y: 1735, w: 148, h: 149 },
      F: { x: 7, y: 1577, w: 148, h: 149 },
      'F+': { x: 7, y: 1419, w: 148, h: 149 },
      E: { x: 7, y: 1261, w: 148, h: 149 },
      'E+': { x: 7, y: 1103, w: 148, h: 149 },
      D: { x: 7, y: 945, w: 148, h: 149 },
      'D+': { x: 7, y: 787, w: 148, h: 149 },
      C: { x: 7, y: 629, w: 148, h: 149 },
      'C+': { x: 7, y: 471, w: 148, h: 149 },
      B: { x: 7, y: 313, w: 148, h: 149 },
      'B+': { x: 165, y: 471, w: 148, h: 149 },
      A: { x: 323, y: 629, w: 148, h: 149 },
      'A+': { x: 481, y: 787, w: 148, h: 149 },
      S: { x: 639, y: 945, w: 148, h: 150 },
      'S+': { x: 797, y: 1103, w: 148, h: 149 },
      SS: { x: 954, y: 1261, w: 149, h: 150 },
      'SS+': { x: 1112, y: 1419, w: 149, h: 149 },
    });

    const HIGH_RANK_SPRITE_GRID = Object.freeze({
      UG: [
        [10, 8],
        [11, 9],
        [12, 10],
        [1, 10],
        [2, 11],
        [3, 12],
        [12, 21],
        [4, 13],
        [11, 21],
        [3, 14],
      ],
      UF: [
        [10, 23],
        [9, 16],
        [8, 16],
        [7, 16],
        [6, 16],
        [5, 16],
        [4, 16],
        [3, 16],
        [2, 16],
        [1, 16],
      ],
      UE: [
        [8, 17],
        [8, 18],
        [8, 19],
        [8, 20],
        [8, 21],
        [8, 22],
        [8, 23],
        [8, 24],
        [7, 17],
        [6, 17],
      ],
      UD: [
        [5, 17],
        [4, 17],
        [3, 17],
        [2, 17],
        [1, 17],
        [7, 18],
        [7, 19],
        [7, 20],
        [7, 21],
        [7, 22],
      ],
      UC: [
        [7, 23],
        [7, 24],
        [6, 18],
        [5, 18],
        [4, 18],
        [3, 18],
        [2, 18],
        [1, 18],
        [6, 19],
        [6, 20],
      ],
      UB: [
        [6, 21],
        [6, 22],
        [6, 23],
        [6, 24],
        [5, 19],
        [4, 19],
        [3, 19],
        [2, 19],
        [1, 19],
        [5, 20],
      ],
      UA: [
        [5, 21],
        [5, 22],
        [5, 23],
        [5, 24],
        [4, 20],
        [3, 20],
        [2, 20],
        [1, 20],
        [4, 21],
        [4, 22],
      ],
      US: [
        [4, 23],
        [4, 24],
        [3, 21],
        [2, 21],
        [1, 21],
        [3, 22],
        [3, 23],
        [3, 24],
        [2, 22],
        [1, 22],
      ],
      LG: [
        [2, 23],
        [2, 24],
        [1, 0],
        [12, 1],
        [11, 1],
        [10, 1],
        [9, 1],
        [8, 1],
        [7, 1],
        [6, 1],
        [5, 1],
        [4, 1],
        [2, 1],
        [1, 1],
        [12, 2],
        [11, 2],
        [10, 2],
        [9, 2],
        [8, 2],
        [7, 2],
        [6, 2],
        [5, 2],
        [3, 2],
        [2, 2],
        [1, 2],
      ],
      LF: [
        [12, 3],
        [11, 3],
        [10, 3],
        [9, 3],
        [8, 3],
        [7, 3],
        [6, 3],
        [4, 3],
        [3, 3],
        [2, 3],
        [1, 3],
        [12, 4],
        [11, 4],
        [10, 4],
        [9, 4],
        [8, 4],
        [7, 4],
        [5, 4],
        [4, 4],
        [3, 4],
        [2, 4],
        [1, 4],
        [12, 5],
        [11, 5],
        [10, 5],
      ],
      LE: [
        [9, 5],
        [8, 5],
        [6, 5],
        [5, 5],
        [4, 5],
        [3, 5],
        [2, 5],
        [1, 5],
        [12, 6],
        [11, 6],
        [10, 6],
        [9, 6],
        [7, 6],
        [6, 6],
        [5, 6],
        [4, 6],
        [3, 6],
        [2, 6],
        [1, 6],
        [12, 7],
        [11, 7],
        [10, 7],
        [8, 7],
        [7, 7],
        [6, 7],
      ],
      LD: [
        [5, 7],
        [4, 7],
        [3, 7],
        [2, 7],
        [1, 7],
        [12, 8],
        [11, 8],
        [9, 8],
        [8, 8],
        [7, 8],
        [6, 8],
        [5, 8],
        [4, 8],
        [3, 8],
        [2, 8],
        [1, 8],
        [12, 9],
        [10, 9],
        [9, 9],
        [8, 9],
        [7, 9],
        [6, 9],
        [5, 9],
        [4, 9],
        [3, 9],
      ],
      LC: [
        [2, 9],
        [1, 9],
        [11, 10],
        [10, 10],
        [9, 10],
        [8, 10],
        [7, 10],
        [6, 10],
        [5, 10],
        [4, 10],
        [3, 10],
        [2, 10],
        [12, 11],
        [11, 11],
        [10, 11],
        [9, 11],
        [8, 11],
        [7, 11],
        [6, 11],
        [5, 11],
        [4, 11],
        [3, 11],
        [1, 11],
        [12, 12],
        [11, 12],
      ],
      LB: [
        [10, 12],
        [9, 12],
        [8, 12],
        [7, 12],
        [6, 12],
        [5, 12],
        [4, 12],
        [2, 12],
        [1, 12],
        [12, 13],
        [12, 14],
        [12, 15],
        [12, 16],
        [12, 17],
        [12, 18],
        [12, 19],
        [12, 20],
        [12, 22],
        [12, 23],
        [12, 24],
        [11, 13],
        [10, 13],
        [9, 13],
        [8, 13],
        [7, 13],
      ],
      LA: [
        [6, 13],
        [5, 13],
        [3, 13],
        [2, 13],
        [1, 13],
        [11, 14],
        [11, 15],
        [11, 16],
        [11, 17],
        [11, 18],
        [11, 19],
        [11, 20],
        [11, 22],
        [11, 23],
        [11, 24],
        [10, 14],
        [9, 14],
        [8, 14],
        [7, 14],
        [6, 14],
        [5, 14],
        [4, 14],
        [2, 14],
        [1, 14],
        [10, 15],
      ],
      LS: [
        [10, 16],
        [10, 17],
        [10, 18],
        [10, 19],
        [10, 20],
        [10, 21],
        [10, 22],
        [10, 24],
        [9, 15],
        [8, 15],
        [7, 15],
        [6, 15],
        [5, 15],
        [4, 15],
        [3, 15],
        [2, 15],
        [1, 15],
        [9, 17],
        [9, 18],
        [9, 19],
        [9, 20],
        [9, 21],
        [9, 22],
        [9, 23],
        [9, 24],
      ],
    });

    const HIGH_RANK_SPRITE_CELL_X = 6;
    const HIGH_RANK_SPRITE_CELL_Y = 155;
    const HIGH_RANK_SPRITE_CELL_STEP = 158;
    const HIGH_RANK_SPRITE_WIDTH = 150;
    const HIGH_RANK_SPRITE_HEIGHT = 153;

    const GAME_RANK_SPRITE_MAP = (() => {
      const map = {
        ...BASE_GAME_RANK_SPRITE_MAP,
      };
      for (const [family, cells] of Object.entries(HIGH_RANK_SPRITE_GRID)) {
        cells.forEach(([row, col], idx) => {
          const label = idx === 0 ? family : `${family}${idx}`;
          map[label] = {
            x: HIGH_RANK_SPRITE_CELL_X + col * HIGH_RANK_SPRITE_CELL_STEP,
            y: HIGH_RANK_SPRITE_CELL_Y + (row - 1) * HIGH_RANK_SPRITE_CELL_STEP,
            w: HIGH_RANK_SPRITE_WIDTH,
            h: HIGH_RANK_SPRITE_HEIGHT,
          };
        });
      }
      return Object.freeze(map);
    })();

    const RATING_BADGE_MINIMA = [
      { min: 0, label: 'G' },
      { min: 300, label: 'G+' },
      { min: 600, label: 'F' },
      { min: 900, label: 'F+' },
      { min: 1300, label: 'E' },
      { min: 1800, label: 'E+' },
      { min: 2300, label: 'D' },
      { min: 2900, label: 'D+' },
      { min: 3500, label: 'C' },
      { min: 4900, label: 'C+' },
      { min: 6500, label: 'B' },
      { min: 8200, label: 'B+' },
      { min: 10000, label: 'A' },
      { min: 12100, label: 'A+' },
      { min: 14500, label: 'S' },
      { min: 15900, label: 'S+' },
      { min: 17500, label: 'SS' },
      { min: 19200, label: 'SS+' },
      { min: 19600, label: 'UG' },
      { min: 20000, label: 'UG1' },
      { min: 20400, label: 'UG2' },
      { min: 20800, label: 'UG3' },
      { min: 21200, label: 'UG4' },
      { min: 21600, label: 'UG5' },
      { min: 22100, label: 'UG6' },
      { min: 22500, label: 'UG7' },
      { min: 23000, label: 'UG8' },
      { min: 23400, label: 'UG9' },
      { min: 23900, label: 'UF' },
      { min: 24300, label: 'UF1' },
      { min: 24800, label: 'UF2' },
      { min: 25300, label: 'UF3' },
      { min: 25800, label: 'UF4' },
      { min: 26300, label: 'UF5' },
      { min: 26800, label: 'UF6' },
      { min: 27300, label: 'UF7' },
      { min: 27800, label: 'UF8' },
      { min: 28300, label: 'UF9' },
      { min: 28800, label: 'UE' },
      { min: 29400, label: 'UE1' },
      { min: 29900, label: 'UE2' },
      { min: 30400, label: 'UE3' },
      { min: 31000, label: 'UE4' },
      { min: 31500, label: 'UE5' },
      { min: 32100, label: 'UE6' },
      { min: 32700, label: 'UE7' },
      { min: 33200, label: 'UE8' },
      { min: 33800, label: 'UE9' },
      { min: 34400, label: 'UD' },
      { min: 35000, label: 'UD1' },
      { min: 35600, label: 'UD2' },
      { min: 36200, label: 'UD3' },
      { min: 36800, label: 'UD4' },
      { min: 37500, label: 'UD5' },
      { min: 38100, label: 'UD6' },
      { min: 38700, label: 'UD7' },
      { min: 39400, label: 'UD8' },
      { min: 40000, label: 'UD9' },
      { min: 40700, label: 'UC' },
      { min: 41300, label: 'UC1' },
      { min: 42000, label: 'UC2' },
      { min: 42700, label: 'UC3' },
      { min: 43400, label: 'UC4' },
      { min: 44000, label: 'UC5' },
      { min: 44700, label: 'UC6' },
      { min: 45400, label: 'UC7' },
      { min: 46200, label: 'UC8' },
      { min: 46900, label: 'UC9' },
      { min: 47600, label: 'UB' },
      { min: 48300, label: 'UB1' },
      { min: 49000, label: 'UB2' },
      { min: 49800, label: 'UB3' },
      { min: 50500, label: 'UB4' },
      { min: 51300, label: 'UB5' },
      { min: 52000, label: 'UB6' },
      { min: 52800, label: 'UB7' },
      { min: 53600, label: 'UB8' },
      { min: 54400, label: 'UB9' },
      { min: 55200, label: 'UA' },
      { min: 55900, label: 'UA1' },
      { min: 56700, label: 'UA2' },
      { min: 57500, label: 'UA3' },
      { min: 58400, label: 'UA4' },
      { min: 59200, label: 'UA5' },
      { min: 60000, label: 'UA6' },
      { min: 60800, label: 'UA7' },
      { min: 61700, label: 'UA8' },
      { min: 62500, label: 'UA9' },
      { min: 63400, label: 'US' },
      { min: 64200, label: 'US1' },
      { min: 65100, label: 'US2' },
      { min: 66400, label: 'US3' },
      { min: 67700, label: 'US4' },
      { min: 69000, label: 'US5' },
      { min: 70300, label: 'US6' },
      { min: 71600, label: 'US7' },
      { min: 72900, label: 'US8' },
      { min: 74400, label: 'US9' },
      { min: 76000, label: 'LG' },
      { min: 76600, label: 'LG1' },
      { min: 77200, label: 'LG2' },
      { min: 77800, label: 'LG3' },
      { min: 78500, label: 'LG4' },
      { min: 79100, label: 'LG5' },
      { min: 79700, label: 'LG6' },
      { min: 80400, label: 'LG7' },
      { min: 81000, label: 'LG8' },
      { min: 81700, label: 'LG9' },
      { min: 82300, label: 'LG10' },
      { min: 83000, label: 'LG11' },
      { min: 83600, label: 'LG12' },
      { min: 84300, label: 'LG13' },
      { min: 84900, label: 'LG14' },
      { min: 85600, label: 'LG15' },
      { min: 86200, label: 'LG16' },
      { min: 86700, label: 'LG17' },
      { min: 87300, label: 'LG18' },
      { min: 87900, label: 'LG19' },
      { min: 88500, label: 'LG20' },
      { min: 89100, label: 'LG21' },
      { min: 89700, label: 'LG22' },
      { min: 90300, label: 'LG23' },
      { min: 90900, label: 'LG24' },
      { min: 91400, label: 'LF' },
      { min: 92000, label: 'LF1' },
      { min: 92600, label: 'LF2' },
      { min: 93200, label: 'LF3' },
      { min: 93800, label: 'LF4' },
      { min: 94400, label: 'LF5' },
      { min: 95000, label: 'LF6' },
      { min: 95600, label: 'LF7' },
      { min: 96300, label: 'LF8' },
      { min: 96900, label: 'LF9' },
      { min: 97500, label: 'LF10' },
      { min: 98000, label: 'LF11' },
      { min: 98500, label: 'LF12' },
      { min: 99000, label: 'LF13' },
      { min: 99600, label: 'LF14' },
      { min: 100100, label: 'LF15' },
      { min: 100600, label: 'LF16' },
      { min: 101100, label: 'LF17' },
      { min: 101700, label: 'LF18' },
      { min: 102200, label: 'LF19' },
      { min: 102700, label: 'LF20' },
      { min: 103200, label: 'LF21' },
      { min: 103800, label: 'LF22' },
      { min: 104300, label: 'LF23' },
      { min: 104800, label: 'LF24' },
      { min: 105400, label: 'LE' },
      { min: 105900, label: 'LE1' },
      { min: 106400, label: 'LE2' },
      { min: 106900, label: 'LE3' },
      { min: 107500, label: 'LE4' },
      { min: 108000, label: 'LE5' },
      { min: 108500, label: 'LE6' },
      { min: 109100, label: 'LE7' },
      { min: 109600, label: 'LE8' },
      { min: 110100, label: 'LE9' },
      { min: 110700, label: 'LE10' },
      { min: 111200, label: 'LE11' },
      { min: 111800, label: 'LE12' },
      { min: 112300, label: 'LE13' },
      { min: 112800, label: 'LE14' },
      { min: 113400, label: 'LE15' },
      { min: 113900, label: 'LE16' },
      { min: 114400, label: 'LE17' },
      { min: 115000, label: 'LE18' },
      { min: 115500, label: 'LE19' },
      { min: 116100, label: 'LE20' },
      { min: 116600, label: 'LE21' },
      { min: 117100, label: 'LE22' },
      { min: 117700, label: 'LE23' },
      { min: 118200, label: 'LE24' },
      { min: 118800, label: 'LD' },
      { min: 119300, label: 'LD1' },
      { min: 119900, label: 'LD2' },
      { min: 120400, label: 'LD3' },
      { min: 121000, label: 'LD4' },
      { min: 121500, label: 'LD5' },
      { min: 122000, label: 'LD6' },
      { min: 122600, label: 'LD7' },
      { min: 123100, label: 'LD8' },
      { min: 123700, label: 'LD9' },
      { min: 124200, label: 'LD10' },
      { min: 124800, label: 'LD11' },
      { min: 125300, label: 'LD12' },
      { min: 125900, label: 'LD13' },
      { min: 126400, label: 'LD14' },
      { min: 127000, label: 'LD15' },
      { min: 127500, label: 'LD16' },
      { min: 128100, label: 'LD17' },
      { min: 128700, label: 'LD18' },
      { min: 129200, label: 'LD19' },
      { min: 129800, label: 'LD20' },
      { min: 130300, label: 'LD21' },
      { min: 130900, label: 'LD22' },
      { min: 131400, label: 'LD23' },
      { min: 132000, label: 'LD24' },
      { min: 132500, label: 'LC' },
      { min: 133100, label: 'LC1' },
      { min: 133700, label: 'LC2' },
      { min: 134200, label: 'LC3' },
      { min: 134800, label: 'LC4' },
      { min: 135300, label: 'LC5' },
      { min: 135900, label: 'LC6' },
      { min: 136500, label: 'LC7' },
      { min: 137000, label: 'LC8' },
      { min: 137600, label: 'LC9' },
      { min: 138100, label: 'LC10' },
      { min: 138700, label: 'LC11' },
      { min: 139300, label: 'LC12' },
      { min: 139800, label: 'LC13' },
      { min: 140400, label: 'LC14' },
      { min: 141000, label: 'LC15' },
      { min: 141500, label: 'LC16' },
      { min: 142100, label: 'LC17' },
      { min: 142700, label: 'LC18' },
      { min: 143200, label: 'LC19' },
      { min: 143800, label: 'LC20' },
      { min: 144400, label: 'LC21' },
      { min: 144900, label: 'LC22' },
      { min: 145500, label: 'LC23' },
      { min: 146100, label: 'LC24' },
      { min: 146600, label: 'LB' },
      { min: 147200, label: 'LB1' },
      { min: 147800, label: 'LB2' },
      { min: 148400, label: 'LB3' },
      { min: 148900, label: 'LB4' },
      { min: 149500, label: 'LB5' },
      { min: 150100, label: 'LB6' },
      { min: 150700, label: 'LB7' },
      { min: 151200, label: 'LB8' },
      { min: 151800, label: 'LB9' },
      { min: 152400, label: 'LB10' },
      { min: 153000, label: 'LB11' },
      { min: 153500, label: 'LB12' },
      { min: 154100, label: 'LB13' },
      { min: 154700, label: 'LB14' },
      { min: 155300, label: 'LB15' },
      { min: 155900, label: 'LB16' },
      { min: 156400, label: 'LB17' },
      { min: 157000, label: 'LB18' },
      { min: 157600, label: 'LB19' },
      { min: 158200, label: 'LB20' },
      { min: 158800, label: 'LB21' },
      { min: 159300, label: 'LB22' },
      { min: 159900, label: 'LB23' },
      { min: 160500, label: 'LB24' },
      { min: 161100, label: 'LA' },
      { min: 161700, label: 'LA1' },
      { min: 162300, label: 'LA2' },
      { min: 162900, label: 'LA3' },
      { min: 163400, label: 'LA4' },
      { min: 164000, label: 'LA5' },
      { min: 164600, label: 'LA6' },
      { min: 165200, label: 'LA7' },
      { min: 165800, label: 'LA8' },
      { min: 166400, label: 'LA9' },
      { min: 167000, label: 'LA10' },
      { min: 167600, label: 'LA11' },
      { min: 168200, label: 'LA12' },
      { min: 168700, label: 'LA13' },
      { min: 169300, label: 'LA14' },
      { min: 169900, label: 'LA15' },
      { min: 170500, label: 'LA16' },
      { min: 171100, label: 'LA17' },
      { min: 171700, label: 'LA18' },
      { min: 172300, label: 'LA19' },
      { min: 172900, label: 'LA20' },
      { min: 173500, label: 'LA21' },
      { min: 174100, label: 'LA22' },
      { min: 174700, label: 'LA23' },
      { min: 175300, label: 'LA24' },
      { min: 175900, label: 'LS' },
      { min: 176500, label: 'LS1' },
      { min: 177100, label: 'LS2' },
      { min: 177700, label: 'LS3' },
      { min: 178300, label: 'LS4' },
      { min: 178900, label: 'LS5' },
      { min: 179500, label: 'LS6' },
      { min: 180100, label: 'LS7' },
      { min: 180700, label: 'LS8' },
      { min: 181300, label: 'LS9' },
      { min: 181900, label: 'LS10' },
      { min: 182500, label: 'LS11' },
      { min: 183100, label: 'LS12' },
      { min: 183700, label: 'LS13' },
      { min: 184300, label: 'LS14' },
      { min: 184900, label: 'LS15' },
      { min: 185500, label: 'LS16' },
      { min: 186200, label: 'LS17' },
      { min: 186800, label: 'LS18' },
      { min: 187400, label: 'LS19' },
      { min: 188000, label: 'LS20' },
      { min: 188600, label: 'LS21' },
      { min: 189200, label: 'LS22' },
      { min: 189800, label: 'LS23' },
      { min: 190400, label: 'LS24' },
    ];

    const RATING_BADGES = RATING_BADGE_MINIMA.map((badge, idx) => {
      const next = RATING_BADGE_MINIMA[idx + 1];
      const sprite = GAME_RANK_SPRITE_MAP[badge.label];
      return {
        threshold: next ? next.min : Infinity,
        label: badge.label,
        ...(sprite ? { sprite } : {}),
      };
    });

    const progressTargets = [
      {
        label: ratingDisplays.nextLabel,
        needed: ratingDisplays.nextNeeded,
        fill: ratingDisplays.progressFill,
        bar: ratingDisplays.progressBar,
      },
      {
        label: ratingDisplays.floatNextLabel,
        needed: ratingDisplays.floatNextNeeded,
        fill: ratingDisplays.floatProgressFill,
        bar: ratingDisplays.floatProgressBar,
      },
    ];

    function clampStatValue(value) {
      if (typeof value !== 'number' || isNaN(value)) return 0;
      return Math.max(0, Math.min(MAX_STAT_VALUE, value));
    }

    function readIntInput(input) {
      if (!input) return 0;
      const raw = parseInt(input.value, 10);
      return isNaN(raw) ? 0 : raw;
    }

    function setInputValue(input, value) {
      if (!input || typeof value !== 'number') return;
      input.value = String(value);
    }

    function getCurrentStarLevel() {
      return readIntInput(ratingInputs.star);
    }

    function getCurrentUniqueLevel() {
      return readIntInput(ratingInputs.unique);
    }

    function calcUniqueBonus(starLevel, uniqueLevel) {
      const lvl = typeof uniqueLevel === 'number' && uniqueLevel > 0 ? uniqueLevel : 0;
      if (!lvl) return 0;
      const multiplier = starLevel === 1 || starLevel === 2 ? 120 : 170;
      return lvl * multiplier;
    }

    function resolveRatingBadgeIndex(totalScore) {
      for (let i = 0; i < RATING_BADGES.length; i++) {
        if (totalScore < RATING_BADGES[i].threshold) return i;
      }
      return RATING_BADGES.length - 1;
    }

    function getRatingBadgeIndex(totalScore) {
      return resolveRatingBadgeIndex(totalScore);
    }

    function getRatingBadge(totalScore) {
      return RATING_BADGES[resolveRatingBadgeIndex(totalScore)];
    }

    function syncBadgeSpriteMetrics(target) {
      if (!target) return { badgeWidth: 0, badgeHeight: 0 };
      const style = typeof getComputedStyle === 'function' ? getComputedStyle(target) : null;
      const cssWidth = style ? parseFloat(style.width) : 0;
      const cssHeight = style ? parseFloat(style.height) : 0;
      const badgeWidth = target.clientWidth || cssWidth || 0;
      const badgeHeight = target.clientHeight || cssHeight || 0;
      return { badgeWidth, badgeHeight };
    }

    function applyBadgeSpriteStyles(target, spriteUrl) {
      if (!target) return;
      target.style.backgroundImage = `url(${spriteUrl})`;
      target.style.backgroundRepeat = 'no-repeat';
      target.style.backgroundPosition = 'center';
      target.style.backgroundSize = 'contain';
    }

    function loadRatingSprite() {
      if (!ratingDisplays.badgeSprite && !ratingDisplays.floatBadgeSprite) return;
      const spriteUrl = RATING_SPRITE.version
        ? `${RATING_SPRITE.url}?v=${RATING_SPRITE.version}`
        : RATING_SPRITE.url;
      const img = new Image();
      img.onload = () => {
        RATING_SPRITE.sheetWidth = img.naturalWidth;
        RATING_SPRITE.sheetHeight = img.naturalHeight;
        RATING_SPRITE.activeUrl = spriteUrl;
        RATING_SPRITE.loaded = true;
        applyBadgeSpriteStyles(ratingDisplays.badgeSprite, spriteUrl);
        applyBadgeSpriteStyles(ratingDisplays.floatBadgeSprite, spriteUrl);
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
        speed: clampStatValue(readIntInput(ratingInputs.speed)),
        stamina: clampStatValue(readIntInput(ratingInputs.stamina)),
        power: clampStatValue(readIntInput(ratingInputs.power)),
        guts: clampStatValue(readIntInput(ratingInputs.guts)),
        wisdom: clampStatValue(readIntInput(ratingInputs.wisdom)),
      };
    }

    function calcStatScore(statValue) {
      return STAT_SCORES[clampStatValue(statValue)];
    }

    function calculateRatingBreakdown(skillScoreOverride) {
      if (typeof skillScoreOverride === 'number' && !isNaN(skillScoreOverride)) {
        lastSkillScore = Math.round(skillScoreOverride);
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
      if (
        RATING_SPRITE.loaded &&
        badge.sprite &&
        RATING_SPRITE.sheetWidth &&
        RATING_SPRITE.sheetHeight
      ) {
        const rect = badge.sprite;
        const { badgeWidth, badgeHeight } = syncBadgeSpriteMetrics(target);
        const renderWidth = badgeWidth || rect.w;
        const renderHeight = badgeHeight || rect.h;
        const scale = Math.min(renderWidth / rect.w, renderHeight / rect.h);
        const scaledSpriteWidth = RATING_SPRITE.sheetWidth * scale;
        const scaledSpriteHeight = RATING_SPRITE.sheetHeight * scale;
        const scaledRectWidth = rect.w * scale;
        const scaledRectHeight = rect.h * scale;
        const offsetX = (renderWidth - scaledRectWidth) / 2 - rect.x * scale;
        const offsetY = (renderHeight - scaledRectHeight) / 2 - rect.y * scale;
        target.style.backgroundImage = RATING_SPRITE.activeUrl
          ? `url(${RATING_SPRITE.activeUrl})`
          : '';
        target.style.backgroundRepeat = 'no-repeat';
        target.style.backgroundSize = `${scaledSpriteWidth}px ${scaledSpriteHeight}px`;
        target.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
        target.textContent = '';
      } else {
        target.style.backgroundImage = 'none';
        target.style.backgroundSize = '';
        target.style.backgroundPosition = '';
        target.textContent = badge.label;
      }
    }

    function updateRatingDisplay(skillScoreOverride) {
      const breakdown = calculateRatingBreakdown(skillScoreOverride);
      if (ratingDisplays.stats) ratingDisplays.stats.textContent = breakdown.statsScore.toString();
      if (ratingDisplays.skills)
        ratingDisplays.skills.textContent = breakdown.skillScore.toString();
      if (ratingDisplays.unique)
        ratingDisplays.unique.textContent = breakdown.uniqueBonus.toString();
      if (ratingDisplays.total) ratingDisplays.total.textContent = breakdown.total.toString();
      if (ratingDisplays.floatTotal)
        ratingDisplays.floatTotal.textContent = breakdown.total.toString();
      const badge = getRatingBadge(breakdown.total);
      updateBadgeSprite(ratingDisplays.badgeSprite, badge);
      updateBadgeSprite(ratingDisplays.floatBadgeSprite, badge);
      const hasProgressTarget = progressTargets.some((t) => t.fill && t.label && t.needed);
      if (hasProgressTarget) {
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
        const labelText = hasNext
          ? typeof window.t === 'function'
            ? window.t('common.nextRank', {
                badge: nextBadge?.label || current.label,
                threshold: nextThreshold,
              })
            : `Next: ${nextBadge?.label || current.label} at ${nextThreshold}`
          : typeof window.t === 'function'
            ? window.t('common.maxRankReached')
            : 'Max rank reached';
        const neededText = hasNext ? `+${needed}` : '';
        const width = `${Math.round(progress * 100)}%`;
        progressTargets.forEach((target) => {
          if (target.fill) target.fill.style.width = width;
          if (target.label) target.label.textContent = labelText;
          if (target.needed) target.needed.textContent = neededText;
          if (target.bar) {
            target.bar.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
          }
        });
      }
    }

    function readRatingState() {
      const stats = readRatingStats();
      return {
        stats,
        star: getCurrentStarLevel(),
        unique: getCurrentUniqueLevel(),
      };
    }

    function getBadgeBreakdown() {
      return RATING_BADGE_MINIMA.map((badge, idx) => {
        const next = RATING_BADGE_MINIMA[idx + 1];
        const sprite = GAME_RANK_SPRITE_MAP[badge.label];
        return {
          label: badge.label,
          min: badge.min,
          max: next ? next.min - 1 : null,
          nextThreshold: next ? next.min : null,
          sprite: sprite ? { ...sprite } : null,
        };
      });
    }

    function getBadgeSpriteSheetInfo() {
      const url = RATING_SPRITE.version
        ? `${RATING_SPRITE.url}?v=${RATING_SPRITE.version}`
        : RATING_SPRITE.url;
      return {
        url,
        version: RATING_SPRITE.version || '',
      };
    }

    function applyRatingState(data) {
      if (!data || typeof data !== 'object') return;
      const stats = data.stats || {};
      setInputValue(ratingInputs.speed, stats.speed);
      setInputValue(ratingInputs.stamina, stats.stamina);
      setInputValue(ratingInputs.power, stats.power);
      setInputValue(ratingInputs.guts, stats.guts);
      setInputValue(ratingInputs.wisdom, stats.wisdom);
      setInputValue(ratingInputs.star, data.star);
      setInputValue(ratingInputs.unique, data.unique);
    }

    function handleRatingInputChange() {
      updateRatingDisplay();
      if (typeof onChange === 'function') onChange();
    }

    function initRatingInputs() {
      Object.values(ratingInputs).forEach((input) => {
        if (!input) return;
        input.addEventListener('input', handleRatingInputChange);
        input.addEventListener('change', handleRatingInputChange);
      });
      updateRatingDisplay();
    }

    return {
      updateRatingDisplay,
      readRatingState,
      applyRatingState,
      initRatingInputs,
      loadRatingSprite,
      getBadgeBreakdown,
      getBadgeSpriteSheetInfo,
    };
  }

  function getRatingBadgeCatalog() {
    const engine = createRatingEngine({
      ratingInputs: {},
      ratingDisplays: {},
      onChange: null,
    });
    return {
      badges: engine.getBadgeBreakdown(),
      sprite: engine.getBadgeSpriteSheetInfo(),
    };
  }

  global.RatingShared = {
    createAffinityHelpers,
    createRatingEngine,
    getRatingBadgeCatalog,
    normalizeSkillRatingValue,
  };
})(window);
