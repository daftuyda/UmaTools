/**
 * Lighthouse Performance Test using Puppeteer
 * More reliable approach with better control over Chrome
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
  { name: 'skills', path: 'skills.html' },
  { name: 'hints', path: 'hints.html' },
  { name: 'optimizer', path: 'optimizer.html' },
  { name: 'calculator', path: 'calculator.html' }
];
const requestedPages = new Set(
  (process.env.LIGHTHOUSE_PAGES || '')
    .split(',')
    .map(name => name.trim())
    .filter(Boolean)
);
const PAGES = requestedPages.size
  ? PAGE_DEFINITIONS.filter(page => requestedPages.has(page.name))
  : PAGE_DEFINITIONS;

if (!PAGES.length) {
  throw new Error(`LIGHTHOUSE_PAGES did not match: ${[...requestedPages].join(', ')}`);
}

const opts = {
  logLevel: 'error',
  output: ['json', 'html'],
  onlyCategories: ['performance'],
  formFactor: 'mobile',
  throttling: {
    rttMs: 150,
    throughputKbps: 1638.4,
    cpuSlowdownMultiplier: 4
  },
  screenEmulation: {
    mobile: true,
    width: 360,
    height: 640,
    deviceScaleFactor: 2,
    disabled: false,
  },
  port: undefined, // Will be set when Chrome launches
};

async function runLighthouse(page, chrome, baseUrl) {
  const url = `${baseUrl}/${page.path}`;

  console.log(`\n→ Testing ${page.name} (${page.path})...`);

  try {
    const runnerResult = await lighthouse(url, {
      ...opts,
      port: chrome.port,
    });

    // Save reports
    const reportJson = runnerResult.lhr;
    if (reportJson.runtimeError?.code) {
      throw new Error(`${reportJson.runtimeError.code}: ${reportJson.runtimeError.message}`);
    }
    if (typeof reportJson.categories.performance.score !== 'number') {
      throw new Error('Lighthouse returned no performance score');
    }
    const reportHtml = runnerResult.report[1];

    const jsonPath = path.join(OUTPUT_DIR, `${page.name}-report.report.json`);
    const htmlPath = path.join(OUTPUT_DIR, `${page.name}-report.report.html`);

    fs.writeFileSync(jsonPath, JSON.stringify(reportJson, null, 2));
    fs.writeFileSync(htmlPath, reportHtml);

    // Extract metrics
    const score = Math.round(reportJson.categories.performance.score * 100);
    const tti = Math.round(reportJson.audits['interactive']?.numericValue || 0);
    const cls = (reportJson.audits['cumulative-layout-shift']?.numericValue || 0).toFixed(3);
    const fcp = Math.round(reportJson.audits['first-contentful-paint']?.numericValue || 0);
    const lcp = Math.round(reportJson.audits['largest-contentful-paint']?.numericValue || 0);
    const passed = score >= 80 && tti < 3000 && Number(cls) < 0.1;

    console.log(`${passed ? 'PASS' : 'FAIL'} ${page.name}: Performance ${score}/100`);
    console.log(`  - Time to Interactive: ${tti}ms`);
    console.log(`  - CLS: ${cls}`);
    console.log(`  - FCP: ${fcp}ms`);
    console.log(`  - LCP: ${lcp}ms`);

    return {
      page: page.name,
      passed,
      score,
      tti,
      cls: parseFloat(cls),
      fcp,
      lcp
    };
  } catch (error) {
    console.error(`✗ ${page.name} failed: ${error.message}`);
    return {
      page: page.name,
      passed: false,
      error: error.message
    };
  }
}

async function main() {
  // Load ES modules
  await loadModules();

  console.log('🚀 Starting Lighthouse Performance Tests\n');
  console.log('Target Requirements:');
  console.log('  - Performance score: 80+');
  console.log('  - Time to Interactive: < 3000ms (on throttled 4G)');
  console.log('  - Cumulative Layout Shift: < 0.1');
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
      chromeFlags: [
        '--headless=new',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    console.log('✓ Chrome launched');

    // Run tests
    for (const page of PAGES) {
      const result = await runLighthouse(page, chrome, baseUrl);
      results.push(result);
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
    await new Promise(resolve => server.close(resolve));
  }

  // Generate summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 TEST RESULTS SUMMARY\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;

  results.forEach(result => {
    if (result.passed) {
      console.log(`✓ ${result.page.padEnd(12)} - Score: ${result.score}/100`);
    } else {
      const reason = result.error
        ? result.error
        : `score ${result.score}/100, TTI ${result.tti}ms, CLS ${result.cls}`;
      console.log(`✗ ${result.page.padEnd(12)} - ${reason}`);
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

main().catch(error => {
  console.error(`Fatal error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
