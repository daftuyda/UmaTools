const assert = require('node:assert/strict');
const launcher = require('chrome-launcher');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../../scripts/audit/smoke-routes');
async function main() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const profileRoot = path.resolve(__dirname, '../../.tmp-team-trials');
    fs.mkdirSync(profileRoot, { recursive: true });
    browser = await puppeteer.launch({
      executablePath: process.argv[2] || launcher.Launcher.getInstallations()[0],
      headless: true,
      userDataDir: fs.mkdtempSync(path.join(profileRoot, 'browser-')),
      args: ['--no-sandbox'],
    });
    for (const unavailable of [false, true]) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setBypassServiceWorker(true);
      if (unavailable) {
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          if (request.url().includes('team-trials-calibration.json'))
            request.respond({ status: 503, body: 'unavailable' }).catch(() => {});
          else request.continue().catch(() => {});
        });
      }
      await page.goto('http://127.0.0.1:' + server.address().port + '/optimizer', {
        waitUntil: 'networkidle0',
      });
      await page.evaluate(() => {
        const api = window.TeamTrialsOptimizer;
        const original = api.optimizeTeamTrialsBuild;
        api.optimizeTeamTrialsBuild = function (input, options) {
          const result = original(input, options);
          window.calibrationTest = { input, result };
          return result;
        };
        document.querySelectorAll('select[id^="cfg-"]').forEach((select) => {
          if ([...select.options].some((o) => o.value === 'A')) {
            select.value = 'A';
            select.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        const skill = document.querySelector('.skill-name');
        skill.value = 'Corner Adept ○';
        skill.dispatchEvent(new Event('change', { bubbles: true }));
        const budget = document.querySelector('#budget');
        budget.value = '500';
        budget.dispatchEvent(new Event('input', { bubbles: true }));
        const mode = document.querySelector('#optimize-mode');
        mode.value = 'team_trials';
        mode.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForFunction(
        (expectCalibration) =>
          Array.isArray(window.__skillsAllData) &&
          window.calibrationTest?.result?.chosen?.some(
            (s) => String(s.skillId) === '200332' && !!s.calibration === expectCalibration
          ),
        {},
        !unavailable
      );
      const result = await page.evaluate(() => ({
        calibration: window.calibrationTest.result.chosen.find(
          (s) => String(s.skillId) === '200332'
        ).calibration,
        labels: [...document.querySelectorAll('.res-metrics')].map((e) => e.textContent),
        error: window.calibrationTest.result.error,
      }));
      assert.equal(result.error, null);
      assert.equal(!!result.calibration, !unavailable);
      assert(
        result.labels.some((label) => label.includes(unavailable ? 'heuristic' : 'simulated'))
      );
      if (!unavailable) {
        await page.evaluate(() => {
          localStorage.setItem('umatoolsServer', 'jp');
          window.dispatchEvent(
            new CustomEvent('umatools:server-change', { detail: { server: 'jp' } })
          );
        });
        await page.waitForFunction(
          () => window.calibrationTest?.input?.activationCalibration === null
        );
      }
      await context.close();
    }
    console.log(
      'Team Trials browser checks passed: real calibration loading, simulated labels, unavailable-data fallback, and JP isolation.'
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
