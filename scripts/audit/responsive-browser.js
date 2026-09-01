#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const chromeLauncher = require('chrome-launcher');
const puppeteer = require('puppeteer-core');
const { createServer } = require('./smoke-routes');

const projectRoot = path.join(__dirname, '..', '..');
const publicRoot = path.join(projectRoot, 'public');
const minimumTargetSize = 24;

const viewportDefinitions = [
  { name: 'mobile', width: 360, height: 800, deviceScaleFactor: 2, isMobile: true },
  { name: 'tablet', width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true },
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
];

const navigationViewportDefinitions = [
  { name: 'mobile-nav', width: 360, height: 800, deviceScaleFactor: 2, isMobile: true },
  { name: 'tablet-nav', width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true },
  { name: 'edge-nav', width: 1181, height: 900, deviceScaleFactor: 1, isMobile: false },
  { name: 'desktop-nav', width: 1200, height: 900, deviceScaleFactor: 1, isMobile: false },
  { name: 'wide-nav', width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
];

const navigationLanguages = [
  {
    code: 'en',
    trigger: 'About',
    directory: 'All Documentation',
    meta: 'Reference library',
  },
  {
    code: 'jp',
    trigger: 'サイト概要',
    directory: 'ドキュメント一覧',
    meta: 'リファレンスライブラリ',
  },
];

function parseList(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function walkHtml(directory = publicRoot) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkHtml(fullPath);
    return entry.isFile() && entry.name.endsWith('.html') ? [fullPath] : [];
  });
}

function pageForHtml(filePath) {
  const relative = path.relative(publicRoot, filePath).replaceAll(path.sep, '/');
  const route =
    relative === 'index.html'
      ? '/'
      : relative.endsWith('/index.html')
        ? `/${relative.slice(0, -'/index.html'.length)}`
        : `/${relative.slice(0, -'.html'.length)}`;
  return { name: route === '/' ? 'index' : route.slice(1), path: route };
}

function getPages() {
  const availablePages = walkHtml()
    .map(pageForHtml)
    .sort((left, right) => left.name.localeCompare(right.name));
  const requestedPages = new Set(parseList(process.env.RESPONSIVE_PAGES || ''));
  const pages = requestedPages.size
    ? availablePages.filter((page) => requestedPages.has(page.name))
    : availablePages;

  if (!pages.length || pages.length !== (requestedPages.size || availablePages.length)) {
    const unknown = [...requestedPages].filter(
      (requested) => !availablePages.some((page) => page.name === requested)
    );
    throw new Error(`RESPONSIVE_PAGES did not match: ${unknown.join(', ')}`);
  }
  return pages;
}

function getViewports() {
  const requestedViewports = new Set(parseList(process.env.RESPONSIVE_VIEWPORTS || ''));
  const viewports = requestedViewports.size
    ? viewportDefinitions.filter((viewport) => requestedViewports.has(viewport.name))
    : viewportDefinitions;

  if (
    !viewports.length ||
    viewports.length !== (requestedViewports.size || viewportDefinitions.length)
  ) {
    const unknown = [...requestedViewports].filter(
      (requested) => !viewportDefinitions.some((viewport) => viewport.name === requested)
    );
    throw new Error(`RESPONSIVE_VIEWPORTS did not match: ${unknown.join(', ')}`);
  }
  return viewports;
}

function isExpectedLocalFailure(url, baseUrl) {
  if (!url.startsWith(baseUrl)) return true;
  const pathname = new URL(url).pathname;
  return pathname.startsWith('/api/') || pathname.startsWith('/_vercel/');
}

