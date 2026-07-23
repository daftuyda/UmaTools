/**
 * Lighthouse Performance Test Runner
 * Tests all key pages and generates performance reports
 */

const { exec, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const PAGES = [
  { name: 'skills', path: 'skills.html' },
  { name: 'hints', path: 'hints.html' },
  { name: 'optimizer', path: 'optimizer.html' },
  { name: 'calculator', path: 'calculator.html' }
];

const PORT = 8080;
const BASE_URL = `http://localhost:${PORT}`;
const OUTPUT_DIR = './lighthouse-reports';

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Start a simple HTTP server using Python
 */
function startServer() {
  return new Promise((resolve, reject) => {
    const server = exec(`python -m http.server ${PORT}`, {
      cwd: process.cwd()
    });

    let resolved = false;

    server.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`Server: ${output.trim()}`);
      if (!resolved && output.includes('Serving HTTP')) {
        resolved = true;
        console.log(`✓ Server started on port ${PORT}`);
        // Give server a moment to fully initialize
        setTimeout(() => resolve(server), 1000);
      }
    });

    server.stderr.on('data', (data) => {
      const output = data.toString();
      if (!resolved && output.includes('Serving HTTP')) {
        resolved = true;
        console.log(`✓ Server started on port ${PORT}`);
        setTimeout(() => resolve(server), 1000);
      }
    });

    server.on('error', (error) => {
      reject(error);
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!resolved) {
        reject(new Error('Server failed to start within 10 seconds'));
      }
    }, 10000);
  });
}

/**
 * Run Lighthouse on a single page
 */
function runLighthouse(page) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}/${page.path}`;
    const outputPath = path.join(OUTPUT_DIR, `${page.name}-report`).replace(/\\/g, '/');

    console.log(`\n→ Testing ${page.name} (${page.path})...`);

    const args = [
      'lighthouse',
      url,
      '--only-categories=performance',
      '--preset=desktop',
      '--throttling-method=simulate',
      '--throttling.cpuSlowdownMultiplier=4',
      '--output=json',
      '--output=html',
      `--output-path=${outputPath}`,
      '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage'
    ];

    execFile('npx', args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Lighthouse failed: ${error.message}`));
        return;
      }

      try {
        const jsonPath = `${outputPath}.report.json`;
        const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const score = Math.round(report.categories.performance.score * 100);
        const metrics = report.audits;

        const tti = metrics['interactive']?.numericValue || 0;
        const cls = metrics['cumulative-layout-shift']?.numericValue || 0;
        const fcp = metrics['first-contentful-paint']?.numericValue || 0;
        const lcp = metrics['largest-contentful-paint']?.numericValue || 0;

        const result = {
          page: page.name,
          score: score,
          passed: score >= 80,
          metrics: {
            performance: score,
            tti: Math.round(tti),
            cls: cls.toFixed(3),
            fcp: Math.round(fcp),
            lcp: Math.round(lcp)
          }
        };

        console.log(`✓ ${page.name}: Performance ${score}/100`);
        console.log(`  - Time to Interactive: ${result.metrics.tti}ms`);
        console.log(`  - CLS: ${result.metrics.cls}`);
        console.log(`  - First Contentful Paint: ${result.metrics.fcp}ms`);
        console.log(`  - Largest Contentful Paint: ${result.metrics.lcp}ms`);

        resolve(result);
      } catch (parseError) {
        reject(new Error(`Failed to parse Lighthouse report: ${parseError.message}`));
      }
    });
  });
}

/**
 * Main test runner
 */
async function main() {
  console.log('🚀 Starting Lighthouse Performance Tests\n');
  console.log('Target Requirements:');
  console.log('  - Performance score: 80+');
  console.log('  - Time to Interactive: < 3000ms (on throttled 4G)');
  console.log('  - Cumulative Layout Shift: < 0.1');
  console.log('═'.repeat(60));

  let server;

  try {
    // Start server
    server = await startServer();

    // Run tests on all pages
    const results = [];
    for (const page of PAGES) {
      try {
        const result = await runLighthouse(page);
        results.push(result);
      } catch (error) {
        console.error(`✗ ${page.name} failed: ${error.message}`);
        results.push({
          page: page.name,
          error: error.message,
          passed: false
        });
      }
    }

    // Generate summary
    console.log('\n' + '═'.repeat(60));
    console.log('📊 TEST RESULTS SUMMARY\n');

    const passed = results.filter(r => r.passed).length;
    const failed = results.length - passed;

    results.forEach(result => {
      if (result.passed) {
        console.log(`✓ ${result.page.padEnd(12)} - Score: ${result.metrics.performance}/100`);

        // Check additional requirements
        const warnings = [];
        if (result.metrics.tti > 3000) {
          warnings.push(`TTI ${result.metrics.tti}ms > 3000ms`);
        }
        if (parseFloat(result.metrics.cls) > 0.1) {
          warnings.push(`CLS ${result.metrics.cls} > 0.1`);
        }

        if (warnings.length > 0) {
          console.log(`  ⚠ Warnings: ${warnings.join(', ')}`);
        }
      } else {
        console.log(`✗ ${result.page.padEnd(12)} - ${result.error || 'Failed'}`);
      }
    });

    console.log(`\n${passed}/${results.length} pages passed`);
    console.log(`\nDetailed reports saved to: ${OUTPUT_DIR}/`);

    // Save summary to JSON
    const summaryPath = path.join(OUTPUT_DIR, 'summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
    console.log(`Summary saved to: ${summaryPath}`);

    // Exit with appropriate code
    process.exit(failed > 0 ? 1 : 0);

  } catch (error) {
    console.error(`\n✗ Test runner failed: ${error.message}`);
    process.exit(1);
  } finally {
    // Stop server
    if (server) {
      console.log('\n→ Stopping server...');
      server.kill();
    }
  }
}

// Handle interrupts
process.on('SIGINT', () => {
  console.log('\n\n→ Tests interrupted');
  process.exit(130);
});

// Run tests
main().catch(error => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
