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
const changelogVersion = JSON.parse(
  fs.readFileSync(path.join(publicRoot, 'assets', 'changelog.json'), 'utf8')
).version;

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

const skillBrowserViewportDefinitions = [
  { name: 'mobile-modal', width: 360, height: 800, deviceScaleFactor: 2, isMobile: true },
  { name: 'desktop-modal', width: 729, height: 842, deviceScaleFactor: 1, isMobile: false },
];

const decorativeBackgroundViewportDefinitions = [
  { name: 'mobile-background', width: 360, height: 800, deviceScaleFactor: 2, isMobile: true },
  { name: 'desktop-background', width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
];

const decorativeBackgroundThemes = ['light', 'dark', 'oled'];

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

function rgbChannels(value) {
  const channels = String(value)
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (channels?.length !== 3 || !channels.every(Number.isFinite)) return null;
  return String(value).startsWith('color(srgb')
    ? channels.map((channel) => channel * 255)
    : channels;
}

function hasChroma(value) {
  const channels = rgbChannels(value);
  return Boolean(channels) && Math.max(...channels) - Math.min(...channels) >= 20;
}

function assertDistinctSemanticColors(label, values, failures) {
  if (values.some((value) => !hasChroma(value))) {
    failures.push(`${label} includes a grayscale color (${values.join(', ')})`);
  }
  if (new Set(values).size !== values.length) {
    failures.push(`${label} colors are not distinct (${values.join(', ')})`);
  }
}

function isOpaqueBlack(value) {
  const channels = rgbChannels(value);
  if (!channels || channels.some((channel) => Math.abs(channel) > 0.5)) return false;
  const normalized = String(value).trim();
  if (normalized.startsWith('rgba(')) {
    const components = normalized.match(/[\d.]+/g)?.map(Number);
    return Boolean(components?.length >= 4) && components[3] >= 0.99;
  }
  const alphaMatch = normalized.match(/\/\s*([\d.]+%?)\s*\)$/);
  if (!alphaMatch) return true;
  const alpha = alphaMatch[1].endsWith('%')
    ? Number.parseFloat(alphaMatch[1]) / 100
    : Number(alphaMatch[1]);
  return Number.isFinite(alpha) && alpha >= 0.99;
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

async function auditDecorativeBackground(browser, baseUrl, viewport, theme) {
  const page = await browser.newPage();
  const failures = [];

  try {
    await page.evaluateOnNewDocument(
      (selectedTheme, dismissedChangelogVersion) => {
        localStorage.setItem('umatools-theme', selectedTheme);
        localStorage.setItem('umatools.changelog.dismissed', dismissedChangelogVersion);
      },
      theme,
      changelogVersion
    );
    await page.setViewport(viewport);
    await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 20_000 });
    await page.waitForFunction(
      (selectedTheme) => document.documentElement.dataset.theme === selectedTheme,
      { timeout: 3_000 },
      theme
    );
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );

    const state = await page.evaluate(() => {
      const root = document.documentElement;
      const bodyStyle = getComputedStyle(document.body);
      const rootStyle = getComputedStyle(root);
      const layerState = (pseudo) => {
        const style = getComputedStyle(document.body, pseudo);
        return {
          content: style.content,
          display: style.display,
          position: style.position,
          pointerEvents: style.pointerEvents,
          backgroundImage: style.backgroundImage,
        };
      };

      return {
        appliedTheme: root.dataset.theme,
        dark: root.classList.contains('dark'),
        oled: root.classList.contains('oled'),
        before: layerState('::before'),
        after: layerState('::after'),
        bodyBackgroundColor: bodyStyle.backgroundColor,
        bodyBackgroundImage: bodyStyle.backgroundImage,
        rootBackgroundColor: rootStyle.backgroundColor,
        rootBackgroundImage: rootStyle.backgroundImage,
        viewportWidth: root.clientWidth,
        rootScrollWidth: root.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      };
    });

    const expectedDark = theme !== 'light';
    const expectedOled = theme === 'oled';
    if (
      state.appliedTheme !== theme ||
      state.dark !== expectedDark ||
      state.oled !== expectedOled
    ) {
      failures.push(
        `theme state mismatch (theme=${state.appliedTheme}, dark=${state.dark}, oled=${state.oled})`
      );
    }

    const documentWidth = Math.max(state.rootScrollWidth, state.bodyScrollWidth);
    if (documentWidth > state.viewportWidth + 1) {
      failures.push(
        `decorative background creates horizontal overflow ${documentWidth}px > ${state.viewportWidth}px`
      );
    }

    for (const [name, layer] of [
      ['body::before', state.before],
      ['body::after', state.after],
    ]) {
      if (theme === 'oled') {
        if (layer.display !== 'none') {
          failures.push(`${name} remains visible in OLED (display=${layer.display})`);
        }
        continue;
      }
      if (
        layer.display === 'none' ||
        layer.content === 'none' ||
        layer.backgroundImage === 'none'
      ) {
        failures.push(
          `${name} decorative layer is missing ` +
            `(display=${layer.display}, content=${layer.content}, background=${layer.backgroundImage})`
        );
      }
      if (layer.position !== 'fixed') {
        failures.push(`${name} is not viewport-fixed (position=${layer.position})`);
      }
      if (layer.pointerEvents !== 'none') {
        failures.push(`${name} can intercept input (pointer-events=${layer.pointerEvents})`);
      }
    }

    if (theme === 'oled') {
      if (!isOpaqueBlack(state.bodyBackgroundColor)) {
        failures.push(`OLED body is not opaque true black (${state.bodyBackgroundColor})`);
      }
      if (!isOpaqueBlack(state.rootBackgroundColor)) {
        failures.push(`OLED root is not opaque true black (${state.rootBackgroundColor})`);
      }
      if (state.bodyBackgroundImage !== 'none' || state.rootBackgroundImage !== 'none') {
        failures.push(
          `OLED page retains a background image ` +
            `(body=${state.bodyBackgroundImage}, root=${state.rootBackgroundImage})`
        );
      }
    }

    if (theme === 'light' && viewport.name === 'desktop-background') {
      await page.emulateMediaType('print');
      const printLayerDisplays = await page.evaluate(() =>
        ['::before', '::after'].map((pseudo) => getComputedStyle(document.body, pseudo).display)
      );
      if (printLayerDisplays.some((display) => display !== 'none')) {
        failures.push(
          `print media leaves a decorative layer visible ` +
            `(before=${printLayerDisplays[0]}, after=${printLayerDisplays[1]})`
        );
      }
      await page.emulateMediaType('screen');
    }
  } catch (error) {
    failures.push(`decorative background audit failed: ${error.message}`);
  } finally {
    await page.close();
  }

  return failures;
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

