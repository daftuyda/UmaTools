const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const launcher = require('chrome-launcher');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../../scripts/audit/smoke-routes');

async function main() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'umatools-browser-test-'));
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
    chrome = await launcher.launch({
      chromeFlags: ['--headless=new', '--no-sandbox'],
      userDataDir: chromeProfile,
    });
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
    await session.page.evaluate(() => {
      const input = document.querySelector('.skill-name');
      input.value = 'Certain Victory';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await session.page.waitForFunction(
      () => Number(document.querySelector('.skill-score-display')?.textContent) === 180
    );
    for (const level of ['1', '6']) {
      await session.page.select('#unique-level', level);
      assert.equal(
        Number(await session.page.$eval('.skill-score-display', (e) => e.textContent)),
        180
      );
    }
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

    // Skill suggestions should track edits immediately without building thousands of options,
    // and a delayed update from the previous field must not replace the current suggestions.
    for (const route of ['/calculator', '/optimizer']) {
      session = await pageFor(route);
      await session.page.focus('.skill-name');
      await session.page.waitForSelector('#skills-datalist-shared option');
      await session.page.evaluate(() => {
        const first = document.querySelector('.skill-name');
        first.value = 'Studious';
        first.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await session.page.waitForFunction(
        () => document.querySelectorAll('.skill-name').length >= 2
      );
      const immediate = await session.page.evaluate(() => {
        const [first, second] = document.querySelectorAll('.skill-name');
        const edit = (input, value) => {
          input.focus();
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        edit(first, 'Steadfast');
        edit(second, 'victory');
        return [...document.querySelectorAll('#skills-datalist-shared option')].map((o) => o.value);
      });
      assert.ok(immediate.length > 0 && immediate.length <= 100, `${route}: bounded suggestions`);
      assert.ok(immediate.every((name) => name.toLowerCase().includes('victory')));
      await new Promise((resolve) => setTimeout(resolve, 500));
      const afterDelay = await session.page.$$eval('#skills-datalist-shared option', (options) =>
        options.map((option) => option.value)
      );
      assert.deepEqual(afterDelay, immediate, `${route}: stale edits must not replace suggestions`);
      const oneCharacter = await session.page.evaluate(() => {
        const input = document.activeElement;
        input.value = 'z';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return [...document.querySelectorAll('#skills-datalist-shared option')].map((o) => o.value);
      });
      assert.ok(oneCharacter.length > 0 && oneCharacter.length <= 100);
      assert.ok(oneCharacter.every((name) => name.toLowerCase().includes('z')));
      const cleared = await session.page.evaluate(() => {
        const input = document.activeElement;
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return [...document.querySelectorAll('#skills-datalist-shared option')].map((o) => o.value);
      });
      assert.ok(cleared.length > 0 && cleared.length <= 100);
      assert.ok(cleared.some((name) => !name.toLowerCase().includes('z')));
      const localized = await session.page.evaluate(() => {
        document.documentElement.dataset.siteLanguage = 'jp';
        window.dispatchEvent(
          new CustomEvent('umatools:site-language-change', { detail: { language: 'jp' } })
        );
        const input = document.activeElement;
        input.value = '読解力';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return [...document.querySelectorAll('#skills-datalist-shared option')].map((o) => o.value);
      });
      assert.ok(localized.includes('読解力'), `${route}: suggestions should follow site language`);
      if (route === '/optimizer') {
        await session.page.evaluate(() => {
          window._openSkillBrowser();
          const search = document.querySelector('#skill-browser-search');
          search.value = 'no-such-skill';
          search.dispatchEvent(new Event('input', { bubbles: true }));
          search.value = '読解力';
          search.dispatchEvent(new Event('input', { bubbles: true }));
        });
        const modalResults = await session.page.evaluate(async () => {
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          );
          return [...document.querySelectorAll('.skill-card')]
            .filter((card) => card.style.display !== 'none')
            .map((card) => card.querySelector('.card-name')?.textContent);
        });
        assert.ok(modalResults.some((name) => name.includes('読解力')));
        assert.ok(modalResults.length < 10, 'modal should apply the latest search');
      }
      await session.close();
    }

    // An official name can also be a different skill's translated alias.
    session = await pageFor('/optimizer');
    await session.page.evaluate(() => {
      const input = document.querySelector('.optimizer-row .skill-name');
      input.value = 'Steadfast';
      input.focus();
    });
    const suggestion = await session.page.$eval(
      '#skills-datalist-shared option[value="Steadfast"]',
      (option) => ({ value: option.value, label: option.label || option.value })
    );
    assert.deepEqual(suggestion, { value: 'Steadfast', label: 'Steadfast' });
    for (const [name, cost] of [
      ['Steadfast', '160'],
      ['Firm Resolve', '180'],
    ]) {
      await session.page.evaluate((value) => {
        const input = document.querySelector('.optimizer-row .skill-name');
        input.value = value;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, name);
      await session.page.waitForFunction(
        (expected) => document.querySelector('.optimizer-row').dataset.baseCost === expected,
        {},
        cost
      );
    }
    await session.close();

    // Import IDs take precedence over conflicting names, with name-only fallback.
    session = await pageFor('/optimizer');
    await session.page.evaluate(() => {
      const data = {
        acquired_skills: [{ skillId: 100011, name: 'Shooting Star' }, { skillId: 201432 }],
        buyable_skills: [
          { skillId: 200732, name: 'Firm Resolve', hintLevel: 2 },
          { id: 202462, name: 'Steadfast', hintLevel: 1 },
          { skillId: 999999999, name: 'Studious', hintLevel: 0 },
          { name: 'Corner Recovery ○', hintLevel: 0 },
        ],
      };
      const input = document.querySelector('#json-import-input');
      const files = new DataTransfer();
      files.items.add(
        new File([JSON.stringify(data)], 'skill_tree.json', { type: 'application/json' })
      );
      input.files = files.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await session.page.waitForFunction(() =>
      [...document.querySelectorAll('.optimizer-row .skill-name')].some(
        (input) => input.value === 'Steadfast'
      )
    );
    const imported = await session.page.evaluate(() =>
      [...document.querySelectorAll('.optimizer-row')]
        .filter((row) => !row.dataset.parentGoldId && !row.dataset.parentCircleId)
        .filter((row) => row.querySelector('.skill-name')?.value)
        .map((row) => ({
          name: row.querySelector('.skill-name').value,
          baseCost: row.dataset.baseCost,
          score: row.querySelector('.base-cost').textContent,
          hint: row.querySelector('.hint-level').value,
          required: row.querySelector('.required-skill').checked,
          cost: row.querySelector('.cost').value,
        }))
    );
    const steadfast = imported.find((row) => row.name === 'Steadfast');
    const firmResolve = imported.find((row) => row.name === 'Firm Resolve');
    assert.equal(steadfast?.baseCost, '160');
    assert.equal(steadfast?.hint, '2');
    assert.match(steadfast?.score, /217/);
    assert.equal(firmResolve?.baseCost, '180');
    assert.equal(firmResolve?.hint, '1');
    assert.match(firmResolve?.score, /217/);
    assert.equal(imported.filter((row) => row.name === 'Studious').length, 1);
    assert.ok(
      imported.some(
        (row) =>
          row.name === 'Studious' && row.baseCost === '120' && row.required && row.cost === '0'
      )
    );
    assert.ok(imported.some((row) => row.name.startsWith('Corner Recovery')));
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
    if (browser) await browser.close().catch((error) => console.error('Browser cleanup:', error));
    try {
      if (chrome) await chrome.kill();
    } catch (error) {
      console.error('Chrome cleanup:', error);
    }
    await fs.promises
      .rm(chromeProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
      .catch((error) => console.error('Browser profile cleanup:', error));
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
