/**
 * Cross-device Lighthouse audit for the primary public pages.
 */

const fs = require('fs');
const path = require('path');
const { createServer } = require('./smoke-routes');

// Lighthouse requires dynamic import
let lighthouse, chromeLauncher;

async function loadModules() {
  lighthouse = (await import('lighthouse')).default;
  chromeLauncher = await import('chrome-launcher');
}

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'lighthouse-reports');

const PAGE_DEFINITIONS = [
  { name: 'home', path: 'index.html' },
  { name: 'about', path: 'about.html' },
  { name: 'skills', path: 'skills.html' },
  { name: 'hints', path: 'hints.html' },
  { name: 'deck', path: 'deck.html' },
  { name: 'optimizer', path: 'optimizer.html' },
  { name: 'calculator', path: 'calculator.html' },
  { name: 'token-planner', path: 'token-planner.html' },
  { name: 'guides', path: 'guides.html' },
];

const CATEGORY_THRESHOLDS = {
  performance: 80,
  accessibility: 90,
  'best-practices': 90,
  seo: 90,
};

function parseList(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const requestedPages = new Set(parseList(process.env.LIGHTHOUSE_PAGES || ''));
const PAGES = requestedPages.size
  ? PAGE_DEFINITIONS.filter((page) => requestedPages.has(page.name))
  : PAGE_DEFINITIONS;

const requestedFormFactors = parseList(process.env.LIGHTHOUSE_FORM_FACTORS || 'mobile,desktop');
const FORM_FACTORS = requestedFormFactors.filter((name) => name === 'mobile' || name === 'desktop');

const requestedCategories = parseList(
  process.env.LIGHTHOUSE_CATEGORIES || Object.keys(CATEGORY_THRESHOLDS).join(',')
);
const CATEGORIES = requestedCategories.filter((category) => category in CATEGORY_THRESHOLDS);

if (!PAGES.length) {
  throw new Error(`LIGHTHOUSE_PAGES did not match: ${[...requestedPages].join(', ')}`);
}

if (!FORM_FACTORS.length || FORM_FACTORS.length !== requestedFormFactors.length) {
  throw new Error('LIGHTHOUSE_FORM_FACTORS must contain mobile, desktop, or both');
}

if (!CATEGORIES.length || CATEGORIES.length !== requestedCategories.length) {
  throw new Error(
    `LIGHTHOUSE_CATEGORIES must contain: ${Object.keys(CATEGORY_THRESHOLDS).join(', ')}`
  );
}

function createOptions(formFactor) {
  const mobile = formFactor === 'mobile';
  return {
    logLevel: 'error',
    output: ['json', 'html'],
    onlyCategories: CATEGORIES,
    formFactor,
    throttling: mobile
      ? {
          rttMs: 150,
          throughputKbps: 1638.4,
          cpuSlowdownMultiplier: 4,
        }
      : {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1,
        },
    screenEmulation: mobile
      ? {
          mobile: true,
          width: 360,
          height: 640,
          deviceScaleFactor: 2,
          disabled: false,
        }
      : {
          mobile: false,
          width: 1350,
          height: 940,
          deviceScaleFactor: 1,
          disabled: false,
        },
    port: undefined,
  };
}

async function runLighthouse(page, formFactor, chrome, baseUrl) {
  const url = `${baseUrl}/${page.path}`;

  console.log(`\n→ Testing ${page.name} (${page.path}, ${formFactor})...`);

  try {
    const runnerResult = await lighthouse(url, {
      ...createOptions(formFactor),
      port: chrome.port,
    });

    // Save reports
    const reportJson = runnerResult.lhr;
    if (reportJson.runtimeError?.code) {
      throw new Error(`${reportJson.runtimeError.code}: ${reportJson.runtimeError.message}`);
    }
    for (const category of CATEGORIES) {
      if (typeof reportJson.categories[category]?.score !== 'number') {
        throw new Error(`Lighthouse returned no ${category} score`);
      }
    }
    const reportHtml = runnerResult.report[1];

    const reportName = `${page.name}-${formFactor}-report`;
    const jsonPath = path.join(OUTPUT_DIR, `${reportName}.report.json`);
    const htmlPath = path.join(OUTPUT_DIR, `${reportName}.report.html`);

    fs.writeFileSync(jsonPath, JSON.stringify(reportJson, null, 2));
    fs.writeFileSync(htmlPath, reportHtml);

    // Extract metrics
    const scores = Object.fromEntries(
      CATEGORIES.map((category) => [
        category,
        Math.round(reportJson.categories[category].score * 100),
      ])
    );
    const tti = Math.round(reportJson.audits['interactive']?.numericValue || 0);
    const cls = (reportJson.audits['cumulative-layout-shift']?.numericValue || 0).toFixed(3);
    const fcp = Math.round(reportJson.audits['first-contentful-paint']?.numericValue || 0);
    const lcp = Math.round(reportJson.audits['largest-contentful-paint']?.numericValue || 0);
    const categoriesPassed = CATEGORIES.every(
      (category) => scores[category] >= CATEGORY_THRESHOLDS[category]
    );
    const performancePassed =
      !CATEGORIES.includes('performance') || (tti < 3000 && Number(cls) < 0.1);
    const passed = categoriesPassed && performancePassed;

    console.log(`${passed ? 'PASS' : 'FAIL'} ${page.name} (${formFactor})`);
    for (const [category, score] of Object.entries(scores)) {
      console.log(`  - ${category}: ${score}/100`);
    }
    if (CATEGORIES.includes('performance')) {
      console.log(`  - Time to Interactive: ${tti}ms`);
      console.log(`  - CLS: ${cls}`);
      console.log(`  - FCP: ${fcp}ms`);
      console.log(`  - LCP: ${lcp}ms`);
    }

    return {
      page: page.name,
      formFactor,
      passed,
      scores,
      tti,
      cls: parseFloat(cls),
      fcp,
      lcp,
    };
  } catch (error) {
    console.error(`✗ ${page.name} failed: ${error.message}`);
    return {
      page: page.name,
      formFactor,
      passed: false,
      error: error.message,
    };
  }
}

async function main() {
  // Load ES modules
  await loadModules();

  console.log('🚀 Starting cross-device Lighthouse audits\n');
  console.log('Target Requirements:');
  for (const category of CATEGORIES) {
    console.log(`  - ${category}: ${CATEGORY_THRESHOLDS[category]}+`);
  }
  console.log('  - Time to Interactive: < 3000ms (on throttled 4G)');
  console.log('  - Cumulative Layout Shift: < 0.1');
  console.log(`  - Form factors: ${FORM_FACTORS.join(', ')}`);
  console.log('═'.repeat(60));

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Start the shared static server on an available local port.
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  // The server is listening before Chrome is launched.
  console.log('✓ Server started');

  let chrome;
  const results = [];

  try {
    // Launch Chrome
    console.log('\nLaunching Chrome...');
    chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    console.log('✓ Chrome launched');

    // Run tests
    for (const formFactor of FORM_FACTORS) {
      for (const page of PAGES) {
        const result = await runLighthouse(page, formFactor, chrome, baseUrl);
        results.push(result);
      }
    }
  } catch (error) {
    console.error(`\n✗ Test runner failed: ${error.message}`);
  } finally {
    // Cleanup
    if (chrome) {
      console.log('\n→ Closing Chrome...');
      await chrome.kill();
    }

    console.log('→ Stopping server...');
    await new Promise((resolve) => server.close(resolve));
  }

  // Generate summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 TEST RESULTS SUMMARY\n');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  results.forEach((result) => {
    if (result.passed) {
      const scores = Object.entries(result.scores)
        .map(([category, score]) => `${category} ${score}`)
        .join(', ');
      console.log(`✓ ${result.page.padEnd(12)} ${result.formFactor.padEnd(7)} - ${scores}`);
    } else {
      const reason = result.error
        ? result.error
        : `${Object.entries(result.scores)
            .map(([category, score]) => `${category} ${score}`)
            .join(', ')}, TTI ${result.tti}ms, CLS ${result.cls}`;
      console.log(`✗ ${result.page.padEnd(12)} ${result.formFactor.padEnd(7)} - ${reason}`);
    }
  });

  console.log(`\n${passed}/${results.length} pages passed`);
  console.log(`\nDetailed reports saved to: ${OUTPUT_DIR}/`);

  // Save summary
  const summaryPath = path.join(OUTPUT_DIR, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
  console.log(`Summary saved to: ${summaryPath}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