async function auditSkillBrowser(browser, baseUrl, viewport, theme = 'oled') {
  const page = await browser.newPage();
  const failures = [];

  try {
    await page.evaluateOnNewDocument(
      (selectedTheme, dismissedChangelogVersion) => {
        localStorage.setItem('umatools-theme', selectedTheme);
        localStorage.setItem('umatools.changelog.dismissed', dismissedChangelogVersion);
        localStorage.setItem(
          'umatools.tutorial.optimizer',
          JSON.stringify({ status: 'completed', step: 0 })
        );
      },
      theme,
      changelogVersion
    );
    await page.setViewport(viewport);
    await page.goto(`${baseUrl}/optimizer`, { waitUntil: 'load', timeout: 20_000 });
    await page.waitForFunction(
      () => document.querySelectorAll('#skills-datalist-shared option').length > 20,
      { timeout: 10_000 }
    );
    await page.click('#browse-skills-btn');
    await page.waitForSelector('#skill-browser-backdrop.open .skill-card', { timeout: 5_000 });
    await new Promise((resolve) => setTimeout(resolve, 350));

    const state = await page.evaluate(async () => {
      const modal = document.querySelector('#skill-browser-modal');
      const grid = document.querySelector('#skill-browser-grid');
      const header = modal.querySelector(':scope > .modal-header');
      const footer = modal.querySelector(':scope > .modal-footer');
      const card = grid.querySelector('.skill-card');
      const cardStyle = getComputedStyle(card);
      const check = card.querySelector('.card-check');
      const checkRect = check.getBoundingClientRect();
      const metaStyle = getComputedStyle(card.querySelector('.card-meta'));
      const hintStyle = getComputedStyle(card.querySelector('.card-hint-btn'));
      const cardRect = card.getBoundingClientRect();
      const cardContentBottom = Math.max(
        card.querySelector('.card-meta').getBoundingClientRect().bottom,
        card.querySelector('.card-hints').getBoundingClientRect().bottom
      );
      const cardChildren = ['card-name', 'card-lower', 'card-meta', 'card-hints'].map(
        (className) => {
          const element = card.querySelector(`.${className}`);
          const rect = element?.getBoundingClientRect();
          return rect
            ? `${className}:${(rect.top - cardRect.top).toFixed(1)}-${(rect.bottom - cardRect.top).toFixed(1)}`
            : `${className}:none`;
        }
      );
      const dot = document.querySelector('.filter-chip[data-category="gold"] .chip-dot');
      const dotRect = dot.getBoundingClientRect();
      const subfilters = document.querySelector('.filter-chip-sub');
      const modalRect = modal.getBoundingClientRect();
      const visibleCards = [...grid.querySelectorAll('.skill-card')].filter(
        (item) => getComputedStyle(item).display !== 'none'
      );
      const columnPositions = [
        ...new Set(
          visibleCards.slice(0, 12).map((item) => Math.round(item.getBoundingClientRect().left))
        ),
      ];
      const categoryColors = ['gold', 'blue', 'red'].map(
        (category) =>
          getComputedStyle(
            document.querySelector(`.filter-chip[data-category="${category}"] .chip-dot`)
          ).backgroundColor
      );
      const railColors = ['gold', 'blue', 'red'].map(
        (category) =>
          getComputedStyle(document.querySelector(`.skill-card.cat-${category}`)).borderLeftColor
      );
      const headerTop = header.getBoundingClientRect().top;
      const footerTop = footer.getBoundingClientRect().top;
      grid.scrollTop = Math.min(320, grid.scrollHeight - grid.clientHeight);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      return {
        oled: document.documentElement.classList.contains('oled'),
        modalBackground: getComputedStyle(modal).backgroundColor,
        modalWithinViewport:
          modalRect.left >= -1 &&
          modalRect.right <= document.documentElement.clientWidth + 1 &&
          modalRect.top >= -1 &&
          modalRect.bottom <= innerHeight + 1,
        horizontalOverflow:
          document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        columns: columnPositions.length,
        gridScrolls: grid.scrollHeight > grid.clientHeight + 1,
        gridOverflowY: getComputedStyle(grid).overflowY,
        headerStayed: Math.abs(header.getBoundingClientRect().top - headerTop) < 1,
        footerStayed: Math.abs(footer.getBoundingClientRect().top - footerTop) < 1,
        cardPadding: parseFloat(cardStyle.paddingTop),
        cardBorderLeft: parseFloat(cardStyle.borderLeftWidth),
        cardBackground: cardStyle.backgroundImage,
        cardContentBottomInset: cardRect.bottom - cardContentBottom,
        cardHeight: cardRect.height,
        cardGridRows: cardStyle.gridTemplateRows,
        cardChildren,
        checkWidth: checkRect.width,
        checkHeight: checkRect.height,
        metaDisplay: metaStyle.display,
        metaGap: parseFloat(metaStyle.columnGap),
        hintBorder: parseFloat(hintStyle.borderTopWidth),
        hintBackground: hintStyle.backgroundColor,
        dotWidth: dotRect.width,
        dotHeight: dotRect.height,
        subfiltersInitiallyHidden: getComputedStyle(subfilters).display === 'none',
        categoryColors,
        railColors,
      };
    });

    if (theme === 'oled' && !state.oled) failures.push('OLED theme was not applied');
    if (theme === 'oled' && state.modalBackground !== 'rgb(0, 0, 0)') {
      failures.push(`OLED modal surface is not true black (${state.modalBackground})`);
    }
    if (!state.modalWithinViewport) failures.push('modal leaves the viewport');
    if (state.horizontalOverflow) failures.push('open modal creates horizontal page overflow');
    const expectedColumns = viewport.width <= 700 ? 1 : 2;
    if (state.columns !== expectedColumns) {
      failures.push(`expected ${expectedColumns} card column(s), found ${state.columns}`);
    }
    if (!state.gridScrolls || !['auto', 'scroll'].includes(state.gridOverflowY)) {
      failures.push('skill grid does not own vertical scrolling');
    }
    if (!state.headerStayed || !state.footerStayed) {
      failures.push('modal header or footer moved while the skill grid scrolled');
    }
    if (state.cardPadding <= 0 || state.cardBorderLeft < 4 || state.cardBackground === 'none') {
      failures.push('skill cards are missing padding, tint, or category rail');
    }
    if (state.cardContentBottomInset < 6) {
      failures.push(
        `skill card content is clipped at the bottom (${state.cardContentBottomInset.toFixed(1)}px inset; ` +
          `${state.cardHeight.toFixed(1)}px card; rows ${state.cardGridRows}; ${state.cardChildren.join(', ')})`
      );
    }
    if (state.checkWidth < 18 || state.checkHeight < 18) {
      failures.push(`selection control is undersized (${state.checkWidth}x${state.checkHeight})`);
    }
    if (state.metaDisplay !== 'flex' || state.metaGap <= 0) {
      failures.push('card metadata is not separated with a flex gap');
    }
    if (state.hintBorder <= 0 || state.hintBackground === 'rgba(0, 0, 0, 0)') {
      failures.push('hint-level buttons are missing custom styling');
    }
    if (state.dotWidth < 8 || state.dotHeight < 8) {
      failures.push(`category dot is undersized (${state.dotWidth}x${state.dotHeight})`);
    }
    if (!state.subfiltersInitiallyHidden) failures.push('type subfilters start expanded');
    assertDistinctSemanticColors('Browse Skills category dots', state.categoryColors, failures);
    assertDistinctSemanticColors('Browse Skills card rails', state.railColors, failures);

    await page.click('.filter-chip-group > .filter-chip');
    const expanded = await page.$eval(
      '.filter-chip-group',
      (group) =>
        group.classList.contains('expanded') &&
        group.querySelector(':scope > .filter-chip')?.getAttribute('aria-expanded') === 'true' &&
        getComputedStyle(group.querySelector('.filter-chip-sub')).display === 'flex'
    );
    if (!expanded) failures.push('type subfilters did not expand accessibly');

    await page.click('.skill-card .card-check');
    const selection = await page.evaluate(() => ({
      selected: document.querySelector('.skill-card')?.classList.contains('selected'),
      pressed:
        document.querySelector('.skill-card .card-check')?.getAttribute('aria-pressed') === 'true',
      count: document.querySelector('#skill-browser-selected-count')?.textContent,
      addEnabled: !document.querySelector('#skill-browser-add')?.disabled,
    }));
    if (
      !selection.selected ||
      !selection.pressed ||
      selection.count !== '1' ||
      !selection.addEnabled
    ) {
      failures.push('card selection state did not update the control and Add button');
    }

    if (process.env.RESPONSIVE_SCREENSHOTS === '1') {
      const screenshotPath = path.join(
        process.env.TEMP || projectRoot,
        `umatools-skill-browser-${theme}-${viewport.name}.png`
      );
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`  screenshot: ${screenshotPath}`);
    }

    await page.click('#skill-browser-cancel');
    await new Promise((resolve) => setTimeout(resolve, 50));
    const closeState = await page.evaluate(() => ({
      hidden: document.querySelector('#skill-browser-backdrop')?.getAttribute('aria-hidden'),
      open: document.querySelector('#skill-browser-backdrop')?.classList.contains('open'),
      focusId: document.activeElement?.id,
    }));
    if (
      closeState.hidden !== 'true' ||
      closeState.open ||
      closeState.focusId !== 'browse-skills-btn'
    ) {
      failures.push('closing the modal did not hide it and restore trigger focus');
    }
  } catch (error) {
    failures.push(`skill browser audit failed: ${error.message}`);
  } finally {
    await page.close();
  }

  return failures;
}

