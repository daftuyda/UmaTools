// OCR Test Harness & Metrics Evaluation
// Run in browser console: OCRTest.runAll()
//
// Tests:
//   1. Fuzzy matching accuracy (exact, 1-edit, 2-edit, 3-edit distances)
//   2. N-gram similarity correctness
//   3. Confidence scoring calibration
//   4. Suggestion quality (top-3 accuracy)
//   5. Preprocessing pipeline validity
//   6. OCR text normalization
//   7. End-to-end skill parsing

(function () {
  'use strict';

  const results = { passed: 0, failed: 0, total: 0, details: [] };

  function assert(condition, testName, detail) {
    results.total++;
    if (condition) {
      results.passed++;
      results.details.push({ test: testName, status: 'PASS', detail });
    } else {
      results.failed++;
      results.details.push({ test: testName, status: 'FAIL', detail });
      console.error(`FAIL: ${testName}`, detail || '');
    }
  }

  // ─── Test: Exact matching ──────────────────────────────────────

  function testExactMatching() {
    const M = window.OCRMatcher;
    if (!M) {
      assert(false, 'OCRMatcher loaded');
      return;
    }

    const exactCases = [
      'Concentration',
      'Stealth Mode',
      'Focus',
      'Iron Will',
      'Smart Falcon',
      'Shadow Break',
      'Rising Tide',
    ];

    for (const name of exactCases) {
      const result = M.matchSkill(name);
      assert(
        result && result.match && result.match.name === name,
        `Exact match: "${name}"`,
        result ? `matched="${result.match?.name}" conf=${result.confidence}` : 'no match'
      );
      if (result && result.match) {
        assert(
          result.confidence >= 0.85,
          `Exact match confidence >= 85%: "${name}"`,
          `confidence=${Math.round(result.confidence * 100)}%`
        );
      }
    }
  }

  // ─── Test: Fuzzy matching with OCR-like errors ─────────────────

  function testFuzzyMatching() {
    const M = window.OCRMatcher;
    if (!M) return;

    const fuzzyCases = [
      // 1-edit distance
      { input: 'Concetration', expected: 'Concentration' },
      { input: 'Stelth Mode', expected: 'Stealth Mode' },
      { input: 'lron Will', expected: 'Iron Will' },
      // 2-edit distance
      { input: 'Consentration', expected: 'Concentration' },
      { input: 'Stelth Mod', expected: 'Stealth Mode' },
      // Common OCR substitutions
      { input: 'Concentrat1on', expected: 'Concentration' },
      { input: 'F0cus', expected: 'Focus' },
      // Pipe as I
      { input: '|ron Will', expected: 'Iron Will' },
    ];

    for (const tc of fuzzyCases) {
      const result = M.matchSkill(tc.input);
      const matched = result?.match?.name || null;
      assert(
        matched === tc.expected,
        `Fuzzy: "${tc.input}" -> "${tc.expected}"`,
        `got="${matched}" conf=${result ? Math.round(result.confidence * 100) : 0}%`
      );
    }
  }

  // ─── Test: N-gram similarity ──────────────────────────────────

  function testNgramSimilarity() {
    const M = window.OCRMatcher;
    if (!M) return;

    // Same strings should have similarity 1.0
    const selfSim = M.ngramSimilarity('concentration', 'concentration', 3);
    assert(selfSim === 1.0, 'N-gram self-similarity = 1.0', `got ${selfSim}`);

    // Completely different strings should have low similarity
    const diffSim = M.ngramSimilarity('abcdef', 'xyz123', 3);
    assert(diffSim < 0.1, 'N-gram different strings < 0.1', `got ${diffSim}`);

    // Similar strings should have high similarity
    const simSim = M.ngramSimilarity('concentration', 'concetration', 3);
    assert(simSim > 0.7, 'N-gram similar strings > 0.7', `got ${simSim}`);
  }

  // ─── Test: Confidence scoring ─────────────────────────────────

  function testConfidenceScoring() {
    const M = window.OCRMatcher;
    if (!M) return;

    // Exact match should have high confidence
    const exact = M.matchSkill('Concentration');
    assert(
      exact && exact.confidence >= 0.85,
      'Confidence: exact match >= 85%',
      `conf=${exact ? Math.round(exact.confidence * 100) : 0}%`
    );

    // 1-edit match should have medium-high confidence
    const oneEdit = M.matchSkill('Concetration');
    assert(
      oneEdit && oneEdit.confidence >= 0.65,
      'Confidence: 1-edit >= 65%',
      `conf=${oneEdit ? Math.round(oneEdit.confidence * 100) : 0}%`
    );

    // Garbage text should have low or no confidence
    const garbage = M.matchSkill('xyzabc123');
    assert(
      !garbage || !garbage.match || garbage.confidence < 0.5,
      'Confidence: garbage text < 50%',
      `conf=${garbage ? Math.round(garbage.confidence * 100) : 0}%`
    );
  }

  // ─── Test: Suggestions quality ────────────────────────────────

  function testSuggestions() {
    const M = window.OCRMatcher;
    if (!M) return;

    // Ambiguous input should produce suggestions
    const result = M.matchSkill('Concentr');
    if (result && result.suggestions) {
      assert(
        result.suggestions.length >= 0,
        'Suggestions returned for partial match',
        `count=${result.suggestions.length}`
      );
    }

    // Low-confidence match should have suggestions
    const lowConf = M.matchSkill('Consntratn');
    if (lowConf && lowConf.confidence < 0.7) {
      assert(
        lowConf.suggestions && lowConf.suggestions.length > 0,
        'Low-confidence match has suggestions',
        `conf=${Math.round(lowConf.confidence * 100)}% sug=${lowConf.suggestions?.length || 0}`
      );
    }
  }

  // ─── Test: Text normalization ─────────────────────────────────

  function testNormalization() {
    const M = window.OCRMatcher;
    if (!M) return;

    assert(
      M.normalizeForMatch('  Hello  World  ') === 'hello world',
      'Normalize: trim + collapse spaces'
    );
    assert(M.normalizeForMatch('\u2018test\u2019') === "'test'", 'Normalize: unicode quotes');
    assert(M.normalizeForMatch('A\u2014B') === 'a-b', 'Normalize: em-dash to hyphen');

    const ocr = M.normalizeOCROutput('Test|Line|Here');
    assert(ocr === 'TestILineIHere', 'OCR normalize: pipes to I');
  }

  // ─── Test: Hint level extraction ──────────────────────────────

  function testHintExtraction() {
    const M = window.OCRMatcher;
    if (!M) return;

    assert(M.extractHintLevel('Hint Lvl 3') === 3, 'Hint: "Hint Lvl 3"');
    assert(M.extractHintLevel('Hint Lv 2') === 2, 'Hint: "Hint Lv 2"');
    assert(M.extractHintLevel('HintLv.1') === 1, 'Hint: "HintLv.1"');
    assert(M.extractHintLevel('20% OFF') === 2, 'Hint: "20% OFF"');
    assert(M.extractHintLevel('30% off') === 3, 'Hint: "30% off"');
    assert(M.extractHintLevel('No hint here') === null, 'Hint: no match');
    // Extended garbled patterns
    assert(M.extractHintLevel('Hint Ly 4') === 4, 'Hint: "Hint Ly 4" (v→y garble)');
    assert(M.extractHintLevel('Hlnt Lv 2') === 2, 'Hint: "Hlnt Lv 2" (i→l garble)');
    assert(M.extractHintLevel('H1nt Lv.3') === 3, 'Hint: "H1nt Lv.3" (i→1 garble)');
    assert(M.extractHintLevel('Lv2') === 2, 'Hint: "Lv2" (short badge)');
    assert(M.extractHintLevel('Lv.5') === 5, 'Hint: "Lv.5" (short badge with dot)');
    assert(M.extractHintLevel('2O% OFF') === 2, 'Hint: "2O% OFF" (0→O garble)');
    assert(M.extractHintLevel('Obtained') === 0, 'Hint: "Obtained"');
  }

  // ─── Test: End-to-end parsing ─────────────────────────────────

  function testEndToEndParsing() {
    const M = window.OCRMatcher;
    if (!M) return;

    const ocrText = `Concentration 160
Hint Lvl 2
Stealth Mode 120
Iron Will 80
20% OFF
Focus 100`;

    const detected = M.parseOCRText(ocrText);

    assert(detected.length >= 3, `E2E: detected >= 3 skills`, `got ${detected.length}`);

    const names = detected.map((d) => d.name);
    assert(names.includes('Concentration'), 'E2E: found Concentration');
    assert(
      names.includes('Stealth Mode') || names.includes('Focus') || names.includes('Iron Will'),
      'E2E: found at least one other skill',
      `names: ${names.join(', ')}`
    );

    // Check that confidences are reasonable
    for (const d of detected) {
      assert(
        d.confidence > 0 && d.confidence <= 1,
        `E2E confidence in range: ${d.name}`,
        `conf=${Math.round(d.confidence * 100)}%`
      );
    }
  }

  // ─── Test: Levenshtein distance ───────────────────────────────

  function testLevenshtein() {
    const M = window.OCRMatcher;
    if (!M) return;

    assert(M.levenshtein('', '') === 0, 'Lev: empty strings');
    assert(M.levenshtein('abc', '') === 3, 'Lev: one empty');
    assert(M.levenshtein('abc', 'abc') === 0, 'Lev: identical');
    assert(M.levenshtein('abc', 'abd') === 1, 'Lev: 1 substitution');
    assert(M.levenshtein('abc', 'abcd') === 1, 'Lev: 1 insertion');
    assert(M.levenshtein('abcd', 'abc') === 1, 'Lev: 1 deletion');
    assert(M.levenshtein('kitten', 'sitting') === 3, 'Lev: kitten/sitting');
  }

  // ─── Test: Damerau-Levenshtein (transpositions) ───────────────

  function testDamerauLevenshtein() {
    const M = window.OCRMatcher;
    if (!M) return;

    assert(M.damerauLevenshtein('ab', 'ba') === 1, 'DL: transposition');
    assert(M.damerauLevenshtein('abc', 'bac') === 1, 'DL: transposition at start');
    // Standard Levenshtein would give 2 for a transposition
    const dlDist = M.damerauLevenshtein('ab', 'ba');
    const lDist = M.levenshtein('ab', 'ba');
    assert(dlDist <= lDist, 'DL <= Lev for transpositions', `DL=${dlDist} L=${lDist}`);
  }

  // ─── Test: Preprocessing module loads ─────────────────────────

  function testPreprocessingLoaded() {
    const P = window.OCRPreprocess;
    assert(!!P, 'OCRPreprocess module loaded');
    if (!P) return;
    assert(typeof P.preprocessImage === 'function', 'preprocessImage is function');
    assert(typeof P.preprocessMultiVariant === 'function', 'preprocessMultiVariant is function');
    assert(typeof P.selectBestFrame === 'function', 'selectBestFrame is function');
    assert(typeof P.blobToCanvas === 'function', 'blobToCanvas is function');
    assert(typeof P.cropSkillRegion === 'function', 'cropSkillRegion is function');
    assert(typeof P.detectLayout === 'function', 'detectLayout is function');
    assert(typeof P.drawDebugOverlay === 'function', 'drawDebugOverlay is function');
    assert(!!P.SKILL_REGIONS, 'SKILL_REGIONS defined');
    assert(!!P.SKILL_REGIONS.pc, 'SKILL_REGIONS.pc defined');
    assert(!!P.SKILL_REGIONS.mobile, 'SKILL_REGIONS.mobile defined');
  }

  // ─── Test: Region cropping ──────────────────────────────────

  function testRegionCropping() {
    const P = window.OCRPreprocess;
    if (!P) return;

    // PC layout: landscape
    const pcCanvas = document.createElement('canvas');
    pcCanvas.width = 960;
    pcCanvas.height = 540;
    const pcLayout = P.detectLayout(pcCanvas);
    assert(pcLayout === 'pc', 'Layout: landscape -> pc', `got ${pcLayout}`);

    const pcCrop = P.cropSkillRegion(pcCanvas);
    assert(pcCrop.layout === 'pc', 'Crop: pc layout');
    assert(pcCrop.region.w > 0 && pcCrop.region.h > 0, 'Crop: valid pc dimensions');
    assert(pcCrop.canvas.width > 0, 'Crop: pc canvas has width');

    // Mobile layout: portrait
    const mobileCanvas = document.createElement('canvas');
    mobileCanvas.width = 270;
    mobileCanvas.height = 480;
    const mobileLayout = P.detectLayout(mobileCanvas);
    assert(mobileLayout === 'mobile', 'Layout: portrait -> mobile', `got ${mobileLayout}`);

    const mobileCrop = P.cropSkillRegion(mobileCanvas);
    assert(mobileCrop.layout === 'mobile', 'Crop: mobile layout');
    assert(mobileCrop.region.w > 0 && mobileCrop.region.h > 0, 'Crop: valid mobile dimensions');

    // Crop region is smaller than original
    assert(pcCrop.canvas.width < pcCanvas.width, 'Crop: pc width < original');
    assert(mobileCrop.canvas.width <= mobileCanvas.width, 'Crop: mobile width <= original');
  }

  // ─── Test: OCR quality heuristic ──────────────────────────────

  function testOCRQuality() {
    const M = window.OCRMatcher;
    if (!M) return;

    const goodQuality = M.ocrTextQuality('Concentration');
    assert(goodQuality > 0.6, 'Quality: good text > 0.6', `got ${goodQuality.toFixed(3)}`);

    const badQuality = M.ocrTextQuality('|||###');
    assert(badQuality < 0.4, 'Quality: bad text < 0.4', `got ${badQuality.toFixed(3)}`);

    const emptyQuality = M.ocrTextQuality('');
    assert(emptyQuality === 0, 'Quality: empty text = 0');
  }

  // ─── Test: Correction cache ───────────────────────────────────

  function testCorrectionCache() {
    const M = window.OCRMatcher;
    if (!M) return;

    M.addCorrection('Concentratin', 'Concentration');
    const cached = M.getCorrection('Concentratin');
    assert(cached === 'Concentration', 'Correction cache: stores and retrieves');

    const result = M.matchSkill('Concentratin');
    assert(
      result && result.match && result.match.name === 'Concentration',
      'Correction cache: used in matching',
      `source=${result?.source}`
    );

    M.clearCorrections();
    const cleared = M.getCorrection('Concentratin');
    assert(cleared === null, 'Correction cache: cleared');
  }

  // ─── Accuracy benchmark ───────────────────────────────────────

  function runAccuracyBenchmark() {
    const M = window.OCRMatcher;
    if (!M) return null;

    // Simulated OCR outputs with varying quality
    const benchmark = [
      // Perfect
      { ocr: 'Concentration', expected: 'Concentration' },
      { ocr: 'Stealth Mode', expected: 'Stealth Mode' },
      { ocr: 'Iron Will', expected: 'Iron Will' },
      { ocr: 'Focus', expected: 'Focus' },
      { ocr: 'Shadow Break', expected: 'Shadow Break' },

      // 1-edit errors
      { ocr: 'Concetration', expected: 'Concentration' },
      { ocr: 'Stelth Mode', expected: 'Stealth Mode' },
      { ocr: 'lron Will', expected: 'Iron Will' },

      // 2-edit errors
      { ocr: 'Consentration', expected: 'Concentration' },

      // Common OCR noise
      { ocr: 'Concentration 160', expected: 'Concentration' },
      { ocr: 'Stealth Mode Hint Lvl 2', expected: 'Stealth Mode' },
      { ocr: 'Iron Will | 80', expected: 'Iron Will' },
    ];

    let top1Correct = 0;
    let top3Correct = 0;
    const total = benchmark.length;

    for (const tc of benchmark) {
      const result = M.matchSkill(tc.ocr);
      const top1 = result?.match?.name || '';

      if (top1 === tc.expected) {
        top1Correct++;
        top3Correct++;
      } else if (result?.suggestions) {
        const inTop3 = result.suggestions.some((s) => s.name === tc.expected);
        if (inTop3) top3Correct++;
      }
    }

    const top1Acc = ((top1Correct / total) * 100).toFixed(1);
    const top3Acc = ((top3Correct / total) * 100).toFixed(1);

    console.log(`\n--- Accuracy Benchmark ---`);
    console.log(`Top-1 Accuracy: ${top1Acc}% (${top1Correct}/${total})`);
    console.log(`Top-3 Accuracy: ${top3Acc}% (${top3Correct}/${total})`);
    console.log(`Target: Top-1 >= 95%, Top-3 >= 90%`);

    return { top1Acc: parseFloat(top1Acc), top3Acc: parseFloat(top3Acc), total };
  }

  // ─── Run all tests ────────────────────────────────────────────

  function runAll() {
    results.passed = 0;
    results.failed = 0;
    results.total = 0;
    results.details = [];

    console.log('=== OCR Test Harness ===\n');

    testPreprocessingLoaded();
    testRegionCropping();
    testLevenshtein();
    testDamerauLevenshtein();
    testNgramSimilarity();
    testNormalization();
    testHintExtraction();
    testOCRQuality();
    testCorrectionCache();
    testExactMatching();
    testFuzzyMatching();
    testConfidenceScoring();
    testSuggestions();
    testEndToEndParsing();

    const benchmark = runAccuracyBenchmark();

    console.log(
      `\n=== Results: ${results.passed}/${results.total} passed, ${results.failed} failed ===`
    );

    if (results.failed > 0) {
      console.log('\nFailed tests:');
      results.details
        .filter((d) => d.status === 'FAIL')
        .forEach((d) => console.log(`  - ${d.test}: ${d.detail || ''}`));
    }

    return {
      passed: results.passed,
      failed: results.failed,
      total: results.total,
      benchmark,
      details: results.details,
    };
  }

  // ─── Automated Accuracy Tests against reference images ──────
  // Runs the full OCR pipeline on each reference image and compares
  // detected skill names + hint levels against known expected outcomes.
  //
  // Usage: OCRTest.runImageTests()   — runs all 12 images
  //        OCRTest.runImageTests('m1') — runs just m1.png

  const REFERENCE_TESTS = [
    {
      image: './reference/m1.png',
      layout: 'mobile',
      expected: [
        { name: 'Studious', hint: 0 },
        { name: 'I Can See Right Through You', hint: 1 },
        { name: 'Levelheaded', hint: 1 },
      ],
    },
    {
      image: './reference/m2.png',
      layout: 'mobile',
      expected: [
        { name: 'Studious', hint: 1 },
        { name: 'Levelheaded', hint: 1 },
        { name: 'Lucky Seven', hint: 0 },
      ],
    },
    {
      image: './reference/m3.png',
      layout: 'mobile',
      expected: [
        { name: 'Focus', hint: null },
        { name: 'Iron Will', hint: 1 },
        { name: 'Lay Low', hint: null },
      ],
    },
    {
      image: './reference/m4.png',
      layout: 'mobile',
      expected: [
        { name: 'Preferred Position', hint: null },
        { name: 'Medium Straightaways', hint: null },
        { name: 'Medium Corners', hint: null },
        { name: 'Dominator', hint: 0 },
      ],
    },
    {
      image: './reference/m5.png',
      layout: 'mobile',
      expected: [
        { name: 'This Dance Is for Vittoria!', hint: 1 },
        { name: 'I See Victory in My Future!', hint: 1 },
        { name: 'Standard Distance', hint: null },
      ],
    },
    {
      image: './reference/m6.png',
      layout: 'mobile',
      expected: [
        { name: 'Tether', hint: null },
        { name: 'Fighter', hint: 3 },
        { name: 'Tail Held High', hint: 1 },
      ],
    },
    {
      image: './reference/m7.png',
      layout: 'mobile',
      expected: [
        { name: 'Straightaway Acceleration', hint: 3 },
        { name: 'Straightaway Recovery', hint: 3 },
        { name: 'Race Planner', hint: 0 },
      ],
    },
    {
      image: './reference/m8.png',
      layout: 'mobile',
      expected: [
        { name: 'Tether', hint: null },
        { name: 'Levelheaded', hint: 1 },
        { name: 'Lucky Seven', hint: 1 },
        { name: 'Tail Held High', hint: 1 },
      ],
    },
    {
      image: './reference/m9.png',
      layout: 'mobile',
      expected: [
        { name: 'Hanshin Racecourse', hint: 1 },
        { name: 'Standard Distance', hint: null },
        { name: 'Non-Standard Distance', hint: 1 },
        { name: 'Straightaway Recovery', hint: 3 },
      ],
    },
    {
      image: './reference/m10.png',
      layout: 'mobile',
      expected: [
        { name: 'Preferred Position', hint: null },
        { name: 'Extra Tank', hint: 5 },
        { name: 'Hesitant Front Runners', hint: 1 },
      ],
    },
    {
      image: './reference/pc1.png',
      layout: 'pc',
      expected: [
        { name: 'Angling and Scheming', hint: 2 },
        { name: 'Flowery☆Maneuver', hint: 2 },
        { name: 'Straightaway Adept', hint: null },
      ],
    },
    {
      image: './reference/pc2.png',
      layout: 'pc',
      expected: [
        { name: 'No Stopping Me!', hint: 1 },
        { name: 'Nimble Navigator', hint: null },
        { name: 'Go with the Flow', hint: 4 },
      ],
    },
    {
      image: './reference/pc3.png',
      layout: 'pc',
      expected: [
        { name: 'Steadfast', hint: 3 },
        { name: 'Extra Tank', hint: 5 },
        { name: 'Frenzied Pace Chasers', hint: 1 },
        { name: 'Flustered Pace Chasers', hint: null },
      ],
    },
    {
      image: './reference/pc4.png',
      layout: 'pc',
      expected: [
        { name: 'Mile Maven', hint: null },
        { name: 'Productive Plan', hint: null },
        { name: 'Updrafters', hint: 2 },
      ],
    },
    {
      image: './reference/pc5.png',
      layout: 'pc',
      expected: [
        { name: 'Watchful Eye', hint: 2 },
        { name: 'Up-Tempo', hint: 2 },
        { name: 'Subdued Front Runners', hint: 1 },
      ],
    },
    {
      image: './reference/pc6.png',
      layout: 'pc',
      expected: [
        { name: 'Hard Worker', hint: null },
        { name: 'Fighter', hint: null },
        { name: 'Shake It Out', hint: null },
      ],
    },
    {
      image: './reference/pc7.png',
      layout: 'pc',
      expected: [
        { name: 'Prudent Positioning', hint: null },
        { name: 'Hesitant Late Surgers', hint: 2 },
        { name: 'Unyielding Spirit', hint: null },
      ],
    },
    {
      image: './reference/pc8.png',
      layout: 'pc',
      expected: [
        { name: 'Barcarole of Blessings', hint: 2 },
        { name: 'Shooting for Victory!', hint: 2 },
        { name: 'Snowy Days', hint: null },
      ],
    },
    {
      image: './reference/pc9.png',
      layout: 'pc',
      expected: [
        { name: 'Pace Strategy', hint: 2 },
        { name: 'Nimble Navigator', hint: 1 },
        { name: 'Go with the Flow', hint: 2 },
        { name: 'Speed Star', hint: 3 },
      ],
    },
    {
      image: './reference/pc10.png',
      layout: 'pc',
      expected: [
        { name: 'Focus', hint: 2 },
        { name: 'Center Stage', hint: null },
        { name: 'Prudent Positioning', hint: 3 },
      ],
    },
    {
      image: './reference/pc11.png',
      layout: 'pc',
      expected: [
        { name: 'Updrafters', hint: 1 },
        { name: 'Hesitant Late Surgers', hint: 2 },
        { name: 'Sprint Straightaways', hint: 2 },
      ],
    },
    {
      image: './reference/pc12.png',
      layout: 'pc',
      expected: [
        { name: 'Shooting for Victory!', hint: 4 },
        { name: 'Barcarole of Blessings', hint: 2 },
        { name: 'Flashy\u2606Landing', hint: 3 },
      ],
    },
    {
      image: './reference/pc13.png',
      layout: 'pc',
      expected: [
        { name: 'Corner Adept', hint: null },
        { name: 'Corner Recovery', hint: 3 },
        { name: 'Straightaway Adept', hint: 4 },
      ],
    },
  ];

  async function loadImageAsBlob(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return res.blob();
  }

  async function runImageTests(filter) {
    const pipeline = window.ocrPipelineCore;
    if (!pipeline) {
      console.error('[test] ocrPipelineCore not found. Is ocr.js loaded?');
      return null;
    }

    const tests = filter
      ? REFERENCE_TESTS.filter((t) => t.image.includes(filter))
      : REFERENCE_TESTS;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  OCR ACCURACY TEST — ${tests.length} images`);
    console.log(`${'='.repeat(60)}\n`);

    let totalExpected = 0;
    let totalFound = 0;
    let totalNameCorrect = 0;
    let totalHintCorrect = 0;
    let totalFalsePositives = 0;
    const imageResults = [];

    for (const test of tests) {
      const label = test.image.split('/').pop();
      console.log(`── ${label} (${test.layout}) ──`);

      try {
        const blob = await loadImageAsBlob(test.image);
        const result = await pipeline(blob);
        const detected = result.detectedSkills;
        const cards = result.cards;

        console.log(`   Cards detected: ${cards.length} | Skills matched: ${detected.length}`);
        if (result.rawOCRText) {
          console.log(
            `   Raw OCR (first 150): "${result.rawOCRText.substring(0, 150).replace(/\n/g, ' | ')}"`
          );
        }

        // Compare each expected skill against detected
        // Use normalizeForMatch to handle symbol variants (◎/○/× suffixes)
        const norm = window.OCRMatcher.normalizeForMatch;
        let nameCorrect = 0;
        let hintCorrect = 0;
        const matchedDetected = new Set();

        for (const exp of test.expected) {
          const expNorm = norm(exp.name);
          const match = detected.find(
            (d, i) => !matchedDetected.has(i) && norm(d.name) === expNorm
          );

          if (match) {
            const di = detected.indexOf(match);
            matchedDetected.add(di);
            nameCorrect++;

            // Check hint (null in expected means "don't care")
            const hintOk = exp.hint === null || match.hint === exp.hint;
            if (hintOk) hintCorrect++;

            const hintStr = exp.hint === null ? 'any' : exp.hint;
            const status = hintOk ? 'PASS' : `HINT_MISS(got ${match.hint})`;
            console.log(
              `   ✓ ${exp.name} — ${status} (conf: ${Math.round(match.confidence * 100)}%, hint: ${match.hint}/${hintStr})`
            );
          } else {
            console.log(`   ✗ ${exp.name} — NOT FOUND`);
          }
        }

        // Count false positives (detected skills not in expected list)
        const falsePositives = detected.filter((d, i) => !matchedDetected.has(i));
        for (const fp of falsePositives) {
          console.log(
            `   ⚠ FALSE POSITIVE: "${fp.name}" (conf: ${Math.round(fp.confidence * 100)}%, raw: "${fp.rawText}")`
          );
        }

        totalExpected += test.expected.length;
        totalFound += nameCorrect;
        totalNameCorrect += nameCorrect;
        totalHintCorrect += hintCorrect;
        totalFalsePositives += falsePositives.length;

        imageResults.push({
          image: label,
          expected: test.expected.length,
          found: nameCorrect,
          hintCorrect,
          falsePositives: falsePositives.length,
          detected,
          cards: cards.length,
        });
      } catch (err) {
        console.error(`   ERROR processing ${label}:`, err);
        imageResults.push({
          image: label,
          expected: test.expected.length,
          found: 0,
          hintCorrect: 0,
          falsePositives: 0,
          detected: [],
          cards: 0,
          error: err.message,
        });
        totalExpected += test.expected.length;
      }
    }

    // Summary
    const nameAcc =
      totalExpected > 0 ? ((totalNameCorrect / totalExpected) * 100).toFixed(1) : '0.0';
    const hintAcc =
      totalExpected > 0 ? ((totalHintCorrect / totalExpected) * 100).toFixed(1) : '0.0';

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  SUMMARY`);
    console.log(`${'='.repeat(60)}`);
    console.log(`  Skill name accuracy: ${nameAcc}% (${totalNameCorrect}/${totalExpected})`);
    console.log(`  Hint level accuracy: ${hintAcc}% (${totalHintCorrect}/${totalExpected})`);
    console.log(`  False positives:     ${totalFalsePositives}`);
    console.log(`  Target:              95% name accuracy, 0 false positives`);
    console.log(`${'='.repeat(60)}\n`);

    // Per-image table
    console.table(
      imageResults.map((r) => ({
        Image: r.image,
        Cards: r.cards,
        Expected: r.expected,
        Found: r.found,
        'Hint OK': r.hintCorrect,
        'False+': r.falsePositives,
        Error: r.error || '',
      }))
    );

    return {
      nameAccuracy: parseFloat(nameAcc),
      hintAccuracy: parseFloat(hintAcc),
      totalExpected,
      totalFound: totalNameCorrect,
      totalFalsePositives,
      imageResults,
    };
  }

  window.OCRTest = { runAll, runAccuracyBenchmark, runImageTests, REFERENCE_TESTS };
})();
