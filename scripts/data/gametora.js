#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_BASE_URL = 'https://gametora.com';
const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', '..', 'public', 'assets');
const DEFAULT_CACHE_DIR = path.join(__dirname, '..', '..', '.cache_gametora');
const DEFAULT_METADATA_PATH = path.join(DEFAULT_CACHE_DIR, 'gametora_metadata.json');
const SKILLS_ALL_PATH = path.join(__dirname, '..', '..', 'public', 'assets', 'skills_all.json');

const USER_AGENT = 'Mozilla/5.0 (compatible; gametora-codex-scraper/2.0)';

// GameTora image URL templates
const GT_SUPPORT_IMG = (id) =>
  `${DEFAULT_BASE_URL}/images/umamusume/supports/support_card_s_${id}.png`;
const GT_CHAR_IMG = (charId, cardId) =>
  `${DEFAULT_BASE_URL}/images/umamusume/characters/thumb/chara_stand_${charId}_${cardId}.png`;

const STAT_NAMES = ['Speed', 'Stamina', 'Power', 'Guts', 'Wit'];

// evrew stat-key → display name
const EVREW_KEY_MAP = Object.freeze({
  sp: 'Speed',
  st: 'Stamina',
  po: 'Power',
  gu: 'Guts',
  in: 'Wit',
  wi: 'Wit',
  sk: 'Skill Pts',
  pt: 'Skill Pts',
  bo: 'Bond',
  bo_ch: 'Bond',
  bo_l: 'Bond',
  bo_r: 'Bond',
  vi: 'Energy',
  en: 'Energy',
  hp: 'Energy',
  mo: 'Motivation',
  fa: 'Fans',
  me: 'Max Energy',
  he: 'Motivation',
});

const RARITY_MAP = { 1: 'R', 2: 'SR', 3: 'SSR' };

// GameTora XOR cipher offsets/keys (reverse-engineered from frontend JS)
const GT_NAME_OFFSET = 86;
const GT_NAME_KEY = 106;
const GT_REWARD_OFFSET = 36;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    what: 'all',
    server: 'global',
    outUma: path.join(DEFAULT_OUTPUT_DIR, 'uma_data.json'),
    outSupports: path.join(DEFAULT_OUTPUT_DIR, 'support_card.json'),
    outSupportHints: path.join(DEFAULT_OUTPUT_DIR, 'support_hints.json'),
    outRaces: path.join(DEFAULT_OUTPUT_DIR, 'races.json'),
    outSkills: SKILLS_ALL_PATH,
    charThumbDir: path.join(DEFAULT_OUTPUT_DIR, 'character_thumbs'),
    supportThumbDir: path.join(DEFAULT_OUTPUT_DIR, 'support_thumbs'),
    metadata: DEFAULT_METADATA_PATH,
    noFetch: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--what') opts.what = argv[++i];
    else if (arg === '--server') opts.server = argv[++i];
    else if (arg === '--out-uma') opts.outUma = argv[++i];
    else if (arg === '--out-supports') opts.outSupports = argv[++i];
    else if (arg === '--out-support-hints') opts.outSupportHints = argv[++i];
    else if (arg === '--out-races') opts.outRaces = argv[++i];
    else if (arg === '--out-skills') opts.outSkills = argv[++i];
    else if (arg === '--char-thumb-dir') opts.charThumbDir = argv[++i];
    else if (arg === '--support-thumb-dir') opts.supportThumbDir = argv[++i];
    else if (arg === '--metadata') opts.metadata = argv[++i];
    else if (arg === '--no-fetch') opts.noFetch = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }
  return opts;
}