async function auditOledSemanticAccents(browser, baseUrl) {
  const page = await browser.newPage();
  const failures = [];
  const viewport = { width: 1200, height: 900, deviceScaleFactor: 1, isMobile: false };

  try {
    await page.evaluateOnNewDocument((dismissedChangelogVersion) => {
      localStorage.setItem('umatools-theme', 'oled');
      localStorage.setItem('umatools.changelog.dismissed', dismissedChangelogVersion);
    }, changelogVersion);
    await page.setViewport(viewport);

    await page.goto(`${baseUrl}/optimizer`, { waitUntil: 'load', timeout: 20_000 });
    await page.waitForSelector('.race-config-container select.aff-grade-good', { timeout: 5_000 });
    const aptitudeColors = await page.evaluate(() => ({
      groups: [...document.querySelectorAll('#optimizer-race-config .race-config-pane .kv-row')]
        .slice(0, 3)
        .map((row) => getComputedStyle(row.querySelector('.k'), '::before').backgroundColor),
      grades: ['good', 'average', 'bad', 'terrible'].map(
        (grade) => getComputedStyle(document.querySelector(`select.aff-grade-${grade}`)).borderColor
      ),
    }));
    assertDistinctSemanticColors('OLED aptitude groups', aptitudeColors.groups, failures);
    assertDistinctSemanticColors('OLED aptitude grades', aptitudeColors.grades, failures);

    await page.goto(`${baseUrl}/skills`, { waitUntil: 'load', timeout: 20_000 });
    await page.waitForFunction(
      () => document.querySelectorAll('#skillFilters .skills-filter-btn').length >= 4,
      { timeout: 20_000 }
    );
    const libraryState = await page.evaluate(() => ({
      categories: [...document.querySelectorAll('#skillFilters .skills-filter-btn')].map(
        (button) => button.dataset.cat
      ),
      colors: ['gold', 'blue', 'red'].map((category) => {
        const selector =
          category === 'gold'
            ? '.skills-filter-btn[data-cat="golden"], .skills-filter-btn[data-cat="gold"]'
            : `.skills-filter-btn[data-cat="${category}"]`;
        const button = document.querySelector(selector);
        return button ? getComputedStyle(button).color : '';
      }),
    }));
    if (libraryState.colors.some((color) => !color)) {
      failures.push(
        `Skill Library is missing a tested category (${libraryState.categories.join(', ')})`
      );
    } else {
      assertDistinctSemanticColors('OLED Skill Library categories', libraryState.colors, failures);
    }

    if (process.env.RESPONSIVE_SCREENSHOTS === '1') {
      const screenshotPath = path.join(
        process.env.TEMP || projectRoot,
        'umatools-oled-skill-library.png'
      );
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`  screenshot: ${screenshotPath}`);
    }

    const umadleTarget = encodeURIComponent('Special Week \u2014 Special Dreamer');
    await page.goto(`${baseUrl}/umadle?target=${umadleTarget}`, {
      waitUntil: 'load',
      timeout: 20_000,
    });
    await page.waitForNetworkIdle({ idleTime: 200, timeout: 3_000 }).catch(() => {});
    await page.waitForFunction(
      () => {
        const modal = document.querySelector('#umaPickerModal');
        if (modal?.hidden) document.querySelector('#pickUmaBtn')?.click();
        return Boolean(
          document.querySelector(
            '#umaPickerModal:not([hidden]) .modal-card-item[data-slug="100102-special-week"]'
          )
        );
      },
      { polling: 250, timeout: 20_000 }
    );
    await page.$eval('.modal-card-item[data-slug="100102-special-week"]', (item) => item.click());
    await page.waitForSelector('.guess-details', { timeout: 5_000 });
    const actualUmadleStates = await page.evaluate(() => {
      const details = document.querySelector('.guess-details');
      details.open = true;
      return ['match', 'up', 'down'].map(
        (state) => details.querySelectorAll(`.cell.${state}`).length
      );
    });
    if (actualUmadleStates.some((count) => count === 0)) {
      failures.push(
        `deterministic Umadle guess did not render every state (${actualUmadleStates})`
      );
    }
    const umadleColors = await page.evaluate(() => {
      const details = document.querySelector('.guess-details');
      return ['match', 'up', 'down'].map((state) => {
        const cell = details.querySelector(`.cell.${state}`);
        return {
          border: getComputedStyle(cell).borderColor,
          symbol: getComputedStyle(cell.querySelector('.sym')).color,
        };
      });
    });
    assertDistinctSemanticColors(
      'OLED Umadle state borders',
      umadleColors.map((state) => state.border),
      failures
    );
    assertDistinctSemanticColors(
      'OLED Umadle symbols',
      umadleColors.map((state) => state.symbol),
      failures
    );
    if (process.env.RESPONSIVE_SCREENSHOTS === '1') {
      const screenshotPath = path.join(process.env.TEMP || projectRoot, 'umatools-oled-umadle.png');
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`  screenshot: ${screenshotPath}`);
    }
  } catch (error) {
    failures.push(`OLED semantic accent audit failed: ${error.message}`);
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

    for (const viewport of decorativeBackgroundViewportDefinitions) {
      for (const theme of decorativeBackgroundThemes) {
        const failures = await auditDecorativeBackground(browser, baseUrl, viewport, theme);
        results.push({
          page: `background-${theme}`,
          viewport: viewport.name,
          passed: failures.length === 0,
          failures,
        });
        console.log(
          `${failures.length ? 'FAIL' : 'PASS'} ${`background-${theme}`.padEnd(15)} ${viewport.name}`
        );
        failures.forEach((failure) => console.log(`  - ${failure}`));
      }
    }

    const skillBrowserTheme = process.env.RESPONSIVE_MODAL_THEME || 'oled';
    for (const viewport of skillBrowserViewportDefinitions) {
      const failures = await auditSkillBrowser(browser, baseUrl, viewport, skillBrowserTheme);
      results.push({
        page: 'browse-skills',
        viewport: viewport.name,
        passed: failures.length === 0,
        failures,
      });
      console.log(
        `${failures.length ? 'FAIL' : 'PASS'} ${'browse-skills'.padEnd(15)} ${viewport.name}`
      );
      failures.forEach((failure) => console.log(`  - ${failure}`));
    }

    const oledFailures = await auditOledSemanticAccents(browser, baseUrl);
    results.push({
      page: 'oled-accents',
      viewport: 'desktop',
      passed: oledFailures.length === 0,
      failures: oledFailures,
    });
    console.log(`${oledFailures.length ? 'FAIL' : 'PASS'} ${'oled-accents'.padEnd(15)} desktop`);
    oledFailures.forEach((failure) => console.log(`  - ${failure}`));

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