async function inspectLayout(page, viewport) {
  return page.evaluate(
    ({ isMobile, minimumSize }) => {
      function isRendered(element) {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          !element.closest('[aria-hidden="true"], [hidden], [inert]') &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) !== 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      }

      function isInViewport(element) {
        const rect = element.getBoundingClientRect();
        return isRendered(element) && rect.bottom > 0 && rect.top < innerHeight;
      }

      function selectorFor(element) {
        if (element.id) return `#${CSS.escape(element.id)}`;
        const classes = [...element.classList].slice(0, 2).map((name) => `.${CSS.escape(name)}`);
        return `${element.localName}${classes.join('')}`;
      }

      function effectiveTargetRect(element) {
        if (element.matches('input[type="checkbox"], input[type="radio"]')) {
          const labels = element.labels ? [...element.labels] : [];
          const label = labels.find((candidate) => isRendered(candidate));
          if (label) return label.getBoundingClientRect();
        }
        return element.getBoundingClientRect();
      }

      function hasHorizontalScrollContainer(element) {
        let ancestor = element.parentElement;
        while (ancestor && ancestor !== document.body) {
          const style = getComputedStyle(ancestor);
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) return true;
          ancestor = ancestor.parentElement;
        }
        return false;
      }

      const root = document.documentElement;
      const horizontalOverflow = root.scrollWidth > root.clientWidth + 1;
      const overflowElements = horizontalOverflow
        ? [...document.body.querySelectorAll('*')]
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              return (
                isRendered(element) &&
                !hasHorizontalScrollContainer(element) &&
                (rect.left < -1 || rect.right > root.clientWidth + 1)
              );
            })
            .slice(0, 10)
            .map(selectorFor)
        : [];

      const targetSelector = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        'summary',
        '[role="button"]',
      ].join(',');
      const undersizedTargets = [...document.querySelectorAll(targetSelector)]
        .filter((element) => {
          if (!isRendered(element)) return false;
          const style = getComputedStyle(element);
          if (element.localName === 'a' && style.display === 'inline') return false;
          const rect = effectiveTargetRect(element);
          return rect.width < minimumSize || rect.height < minimumSize;
        })
        .slice(0, 20)
        .map((element) => {
          const rect = effectiveTargetRect(element);
          return `${selectorFor(element)} (${Math.round(rect.width)}x${Math.round(rect.height)})`;
        });

      const zoomProneControls = isMobile
        ? [
            ...document.querySelectorAll(
              'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="color"]), select, textarea'
            ),
          ]
            .filter(
              (element) =>
                isRendered(element) && parseFloat(getComputedStyle(element).fontSize) < 16
            )
            .slice(0, 20)
            .map(
              (element) =>
                `${selectorFor(element)} (${parseFloat(getComputedStyle(element).fontSize).toFixed(1)}px)`
            )
        : [];

      const brokenImages = [...document.images]
        .filter((image) => {
          if (!isInViewport(image) || !image.currentSrc) return false;
          return image.complete && image.naturalWidth === 0;
        })
        .slice(0, 10)
        .map((image) => `${selectorFor(image)} (${image.currentSrc})`);

      const unresolvedTranslations = [...document.querySelectorAll('[data-i18n]')]
        .filter((element) => {
          const key = element.dataset.i18n?.trim();
          return key && element.textContent.trim() === key;
        })
        .slice(0, 10)
        .map((element) => `${selectorFor(element)} (${element.dataset.i18n})`);

      const unresolvedTranslatedAttributes = [
        ['data-i18n-aria', 'aria-label'],
        ['data-i18n-placeholder', 'placeholder'],
        ['data-i18n-title', 'title'],
      ]
        .flatMap(([dataAttribute, translatedAttribute]) =>
          [...document.querySelectorAll(`[${dataAttribute}]`)]
            .filter((element) => {
              const key = element.getAttribute(dataAttribute)?.trim();
              return key && element.getAttribute(translatedAttribute)?.trim() === key;
            })
            .map(
              (element) =>
                `${selectorFor(element)} (${translatedAttribute}=${element.getAttribute(dataAttribute)})`
            )
        )
        .slice(0, 10);

      return {
        viewportWidth: root.clientWidth,
        documentWidth: root.scrollWidth,
        horizontalOverflow,
        overflowElements,
        undersizedTargets,
        zoomProneControls,
        brokenImages,
        unresolvedTranslations: [...unresolvedTranslations, ...unresolvedTranslatedAttributes],
      };
    },
    { isMobile: viewport.isMobile, minimumSize: minimumTargetSize }
  );
}

async function auditPage(browser, baseUrl, pageDefinition, viewport) {
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const resourceFailures = [];
  const url = `${baseUrl}${pageDefinition.path}`;

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const locationUrl = message.location().url || '';
    if (locationUrl && !locationUrl.startsWith(baseUrl)) return;
    if (locationUrl.includes('/_vercel/')) return;
    consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() < 400 || isExpectedLocalFailure(response.url(), baseUrl)) return;
    resourceFailures.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });

  try {
    await page.setViewport(viewport);
    await page.goto(url, { waitUntil: 'load', timeout: 20_000 });
    await page.waitForNetworkIdle({ idleTime: 200, timeout: 3_000 }).catch(() => {});
    const layout = await inspectLayout(page, viewport);
    return {
      page: pageDefinition.name,
      viewport: viewport.name,
      ...layout,
      pageErrors: [...new Set(pageErrors)],
      consoleErrors: [...new Set(consoleErrors)],
      resourceFailures: [...new Set(resourceFailures)],
    };
  } catch (error) {
    return {
      page: pageDefinition.name,
      viewport: viewport.name,
      fatalError: error.message,
      pageErrors: [...new Set(pageErrors)],
      consoleErrors: [...new Set(consoleErrors)],
      resourceFailures: [...new Set(resourceFailures)],
    };
  } finally {
    await page.close();
  }
}