function printHelp() {
  console.log(
    [
      'Usage: node scripts/data/gametora.js [options]',
      '',
      'Options:',
      '  --what <skills|uma|supports|races|all>   What to scrape (default: all)',
      '  --server <global|japan>                  Server (default: global)',
      '  --out-uma <path>          Output for character data',
      '  --out-supports <path>     Output for support events',
      '  --out-support-hints <path> Output for support hints',
      '  --out-races <path>        Output for race geometry data',
      '  --out-skills <path>       Output for skills metadata',
      '  --char-thumb-dir <path>   Where to save character thumbnails',
      '  --support-thumb-dir <path> Where to save support thumbnails',
      '  --metadata <path>         Metadata JSON output',
      '  --no-fetch                Use cached JSON only',
    ].join('\n')
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Decrypt a GameTora XOR-encoded string.
 * Encoding: base64(plaintext XOR repeat("k"+key))
 */
function gtDecrypt(encoded, key) {
  if (!encoded || typeof encoded !== 'string') return '';
  const bytes = Buffer.from(encoded, 'base64');
  const keyBytes = Buffer.from(`k${key}`, 'utf8');
  const result = Buffer.alloc(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    result[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
  }
  return result.toString('utf8');
}

function writeJsonFile(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// JSON fetching with cache (mirrors gamewith_skills.js pattern)
// ---------------------------------------------------------------------------

function jsonCachePath(url) {
  const slug = url
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .slice(0, 200);
  // Avoid double .json extension if URL already ends in .json
  const ext = slug.endsWith('.json') ? '' : '.json';
  return path.join(DEFAULT_CACHE_DIR, `${slug}${ext}`);
}

async function fetchJsonCached(url, noFetch = false) {
  const cached = jsonCachePath(url);

  if (noFetch) {
    if (!fs.existsSync(cached)) {
      throw new Error(`--no-fetch: cache miss for ${url}`);
    }
    return JSON.parse(fs.readFileSync(cached, 'utf8'));
  }

  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    ensureDir(DEFAULT_CACHE_DIR);
    fs.writeFileSync(cached, JSON.stringify(data), 'utf8');
    return data;
  } catch (err) {
    if (fs.existsSync(cached)) {
      console.log(`  [cache-fallback] ${url}: ${err.message}`);
      return JSON.parse(fs.readFileSync(cached, 'utf8'));
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Image downloading
// ---------------------------------------------------------------------------

/**
 * Download an image from `url` to `destPath` if it doesn't already exist.
 * Returns true if downloaded, false if skipped (already exists).
 */
async function downloadImage(url, destPath) {
  if (fs.existsSync(destPath)) return false;
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  return true;
}

/**
 * Download thumbnails for a list of items in parallel (concurrency-limited).
 * @param {Array} items - objects with `slug` and `remoteUrl` keys
 * @param {string} destDir - directory to save into
 * @param {boolean} noFetch - skip downloads
 * @returns {{ downloaded: number, skipped: number, failed: number }}
 */
async function downloadThumbs(items, destDir, noFetch) {
  ensureDir(destDir);
  if (noFetch) return { downloaded: 0, skipped: items.length, failed: 0 };

  // Build index of existing files by card-ID prefix so we can detect slug renames.
  // e.g. "102602-mihono-bourbon.png" → prefix "102602"
  const existingByPrefix = new Map();
  for (const f of fs.readdirSync(destDir)) {
    if (!f.endsWith('.png')) continue;
    const dash = f.indexOf('-');
    if (dash > 0) existingByPrefix.set(f.slice(0, dash), f);
  }

  const CONCURRENCY = 8;
  let downloaded = 0,
    skipped = 0,
    failed = 0,
    renamed = 0;
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      const { slug, remoteUrl } = items[i];
      const dest = path.join(destDir, `${slug}.png`);
      if (fs.existsSync(dest)) {
        skipped++;
        continue;
      }
      // If slug changed but card-ID prefix matches an existing file, rename it
      const dash = slug.indexOf('-');
      const prefix = dash > 0 ? slug.slice(0, dash) : '';
      const oldFile = prefix ? existingByPrefix.get(prefix) : null;
      if (oldFile && oldFile !== `${slug}.png`) {
        const oldPath = path.join(destDir, oldFile);
        fs.renameSync(oldPath, dest);
        existingByPrefix.set(prefix, `${slug}.png`);
        renamed++;
        skipped++;
        continue;
      }
      try {
        const did = await downloadImage(remoteUrl, dest);
        if (did) downloaded++;
        else skipped++;
      } catch (err) {
        failed++;
        if (failed <= 5) console.log(`  [thumb] Failed: ${slug} — ${err.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  if (renamed) console.log(`  [thumb] Renamed ${renamed} file(s) for updated slugs`);
  return { downloaded, skipped, failed };
}

// ---------------------------------------------------------------------------
// Manifest loader
// ---------------------------------------------------------------------------

async function loadManifest(noFetch) {
  const url = `${DEFAULT_BASE_URL}/data/manifests/umamusume.json`;
  return fetchJsonCached(url, noFetch);
}

function manifestUrl(manifest, key) {
  const hash = manifest[key];
  if (!hash) return null;
  return `${DEFAULT_BASE_URL}/data/umamusume/${key}.${hash}.json`;
}

async function loadManifestData(manifest, key, noFetch) {
  const url = manifestUrl(manifest, key);
  if (!url) {
    console.log(`  [manifest] No hash for "${key}"`);
    return null;
  }
  return fetchJsonCached(url, noFetch);
}

// ---------------------------------------------------------------------------
// Skill name map (for hint lookups)
// ---------------------------------------------------------------------------

let _skillNameMap = null;

function loadSkillNameMap() {
  if (_skillNameMap) return _skillNameMap;
  _skillNameMap = {};
  if (!fs.existsSync(SKILLS_ALL_PATH)) return _skillNameMap;
  try {
    const all = JSON.parse(fs.readFileSync(SKILLS_ALL_PATH, 'utf8'));
    for (const item of all) {
      if (!item || typeof item !== 'object') continue;
      const sid = item.id || item.skill_id || item.skillId;
      if (sid == null) continue;
      const name = item.name_en || item.enname || item.name || item.jpname || '';
      if (name) _skillNameMap[String(sid)] = name;
    }
  } catch {}
  return _skillNameMap;
}

// ---------------------------------------------------------------------------
// evrew (event reward) decoder
// ---------------------------------------------------------------------------

function formatEvrew(rewardIds, evrew, skillMap) {
  const parts = [];
  for (const rid of rewardIds) {
    const entry = evrew[rid - GT_REWARD_OFFSET];
    if (!entry) continue;
    const [key, val, extra] = entry;
    if (val == null) continue; // skip special markers (e.g. "se" scenario events)
    const label = EVREW_KEY_MAP[key] || key;

    if (key === 'sk') {
      // Skill hint: ["sk", "+1", skillId]
      const skillName = extra ? skillMap[String(extra)] || `Skill#${extra}` : 'Unknown Skill';
      parts.push(`${skillName} hint ${val}`);
    } else if (key === 'bo' && extra) {
      // Bond: ["bo", "+5", charId] — just show as "Bond +5"
      parts.push(`${label} ${val}`);
    } else {
      parts.push(`${label} ${val}`);
    }
  }
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// 1. Sync skills metadata
// ---------------------------------------------------------------------------

async function syncSkillsAll(outPath, noFetch) {
  const manifest = await loadManifest(noFetch);
  const url = manifestUrl(manifest, 'skills');
  if (!url) {
    console.error('[skills] No skills hash in manifest');
    return null;
  }

  const skills = await fetchJsonCached(url, noFetch);
  const arr = Array.isArray(skills) ? skills : skills?.skills || skills?.items || [];
  if (!arr.length) {
    console.error('[skills] Empty skills payload');
    return null;
  }

  writeJsonFile(outPath, arr);
  const officialCount = arr.filter((r) => r && String(r.name_en || '').trim()).length;
  console.log(`[skills] Wrote ${arr.length} skills (${officialCount} official EN names)`);
  return { count: arr.length, officialCount, source: url };
}

// ---------------------------------------------------------------------------
// 2. Build character data from manifest
// ---------------------------------------------------------------------------

async function buildCharacters(outPath, manifest, noFetch, thumbDir) {
  console.log('[character] Loading manifest data...');
  const [charCards, profiles, objectives] = await Promise.all([
    loadManifestData(manifest, 'character-cards', noFetch),
    loadManifestData(manifest, 'char_profiles', noFetch),
    loadManifestData(manifest, 'ura-objectives', noFetch),
  ]);

  if (!charCards || !charCards.length) {
    console.error('[character] No character-cards data');
    return { count: 0 };
  }

  // Build lookup maps
  const profileMap = {};
  if (Array.isArray(profiles)) {
    for (const p of profiles) {
      if (p && p.char_id) profileMap[p.char_id] = p;
    }
  }

  const objectiveMap = {};
  if (Array.isArray(objectives)) {
    for (const o of objectives) {
      if (o && o.obj_id) objectiveMap[o.obj_id] = o;
    }
  }

  // Load training events for characters (using encrypted te_names)
  let eventsByCardId = {};
  try {
    const [charCardEvts, teNamesEn, teNamesJa, evrew] = await Promise.all([
      loadManifestData(manifest, 'training_events/char_card', noFetch),
      loadManifestData(manifest, 'dict/te_names_en', noFetch),
      loadManifestData(manifest, 'dict/te_names_ja', noFetch),
      loadManifestData(manifest, 'dict/evrew', noFetch),
    ]);
    if (charCardEvts && evrew) {
      const skillMap = loadSkillNameMap();
      eventsByCardId = parseTrainingEventsByEntity(
        charCardEvts,
        teNamesEn,
        teNamesJa,
        evrew,
        skillMap
      );
    }
  } catch (err) {
    console.log(`[character] Warning: could not load training events: ${err.message}`);
  }

  const result = [];

  for (const card of charCards) {
    const cardId = card.card_id;
    const name = card.name_en || '';
    if (!name) continue;

    // Title/nickname
    let nickname = card.title_en_gl || card.title || '';
    // Clean bracket prefix e.g. "[Special Dreamer]" → "Special Dreamer"
    nickname = nickname.replace(/^\[(.+)\]$/, '$1').trim();

    // JP name and nickname
    const nameJP = (card.name_jp || '').trim() || null;
    let nicknameJP = (card.title_jp || '').trim();
    nicknameJP = nicknameJP ? nicknameJP.replace(/^\[(.+)\]$/, '$1').trim() : null;

    const slug = card.url_name || `${cardId}-${slugify(name)}`;

    // Stats
    const baseStats = {};
    if (card.base_stats?.length >= 5) {
      baseStats[`${card.rarity || 1}\u2605`] = arrayToStats(card.base_stats);
    }
    if (card.five_star_stats?.length >= 5) {
      baseStats['5\u2605'] = arrayToStats(card.five_star_stats);
    }
    if (card.four_star_stats?.length >= 5) {
      baseStats['4\u2605'] = arrayToStats(card.four_star_stats);
    }

    // Stat bonuses
    const statBonuses = card.stat_bonus?.length >= 5 ? arrayToStats(card.stat_bonus) : {};

    // Aptitudes
    const apt = {};
    if (card.aptitude?.length >= 10) {
      const a = card.aptitude;
      apt.Surface = { Turf: a[0], Dirt: a[1] };
      apt.Distance = { Short: a[2], Mile: a[3], Medium: a[4], Long: a[5] };
      apt.Strategy = { Front: a[6], Pace: a[7], Late: a[8], End: a[9] };
    }

    // Profile data
    const profile = profileMap[card.char_id];
    const enProfile = profile?.en || {};
    const heightCm = enProfile.shoes ? parseHeight(enProfile.shoes) : null;
    const threeSizes = parseThreeSizes(enProfile);

    // Objectives
    const objData = objectiveMap[cardId] || objectiveMap[card.char_id];
    const parsedObjectives = objData ? buildObjectives(objData) : [];

    // Events
    const events = eventsByCardId[cardId] || [];

    result.push({
      UmaKey: nickname ? `${name} :: ${nickname}` : `${name} :: ${slug}`,
      UmaName: name,
      UmaNameJP: nameJP,
      UmaNickname: nickname || null,
      UmaNicknameJP: nicknameJP,
      UmaSlug: slug,
      UmaId: String(cardId),
      UmaServer: card.release_en ? 'global' : 'jp',
      UmaBaseStars: card.rarity || null,
      UmaBaseStats: baseStats,
      UmaStatBonuses: statBonuses,
      UmaAptitudes: apt,
      UmaHeightCm: heightCm,
      UmaThreeSizes: threeSizes,
      UmaObjectives: parsedObjectives,
      UmaEvents: events,
      UmaImage: `/assets/character_thumbs/${slug}.png`,
    });
  }

  writeJsonFile(outPath, result);
  const globalCount = result.filter((r) => r.UmaServer === 'global').length;
  console.log(`[character] Done: ${result.length} character cards (${globalCount} global)`);

  // Download thumbnails
  if (thumbDir) {
    const thumbItems = charCards
      .filter((c) => c.name_en)
      .map((c) => ({
        slug: c.url_name || `${c.card_id}-${slugify(c.name_en)}`,
        remoteUrl: GT_CHAR_IMG(c.char_id, c.card_id),
      }));
    console.log(`[character] Downloading ${thumbItems.length} thumbnails...`);
    const stats = await downloadThumbs(thumbItems, thumbDir, noFetch);
    console.log(
      `[character] Thumbs: ${stats.downloaded} new, ${stats.skipped} cached, ${stats.failed} failed`
    );
  }

  return { count: result.length };
}

function arrayToStats(arr) {
  const out = {};
  for (let i = 0; i < Math.min(STAT_NAMES.length, arr.length); i++) {
    out[STAT_NAMES[i]] = arr[i];
  }
  return out;
}

function slugify(name) {
  return (
    (name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'unknown'
  );
}

function parseHeight(shoesStr) {
  if (!shoesStr) return null;
  // "Left: 23.5cm Right: 23.0cm" — not actual height. Return null.
  return null;
}

function parseThreeSizes(enProfile) {
  // Profile doesn't directly have B/W/H; return empty
  return {};
}

function buildObjectives(objData) {
  const objectives = [];
  for (const obj of objData.objectives || []) {
    const races = obj.races || [];
    const raceNames = races.map((r) => r.name_en || '').filter(Boolean);
    const name = raceNames.length ? raceNames.join(', ') : objectiveFallbackName(obj);
    const turn = obj.turn || 0;
    let year = 'Senior Year';
    if (turn <= 24) year = 'Junior Year';
    else if (turn <= 48) year = 'Classic Year';
    objectives.push({
      ObjectiveName: name,
      Turn: String(turn),
      Time: year,
      ObjectiveCondition: '',
    });
  }
  return objectives;
}

const URA_RACE_TYPE = { 1: 'URA Preliminary', 2: 'URA Semi-Final', 3: 'URA Final' };
const OBJ_GRADE_LABEL = {
  100: 'G1',
  200: 'G2',
  300: 'G3',
  400: 'OP',
  500: 'Pre-OP',
  700: 'Pre-OP',
};

function objectiveFallbackName(obj) {
  // URA Finals (target_type=3, race_type 1/2/3)
  if (obj.target_type === 3 && obj.race_type) {
    return URA_RACE_TYPE[obj.race_type] || `URA Race ${obj.race_type}`;
  }
  // Fan count (cond_type=3)
  if (obj.cond_type === 3 && obj.cond_value) {
    return `Earn ${Number(obj.cond_value).toLocaleString()} fans`;
  }
  // Win count across grade (cond_type=2)
  if (obj.cond_type === 2) {
    const place = formatPlacement(obj.cond_value);
    const count = obj.cond_value_2 || 1;
    const grade = OBJ_GRADE_LABEL[obj.cond_id] || '?';
    const suffix = grade !== 'G1' ? ' or higher' : '';
    return `${place} in ${count} ${grade}${suffix} race${count !== 1 ? 's' : ''}`;
  }
  return `Objective ${obj.order ?? '?'}`;
}

function formatPlacement(val) {
  if (!val || val === 0) return 'Participate';
  if (val === 1) return 'Place 1st';
  return `Place ${val}${val === 2 ? 'nd' : val === 3 ? 'rd' : 'th'} or better`;
}

// ---------------------------------------------------------------------------
// Training event name decoder — decrypts te_names with XOR cipher
// ---------------------------------------------------------------------------

/**
 * Decode an event name index using te_names arrays.
 * Prefers EN; falls back to JA if EN is missing or identical to JA (untranslated).
 */
function decodeEventName(nameIdx, teNamesEn, teNamesJa) {
  const adjustedIdx = nameIdx - GT_NAME_OFFSET;
  const encodedEn = teNamesEn?.[adjustedIdx];
  const encodedJa = teNamesJa?.[adjustedIdx];

  const nameEn = encodedEn ? gtDecrypt(encodedEn, GT_NAME_KEY) : '';
  const nameJa = encodedJa ? gtDecrypt(encodedJa, GT_NAME_KEY) : '';

  // Prefer EN name, fall back to JA
  return nameEn || nameJa || `Event #${nameIdx}`;
}

// ---------------------------------------------------------------------------
// Training events parser with per-entity grouping
// ---------------------------------------------------------------------------

function parseTrainingEventsByEntity(rawEntries, teNamesEn, teNamesJa, evrew, skillMap) {
  const result = {};

  for (const entry of rawEntries) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const entityId = entry[0];
    const events = entry[1];
    if (!Array.isArray(events)) continue;

    const entityEvents = [];

    for (let ei = 0; ei < events.length; ei++) {
      const evt = events[ei];
      if (!Array.isArray(evt) || evt.length < 2) continue;

      const nameIdx = evt[0];
      const eventName = decodeEventName(nameIdx, teNamesEn, teNamesJa);
      const choiceData = evt[1];
      if (!Array.isArray(choiceData)) continue;

      const choices = choiceData.filter((c) => Array.isArray(c) && Array.isArray(c[1]));

      if (choices.length === 0) {
        entityEvents.push({ EventName: eventName, EventOptions: { '': 'See details' } });
        continue;
      }

      const options = {};
      if (choices.length === 1) {
        const rewards = formatEvrew(choices[0][1] || [], evrew, skillMap);
        options[''] = rewards || 'See details';
      } else {
        for (let ci = 0; ci < choices.length; ci++) {
          const label = ci === 0 ? 'Top Option' : ci === 1 ? 'Bottom Option' : `Option ${ci + 1}`;
          const rewards = formatEvrew(choices[ci][1] || [], evrew, skillMap);
          options[label] = rewards || 'See details';
        }
      }

      entityEvents.push({ EventName: eventName, EventOptions: options });
    }

    result[entityId] = entityEvents;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Support card effect parser
// ---------------------------------------------------------------------------

/**
 * Parse a card's effects array into readable format with level breakpoints.
 * Each effect entry: [type_id, val_lv1, val_lv5, val_lv10, ..., val_lv50]
 * -1 means "interpolate between surrounding defined values".
 */
const EFFECT_LEVELS = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

function parseCardEffects(effectsArr, effectTypeLookup) {
  if (!Array.isArray(effectsArr) || !effectsArr.length) return [];

  const result = [];
  for (const row of effectsArr) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const typeId = row[0];
    const rawValues = row.slice(1); // up to 11 level values

    // Collect defined breakpoints (non -1 values)
    const breakpoints = [];
    for (let i = 0; i < rawValues.length; i++) {
      if (rawValues[i] !== -1) breakpoints.push({ i, v: rawValues[i] });
    }

    // Interpolate -1 values between defined breakpoints
    const values = new Array(rawValues.length).fill(0);
    for (let i = 0; i < rawValues.length; i++) {
      if (rawValues[i] !== -1) {
        values[i] = rawValues[i];
        continue;
      }
      let prev = null, next = null;
      for (const bp of breakpoints) {
        if (bp.i <= i) prev = bp;
        if (bp.i > i && !next) next = bp;
      }
      if (!prev) {
        values[i] = 0; // before first defined value
      } else if (!next) {
        values[i] = prev.v; // after last defined value
      } else {
        // linear interpolation between surrounding breakpoints
        const prevLv = EFFECT_LEVELS[prev.i];
        const nextLv = EFFECT_LEVELS[next.i];
        const curLv = EFFECT_LEVELS[i];
        values[i] = Math.floor(prev.v + (next.v - prev.v) * (curLv - prevLv) / (nextLv - prevLv));
      }
    }

    const info = effectTypeLookup[typeId] || { name: `Effect #${typeId}`, symbol: '' };
    result.push({
      id: typeId,
      name: info.name,
      symbol: info.symbol,
      values,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// 3. Build support data from manifest
// ---------------------------------------------------------------------------

async function buildSupports(outEventsPath, outHintsPath, manifest, noFetch, thumbDir) {
  console.log('[support] Loading manifest data...');
  const [supportCards, teNamesEn, teNamesJa, evrew, supportEffectsDef] = await Promise.all([
    loadManifestData(manifest, 'support-cards', noFetch),
    loadManifestData(manifest, 'dict/te_names_en', noFetch),
    loadManifestData(manifest, 'dict/te_names_ja', noFetch),
    loadManifestData(manifest, 'dict/evrew', noFetch),
    loadManifestData(manifest, 'support_effects', noFetch),
  ]);

  if (!supportCards || !supportCards.length) {
    console.error('[support] No support-cards data');
    return { cards: 0, hints: 0, events: 0 };
  }

  // Build support effect type lookup: id → { name, symbol }
  const effectTypeLookup = {};
  if (Array.isArray(supportEffectsDef)) {
    for (const eff of supportEffectsDef) {
      if (eff && eff.id != null) {
        effectTypeLookup[eff.id] = {
          name: eff.name_en || eff.name || `Effect #${eff.id}`,
          symbol: eff.symbol || '',
        };
      }
    }
  }
  console.log(`[support] Loaded ${Object.keys(effectTypeLookup).length} effect type definitions`);

  const skillMap = loadSkillNameMap();

  // Load training events for SSR + SR supports (with JA fallback)
  let eventsBySupport = {};
  try {
    const [ssrEvts, srEvts] = await Promise.all([
      loadManifestData(manifest, 'training_events/ssr', noFetch),
      loadManifestData(manifest, 'training_events/sr', noFetch),
    ]);
    const allEvts = [...(ssrEvts || []), ...(srEvts || [])];
    if (allEvts.length && evrew) {
      eventsBySupport = parseTrainingEventsByEntity(allEvts, teNamesEn, teNamesJa, evrew, skillMap);
    }
  } catch (err) {
    console.log(`[support] Warning: could not load training events: ${err.message}`);
  }

  // Build hints and events
  const hints = [];
  const allEvents = [];
  const eventSet = new Set();

  for (const card of supportCards) {
    const supId = card.support_id;
    const charName = card.char_name || '';
    const rarity = RARITY_MAP[card.rarity] || 'UNKNOWN';
    const slug = card.url_name || `${supId}-${slugify(charName)}`;
    const displayName = charName ? `${charName} (${rarity})` : `Support #${supId} (${rarity})`;
    const charNameJP = (card.name_jp || '').trim();
    const displayNameJP = charNameJP ? `${charNameJP} (${rarity})` : null;

    // Hints
    const hintSkills = card.hints?.hint_skills || [];
    const hintOthers = card.hints?.hint_others || [];
    const parsedHints = [];

    for (const sid of hintSkills) {
      const skillName = skillMap[String(sid)] || '';
      parsedHints.push({ SkillId: String(sid), Name: skillName, HintLevel: null });
    }
    for (const other of hintOthers) {
      if (other && typeof other === 'object') {
        // hint_others entries: {hint_type, hint_value}
        // These are non-skill hints (stat bonuses, training effects, etc.)
        // We'll include them with descriptive names
        const hintType = other.hint_type;
        const hintValue = other.hint_value;
        const name = describeHintOther(hintType, hintValue);
        if (name) parsedHints.push({ SkillId: '', Name: name, HintLevel: null });
      }
    }

    // Support type (speed/stamina/power/guts/intelligence/friend/group → display name)
    const typeRaw = card.type || '';
    const SUPPORT_TYPE_MAP = {
      speed: 'Speed',
      stamina: 'Stamina',
      power: 'Power',
      guts: 'Guts',
      intelligence: 'Wit',
      friend: 'Friend',
      group: 'Group',
    };
    const supportType = SUPPORT_TYPE_MAP[typeRaw] || typeRaw || 'Unknown';

    // Parse card effects with level breakpoints
    const parsedEffects = parseCardEffects(card.effects, effectTypeLookup);

    // Parse unique effect
    let parsedUnique = null;
    if (card.unique && Array.isArray(card.unique.effects) && card.unique.effects.length) {
      parsedUnique = {
        level: card.unique.level || 0,
        effects: card.unique.effects.map((u) => {
          const info = effectTypeLookup[u.type] || { name: `Effect #${u.type}`, symbol: '' };
          return { id: u.type, name: info.name, symbol: info.symbol, value: u.value };
        }),
      };
    }

    hints.push({
      SupportSlug: slug,
      SupportId: String(supId),
      SupportName: displayName,
      SupportNameJP: displayNameJP,
      SupportRarity: rarity,
      SupportServer: card.release_en ? 'global' : 'jp',
      SupportType: supportType,
      SupportEffects: parsedEffects,
      SupportUnique: parsedUnique,
      SupportImage: `/assets/support_thumbs/${slug}.png`,
      SupportHints: parsedHints,
    });

    // Events for this support
    const events = eventsBySupport[supId] || [];
    for (const evt of events) {
      const key = `${evt.EventName}|${JSON.stringify(evt.EventOptions)}`;
      if (!eventSet.has(key)) {
        eventSet.add(key);
        allEvents.push(evt);
      }
    }
  }

  writeJsonFile(outHintsPath, hints);
  writeJsonFile(outEventsPath, allEvents);

  const totalHints = hints.reduce((sum, h) => sum + h.SupportHints.length, 0);
  console.log(
    `[support] Done: ${hints.length} cards, ${totalHints} hints, ${allEvents.length} events`
  );

  // Download thumbnails
  if (thumbDir) {
    const thumbItems = supportCards.map((c) => ({
      slug: c.url_name || `${c.support_id}-${slugify(c.char_name)}`,
      remoteUrl: GT_SUPPORT_IMG(c.support_id),
    }));
    console.log(`[support] Downloading ${thumbItems.length} thumbnails...`);
    const stats = await downloadThumbs(thumbItems, thumbDir, noFetch);
    console.log(
      `[support] Thumbs: ${stats.downloaded} new, ${stats.skipped} cached, ${stats.failed} failed`
    );
  }

  return { cards: hints.length, hints: totalHints, events: allEvents.length };
}

function describeHintOther(type, value) {
  // hint_type values observed in the data — map to descriptive names
  // These are non-skill bonuses provided by support cards
  const descriptions = {
    1: 'Initial Speed bonus',
    2: 'Initial Stamina bonus',
    3: 'Initial Power bonus',
    4: 'Initial Guts bonus',
    5: 'Initial Wit bonus',
    6: 'Speed training bonus',
    7: 'Stamina training bonus',
    8: 'Power training bonus',
    9: 'Guts training bonus',
    10: 'Wit training bonus',
  };
  return descriptions[type] || null;
}

// ---------------------------------------------------------------------------
// 4. Build race data from manifest
// ---------------------------------------------------------------------------

// NOTE: GameTora's racetracks manifest swaps Tokyo and Nakayama relative to
// the in-game racecourse_master IDs. Track 10005 in the manifest groups the
// Nakayama courses (310 m final straight) and track 10006 groups the Tokyo
// courses (525 m). Matching the manifest is the only way to get correct
// labels on Tokyo Yushun, Arima Kinen, etc. without rewriting upstream data.
const TRACK_VENUE_JP = Object.freeze({
  10001: '\u672d\u5e4c',
  10002: '\u51fd\u9928',
  10003: '\u798f\u5cf6',
  10004: '\u65b0\u6f5f',
  10005: '\u4e2d\u5c71',
  10006: '\u6771\u4eac',
  10007: '\u4e2d\u4eac',
  10008: '\u4eac\u90fd',
  10009: '\u962a\u795e',
  10010: '\u5c0f\u5009',
  10101: '\u5927\u4e95',
  10102: '\u5ddd\u5d0e',
  10103: '\u8239\u6a4b',
  10104: '\u76db\u5ca1',
  10105: '\u4f50\u8cc0',
  10201: '\u30ed\u30f3\u30b7\u30e3\u30f3',
  10202: '\u30b5\u30f3\u30bf\u30a2\u30cb\u30bf\u30d1\u30fc\u30af',
  10203: '\u30c7\u30eb\u30de\u30fc',
});

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseSegments(raw) {
  const segments = [];
  for (const item of raw || []) {
    const start = toFiniteNumber(item?.start);
    const end = toFiniteNumber(item?.end);
    if (start == null || end == null || end <= start) continue;
    segments.push({ start: Math.round(start), end: Math.round(end) });
  }
  segments.sort((a, b) => (a.start !== b.start ? a.start - b.start : a.end - b.end));
  return segments;
}

function mergeRanges(ranges) {
  if (!ranges.length) return [];
  const merged = [];
  let cur = [ranges[0][0], ranges[0][1]];
  for (let i = 1; i < ranges.length; i += 1) {
    const next = ranges[i];
    if (next[0] <= cur[1] + 1) cur[1] = Math.max(cur[1], next[1]);
    else {
      merged.push(cur);
      cur = [next[0], next[1]];
    }
  }
  merged.push(cur);
  return merged;
}

function parseSlopes(raw, uphill) {
  const ranges = [];
  for (const item of raw || []) {
    const slope = toFiniteNumber(item?.slope);
    const start = toFiniteNumber(item?.start);
    const end = toFiniteNumber(item?.end);
    if (slope == null || start == null || end == null || end <= start) continue;
    if (uphill && slope <= 0) continue;
    if (!uphill && slope >= 0) continue;
    ranges.push([Math.round(start), Math.round(end)]);
  }
  ranges.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]));
  return mergeRanges(ranges);
}

function deriveLs(course, distance) {
  const spurtStart = toFiniteNumber(course?.spurtStart?.meters);
  if (spurtStart != null) return Math.round(spurtStart);
  if (distance != null) return Math.floor((distance * 2) / 3);
  return null;
}

function deriveFinalCornerStart(corners, ls) {
  if (!corners.length || ls == null) return null;
  const containing = corners.find((corner) => ls >= corner.start && ls <= corner.end);
  if (containing) return containing.start;
  const after = corners.find((corner) => corner.start >= ls);
  if (after) return after.start;
  return corners[corners.length - 1].start;
}

function deriveFinalStraightStart(straights, fc, ls) {
  if (!straights.length) return null;
  if (fc != null) {
    const afterCorner = straights.find((straight) => straight.start >= fc);
    if (afterCorner) return afterCorner.start;
  }
  if (ls != null) {
    const afterLs = straights.find((straight) => straight.start >= ls);
    if (afterLs) return afterLs.start;
    const containing = straights.find((straight) => ls >= straight.start && ls <= straight.end);
    if (containing) return containing.start;
  }
  return straights[straights.length - 1].start;
}

function collectRaceInstances(raceInstances) {
  const byRaceId = new Map();
  if (!Array.isArray(raceInstances)) return byRaceId;

  for (const row of raceInstances) {
    if (!row || typeof row !== 'object') continue;
    const details = row.details || {};
    const raceId = toFiniteNumber(details.id);
    if (raceId == null) continue;
    if (!byRaceId.has(raceId)) byRaceId.set(raceId, []);
    byRaceId.get(raceId).push({
      year: toFiniteNumber(row.year),
      month: toFiniteNumber(row.month),
      half: toFiniteNumber(row.half),
    });
  }
  return byRaceId;
}

async function buildRaces(outPath, manifest, noFetch) {
  console.log('[races] Loading manifest data...');
  const [racesRaw, racetracksRaw, raceInstancesRaw] = await Promise.all([
    loadManifestData(manifest, 'races', noFetch),
    loadManifestData(manifest, 'racetracks', noFetch),
    loadManifestData(manifest, 'race_instances', noFetch),
  ]);

  if (!Array.isArray(racesRaw) || !racesRaw.length) {
    console.error('[races] No races data');
    return { count: 0 };
  }
  if (!Array.isArray(racetracksRaw) || !racetracksRaw.length) {
    console.error('[races] No racetracks data');
    return { count: 0 };
  }

  const coursesById = new Map();
  for (const track of racetracksRaw) {
    const trackId = toFiniteNumber(track?.id);
    if (trackId == null) continue;
    for (const course of track?.courses || []) {
      const courseId = toFiniteNumber(course?.id);
      if (courseId == null) continue;
      coursesById.set(courseId, { trackId, course });
    }
  }

  const raceInstancesById = collectRaceInstances(raceInstancesRaw);
  const rows = [];

  for (const race of racesRaw) {
    if (!race || typeof race !== 'object') continue;
    const id = toFiniteNumber(race.id);
    const raceId = toFiniteNumber(race.race_id);
    const distance = toFiniteNumber(race.distance);
    const trackId = toFiniteNumber(race.track);
    const courseId = toFiniteNumber(race.course_id);
    if (id == null || distance == null || trackId == null) continue;

    const bundle = courseId != null ? coursesById.get(courseId) : null;
    const course = bundle ? bundle.course : null;
    const corners = parseSegments(course?.corners);
    const straights = parseSegments(course?.straights);
    const ls = deriveLs(course, distance);
    const fc = deriveFinalCornerStart(corners, ls);
    const fs = deriveFinalStraightStart(straights, fc, ls);
    const us = parseSlopes(course?.slopes, true);
    const ds = parseSlopes(course?.slopes, false);

    const terrain = toFiniteNumber(race.terrain);
    const venue = TRACK_VENUE_JP[trackId] || `Track ${trackId}`;

    rows.push({
      id: Math.round(id),
      race_id: raceId == null ? null : Math.round(raceId),
      name: race.name_jp || race.name_en || `Race ${Math.round(id)}`,
      name_en: race.name_en || race.name_jp || `Race ${Math.round(id)}`,
      venue,
      track_id: Math.round(trackId),
      course_id: courseId == null ? null : Math.round(courseId),
      distance: Math.round(distance),
      gt: terrain === 2 ? 2 : 1,
      ls,
      fc,
      fs,
      us,
      ds,
      terrain: terrain == null ? null : Math.round(terrain),
      grade: toFiniteNumber(race.grade),
      group: toFiniteNumber(race.group),
      season: toFiniteNumber(race.season),
      entries: toFiniteNumber(race.entries),
      instances: raceInstancesById.get(Math.round(id)) || [],
    });
  }

  rows.sort((a, b) => {
    if (a.track_id !== b.track_id) return a.track_id - b.track_id;
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.id - b.id;
  });

  writeJsonFile(outPath, rows);
  console.log(`[races] Done: ${rows.length} race presets`);
  return { count: rows.length };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const validWhat = ['skills', 'uma', 'supports', 'races', 'all'];
  if (!validWhat.includes(opts.what)) {
    console.error(`Invalid --what value: ${opts.what}. Must be one of: ${validWhat.join(', ')}`);
    process.exit(1);
  }

  ensureDir(path.dirname(opts.metadata));

  const metadata = {
    scraped_at_utc: new Date().toISOString(),
    server: opts.server,
    what: opts.what,
    results: {},
  };

  try {
    // Always load manifest first (except for skills-only, which loads its own)
    let manifest = null;
    if (opts.what !== 'skills') {
      console.log('Loading manifest...');
      manifest = await loadManifest(opts.noFetch);
      console.log(`Manifest loaded (${Object.keys(manifest).length} entries)`);
    }

    if (opts.what === 'skills' || opts.what === 'all') {
      console.log('\n=== Skills Metadata ===');
      metadata.results.skills = await syncSkillsAll(opts.outSkills, opts.noFetch);
    }

    if (opts.what === 'uma' || opts.what === 'all') {
      console.log('\n=== Characters ===');
      metadata.results.characters = await buildCharacters(
        opts.outUma,
        manifest,
        opts.noFetch,
        opts.charThumbDir
      );
    }

    if (opts.what === 'supports' || opts.what === 'all') {
      console.log('\n=== Support Cards ===');
      metadata.results.supports = await buildSupports(
        opts.outSupports,
        opts.outSupportHints,
        manifest,
        opts.noFetch,
        opts.supportThumbDir
      );
    }

    if (opts.what === 'races' || opts.what === 'all') {
      console.log('\n=== Races ===');
      metadata.results.races = await buildRaces(opts.outRaces, manifest, opts.noFetch);
    }
  } catch (err) {
    console.error(`[fatal] ${err.message}`);
    process.exit(2);
  }

  writeJsonFile(opts.metadata, metadata);
  console.log(`\nMetadata written to ${opts.metadata}`);
}

main().catch((err) => {
  console.error('Failed to run GameTora scraper.');
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
