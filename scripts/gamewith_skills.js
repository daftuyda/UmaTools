#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DEFAULT_SOURCE_URL = 'https://gamewith.jp/uma-musume/article/show/279309';
const DEFAULT_HTML_CACHE = path.join(__dirname, '..', '.cache_gamewith', 'gamewith_279309.html');
const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'assets');
const DEFAULT_METADATA_PATH = path.join(
  __dirname,
  '..',
  '.cache_gamewith',
  'gamewith_metadata.json'
);
const SKILLS_ALL_PATH = path.join(__dirname, '..', 'assets', 'skills_all.json');

const APTITUDE_ID_TO_JP = Object.freeze({
  1: '芝',
  2: 'ダート',
  3: '短距離',
  4: 'マイル',
  5: '中距離',
  6: '長距離',
  7: '逃げ',
  8: '先行',
  9: '差し',
  10: '追込',
});

const APTITUDE_ID_TO_EN = Object.freeze({
  1: 'Turf',
  2: 'Dirt',
  3: 'Sprint',
  4: 'Mile',
  5: 'Medium',
  6: 'Long',
  7: 'Front',
  8: 'Pace',
  9: 'Late',
  10: 'End',
});

const AFFINITY_ROLE_BY_ID = Object.freeze({
  1: 'Turf',
  2: 'Dirt',
  3: 'Sprint',
  4: 'Mile',
  5: 'Medium',
  6: 'Long',
  7: 'Front',
  8: 'Pace',
  9: 'Late',
  10: 'End',
});

const APTITUDE_IDS = Object.freeze(Object.keys(APTITUDE_ID_TO_JP));
const DISTANCE_IDS = new Set(['3', '4', '5', '6']);
const STYLE_IDS = new Set(['7', '8', '9', '10']);

const BUCKETS = Object.freeze(['SA', 'BC', 'DEF', 'G']);
const GRADE_BUCKET_TO_ID = Object.freeze({
  SA: 1,
  BC: 2,
  DEF: 3,
  G: 4,
});

const GRADE_ID_TO_MULTIPLIER = Object.freeze({
  0: 1,
  1: 1.1,
  2: 0.9,
  3: 0.8,
  4: 0.7,
});

function parseArgs(argv) {
  const opts = {
    url: DEFAULT_SOURCE_URL,
    html: null,
    out: DEFAULT_OUTPUT_DIR,
    metadata: DEFAULT_METADATA_PATH,
    noFetch: false,
    fullOutput: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url') {
      opts.url = argv[++i];
    } else if (arg === '--html') {
      opts.html = argv[++i];
    } else if (arg === '--out') {
      opts.out = argv[++i];
    } else if (arg === '--metadata') {
      opts.metadata = argv[++i];
    } else if (arg === '--no-fetch') {
      opts.noFetch = true;
    } else if (arg === '--full-output') {
      opts.fullOutput = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelpAndExit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printHelpAndExit(1);
    }
  }

  return opts;
}

