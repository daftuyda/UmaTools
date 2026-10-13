const assert = require('node:assert/strict');
const launcher = require('chrome-launcher');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../../scripts/audit/smoke-routes');

async function main() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let chrome, browser;
  async function pageFor(route, configure) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setBypassServiceWorker(true);
    if (configure) await configure(page);
    await page.goto(base + route, { waitUntil: 'networkidle0' });
    return { page, close: () => context.close() };
  }
  try {
    chrome = await launcher.launch({ chromeFlags: ['--headless=new', '--no-sandbox'] });
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}` });
    let session = await pageFor(
      '/hints?hints=' + encodeURIComponent('<img src=x onerror="window.auditExecuted=1">')
    );
    assert.equal(await session.page.evaluate(() => window.auditExecuted), undefined);
    assert.equal(await session.page.$eval('#chips', (e) => e.querySelectorAll('img').length), 0);
    assert.match(await session.page.$eval('#chips', (e) => e.textContent), /onerror/);
    await session.close();
    session = await pageFor('/hints?hints=%25');
    assert.match(await session.page.$eval('#chips', (e) => e.textContent), /%/);
    await session.close();

    session = await pageFor('/events');
    await session.page.setRequestInterception(true);
    session.page.on('request', (request) => {
      if (!request.url().includes('/event_by_name?')) {
        request.continue().catch(() => {});
        return;
      }
      const name = new URL(request.url()).searchParams.get('event_name');
      setTimeout(
        () =>
          request
            .respond({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                match: { data: { event_name: name, options: { Option: [['Wit +10']] } } },
                other_matches: [],
              }),
            })
            .catch(() => {}),
        name === 'first' ? 150 : 5
      );
    });
    const search = await session.page.evaluate(async () => {
      await Promise.all([window.performSearch('first'), window.performSearch('second')]);
      const newest = document.querySelector('#result h2').textContent;
      await window.performSearch('');
      await window.performSearch('second');
      return { newest, repeated: document.querySelector('#result h2').textContent };
    });
    assert.deepEqual(search, { newest: 'second', repeated: 'second' });
    await session.close();

    session = await pageFor('/skills');
    await session.page.evaluate(() => {
      document.querySelector('#skillSearch').focus();
      window.SkillPopup.open('201432', document.querySelector('#skillSearch'));
    });
    await session.page.waitForSelector('.skill-popup');
    for (let i = 0; i < 8; i++) {
      await session.page.keyboard.press('Tab');
      assert.equal(
        await session.page.evaluate(() => !!document.activeElement.closest('.skill-popup')),
        true
      );
    }
    await session.page.keyboard.press('Escape');
    assert.equal(await session.page.evaluate(() => document.activeElement.id), 'skillSearch');
    assert.equal(await session.page.evaluate(() => document.querySelector('main').inert), false);
    await session.close();

    session = await pageFor('/calculator');
    await session.page.evaluate(() => {
      const input = document.querySelector('.skill-name');
      input.value = 'Studious';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const late = document.querySelector('#cfg-late');
      late.value = 'G';
      late.dispatchEvent(new Event('change', { bubbles: true }));
      return document.querySelector('.skill-score-display')?.textContent;
    });
    await session.page.waitForFunction(
      () => Number(document.querySelector('.skill-score-display')?.textContent) === 60
    );
    assert.equal(
      Number(await session.page.$eval('.skill-score-display', (e) => e.textContent)),
      60
    );
    await session.close();
    // Exercise real consumers through a completed switch and a rapid switch pair.
    for (const route of ['/calculator', '/optimizer', '/skills']) {
      session = await pageFor(route);
      const switchServer = (server) =>
        session.page.evaluate((value) => {
          localStorage.setItem('umatoolsServer', value);
          window.dispatchEvent(
            new CustomEvent('umatools:server-change', { detail: { server: value } })
          );
        }, server);
      await switchServer('jp');
      await session.page.waitForFunction(() =>
        document.querySelector('#skill-data-source')?.textContent.includes('JP')
      );
      await switchServer('global');
      await switchServer('jp');
      await session.page.waitForFunction(() =>
        document.querySelector('#skill-data-source')?.textContent.includes('JP')
      );
      assert.equal((await session.page.evaluate(() => window.SkillData.status('jp'))).server, 'jp');
      await session.close();
    }

    // The same skill must pick up the other server's cost, not a stale name-map entry.
    session = await pageFor('/optimizer', async (page) => {
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const match = request.url().match(/master\/(global|jp)-core\.json$/);
        if (!match) {
          request.continue().catch(() => {});
          return;
        }
        request
          .respond({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              server: match[1],
              source: { kind: 'test' },
              skills: [
                {
                  id: 201432,
                  name: 'Studious',
                  grade_value: 85,
                  need_skill_point: match[1] === 'jp' ? 240 : 120,
                },
              ],
            }),
          })
          .catch(() => {});
      });
    });
    await session.page.evaluate(() => {
      const input = document.querySelector('.skill-name');
      input.value = 'Studious';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await session.page.waitForFunction(
      () => document.querySelector('.optimizer-row').dataset.baseCost === '120'
    );
    await session.page.evaluate(() => {
      localStorage.setItem('umatoolsServer', 'jp');
      window.dispatchEvent(new CustomEvent('umatools:server-change', { detail: { server: 'jp' } }));
    });
    await session.page.waitForFunction(
      () => document.querySelector('.optimizer-row').dataset.baseCost === '240'
    );
    await session.close();

    // Required prerequisite + cheaper gold must not reduce the displayed rating.
    session = await pageFor('/optimizer', async (page) => {
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (!request.url().endsWith('/master/global-core.json')) {
          request.continue().catch(() => {});
          return;
        }
        request
          .respond({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              server: 'global',
              source: { kind: 'test' },
              skills: [
                { id: 200351, name: 'Swinging Maestro', grade_value: 400, need_skill_point: 200 },
                { id: 200352, name: 'Corner Recovery ○', grade_value: 100, need_skill_point: 100 },
                { id: 201432, name: 'Studious', grade_value: 350, need_skill_point: 150 },
              ],
            }),
          })
          .catch(() => {});
      });
    });
    const hintResults = await session.page.evaluate(async () => {
      function add(name) {
        let row = [...document.querySelectorAll('.optimizer-row')].find(
          (row) => !row.querySelector('.skill-name').value
        );
        if (!row) {
          document.querySelector('#add-row').click();
          row = [...document.querySelectorAll('.optimizer-row')].at(-1);
        }
        const input = row.querySelector('.skill-name');
        input.value = name;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return row;
      }
      document.querySelectorAll('select[id^="cfg-"]').forEach((select) => {
        if ([...select.options].some((option) => option.value === 'A')) {
          select.value = 'A';
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      const gold = add('Swinging Maestro');
      add('Studious');
      const lower = document.querySelector(`[data-row-id="${gold.dataset.lowerRowId}"]`);
      lower.querySelector('.required-skill').checked = true;
      lower.querySelector('.required-skill').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#budget').value = '350';
      const results = [];
      for (const level of [0, 1, 2, 3, 4, 5, 0]) {
        const hint = gold.querySelector('.hint-level');
        hint.value = String(level);
        await new Promise((resolve) => {
          const observer = new MutationObserver(() => {
            observer.disconnect();
            resolve();
          });
          observer.observe(document.querySelector('#best-score'), { childList: true });
          hint.dispatchEvent(new Event('change', { bubbles: true }));
        });
        results.push({
          level,
          score: Number(document.querySelector('#best-score').textContent),
          cost: Number(gold.querySelector('.cost').value),
        });
      }
      return results;
    });
    // Studious receives the existing 1.1 A-aptitude factor: 350 * 1.1 + 100 = 485.
    assert.deepEqual(
      hintResults.map((x) => x.score),
      [485, 485, 485, 485, 485, 485, 485]
    );
    assert.deepEqual(
      hintResults.map((x) => x.cost),
      [300, 280, 260, 240, 230, 220, 300]
    );
    await session.close();

    // Use the worker (not Puppeteer's bypass) and navigate a clean URL offline.
    session = await pageFor('/calculator');
    await session.page.setBypassServiceWorker(false);
    await session.page.evaluate(() => navigator.serviceWorker.ready);
    await session.page.reload({ waitUntil: 'networkidle0' });
    await session.page.waitForFunction(async () => {
      const names = await caches.keys();
      const name = names.find((name) => name.startsWith('umatools-runtime-'));
      if (!name) return false;
      const runtime = await caches.open(name);
      return !!(await runtime.match('/assets/uma_skills.csv'));
    });
    await session.page.setOfflineMode(true);
    await session.page.goto(base + '/calculator?offline-regression=1', {
      waitUntil: 'networkidle0',
    });
    await session.page.waitForSelector('.calculator-row');
    assert.match(await session.page.$eval('#lib-status', (e) => e.textContent), /Loaded/);
    await session.close();
    console.log(
      'Browser audit regressions passed: safe hints, URL recovery, search order/retry, modal focus, Studious G=60, server switching, required-skill hint monotonicity, offline clean routes.'
    );
  } finally {
    if (browser) await browser.disconnect();
    if (chrome) await chrome.kill();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
