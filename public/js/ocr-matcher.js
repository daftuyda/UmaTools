// OCR Skill Matcher — Advanced fuzzy matching with composite confidence scoring
// and smart suggestions for the Uma Musume skill optimizer.
//
// Features:
//   - Levenshtein edit distance (from existing code, improved)
//   - N-gram (trigram + bigram) similarity for OCR-error tolerance
//   - Token-level matching for multi-word skills
//   - Composite confidence scoring combining multiple signals
//   - Top-N suggestions engine for low-confidence results
//   - Session correction cache
//   - Skill dictionary with type/cost metadata

(function () {
  'use strict';

  // ─── Configuration ───────────────────────────────────────────

  const CONFIDENCE_THRESHOLDS = {
    HIGH: 0.85,
    MEDIUM: 0.7,
    LOW: 0.5, // below this triggers suggestions
  };

  const MAX_SUGGESTIONS = 3;
  const MAX_EDIT_DISTANCE = 3;
  const NGRAM_SIZE_TRI = 3;
  const NGRAM_SIZE_BI = 2;
  const MIN_QUERY_ALPHA = 3; // minimum alphabetic chars to attempt match
  const HINT_DISCOUNTS = { 0: 0.0, 1: 0.1, 2: 0.2, 3: 0.3, 4: 0.35, 5: 0.4 };

  // ─── Session correction cache ─────────────────────────────────

  const correctionCache = new Map(); // rawText -> correctedSkillName

  function addCorrection(rawText, correctedName) {
    if (rawText && correctedName) {
      correctionCache.set(normalizeForMatch(rawText), correctedName);
    }
  }

  function getCorrection(rawText) {
    if (!rawText) return null;
    return correctionCache.get(normalizeForMatch(rawText)) || null;
  }

  function clearCorrections() {
    correctionCache.clear();
  }

  // ─── Text normalization ───────────────────────────────────────

  function normalizeForMatch(str) {
    return (
      (str || '')
        .toString()
        .trim()
        .toLowerCase()
        // Normalize unicode quotes/dashes
        .replace(/[\u2018\u2019\u2032\u0060]/g, "'")
        .replace(/[\u201C\u201D\u2033]/g, '"')
        .replace(/[\u2013\u2014\u2212]/g, '-')
        .replace(/\u00A0/g, ' ')
        // Collapse whitespace
        .replace(/\s+/g, ' ')
        // Strip non-printing / control chars (keep Unicode letters, digits, basic punct)
        .replace(/[^\p{L}\p{N}\s'\-]/gu, '')
        .trim()
    );
  }

  function normalizeOCROutput(rawText) {
    if (!rawText) return '';
    return (
      rawText
        // Normalize unicode
        .replace(/[\u2018\u2019\u2032\u0060]/g, "'")
        .replace(/[\u201C\u201D\u2033]/g, '"')
        .replace(/[\u2013\u2014\u2212]/g, '-')
        .replace(/\u00A0/g, ' ')
        // Pipe -> I (common OCR substitution for this font)
        .replace(/\|/g, 'I')
        // Remove stray symbols that are OCR noise
        .replace(/[©@#*[\]{}~^`\\]/g, '')
        // Collapse repeated spaces
        .replace(/\s{2,}/g, ' ')
        // Strip only control characters (preserve CJK and other Unicode)
        .split('')
        .filter(function (char) {
          var code = char.charCodeAt(0);
          return code > 31 && code !== 127;
        })
        .join('')
        .trim()
    );
  }

  // ─── Levenshtein distance (optimized single-row DP) ──────────

  function levenshtein(a, b) {
    if (!a) return b ? b.length : 0;
    if (!b) return a.length;
    if (a === b) return 0;

    const m = a.length,
      n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    let prev = new Array(n + 1);
    let curr = new Array(n + 1);

    for (let j = 0; j <= n; j++) prev[j] = j;

    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(
          prev[j] + 1, // deletion
          curr[j - 1] + 1, // insertion
          prev[j - 1] + cost // substitution
        );
      }
      [prev, curr] = [curr, prev];
    }

    return prev[n];
  }

  // ─── Damerau-Levenshtein (includes transpositions) ────────────

  function damerauLevenshtein(a, b) {
    if (!a) return b ? b.length : 0;
    if (!b) return a.length;
    if (a === b) return 0;

    const m = a.length,
      n = b.length;
    const d = Array.from({ length: m + 2 }, () => new Array(n + 2).fill(0));

    const maxDist = m + n;
    d[0][0] = maxDist;

    for (let i = 0; i <= m; i++) {
      d[i + 1][0] = maxDist;
      d[i + 1][1] = i;
    }
    for (let j = 0; j <= n; j++) {
      d[0][j + 1] = maxDist;
      d[1][j + 1] = j;
    }

    const da = {};

    for (let i = 1; i <= m; i++) {
      let db = 0;
      for (let j = 1; j <= n; j++) {
        const i1 = da[b[j - 1]] || 0;
        const j1 = db;
        let cost = 1;
        if (a[i - 1] === b[j - 1]) {
          cost = 0;
          db = j;
        }

        d[i + 1][j + 1] = Math.min(
          d[i][j] + cost, // substitution
          d[i + 1][j] + 1, // insertion
          d[i][j + 1] + 1, // deletion
          d[i1][j1] + (i - i1 - 1) + 1 + (j - j1 - 1) // transposition
        );
      }
      da[a[i - 1]] = i;
    }

    return d[m + 1][n + 1];
  }

  // ─── N-gram similarity ────────────────────────────────────────

  function getNgrams(str, n) {
    const grams = new Map();
    if (!str || str.length < n) {
      if (str) grams.set(str, 1);
      return grams;
    }
    for (let i = 0; i <= str.length - n; i++) {
      const gram = str.substring(i, i + n);
      grams.set(gram, (grams.get(gram) || 0) + 1);
    }
    return grams;
  }

  function ngramSimilarity(a, b, n) {
    const gramsA = getNgrams(a, n);
    const gramsB = getNgrams(b, n);

    let intersection = 0;
    let union = 0;

    const allKeys = new Set([...gramsA.keys(), ...gramsB.keys()]);
    for (const key of allKeys) {
      const countA = gramsA.get(key) || 0;
      const countB = gramsB.get(key) || 0;
      intersection += Math.min(countA, countB);
      union += Math.max(countA, countB);
    }

    return union === 0 ? 0 : intersection / union;
  }

  // ─── Token similarity ─────────────────────────────────────────
  // Compares words between query and candidate

  function tokenSimilarity(queryTokens, candidateTokens) {
    if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;

    let matched = 0;
    const used = new Set();

    for (const qt of queryTokens) {
      let bestScore = 0;
      let bestIdx = -1;

      for (let i = 0; i < candidateTokens.length; i++) {
        if (used.has(i)) continue;
        const ct = candidateTokens[i];

        // Exact token match
        if (qt === ct) {
          bestScore = 1.0;
          bestIdx = i;
          break;
        }

        // Prefix match (OCR often truncates)
        if (ct.startsWith(qt) || qt.startsWith(ct)) {
          const prefixScore = Math.min(qt.length, ct.length) / Math.max(qt.length, ct.length);
          if (prefixScore > bestScore) {
            bestScore = prefixScore;
            bestIdx = i;
          }
        }

        // Edit distance within token
        const dist = levenshtein(qt, ct);
        const maxLen = Math.max(qt.length, ct.length);
        const editScore = maxLen > 0 ? 1 - dist / maxLen : 0;
        if (editScore > bestScore) {
          bestScore = editScore;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0 && bestScore >= 0.5) {
        matched += bestScore;
        used.add(bestIdx);
      }
    }

    const maxTokens = Math.max(queryTokens.length, candidateTokens.length);
    return matched / maxTokens;
  }

  // ─── Composite match score ─────────────────────────────────────
  // Combines multiple similarity signals into a single [0..1] score

  function computeMatchScore(queryNorm, candidateNorm) {
    // 1. Edit distance score
    const editDist = damerauLevenshtein(queryNorm, candidateNorm);
    const maxLen = Math.max(queryNorm.length, candidateNorm.length);
    const editScore = maxLen > 0 ? Math.max(0, 1 - editDist / maxLen) : 0;

    // 2. Trigram similarity
    const trigramScore = ngramSimilarity(queryNorm, candidateNorm, NGRAM_SIZE_TRI);

    // 3. Bigram similarity
    const bigramScore = ngramSimilarity(queryNorm, candidateNorm, NGRAM_SIZE_BI);

    // 4. Token-level similarity
    const queryTokens = queryNorm.split(/\s+/).filter(Boolean);
    const candidateTokens = candidateNorm.split(/\s+/).filter(Boolean);
    const tokenScore = tokenSimilarity(queryTokens, candidateTokens);

    // 5. Prefix bonus (OCR often gets the start right)
    const prefixLen = commonPrefixLength(queryNorm, candidateNorm);
    const prefixScore = maxLen > 0 ? prefixLen / maxLen : 0;

    // 6. Length ratio penalty
    const lenRatio =
      Math.min(queryNorm.length, candidateNorm.length) /
      Math.max(queryNorm.length, candidateNorm.length);

    // Weighted combination
    const composite =
      editScore * 0.3 +
      trigramScore * 0.25 +
      bigramScore * 0.1 +
      tokenScore * 0.2 +
      prefixScore * 0.05 +
      lenRatio * 0.1;

    return {
      composite,
      editDist,
      editScore,
      trigramScore,
      bigramScore,
      tokenScore,
      prefixScore,
      lenRatio,
    };
  }

  function commonPrefixLength(a, b) {
    let i = 0;
    const maxI = Math.min(a.length, b.length);
    while (i < maxI && a[i] === b[i]) i++;
    return i;
  }

  // ─── Quality heuristics for OCR text ──────────────────────────

  function ocrTextQuality(text) {
    if (!text) return 0;

    const alphaCount = (text.match(/\p{L}/gu) || []).length;
    const digitCount = (text.match(/\d/g) || []).length;
    const spaceCount = (text.match(/\s/g) || []).length;
    const symbolCount = text.length - alphaCount - digitCount - spaceCount;

    // Penalize text that's mostly digits or symbols
    const alphaRatio = text.length > 0 ? alphaCount / text.length : 0;

    // Skill names are 3-40 chars typically
    const lengthScore =
      text.length >= 3 && text.length <= 50
        ? 1.0
        : text.length < 3
          ? text.length / 3
          : Math.max(0, 1 - (text.length - 50) / 50);

    // Penalize excessive symbols
    const symbolPenalty = Math.max(0, 1 - symbolCount * 0.3);

    // Penalize consecutive same characters (OCR junk like "lllll")
    const consecutiveRuns = (text.match(/(.)\1{2,}/g) || []).length;
    const runPenalty = Math.max(0, 1 - consecutiveRuns * 0.3);

    return alphaRatio * 0.4 + lengthScore * 0.3 + symbolPenalty * 0.15 + runPenalty * 0.15;
  }

  // ─── Composite confidence score ───────────────────────────────
  // Combines OCR quality, match score, and optional image sharpness

  function computeConfidence(matchScore, ocrQuality, ocrEngineConfidence, sharpnessNorm) {
    // matchScore: from computeMatchScore().composite (0..1)
    // ocrQuality: from ocrTextQuality() (0..1)
    // ocrEngineConfidence: Tesseract confidence if available (0..100 -> 0..1)
    // sharpnessNorm: normalized sharpness score (0..1)

    const engineConf =
      typeof ocrEngineConfidence === 'number' ? Math.min(1, ocrEngineConfidence / 100) : null;

    let confidence;

    if (engineConf !== null) {
      // Use OCR engine confidence as primary signal, blend with match score
      confidence =
        engineConf * 0.35 + matchScore * 0.4 + ocrQuality * 0.15 + (sharpnessNorm || 0.5) * 0.1;
    } else {
      // No engine confidence: rely more on match quality
      confidence = matchScore * 0.55 + ocrQuality * 0.25 + (sharpnessNorm || 0.5) * 0.2;
    }

    // Exact match override
    if (matchScore >= 0.999) confidence = Math.max(confidence, 0.98);

    return Math.min(1, Math.max(0, confidence));
  }

  // ─── Skill dictionary ─────────────────────────────────────────

  let skillDict = []; // [{ name, normName, type, tokens, trigrams }]
  let skillDictMap = new Map(); // normName -> dict entry

  function buildSkillDictionary(skills) {
    skillDict = [];
    skillDictMap.clear();

    // Pre-scan: identify ◎/○ pairs so we can merge them
    const circleBaseNames = new Set();
    const doubleCircleNames = new Set();
    for (const skill of skills) {
      const name = (skill.name || '').trim();
      if (name.endsWith(' \u25ce')) {
        doubleCircleNames.add(name);
        circleBaseNames.add(name.slice(0, -2));
      }
    }

    // Helper: add a single name→displayName entry to the dictionary
    function addEntry(rawName, displayName, type, cost) {
      const normName = normalizeForMatch(rawName);
      if (!normName || normName.length < 2) return;
      const tokens = normName.split(/\s+/).filter(Boolean);
      const trigrams = getNgrams(normName, NGRAM_SIZE_TRI);
      const entry = { name: displayName, normName, type, cost, tokens, trigrams };
      skillDict.push(entry);
      if (!skillDictMap.has(normName)) {
        skillDictMap.set(normName, entry);
      }
    }

    for (const skill of skills) {
      const name = (skill.name || '').trim();
      if (!name || name.length < 2) continue;

      // Skip ◎ variants that have a paired ○ — they collide in normalized space
      // and the ○ variant (or base name) is the one we want OCR to resolve to
      if (name.endsWith(' \u25ce')) {
        const baseName = name.slice(0, -2);
        // Check if a matching ○ exists in the skill list
        const hasSingle = skills.some((s) => (s.name || '').trim() === baseName + ' \u25cb');
        if (hasSingle) continue;
      }

      // For paired ○ skills, use the base name (without ○) as the display name
      let displayName = name;
      if (name.endsWith(' \u25cb') && circleBaseNames.has(name.slice(0, -2))) {
        displayName = name.slice(0, -2);
      }

      const type = (skill.type || '').toLowerCase();
      const cost = skill.cost || null;

      // Primary name entry
      addEntry(name, displayName, type, cost);

      // Alias entries — all resolve to the same displayName
      const aliasNames = skill.aliasNames || [];
      for (const alias of aliasNames) {
        if (alias && alias.trim().length >= 2) {
          addEntry(alias.trim(), displayName, type, cost);
        }
      }

      // Localized name entry
      const localizedName = (skill.localizedName || '').trim();
      if (localizedName && localizedName.length >= 2 && localizedName !== name) {
        addEntry(localizedName, displayName, type, cost);
      }
    }

    return skillDict;
  }

  // ─── Match a single OCR text against the dictionary ───────────

  function matchSkill(ocrText, options) {
    const opts = options || {};
    const maxResults = opts.maxResults || MAX_SUGGESTIONS;
    const ocrConfidence = opts.ocrEngineConfidence || null;
    const sharpnessNorm = opts.sharpnessNorm || null;
    const contextType = opts.contextType || null; // e.g., 'golden', 'green'

    if (!ocrText || skillDict.length === 0) {
      return { match: null, suggestions: [], confidence: 0 };
    }

    const queryNorm = normalizeForMatch(ocrText);
    const quality = ocrTextQuality(queryNorm);

    // Check letter count threshold (Unicode-aware for CJK support)
    const alphaCount = (queryNorm.match(/\p{L}/gu) || []).length;
    const minAlpha = CJK_RE.test(queryNorm) ? 2 : MIN_QUERY_ALPHA;
    if (alphaCount < minAlpha) {
      return { match: null, suggestions: [], confidence: 0, reason: 'too_short' };
    }

    // Check correction cache first
    const cached = getCorrection(ocrText);
    if (cached) {
      const entry = skillDictMap.get(normalizeForMatch(cached));
      if (entry) {
        return {
          match: { name: entry.name, type: entry.type, cost: entry.cost },
          suggestions: [],
          confidence: 0.99,
          source: 'correction_cache',
        };
      }
    }

    // Exact match
    if (skillDictMap.has(queryNorm)) {
      const entry = skillDictMap.get(queryNorm);
      const conf = computeConfidence(1.0, quality, ocrConfidence, sharpnessNorm);
      return {
        match: { name: entry.name, type: entry.type, cost: entry.cost },
        suggestions: [],
        confidence: conf,
        source: 'exact',
      };
    }

    // Score all candidates
    const scored = [];
    for (const entry of skillDict) {
      const scores = computeMatchScore(queryNorm, entry.normName);

      // Early skip: if edit distance is way too large, skip
      const maxAllowed = Math.min(
        MAX_EDIT_DISTANCE,
        Math.max(2, Math.floor(entry.normName.length * 0.4))
      );
      if (scores.editDist > maxAllowed && scores.composite < 0.3) continue;

      // Context boost: if we know the skill type context, boost matching types
      let contextBoost = 0;
      if (contextType && entry.type === contextType) {
        contextBoost = 0.05;
      }

      const finalScore = Math.min(1, scores.composite + contextBoost);

      scored.push({
        entry,
        scores,
        finalScore,
        contextBoost,
      });
    }

    // Sort by score descending
    scored.sort((a, b) => b.finalScore - a.finalScore);

    // Best match
    const best = scored[0] || null;

    if (!best || best.finalScore < 0.35) {
      // No reasonable match
      return {
        match: null,
        suggestions: scored.slice(0, maxResults).map((s) => ({
          name: s.entry.name,
          type: s.entry.type,
          cost: s.entry.cost,
          score: Math.round(s.finalScore * 100),
        })),
        confidence: 0,
        reason: 'no_match',
      };
    }

    const confidence = computeConfidence(best.finalScore, quality, ocrConfidence, sharpnessNorm);

    // Build suggestions (top N excluding the best match)
    const suggestions = scored
      .slice(1, maxResults + 1)
      .filter((s) => s.finalScore >= 0.3)
      .map((s) => ({
        name: s.entry.name,
        type: s.entry.type,
        cost: s.entry.cost,
        score: Math.round(s.finalScore * 100),
      }));

    return {
      match: {
        name: best.entry.name,
        type: best.entry.type,
        cost: best.entry.cost,
      },
      suggestions,
      confidence,
      matchScore: best.finalScore,
      source: 'fuzzy',
      detail: {
        editDist: best.scores.editDist,
        trigramScore: best.scores.trigramScore,
        tokenScore: best.scores.tokenScore,
      },
    };
  }

  // ─── Description / noise line filter ────────────────────────
  // Skip lines that are clearly skill descriptions, role tags, or UI noise
  // rather than skill names.

  // Description lines start with these verbs/adverbs/prepositions
  // NOTE: avoid articles (a/an/the), prepositions (with/from), pronouns (this/that/your)
  // as several skill names start with those words.
  const DESCRIPTION_PREFIXES =
    /^\s*(slightly|moderately|greatly|increase|decrease|recover|restore|regain|widen|reduce|boost|raise|negate|activate|trigger|improve|heighten|allows?\s|enables?\s|grants?\s|provides?\s|deals?\s|gives?\s|causes?\s|makes?\s|keeps?\s|maintains?\s|positioned|well-|when\s|if\s|at\s|on\s|for\s|while\s|during\s|after\s|before\s|into\s|through\s|against\s)/i;

  // Role/position tags that appear in parentheses in descriptions
  const ROLE_TAG_PATTERN =
    /^\s*\(?\s*(end|mid|late|early|front|rear|back)\s+(closer|runner|surger|bettor|chaser|leader)\s*\)?\s*$/i;

  // Standalone role words that OCR picks up from description parentheticals
  const STANDALONE_ROLE =
    /^(late surger|end closer|mid runner|front runner|early leader|rear runner|pace chaser|long|medium|short|mile|dirt|turf)\s*$/i;

  // UI noise patterns
  const UI_NOISE =
    /^\s*(confirm|reset|back|skip|quick|log|menu|agenda|full stats|skill points)\s*$/i;

  // Parenthetical role tags anywhere in a line (from skill descriptions)
  const PARENTHETICAL_ROLE =
    /\(\s*(end|mid|late|early|front|rear|back)\s+(closer|runner|surger|bettor|chaser|leader)\s*\)/i;

  // Cost/number lines: just a number with optional +/- buttons
  const COST_LINE = /^\s*[-+]?\s*\d{1,3}\s*[+-]?\s*$/;

  // Detect CJK characters (Japanese kanji/kana, Chinese, Korean)
  const CJK_RE = /[\u3000-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;

  function isDescriptionOrNoise(line) {
    const trimmed = line.trim();
    // Skip English-specific heuristics for lines containing CJK characters
    if (CJK_RE.test(trimmed)) return false;
    if (DESCRIPTION_PREFIXES.test(trimmed)) return true;
    if (ROLE_TAG_PATTERN.test(trimmed)) return true;
    if (STANDALONE_ROLE.test(trimmed)) return true;
    if (UI_NOISE.test(trimmed)) return true;
    // Lines containing parenthetical role tags as substrings
    // e.g. "sideways. (End Closer)" — prevents matching to "Subdued End Closers"
    if (PARENTHETICAL_ROLE.test(trimmed)) return true;
    // Cost/number lines from +/- buttons
    if (COST_LINE.test(trimmed)) return true;
    // Sentence fragments: mid-text period followed by more words
    // e.g. "sideways. End Closer", "instead. Some text"
    if (/\w\.\s+[A-Za-z]/.test(trimmed)) return true;
    // Lines ending with a period — description sentences end with periods,
    // skill names never do. Catches "the last spurt.", "late-race.",
    // "runners early-race.", "starts.", etc.
    if (/\.\s*$/.test(trimmed) && trimmed.length > 1) return true;
    // Lines with 3+ words that are mostly lowercase are likely descriptions
    const words = trimmed.split(/\s+/);
    if (words.length >= 3) {
      const lowercaseWords = words.filter((w) => w === w.toLowerCase()).length;
      if (lowercaseWords / words.length >= 0.7) return true;
    }
    // Lines with common description verbs/prepositions in the middle
    // e.g. "well-positioned upon approaching", "runners in the final"
    if (
      /\b(upon|towards?|approaching|positioned|during|within|between|among)\b/i.test(trimmed) &&
      words.length >= 3
    )
      return true;
    return false;
  }

  // ─── Batch match with best-variant selection ──────────────────
  // Given OCR output lines, match each and keep the best variant result

  function matchSkillLines(lines, options) {
    const results = [];
    const seen = new Set();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim().length < 3) continue;

      // Skip description lines, role tags, and UI noise
      if (isDescriptionOrNoise(line)) continue;

      // Try multiple cleaned variants of the line
      const variants = generateLineVariants(line);

      // Also try concatenating with the next line (skill names sometimes
      // wrap across two OCR lines, e.g. "Unyielding" + "Spirit")
      if (i + 1 < lines.length && lines[i + 1]) {
        const nextLine = lines[i + 1].trim();
        if (nextLine.length >= 2 && nextLine.length <= 20 && !isDescriptionOrNoise(nextLine)) {
          const combined = line.trim() + ' ' + nextLine;
          const combinedVariants = generateLineVariants(combined);
          for (const v of combinedVariants) variants.push(v);
        }
      }

      let bestResult = null;
      let bestVariant = null;
      let bestFullResult = null; // best match from full-length (non-prefix) variants
      let bestFullVariant = null;
      const firstVariantLen = variants[0] ? variants[0].length : 0;

      for (const variant of variants) {
        // Also filter variants (description text can survive into cleaned forms)
        if (isDescriptionOrNoise(variant)) continue;

        const result = matchSkill(variant, options);
        if (!result.match) continue;

        if (
          !bestResult ||
          result.confidence > bestResult.confidence ||
          (result.confidence === bestResult.confidence && variant.length > bestVariant.length)
        ) {
          bestResult = result;
          bestVariant = variant;
        }

        // Track best from full-length variants (not word-prefix truncated)
        if (firstVariantLen > 0 && variant.length >= firstVariantLen * 0.85) {
          if (!bestFullResult || result.confidence > bestFullResult.confidence) {
            bestFullResult = result;
            bestFullVariant = variant;
          }
        }

        // Perfect match from a long variant, stop searching
        if (result.confidence >= 0.98 && variant.length >= line.trim().length) break;
      }

      // When a prefix variant matches a different skill than the full line,
      // prefer the full-line match — the OCR text contains more evidence
      if (bestResult && bestFullResult && bestVariant.length < firstVariantLen * 0.85) {
        const bestName = normalizeForMatch(bestResult.match.name);
        const fullName = normalizeForMatch(bestFullResult.match.name);
        if (bestName !== fullName && bestFullResult.confidence >= 0.6) {
          bestResult = bestFullResult;
          bestVariant = bestFullVariant;
        }
      }

      if (bestResult && bestResult.match) {
        // Penalty: if the matched skill has more tokens than the variant,
        // the match "invented" words not in the OCR text — likely false positive
        const matchTokens = normalizeForMatch(bestResult.match.name).split(/\s+/).length;
        const variantTokens = normalizeForMatch(bestVariant).split(/\s+/).length;
        if (matchTokens > variantTokens) {
          const extraWords = matchTokens - variantTokens;
          bestResult.confidence *= Math.pow(0.7, extraWords);
        }

        const normName = normalizeForMatch(bestResult.match.name);
        if (seen.has(normName)) continue;
        seen.add(normName);

        results.push({
          ...bestResult,
          lineIndex: i,
          rawLine: line,
          cleanedLine: bestVariant,
        });
      }
    }

    return results;
  }

  // ─── Line variant generation ──────────────────────────────────
  // Produce several cleaned versions of a raw OCR line

  function generateLineVariants(line) {
    const variants = new Set();

    // Variant 1: pipes as I
    const pipesAsI = line
      .replace(/[\u2018\u2019\u2032]/g, "'")
      .replace(/[\u201C\u201D\u2033]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u00A0/g, ' ')
      .replace(/\s*\|\s*/g, ' I ')
      .replace(/[[\]©@*#]+/g, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[^\p{L}\p{N}]+/u, '')
      .trim();
    if (pipesAsI.length >= 3) variants.add(pipesAsI);

    // Variant 2: strip pipes entirely
    const noPipes = line
      .replace(/[\u2018\u2019\u2032]/g, "'")
      .replace(/[\u201C\u201D\u2033]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u00A0/g, ' ')
      .replace(/[|[\]©@*#]+/g, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[^\p{L}\p{N}]+/u, '')
      .trim();
    if (noPipes.length >= 3) variants.add(noPipes);

    // Variant 3: strip trailing numbers (cost)
    for (const base of [pipesAsI, noPipes]) {
      const stripped = base.replace(/\s+\d{1,3}\s*[+]?\s*$/, '').trim();
      if (stripped.length >= 3 && stripped !== base) variants.add(stripped);
    }

    // Variant 4: strip hint/discount text then trailing numbers
    for (const base of [pipesAsI, noPipes]) {
      const stripped = base
        .replace(/[Hh]int\s*[Ll][vV]\.?\s*\d/g, '')
        .replace(/\d+%\s*[Oo][Ff][Ff]/gi, '')
        .replace(/\s+\d{1,3}\s*[+]?\s*$/, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (stripped.length >= 3 && stripped !== base) variants.add(stripped);
    }

    // Variant 5: progressive word prefixes (handles trailing garbage)
    // Limit: keep at least half the words to avoid matching description fragments
    for (const base of [pipesAsI, noPipes]) {
      const words = base.split(/\s+/);
      const minN = Math.max(1, Math.ceil(words.length * 0.4));
      for (let n = Math.min(words.length - 1, 7); n >= minN; n--) {
        const prefix = words.slice(0, n).join(' ');
        if (prefix.length >= 3) variants.add(prefix);
      }
    }

    // Variant 6: CamelCase split — OCR sometimes merges adjacent words
    // with garbled characters between them (e.g. "Flowery7rManeuver").
    // Split on lowercase→uppercase transitions, strip trailing digit
    // clusters from words, and remove discount/hint text.
    for (const base of [pipesAsI, noPipes]) {
      const camelSplit = base.replace(/([a-z])([A-Z])/g, '$1 $2');
      if (camelSplit !== base && camelSplit.length >= 3) {
        variants.add(camelSplit);
        // Clean: strip discount text, then trailing digits from each word
        const cleaned = camelSplit
          .replace(/\d+%?\s*[Oo][Ff][Ff]?\s*/g, '') // "20% OFF"
          .split(/\s+/)
          .map((w) => w.replace(/\d+\w*$/, '')) // "Flowery7r" → "Flowery"
          .filter((w) => w.length >= 2)
          .join(' ')
          .trim();
        if (cleaned.length >= 3 && cleaned !== camelSplit) variants.add(cleaned);
      }
    }

    return Array.from(variants);
  }

  // ─── Extract hint level from text ─────────────────────────────

  function mapDiscountPercentToHint(percent) {
    const p = Number(percent);
    if (!Number.isFinite(p)) return null;
    if (p === 10) return 1;
    if (p === 20) return 2;
    if (p === 30) return 3;
    if (p === 35) return 4;
    if (p === 40) return 5;
    return null;
  }

  function parseDiscountHintFromText(text) {
    if (!text) return null;

    // Handles "10% OFF", "40% OFM", "3S%", "4O%", "10%0FF", etc.
    const re = /([1-4])\s*([0-9OoSs])\s*[%9]/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const tens = parseInt(m[1], 10);
      const onesRaw = m[2];
      let ones = onesRaw;
      if (/[Oo]/.test(onesRaw)) ones = '0';
      if (/[Ss]/.test(onesRaw)) ones = '5';
      const onesNum = parseInt(ones, 10);
      if (!Number.isFinite(onesNum)) continue;
      const percent = tens * 10 + onesNum;
      const hint = mapDiscountPercentToHint(percent);
      if (hint !== null) return hint;
    }

    // Fallback: "X0%" where OCR dropped the first digit context
    const mFallback = text.match(/(\d)\s*[0Oo]\s*[%9]/);
    if (mFallback) {
      const hint = mapDiscountPercentToHint(parseInt(mFallback[1], 10) * 10);
      if (hint !== null) return hint;
    }

    return null;
  }

  function extractHintLevel(text) {
    if (!text || typeof text !== 'string') return null;

    // "Hint Lvl 2", "Hint Lv 2", "HintLv.2", etc.
    const m = text.match(/[Hh]int\s*[Ll][vVyY][lL]?\s*\.?\s*(\d)/);
    if (m) {
      const h = parseInt(m[1], 10);
      if (h >= 1 && h <= 5) return h;
    }

    // OCR-garbled hint: "Hlnt Lv", "H1nt Lv", "Himt Lv" etc.
    // Requires H + i-like + n/m + t-like to avoid false positives from "Hit", "Him"
    const mGarbled = text.match(/[Hh][il1][nm][t7]\s*.{0,3}?\s*(\d)/);
    if (mGarbled) {
      const h = parseInt(mGarbled[1], 10);
      if (h >= 1 && h <= 5) return h;
    }

    // "Hint" with missing/extra chars: "Hin 2", "Hnt Lv3"
    const mGarbled2 = text.match(/[Hh](?:in|[il1]n|n)[t7]?\s*.{0,3}?\s*(\d)/);
    if (mGarbled2) {
      const h = parseInt(mGarbled2[1], 10);
      if (h >= 1 && h <= 5) return h;
    }

    // Discount badge ("10% OFF", "35% OFF", "40% OFF", OCR-garbled variants).
    const discountHint = parseDiscountHintFromText(text);
    if (discountHint !== null) return discountHint;

    // Standalone "Lvl X" / "Lv X" / "Ly X" / "Lv.X" / "LV X"
    const m3 = text.match(/[Ll][vVyY][lL]?\s*\.?\s*([1-5])\b/);
    if (m3) {
      const h = parseInt(m3[1], 10);
      if (h >= 1 && h <= 5) return h;
    }

    // Heavily garbled "Hint" badge: Tesseract reduces "Hint Lv.X" to
    // "Hi      XY" — starts with "Hi/Hl/H1", then 2+ spaces, then digits.
    // Extract the LAST digit 1-5 (the actual level; earlier digits are noise).
    const trimmed2 = text.trim();
    if (trimmed2.length < 20 && /^[Hh][il1I]\s{2,}/.test(trimmed2)) {
      const lastDigit = trimmed2.match(/([1-5])\s*$/);
      if (lastDigit) return parseInt(lastDigit[1], 10);
    }

    // Short garbled badge: just "Lv2", "LV3", "Ly1" etc. (no "Hint" prefix)
    // Only match if the text is short (badge-like, < 15 chars)
    if (trimmed2.length < 15) {
      const mShort = trimmed2.match(/[Ll][vVyY]\.?\s*([1-5])/);
      if (mShort) return parseInt(mShort[1], 10);
    }

    // Badge text that's just a digit preceded by "." — "Hint Lv.3" → ".3"
    // Require at least "." or "Lv/Ly" marker to avoid plain numbers ("2003").
    if (trimmed2.length < 8) {
      const mDot = trimmed2.match(/\.?\s*([1-5])\s*$/);
      if (mDot && /^[\s\d.LlVvYy]+$/.test(trimmed2) && /[.LlVvYy]/.test(trimmed2)) {
        return parseInt(mDot[1], 10);
      }
    }

    // "Obtained" / "Bought" means the skill was purchased (hint = 0)
    // Return 0 explicitly so callers know it was detected, not missing
    if (/[Oo]btain|[Bb]ought/i.test(text)) {
      return 0;
    }

    return null;
  }

  // ─── Extract cost from text ───────────────────────────────────

  function extractCost(text) {
    if (!text) return null;
    // Look for standalone numbers that could be costs (typically 60-400)
    const m = text.match(/\b(\d{2,3})\b/);
    if (m) {
      const cost = parseInt(m[1], 10);
      if (cost >= 20 && cost <= 500) return cost;
    }
    return null;
  }

  function inferHintFromCost(baseCost, observedCost) {
    if (!Number.isFinite(baseCost) || !Number.isFinite(observedCost)) return null;
    if (baseCost < 20 || observedCost < 20) return null;
    if (observedCost > baseCost + 2) return null;

    let bestHint = null;
    let bestError = Infinity;

    for (let hint = 0; hint <= 5; hint++) {
      const discount = HINT_DISCOUNTS[hint] || 0;
      const expectedCost = Math.round(baseCost * (1 - discount));
      const err = Math.abs(expectedCost - observedCost);
      if (err < bestError) {
        bestError = err;
        bestHint = hint;
      }
    }

    const tolerance = Math.max(3, Math.round(baseCost * 0.03));
    if (bestHint === null || bestError > tolerance) return null;

    // Do not auto-infer zero hints; reserve 0 for explicit "Obtained/Bought"
    // or discount parse misses that still carried a hint marker.
    if (bestHint === 0) return null;

    return bestHint;
  }

  // ─── Full OCR text parsing ────────────────────────────────────
  // Takes raw OCR text, splits into lines, matches skills, extracts hints

  function parseOCRText(ocrText, options) {
    const opts = options || {};
    const lines = ocrText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const matchResults = matchSkillLines(lines, opts);
    const detected = [];

    // Build set of matched skill line indices to prevent hint cross-contamination
    const matchedLineIndices = new Set(matchResults.map((r) => r.lineIndex));

    for (const result of matchResults) {
      if (!result.match) continue;

      // Confidence filter — raised from 0.35 to reduce false positives
      if (result.confidence < 0.55) continue;

      // Extract hint from nearby lines (badges can be up to 7 lines away)
      // but don't cross into another matched skill's line.
      // Prefer positive offsets: hint badges appear AFTER the skill name
      // in OCR reading order (right-side badge → read after left-side name).
      let hint = null;
      const i = result.lineIndex;
      // Phase 1: search individual lines near the match
      for (const offset of [0, 1, 2, 3, -1, 4, -2, 5, -3, 6, -4, 7, -5]) {
        const li = i + offset;
        if (li < 0 || li >= lines.length) continue;
        // Don't read hint from another skill's matched line
        if (offset !== 0 && matchedLineIndices.has(li)) continue;
        hint = extractHintLevel(lines[li]);
        if (hint !== null) break;
      }
      // Phase 2: if no hint found, try concatenating short adjacent lines
      // (hint badge text can split across 2 lines: "Hint" + "Lv 2")
      if (hint === null) {
        for (const offset of [0, 1, 2, -1, 3, -2]) {
          const li = i + offset;
          if (li < 0 || li + 1 >= lines.length) continue;
          if (offset !== 0 && matchedLineIndices.has(li)) continue;
          if (matchedLineIndices.has(li + 1)) continue;
          const combined = lines[li] + ' ' + lines[li + 1];
          hint = extractHintLevel(combined);
          if (hint !== null) break;
        }
      }

      // Phase 3: cost-based fallback hint inference.
      // If hint text OCR fails but displayed cost is readable, infer hint level
      // from base cost + known discount table.
      if (hint === null && Number.isFinite(result.match.cost)) {
        for (const offset of [0, 1, -1, 2, -2, 3, -3]) {
          const li = i + offset;
          if (li < 0 || li >= lines.length) continue;
          if (offset !== 0 && matchedLineIndices.has(li)) continue;
          if (/skill\s*points/i.test(lines[li])) continue;
          const observedCost = extractCost(lines[li]);
          if (!Number.isFinite(observedCost)) continue;
          const inferred = inferHintFromCost(result.match.cost, observedCost);
          if (inferred !== null) {
            hint = inferred;
            break;
          }
        }
      }

      detected.push({
        name: result.match.name,
        type: result.match.type || '',
        cost: result.match.cost || null,
        hint: hint !== null ? hint : 0,
        confidence: result.confidence,
        suggestions: result.suggestions || [],
        rawText: result.rawLine,
        source: result.source,
        detail: result.detail || null,
      });
    }

    return detected;
  }

  // ─── Confidence label helpers ─────────────────────────────────

  function getConfidenceLevel(confidence) {
    if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) return 'high';
    if (confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'medium';
    return 'low';
  }

  function getConfidencePercent(confidence) {
    return Math.round(confidence * 100);
  }

  // ─── Export ────────────────────────────────────────────────────

  window.OCRMatcher = {
    CONFIDENCE_THRESHOLDS,
    buildSkillDictionary,
    matchSkill,
    matchSkillLines,
    parseOCRText,
    normalizeForMatch,
    normalizeOCROutput,
    extractHintLevel,
    extractCost,
    getConfidenceLevel,
    getConfidencePercent,
    addCorrection,
    getCorrection,
    clearCorrections,
    ocrTextQuality,
    isDescriptionOrNoise,
    // Expose for testing
    levenshtein,
    damerauLevenshtein,
    ngramSimilarity,
    computeMatchScore,
    computeConfidence,
  };
})();