async function auditNavigationDropdown(browser, baseUrl, viewport, language) {
  const page = await browser.newPage();
  const failures = [];

  try {
    await page.setViewport(viewport);
    await page.goto(`${baseUrl}/guides`, { waitUntil: 'load', timeout: 20_000 });
    await page.waitForNetworkIdle({ idleTime: 200, timeout: 3_000 }).catch(() => {});

    await page.evaluate((languageCode) => {
      const select = document.querySelector('#nav-site-lang-select');
      if (!select) return;
      select.value = languageCode;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, language.code);
    await page.waitForFunction(
      (expected) =>
        document.querySelector('.nav-group-guide-directory > .nav-group-btn span')?.textContent ===
        expected,
      { timeout: 2_000 },
      language.trigger
    );

    if (viewport.isMobile) {
      await page.click('.menu-btn');
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const triggerSelector = '.nav-group-guide-directory > .nav-group-btn';
    await page.click(triggerSelector);
    await new Promise((resolve) => setTimeout(resolve, 250));

    const state = await page.evaluate(
      ({ expectedTrigger, expectedDirectory, expectedMeta }) => {
        const root = document.documentElement;
        const group = document.querySelector('.nav-group-guide-directory');
        const trigger = group?.querySelector(':scope > .nav-group-btn');
        const menu = group?.querySelector(':scope > .nav-group-menu-guide-directory');
        const menuRect = menu?.getBoundingClientRect();
        const primaryNavigationCount = [
          ...document.querySelectorAll('nav, [role="navigation"]'),
        ].filter(
          (element) => element.getAttribute('aria-label') === window.t('nav.primary')
        ).length;
        const directoryLabel = menu
          ?.querySelector('[data-i18n="nav.allGuides"]')
          ?.textContent.trim();
        const metaLabel = menu
          ?.querySelector('.nav-menu-heading > span:last-child')
          ?.textContent.trim();

        return {
          expanded: trigger?.getAttribute('aria-expanded') === 'true',
          triggerLabel: trigger?.querySelector('span')?.textContent.trim(),
          directoryLabel,
          metaLabel,
          expectedTrigger,
          expectedDirectory,
          expectedMeta,
          menuLabelledByTrigger:
            Boolean(trigger?.id) && menu?.getAttribute('aria-labelledby') === trigger.id,
          primaryNavigationCount,
          horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
          menuWithinViewport:
            Boolean(menuRect) &&
            menuRect.left >= -1 &&
            menuRect.right <= root.clientWidth + 1 &&
            menuRect.top >= -1,
        };
      },
      {
        expectedTrigger: language.trigger,
        expectedDirectory: language.directory,
        expectedMeta: language.meta,
      }
    );

    if (!state.expanded) failures.push('dropdown did not expose aria-expanded=true');
    if (state.triggerLabel !== state.expectedTrigger) {
      failures.push(`trigger label "${state.triggerLabel}" != "${state.expectedTrigger}"`);
    }
    if (state.directoryLabel !== state.expectedDirectory) {
      failures.push(`directory label "${state.directoryLabel}" != "${state.expectedDirectory}"`);
    }
    if (state.metaLabel !== state.expectedMeta) {
      failures.push(`meta label "${state.metaLabel}" != "${state.expectedMeta}"`);
    }
    if (!state.menuLabelledByTrigger) failures.push('dropdown is not labelled by its trigger');
    if (state.primaryNavigationCount !== 1) {
      failures.push(
        `expected 1 primary navigation landmark, found ${state.primaryNavigationCount}`
      );
    }
    if (state.horizontalOverflow) failures.push('open dropdown creates horizontal page overflow');
    if (!state.menuWithinViewport) failures.push('open dropdown leaves the viewport');

    if (
      (viewport.name === 'desktop-nav' || viewport.name === 'wide-nav') &&
      language.code === 'en'
    ) {
      await page.keyboard.press('Escape');
      await page.focus(triggerSelector);
      await page.keyboard.press('ArrowDown');
      await new Promise((resolve) => setTimeout(resolve, 250));
      const firstItemFocused = await page.evaluate(
        () =>
          document.activeElement ===
          document.querySelector('.nav-group-guide-directory .nav-group-menu .nav-link')
      );
      if (!firstItemFocused) failures.push('ArrowDown did not focus the first document link');

      await page.keyboard.press('ArrowDown');
      const expectedSecondIndex = viewport.name === 'wide-nav' ? 2 : 1;
      const spatialItemFocused = await page.evaluate((expectedIndex) => {
        const links = [
          ...document.querySelectorAll('.nav-group-guide-directory .nav-group-menu .nav-link'),
        ];
        return document.activeElement === links[expectedIndex];
      }, expectedSecondIndex);
      if (!spatialItemFocused) failures.push('ArrowDown did not follow the visual column');

      await page.keyboard.press('End');
      const lastItemFocused = await page.evaluate(() => {
        const links = [
          ...document.querySelectorAll('.nav-group-guide-directory .nav-group-menu .nav-link'),
        ];
        return document.activeElement === links.at(-1);
      });
      if (!lastItemFocused) failures.push('End did not focus the last document link');

      await page.keyboard.press('Escape');
      const escapeState = await page.evaluate((selector) => {
        const trigger = document.querySelector(selector);
        return {
          collapsed: trigger?.getAttribute('aria-expanded') === 'false',
          focusReturned: document.activeElement === trigger,
        };
      }, triggerSelector);
      if (!escapeState.collapsed) failures.push('Escape did not collapse the dropdown');
      if (!escapeState.focusReturned) failures.push('Escape did not return focus to the trigger');

      await page.keyboard.press('ArrowDown');
      await new Promise((resolve) => setTimeout(resolve, 250));
      await page.keyboard.press('End');
      await page.keyboard.press('Tab');
      await new Promise((resolve) => setTimeout(resolve, 50));
      const tabState = await page.evaluate((selector) => {
        const trigger = document.querySelector(selector);
        return {
          collapsed: trigger?.getAttribute('aria-expanded') === 'false',
          focusLeftGroup: !trigger?.closest('.nav-group')?.contains(document.activeElement),
        };
      }, triggerSelector);
      if (!tabState.collapsed) failures.push('Tab did not collapse the dropdown after leaving it');
      if (!tabState.focusLeftGroup) failures.push('Tab did not move focus beyond the dropdown');
    }
  } catch (error) {
    failures.push(`navigation audit failed: ${error.message}`);
  } finally {
    await page.close();
  }

  return failures;
}

function getFailures(result) {
  const failures = [];
  if (result.fatalError) failures.push(`navigation: ${result.fatalError}`);
  if (result.horizontalOverflow) {
    failures.push(
      `document overflow ${result.documentWidth}px > ${result.viewportWidth}px` +
        (result.overflowElements.length ? ` (${result.overflowElements.join(', ')})` : '')
    );
  }
  if (result.undersizedTargets?.length) {
    failures.push(`targets under ${minimumTargetSize}px: ${result.undersizedTargets.join(', ')}`);
  }
  if (result.zoomProneControls?.length) {
    failures.push(`mobile controls below 16px text: ${result.zoomProneControls.join(', ')}`);
  }
  if (result.brokenImages?.length)
    failures.push(`broken images: ${result.brokenImages.join(', ')}`);
  if (result.unresolvedTranslations?.length) {
    failures.push(`unresolved translations: ${result.unresolvedTranslations.join(', ')}`);
  }
  if (result.pageErrors.length) failures.push(`page errors: ${result.pageErrors.join(' | ')}`);
  if (result.consoleErrors.length)
    failures.push(`console errors: ${result.consoleErrors.join(' | ')}`);
  if (result.resourceFailures.length) {
    failures.push(`local resource failures: ${result.resourceFailures.join(', ')}`);
  }
  return failures;
}

async function main() {
  const pages = getPages();
  const viewports = getViewports();
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const results = [];
  let chrome;
  let browser;

  console.log(
    `Responsive browser audit: ${pages.length} pages × ${viewports.length} viewports ` +
      `(${viewports.map((viewport) => viewport.name).join(', ')})`
  );

  try {
    chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}` });

    for (const viewport of viewports) {
      for (const pageDefinition of pages) {
        const result = await auditPage(browser, baseUrl, pageDefinition, viewport);
        const failures = getFailures(result);
        results.push({ ...result, passed: failures.length === 0, failures });
        console.log(
          `${failures.length ? 'FAIL' : 'PASS'} ${pageDefinition.name.padEnd(15)} ${viewport.name}`
        );
        failures.forEach((failure) => console.log(`  - ${failure}`));
      }
    }

    for (const viewport of navigationViewportDefinitions) {
      for (const language of navigationLanguages) {
        const failures = await auditNavigationDropdown(browser, baseUrl, viewport, language);
        results.push({
          page: `navigation-${language.code}`,
          viewport: viewport.name,
          passed: failures.length === 0,
          failures,
        });
        console.log(
          `${failures.length ? 'FAIL' : 'PASS'} ${`navigation-${language.code}`.padEnd(15)} ${viewport.name}`
        );
        failures.forEach((failure) => console.log(`  - ${failure}`));
      }
    }
  } finally {
    if (browser) await browser.disconnect();
    if (chrome) await chrome.kill();
    await new Promise((resolve) => server.close(resolve));
  }

  const failures = results.filter((result) => !result.passed);
  console.log(`\n${results.length - failures.length}/${results.length} responsive checks passed.`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Responsive browser audit failed: ${error.message}`);
  process.exit(1);
});