function printHelpAndExit(code) {
  console.log(
    [
      'Usage:',
      '  node scripts/gamewith_skills.js [--url <url>] [--html <path>] [--out <dir>] [--metadata <path>] [--no-fetch] [--full-output]',
      '',
      'Notes:',
      '  - --html uses a local HTML snapshot instead of fetching.',
      '  - --metadata controls where gamewith_metadata.json is written.',
      '  - --no-fetch forces cached/local HTML usage only.',
      '  - default output is minimal (uma_skills.csv, uma_skills_jp.csv + gamewith_metadata.json).',
      '  - --full-output writes all debug/analysis files.',
    ].join('\n')
  );
  process.exit(code);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function loadHtml(opts) {
  if (opts.html) {
    return {
      html: fs.readFileSync(path.resolve(opts.html), 'utf8'),
      source: `local:${path.resolve(opts.html)}`,
    };
  }

  if (opts.noFetch) {
    if (!fs.existsSync(DEFAULT_HTML_CACHE)) {
      throw new Error(`--no-fetch was set, but cache file is missing: ${DEFAULT_HTML_CACHE}`);
    }
    return {
      html: fs.readFileSync(DEFAULT_HTML_CACHE, 'utf8'),
      source: `cache:${DEFAULT_HTML_CACHE}`,
    };
  }

  try {
    const res = await fetch(opts.url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; gw-codex-scraper/1.0)',
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const html = await res.text();
    ensureDir(path.dirname(DEFAULT_HTML_CACHE));
    fs.writeFileSync(DEFAULT_HTML_CACHE, html, 'utf8');
    return {
      html,
      source: `remote:${opts.url}`,
    };
  } catch (err) {
    if (!fs.existsSync(DEFAULT_HTML_CACHE)) {
      throw err;
    }
    return {
      html: fs.readFileSync(DEFAULT_HTML_CACHE, 'utf8'),
      source: `cache-fallback:${DEFAULT_HTML_CACHE}`,
    };
  }
}

function extractWindowAssignmentExpr(html, name, nextName) {
  const prefix = `window.${name}=`;
  const start = html.indexOf(prefix);
  if (start < 0) {
    throw new Error(`Could not find assignment: ${prefix}`);
  }
  const exprStart = start + prefix.length;

  let exprEnd = -1;
  if (nextName) {
    const nextPrefix = `window.${nextName}=`;
    exprEnd = html.indexOf(nextPrefix, exprStart);
  } else {
    const doubleSemi = html.indexOf(';;', exprStart);
    if (doubleSemi >= 0) {
      const closeBracket = html.lastIndexOf(']', doubleSemi);
      if (closeBracket > exprStart) {
        exprEnd = closeBracket + 1;
      }
    }
    if (exprEnd < 0) {
      const scriptEnd = html.indexOf('</script>', exprStart);
      if (scriptEnd >= 0) {
        const semi = html.lastIndexOf(';', scriptEnd);
        if (semi > exprStart) {
          exprEnd = semi;
        }
      }
    }
  }

  if (exprEnd < 0) {
    throw new Error(`Could not find end of assignment for window.${name}`);
  }

  let expr = html.slice(exprStart, exprEnd).trim();
  if (expr.endsWith(';')) {
    expr = expr.slice(0, -1);
  }
  return expr;
}

function parseEmbeddedSimulatorData(html) {
  const extractionOrder = [
    ['skillDatas', 'over1200LernDatas'],
    ['over1200LernDatas', 'evoSkillDatas'],
    ['evoSkillDatas', 'umaDatas'],
    ['umaDatas', 'scenarioDatas'],
    ['scenarioDatas', null],
  ];

  const sandbox = { window: {} };
  for (const [name, nextName] of extractionOrder) {
    const expr = extractWindowAssignmentExpr(html, name, nextName);
    vm.runInNewContext(`window.${name}=${expr}`, sandbox, { timeout: 5000 });
  }

  return {
    skillDatas: sandbox.window.skillDatas || [],
    over1200LernDatas: sandbox.window.over1200LernDatas || [],
    evoSkillDatas: sandbox.window.evoSkillDatas || [],
    umaDatas: sandbox.window.umaDatas || [],
    scenarioDatas: sandbox.window.scenarioDatas || [],
  };
}

function toInt(value) {
  const num = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(num) ? num : null;
}

function splitNumericList(value) {
  return String(value ?? '')
    .split(',')
    .map((x) => toInt(x))
    .filter((x) => x !== null);
}

function splitCodeList(value) {
  return String(value ?? '')
    .split('/')
    .map((x) => x.trim())
    .filter(Boolean);
}

function stripCircleSuffix(name) {
  return String(name ?? '')
    .replace(/[◯〇○◎]\?/g, '')
    .replace(/[◯〇○◎]$/g, '')
    .trim();
}

function expandSkillData(rawSkillDatas) {
  const expanded = [];

  for (const row of rawSkillDatas) {
    const apParts = splitNumericList(row.ap);
    const ptParts = splitNumericList(row.pt);

    if (String(row.ap ?? '').includes(',')) {
      const baseName = stripCircleSuffix(row.n);
      const singleName = `${baseName}○`;
      const doubleName = `${baseName}◎`;

      const single = {
        ...row,
        n: singleName,
        ap: apParts[0] ?? 0,
        pt: ptParts[0] ?? null,
      };
      expanded.push(single);

      const double = {
        ...row,
        n: doubleName,
        ap: (apParts[0] ?? 0) + (apParts[1] ?? 0),
        pt: ptParts[1] ?? ptParts[0] ?? null,
        p: singleName,
      };
      expanded.push(double);
    } else {
      expanded.push({
        ...row,
        ap: apParts[0] ?? 0,
        pt: ptParts[0] ?? null,
      });
    }
  }

  expanded.forEach((skill, idx) => {
    skill.id = idx + 1;
    skill.appropriate = splitCodeList(skill.r);
    skill.appropriate2 = splitCodeList(skill.r2);
  });

  const firstIdByName = new Map();
  for (const skill of expanded) {
    if (!firstIdByName.has(skill.n)) {
      firstIdByName.set(skill.n, skill.id);
    }
  }

  for (const skill of expanded) {
    if (!skill.p) {
      continue;
    }

    const parentId = firstIdByName.get(String(skill.p));
    if (!parentId) {
      skill.p = null;
      continue;
    }

    skill.p = parentId;
    if (String(skill.c) === '2') {
      const parent = expanded[parentId - 1];
      skill.ap = (toInt(skill.ap) ?? 0) + (toInt(parent.ap) ?? 0);
    }
  }

  return expanded;
}

function buildEvoSkillData(rawEvoSkillDatas, expandedBaseSkills) {
  const byName = new Map();
  for (const skill of expandedBaseSkills) {
    if (!byName.has(skill.n)) {
      byName.set(skill.n, skill);
    }
  }

  const evoSkills = [];
  for (let i = 0; i < rawEvoSkillDatas.length; i += 1) {
    const row = rawEvoSkillDatas[i];
    const beforeName = String(row.sb || '');
    const beforeSkill = byName.get(beforeName) || null;

    evoSkills.push({
      id: expandedBaseSkills.length + i + 1,
      n: String(row.sa || ''),
      k: '',
      c: '2',
      t: beforeSkill ? String(beforeSkill.t ?? '') : '1',
      in: beforeSkill ? beforeSkill.in || '' : '',
      ap: toInt(row.sp) ?? 0,
      pt: '',
      p: beforeSkill ? beforeSkill.id : '',
      appropriate: splitCodeList(row.r),
      appropriate2: splitCodeList(row.r2),
      is_evo: true,
      evo_before_name: beforeName,
    });
  }

  return evoSkills;
}

function normalizeSkillNameStrict(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\uFE0E|\uFE0F/g, '')
    .replace(/[’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—―ーｰ]/g, '-')
    .replace(/[◯〇]/g, '○')
    .replace(/○\?/g, '○')
    .replace(/◎\?/g, '◎')
    .replace(/\s+/g, '')
    .trim();
}

function normalizeSkillNameLoose(value) {
  return normalizeSkillNameStrict(value)
    .replace(/[!?？！☆★♪♡♥❤#＃『』「」()（）［］【】・･,，.。…~～;；:：∴]/g, '')
    .toLowerCase();
}

function addIndexEntry(map, key, value) {
  if (!key) {
    return;
  }
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(value);
}

function createEmptyNameIndexes() {
  return {
    jpStrict: new Map(),
    jpLoose: new Map(),
    enStrict: new Map(),
    enLoose: new Map(),
  };
}

function addNameToIndexes(indexes, jpName, lookupNames, outputName) {
  if (!outputName) {
    return;
  }

  const jpStrict = normalizeSkillNameStrict(jpName || '');
  const jpLoose = normalizeSkillNameLoose(jpName || '');
  addIndexEntry(indexes.jpStrict, jpStrict, outputName);
  addIndexEntry(indexes.jpLoose, jpLoose, outputName);

  for (const lookupName of lookupNames || []) {
    if (!lookupName) {
      continue;
    }
    addIndexEntry(indexes.enStrict, normalizeSkillNameStrict(lookupName), outputName);
    addIndexEntry(indexes.enLoose, normalizeSkillNameLoose(lookupName), outputName);
  }
}

function buildEnglishIndexes(skillsAllPath) {
  const raw = fs.readFileSync(skillsAllPath, 'utf8');
  const all = JSON.parse(raw);

  const official = createEmptyNameIndexes();
  const unofficial = createEmptyNameIndexes();

  for (const row of all) {
    const jp = row.jpname || '';
    const officialEnglish = (row.name_en || '').trim();
    const unofficialEnglish = (row.enname || '').trim();
    const enNames = [row.name_en || '', row.enname || ''].filter(Boolean);

    addNameToIndexes(official, jp, enNames, officialEnglish);
    addNameToIndexes(unofficial, jp, enNames, unofficialEnglish);
  }

  return { official, unofficial };
}

function pickBestEnglishName(values) {
  const list = Array.from(values);
  list.sort((a, b) => {
    if (a.length !== b.length) {
      return a.length - b.length;
    }
    return a.localeCompare(b, 'en');
  });
  return list[0];
}

function resolveEnglishName(jpSkillName, indexes) {
  const strict = normalizeSkillNameStrict(jpSkillName);
  const loose = normalizeSkillNameLoose(jpSkillName);

  const checks = [
    ['jp_strict', indexes.jpStrict.get(strict)],
    ['en_strict', indexes.enStrict.get(strict)],
    ['jp_loose', indexes.jpLoose.get(loose)],
    ['en_loose', indexes.enLoose.get(loose)],
  ];

  for (const [matchType, values] of checks) {
    if (!values || values.size === 0) {
      continue;
    }
    return {
      englishName: pickBestEnglishName(values),
      matchType,
      candidateCount: values.size,
    };
  }

  return {
    englishName: null,
    matchType: 'unmatched',
    candidateCount: 0,
  };
}

function createDefaultAptitudeSelection(defaultGradeId = 1) {
  const selection = {};
  for (const id of APTITUDE_IDS) {
    selection[APTITUDE_ID_TO_JP[id]] = defaultGradeId;
  }
  return selection;
}

function getMultiplierForAptitudeId(selection, aptitudeId) {
  const aptName = APTITUDE_ID_TO_JP[aptitudeId];
  if (!aptName) {
    return undefined;
  }
  const gradeId = selection[aptName];
  return GRADE_ID_TO_MULTIPLIER[gradeId];
}

function computeSkillRatios(selection, appropriateIds, appropriate2Ids) {
  const ratios = [];
  const filtered = (appropriateIds || []).filter((id) => id !== '1' && id !== '2');

  if (filtered.length === 1) {
    const mult = getMultiplierForAptitudeId(selection, filtered[0]);
    if (mult !== undefined) {
      ratios.push(mult);
    }
  }

  if (filtered.length > 1) {
    const distanceMults = [];
    for (const id of ['3', '4', '5', '6']) {
      if (filtered.includes(id)) {
        const mult = getMultiplierForAptitudeId(selection, id);
        if (mult !== undefined) {
          distanceMults.push(mult);
        }
      }
    }

    const styleMults = [];
    for (const id of ['7', '8', '9', '10']) {
      if (filtered.includes(id)) {
        const mult = getMultiplierForAptitudeId(selection, id);
        if (mult !== undefined) {
          styleMults.push(mult);
        }
      }
    }

    if (distanceMults.length) {
      ratios.push(Math.max(...distanceMults));
    }
    if (styleMults.length) {
      ratios.push(Math.max(...styleMults));
    }
  }

  if ((appropriate2Ids || []).length > 0) {
    let hasSA = false;
    for (const id of ['3', '4', '5', '6', '7', '8', '9', '10']) {
      if ((appropriate2Ids || []).includes(id)) {
        const aptName = APTITUDE_ID_TO_JP[id];
        if (selection[aptName] === 1) {
          hasSA = true;
        }
      }
    }
    if (hasSA) {
      ratios.push(GRADE_ID_TO_MULTIPLIER[1]);
    }
  }

  return ratios;
}

function applyRatios(baseValue, ratios) {
  return ratios.reduce((acc, ratio) => Math.round(acc * ratio), baseValue);
}

function buildSummaryValues(skill) {
  const relevantFormulaIds = Array.from(
    new Set(
      [...(skill.appropriate || []), ...(skill.appropriate2 || [])].filter(
        (id) => DISTANCE_IDS.has(id) || STYLE_IDS.has(id)
      )
    )
  );

  const summary = {};
  for (const bucket of BUCKETS) {
    const selection = createDefaultAptitudeSelection(1);
    const gradeId = GRADE_BUCKET_TO_ID[bucket];
    for (const id of relevantFormulaIds) {
      selection[APTITUDE_ID_TO_JP[id]] = gradeId;
    }
    const ratios = computeSkillRatios(selection, skill.appropriate, skill.appropriate2);
    summary[bucket] = applyRatios(skill.ap, ratios);
  }

  const uniqueValues = Array.from(new Set(Object.values(summary))).sort((a, b) => a - b);

  return {
    relevantFormulaIds,
    valuesByBucket: summary,
    uniqueValues,
  };
}

function buildPerAptitudeRows(skill, englishName, matchType) {
  const listedRelevant = new Set([...(skill.appropriate || []), ...(skill.appropriate2 || [])]);
  const formulaRelevant = new Set(
    [...listedRelevant].filter((id) => DISTANCE_IDS.has(id) || STYLE_IDS.has(id))
  );

  const rows = [];
  for (const aptitudeId of APTITUDE_IDS) {
    const aptitudeJp = APTITUDE_ID_TO_JP[aptitudeId];
    const aptitudeEn = APTITUDE_ID_TO_EN[aptitudeId];

    for (const bucket of BUCKETS) {
      const selection = createDefaultAptitudeSelection(1);
      selection[aptitudeJp] = GRADE_BUCKET_TO_ID[bucket];

      const ratios = computeSkillRatios(selection, skill.appropriate, skill.appropriate2);
      const value = applyRatios(skill.ap, ratios);

      rows.push({
        skill_id: skill.id,
        skill_jp: skill.n,
        skill_en: englishName || '',
        english_match_type: matchType,
        aptitude_id: aptitudeId,
        aptitude_jp: aptitudeJp,
        aptitude_en: aptitudeEn,
        grade_bucket: bucket,
        value,
        base_value: skill.ap,
        listed_relevant: listedRelevant.has(aptitudeId) ? 1 : 0,
        formula_relevant: formulaRelevant.has(aptitudeId) ? 1 : 0,
        applied_ratios: ratios.join('*'),
        appropriate_ids: (skill.appropriate || []).join('/'),
        appropriate2_ids: (skill.appropriate2 || []).join('/'),
      });
    }
  }

  return rows;
}

function buildGroupMatrixRows(skill, englishName, matchType) {
  const distanceIds = (skill.appropriate || []).filter((id) => DISTANCE_IDS.has(id));
  const styleIds = (skill.appropriate || []).filter((id) => STYLE_IDS.has(id));

  const distanceBuckets = distanceIds.length > 0 ? BUCKETS : ['NA'];
  const styleBuckets = styleIds.length > 0 ? BUCKETS : ['NA'];

  const rows = [];
  for (const distanceBucket of distanceBuckets) {
    for (const styleBucket of styleBuckets) {
      const selection = createDefaultAptitudeSelection(1);

      if (distanceBucket !== 'NA') {
        const gradeId = GRADE_BUCKET_TO_ID[distanceBucket];
        for (const id of distanceIds) {
          selection[APTITUDE_ID_TO_JP[id]] = gradeId;
        }
      }

      if (styleBucket !== 'NA') {
        const gradeId = GRADE_BUCKET_TO_ID[styleBucket];
        for (const id of styleIds) {
          selection[APTITUDE_ID_TO_JP[id]] = gradeId;
        }
      }

      const ratios = computeSkillRatios(selection, skill.appropriate, skill.appropriate2);
      const value = applyRatios(skill.ap, ratios);

      rows.push({
        skill_id: skill.id,
        skill_jp: skill.n,
        skill_en: englishName || '',
        english_match_type: matchType,
        distance_bucket: distanceBucket,
        style_bucket: styleBucket,
        value,
        base_value: skill.ap,
        distance_ids: distanceIds.join('/'),
        style_ids: styleIds.join('/'),
        applied_ratios: ratios.join('*'),
      });
    }
  }

  return rows;
}

function mapSkillType(skill) {
  const ap = Number(skill.ap);
  if (Number.isFinite(ap) && ap < 0) {
    return 'purple';
  }

  if (skill.is_evo) {
    return 'evo';
  }

  const c = String(skill.c ?? '');
  const t = String(skill.t ?? '');

  if (c === '3') {
    return 'ius';
  }
  if (c === '2') {
    return 'gold';
  }

  if (t === '1') {
    return 'yellow';
  }
  if (t === '2') {
    return 'blue';
  }
  if (t === '3') {
    return 'green';
  }
  if (t === '4') {
    return 'red';
  }

  return '';
}

function deriveAffinityRole(skill) {
  const ids = [];
  for (const id of APTITUDE_IDS) {
    if ((skill.appropriate || []).includes(id) || (skill.appropriate2 || []).includes(id)) {
      ids.push(id);
    }
  }

  const formulaRelevant = ids.filter((id) => DISTANCE_IDS.has(id) || STYLE_IDS.has(id));

  let roleIds = formulaRelevant;
  if (!roleIds.length) {
    if (ids.includes('2')) {
      roleIds = ['2'];
    } else if (ids.includes('1')) {
      roleIds = ['1'];
    } else {
      roleIds = [];
    }
  }

  const labels = roleIds.map((id) => AFFINITY_ROLE_BY_ID[id]).filter(Boolean);
  if (!labels.length) {
    return '';
  }
  if (labels.length === 1) {
    return labels[0];
  }
  return labels.join('/');
}

function toFixedOne(value) {
  return `${Number(value).toFixed(1)}`;
}

function splitDelimitedNames(value) {
  return String(value ?? '')
    .split(/[|/]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function writeCsv(filePath, headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function normalizeCSVLookupKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKC');
}

function buildCSVRowLookup(rows) {
  const lookup = new Map();
  function add(name, row) {
    const key = normalizeCSVLookupKey(name);
    if (key && !lookup.has(key)) lookup.set(key, row);
    const strict = normalizeSkillNameStrict(name);
    if (strict && !lookup.has(strict)) lookup.set(strict, row);
  }

  for (const row of rows) {
    add(row.name, row);
    add(row.localized_name, row);
    String(row.alias_name || '')
      .split('|')
      .forEach((alias) => add(alias, row));
  }

  return lookup;
}

function findCSVOverlayForSkill(lookup, skill) {
  const candidates = [skill?.jpname, skill?.name_en, skill?.enname, skill?.name];
  for (const name of candidates) {
    const key = normalizeCSVLookupKey(name);
    if (key && lookup.has(key)) return lookup.get(key);
    const strict = normalizeSkillNameStrict(name);
    if (strict && lookup.has(strict)) return lookup.get(strict);
  }
  return null;
}

function collectEffectTypes(skill) {
  const types = new Set();
  for (const group of skill?.condition_groups || []) {
    for (const effect of group.effects || []) {
      if (effect?.type != null) types.add(effect.type);
    }
  }
  return Array.from(types);
}

function deriveGameToraSkillType(skill, overlay) {
  if (overlay?.skill_type) return overlay.skill_type;

  const rarity = Number(skill?.rarity);
  if (rarity === 6) return 'evo';
  if (rarity === 3 || rarity === 4 || rarity === 5) return 'ius';
  if (rarity === 2) return 'gold';

  const iconid = Number(skill?.iconid);
  if (Number.isFinite(iconid)) {
    if (iconid >= 30000 && iconid < 40000) return 'red';
    if (iconid % 10 === 4) return 'purple';
    if (iconid >= 10000 && iconid < 20000) return 'green';
    const tensDigit = Math.floor((iconid % 100) / 10);
    if (tensDigit === 2) return 'blue';
  }

  const effects = collectEffectTypes(skill);
  if (effects.includes(9)) return 'blue';
  if (
    effects.some(
      (type) =>
        (type >= 1 && type <= 6) || type === 32 || type === 501 || type === 502 || type === 503
    )
  ) {
    return 'green';
  }
  return 'yellow';
}

function fallbackGameToraScore(skill, skillType) {
  if (skillType === 'ius') return 180;
  if (skillType === 'purple') {
    const gradeValueOverrides = new Map([
      [300041, 0],
      [1100011, -500],
      [202141, -174],
      [202181, -174],
    ]);
    const skillId = Number(skill?.id);
    if (gradeValueOverrides.has(skillId)) return gradeValueOverrides.get(skillId);
    const removalCost = Number(skill?.cost);
    if (removalCost >= 100) return -262;
    if (removalCost >= 70) return -174;
    if (removalCost <= 0) return 0;
    return -129;
  }
  if (typeof skill?.cost === 'number') return skill.cost;
  return 0;
}

function addAlias(aliases, value, primaryName) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed === primaryName) return;
  aliases.add(trimmed);
}

function buildGameToraRows(gameWithRows, locale) {
  if (!fs.existsSync(SKILLS_ALL_PATH)) return gameWithRows;

  const skillsAll = JSON.parse(fs.readFileSync(SKILLS_ALL_PATH, 'utf8'));
  if (!Array.isArray(skillsAll) || !skillsAll.length) return gameWithRows;

  const overlayByName = buildCSVRowLookup(gameWithRows);
  const isJp = locale === 'jp';

  return skillsAll.map((skill) => {
    const overlay = findCSVOverlayForSkill(overlayByName, skill);
    const jpName = String(skill?.jpname || '').trim();
    const officialName = String(skill?.name_en || '').trim();
    const fanName = String(skill?.enname || '').trim();
    const fallbackName = String(skill?.name || '').trim();
    const primaryName =
      (isJp
        ? jpName || officialName || fanName || fallbackName
        : officialName || fanName || fallbackName || jpName) ||
      (skill?.id != null ? `Skill #${skill.id}` : '');
    const skillType = deriveGameToraSkillType(skill, overlay);
    const aliases = new Set();

    if (isJp) {
      addAlias(aliases, fanName, primaryName);
      addAlias(aliases, fallbackName, primaryName);
    } else {
      addAlias(aliases, jpName, primaryName);
      addAlias(aliases, fanName, primaryName);
      addAlias(aliases, fallbackName, primaryName);
      addAlias(aliases, overlay?.name, primaryName);
      addAlias(aliases, overlay?.localized_name, primaryName);
    }
    String(overlay?.alias_name || '')
      .split('|')
      .forEach((alias) => addAlias(aliases, alias, primaryName));

    const localizedName = String(officialName || overlay?.localized_name || '').trim();
    let baseValue =
      overlay && overlay.base_value !== ''
        ? overlay.base_value
        : toFixedOne(fallbackGameToraScore(skill, skillType));
    const numericBaseValue = Number(baseValue);
    if (skillType === 'purple' && Number.isFinite(numericBaseValue) && numericBaseValue >= 0) {
      baseValue = toFixedOne(fallbackGameToraScore(skill, skillType));
    }

    return {
      skill_type: skillType,
      name: primaryName,
      alias_name: Array.from(aliases).join('|'),
      localized_name:
        localizedName && (!isJp || localizedName !== primaryName) ? localizedName : '',
      base_value: baseValue,
      S_A: overlay?.S_A || '',
      B_C: overlay?.B_C || '',
      D_E_F: overlay?.D_E_F || '',
      G: overlay?.G || '',
      affinity_role: overlay?.affinity_role || '',
      is_evo: overlay?.is_evo || (skillType === 'evo' ? 1 : 0),
      evo_parents: overlay?.evo_parents || '',
    };
  });
}

function buildGameToraEnRows(gameWithEnRows) {
  return buildGameToraRows(gameWithEnRows, 'en');
}

function buildGameToraJpRows(gameWithJpRows) {
  return buildGameToraRows(gameWithJpRows, 'jp');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(opts.out);
  const metadataPath = path.resolve(opts.metadata);
  ensureDir(outDir);
  ensureDir(path.dirname(metadataPath));

  const { html, source } = await loadHtml(opts);
  const embedded = parseEmbeddedSimulatorData(html);
  const expandedSkills = expandSkillData(embedded.skillDatas);
  const evoSkills = buildEvoSkillData(embedded.evoSkillDatas, expandedSkills);
  const allSkills = [...expandedSkills, ...evoSkills];

  const englishIndexes = buildEnglishIndexes(SKILLS_ALL_PATH);

  const enrichedSkills = [];
  const summaryRows = [];
  const perAptitudeRows = [];
  const groupMatrixRows = [];
  const unmatchedRows = [];
  const finalUmaSkillsRowsEn = [];
  const finalUmaSkillsRowsJp = [];

  for (const skill of allSkills) {
    const officialResolved = resolveEnglishName(skill.n, englishIndexes.official);
    const unofficialResolved = resolveEnglishName(skill.n, englishIndexes.unofficial);
    const resolved = officialResolved.englishName ? officialResolved : unofficialResolved;
    const summary = buildSummaryValues(skill);
    const hasFormulaAptitude = summary.relevantFormulaIds.length > 0;
    const localizedName = officialResolved.englishName || '';
    const unofficialName = unofficialResolved.englishName || '';
    const finalNameEn = localizedName || unofficialName || skill.n;
    const finalNameJp = skill.n;
    const affinityRole = deriveAffinityRole(skill);
    const skillType = mapSkillType(skill);
    const isEvo = Boolean(skill.is_evo);
    const evoParentJpNames = isEvo ? splitDelimitedNames(skill.evo_before_name || '') : [];
    const evoParentEnNames = isEvo
      ? Array.from(
          new Set(
            evoParentJpNames.map(
              (jpName) =>
                resolveEnglishName(jpName, englishIndexes.official).englishName ||
                resolveEnglishName(jpName, englishIndexes.unofficial).englishName ||
                jpName
            )
          )
        )
      : [];
    const aliasNameEn = finalNameJp !== finalNameEn ? finalNameJp : '';
    const aliasNameJp = unofficialName && unofficialName !== finalNameJp ? unofficialName : '';
    const localizedNameJp = localizedName && localizedName !== finalNameJp ? localizedName : '';

    const enriched = {
      id: skill.id,
      skill_jp: skill.n,
      skill_kana: skill.k || '',
      skill_en: resolved.englishName || '',
      skill_en_localized: localizedName || '',
      skill_en_unofficial: unofficialName || '',
      english_match_type: resolved.matchType,
      english_candidate_count: resolved.candidateCount,
      category_code: String(skill.c ?? ''),
      color_code: String(skill.t ?? ''),
      icon_key: skill.in || '',
      base_value: skill.ap,
      skill_point_cost: skill.pt ?? '',
      parent_skill_id: skill.p ?? '',
      appropriate_ids: skill.appropriate || [],
      appropriate2_ids: skill.appropriate2 || [],
      value_sa: summary.valuesByBucket.SA,
      value_bc: summary.valuesByBucket.BC,
      value_def: summary.valuesByBucket.DEF,
      value_g: summary.valuesByBucket.G,
      unique_values: summary.uniqueValues,
      relevant_formula_ids: summary.relevantFormulaIds,
      affinity_role: affinityRole,
      skill_type: skillType,
      is_evo: isEvo,
      evo_before_name: skill.evo_before_name || '',
    };

    enrichedSkills.push(enriched);

    summaryRows.push({
      skill_id: enriched.id,
      skill_jp: enriched.skill_jp,
      skill_en: enriched.skill_en,
      english_match_type: enriched.english_match_type,
      base_value: enriched.base_value,
      value_sa: enriched.value_sa,
      value_bc: enriched.value_bc,
      value_def: enriched.value_def,
      value_g: enriched.value_g,
      unique_values: enriched.unique_values.join('|'),
      category_code: enriched.category_code,
      color_code: enriched.color_code,
      skill_point_cost: enriched.skill_point_cost,
      parent_skill_id: enriched.parent_skill_id,
      appropriate_ids: enriched.appropriate_ids.join('/'),
      appropriate2_ids: enriched.appropriate2_ids.join('/'),
      relevant_formula_ids: enriched.relevant_formula_ids.join('/'),
      is_evo: enriched.is_evo ? 1 : 0,
      evo_before_name: enriched.evo_before_name,
    });

    if (resolved.matchType === 'unmatched') {
      unmatchedRows.push({
        skill_id: enriched.id,
        skill_jp: enriched.skill_jp,
        skill_kana: enriched.skill_kana,
        category_code: enriched.category_code,
        color_code: enriched.color_code,
        base_value: enriched.base_value,
        appropriate_ids: enriched.appropriate_ids.join('/'),
        appropriate2_ids: enriched.appropriate2_ids.join('/'),
        is_evo: enriched.is_evo ? 1 : 0,
        evo_before_name: enriched.evo_before_name,
      });
    }

    perAptitudeRows.push(...buildPerAptitudeRows(skill, resolved.englishName, resolved.matchType));
    groupMatrixRows.push(...buildGroupMatrixRows(skill, resolved.englishName, resolved.matchType));

    finalUmaSkillsRowsEn.push({
      skill_type: skillType,
      name: finalNameEn,
      alias_name: aliasNameEn,
      localized_name: localizedName || '',
      base_value: toFixedOne(skill.ap),
      S_A: hasFormulaAptitude ? toFixedOne(summary.valuesByBucket.SA) : '',
      B_C: hasFormulaAptitude ? toFixedOne(summary.valuesByBucket.BC) : '',
      D_E_F: hasFormulaAptitude ? toFixedOne(summary.valuesByBucket.DEF) : '',
      G: hasFormulaAptitude ? toFixedOne(summary.valuesByBucket.G) : '',
      affinity_role: affinityRole,
      is_evo: isEvo ? 1 : 0,
      evo_parents: evoParentEnNames.join('|'),
    });

    finalUmaSkillsRowsJp.push({
      skill_type: skillType,
      name: finalNameJp,
      alias_name: aliasNameJp,
      localized_name: localizedNameJp,
      base_value: toFixedOne(skill.ap),
      S_A: hasFormulaAptitude ? toFixedOne(summary.valuesByBucket.SA) : '',
      B_C: hasFormulaAptitude ? toFixedOne(summary.valuesByBucket.BC) : '',
      D_E_F: hasFormulaAptitude ? toFixedOne(summary.valuesByBucket.DEF) : '',
      G: hasFormulaAptitude ? toFixedOne(summary.valuesByBucket.G) : '',
      affinity_role: affinityRole,
      is_evo: isEvo ? 1 : 0,
      evo_parents: evoParentJpNames.join('|'),
    });
  }

  const matchedCount = enrichedSkills.filter((x) => x.skill_en).length;
  const unmatchedCount = enrichedSkills.length - matchedCount;
  const gameToraEnRows = buildGameToraEnRows(finalUmaSkillsRowsEn);
  const gameToraJpRows = buildGameToraJpRows(finalUmaSkillsRowsJp);

  const metadata = {
    source_url: opts.url,
    source_used: source,
    scraped_at_utc: new Date().toISOString(),
    raw_skill_count: embedded.skillDatas.length,
    expanded_skill_count: expandedSkills.length,
    evo_skill_count: embedded.evoSkillDatas.length,
    evo_rows_added_to_exports: evoSkills.length,
    total_exported_skill_rows: allSkills.length,
    en_exported_skill_rows: gameToraEnRows.length,
    en_export_source: gameToraEnRows === finalUmaSkillsRowsEn ? 'gamewith' : 'gametora',
    jp_exported_skill_rows: gameToraJpRows.length,
    jp_export_source: gameToraJpRows === finalUmaSkillsRowsJp ? 'gamewith' : 'gametora',
    uma_data_count: embedded.umaDatas.length,
    scenario_data_count: embedded.scenarioDatas.length,
    english_matched_count: matchedCount,
    english_unmatched_count: unmatchedCount,
    english_match_rate: enrichedSkills.length ? matchedCount / enrichedSkills.length : 0,
    aptitude_buckets: BUCKETS,
    simulator_grade_multipliers: GRADE_ID_TO_MULTIPLIER,
    output_mode: opts.fullOutput ? 'full' : 'minimal',
  };

  const umaSkillsHeaders = [
    'skill_type',
    'name',
    'alias_name',
    'localized_name',
    'base_value',
    'S_A',
    'B_C',
    'D_E_F',
    'G',
    'affinity_role',
    'is_evo',
    'evo_parents',
  ];

  writeCsv(path.join(outDir, 'uma_skills.csv'), umaSkillsHeaders, gameToraEnRows);
  writeCsv(path.join(outDir, 'uma_skills_jp.csv'), umaSkillsHeaders, gameToraJpRows);

  const extraOutputFiles = [
    'gamewith_skills_enriched.json',
    'gamewith_skill_value_summary.csv',
    'gamewith_skill_value_by_aptitude.csv',
    'gamewith_skill_value_group_matrix.csv',
    'gamewith_unmatched_skills.csv',
  ];

  if (opts.fullOutput) {
    fs.writeFileSync(
      path.join(outDir, 'gamewith_skills_enriched.json'),
      `${JSON.stringify({ metadata, skills: enrichedSkills }, null, 2)}\n`,
      'utf8'
    );

    writeCsv(
      path.join(outDir, 'gamewith_skill_value_summary.csv'),
      [
        'skill_id',
        'skill_jp',
        'skill_en',
        'english_match_type',
        'base_value',
        'value_sa',
        'value_bc',
        'value_def',
        'value_g',
        'unique_values',
        'category_code',
        'color_code',
        'skill_point_cost',
        'parent_skill_id',
        'appropriate_ids',
        'appropriate2_ids',
        'relevant_formula_ids',
        'is_evo',
        'evo_before_name',
      ],
      summaryRows
    );

    writeCsv(
      path.join(outDir, 'gamewith_skill_value_by_aptitude.csv'),
      [
        'skill_id',
        'skill_jp',
        'skill_en',
        'english_match_type',
        'aptitude_id',
        'aptitude_jp',
        'aptitude_en',
        'grade_bucket',
        'value',
        'base_value',
        'listed_relevant',
        'formula_relevant',
        'applied_ratios',
        'appropriate_ids',
        'appropriate2_ids',
      ],
      perAptitudeRows
    );

    writeCsv(
      path.join(outDir, 'gamewith_skill_value_group_matrix.csv'),
      [
        'skill_id',
        'skill_jp',
        'skill_en',
        'english_match_type',
        'distance_bucket',
        'style_bucket',
        'value',
        'base_value',
        'distance_ids',
        'style_ids',
        'applied_ratios',
      ],
      groupMatrixRows
    );

    writeCsv(
      path.join(outDir, 'gamewith_unmatched_skills.csv'),
      [
        'skill_id',
        'skill_jp',
        'skill_kana',
        'category_code',
        'color_code',
        'base_value',
        'appropriate_ids',
        'appropriate2_ids',
        'is_evo',
        'evo_before_name',
      ],
      unmatchedRows
    );
  } else {
    for (const fileName of extraOutputFiles) {
      const p = path.join(outDir, fileName);
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    }
  }

  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

  console.log(
    [
      `Source: ${source}`,
      `Raw skills: ${metadata.raw_skill_count}`,
      `Expanded skills: ${metadata.expanded_skill_count}`,
      `Evo rows added: ${metadata.evo_rows_added_to_exports}`,
      `Total exported rows: ${metadata.total_exported_skill_rows}`,
      `EN exported rows: ${metadata.en_exported_skill_rows} (${metadata.en_export_source})`,
      `JP exported rows: ${metadata.jp_exported_skill_rows} (${metadata.jp_export_source})`,
      `Output mode: ${metadata.output_mode}`,
      `English matched: ${metadata.english_matched_count}`,
      `English unmatched: ${metadata.english_unmatched_count}`,
      `Output: ${outDir}`,
      `Metadata: ${metadataPath}`,
    ].join('\n')
  );
}

main().catch((err) => {
  console.error('Failed to scrape GameWith skills.');
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
