#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..', '..');
const publicRoot = path.join(projectRoot, 'public');
const siteOrigin = 'https://daftuyda.moe';
const failures = [];
const warnings = [];

function walkHtml(directory = publicRoot) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkHtml(fullPath);
    return entry.isFile() && entry.name.endsWith('.html') ? [fullPath] : [];
  });
}

function routeForHtml(filePath) {
  const relative = path.relative(publicRoot, filePath).replaceAll(path.sep, '/');
  if (relative === 'index.html') return '/';
  if (relative.endsWith('/index.html')) return `/${relative.slice(0, -'/index.html'.length)}`;
  return `/${relative.slice(0, -'.html'.length)}`;
}

function getAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`(?:^|\\s)${escapedName}=["']([^"']*)["']`, 'i'));
  return match ? match[1].trim() : '';
}

function findTag(html, tagName, attributeName, attributeValue) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'gi'))]
    .map((match) => match[0])
    .find(
      (tag) =>
        getAttribute(tag, attributeName).toLowerCase() === attributeValue.toLowerCase()
    );
}

function metaContent(html, key, value) {
  const tag = findTag(html, 'meta', key, value);
  return tag ? getAttribute(tag, 'content') : '';
}

function canonicalFrom(html) {
  const tag = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((candidate) =>
      getAttribute(candidate, 'rel')
        .toLowerCase()
        .split(/\s+/)
        .includes('canonical')
    );
  return tag ? getAttribute(tag, 'href') : '';
}

function textContent(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<template\b[\s\S]*?<\/template>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:[a-z]+|#\d+|#x[\da-f]+);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSiteUrl(value, baseUrl = siteOrigin) {
  try {
    const url = new URL(value, baseUrl);
    if (url.origin !== siteOrigin) return null;
    let pathname = url.pathname.replace(/\.html$/i, '');
    if (pathname !== '/') pathname = pathname.replace(/\/+$/, '');
    return `${siteOrigin}${pathname || '/'}`;
  } catch {
    return null;
  }
}

function addUnique(map, value, label, file) {
  if (!value) return;
  if (map.has(value)) {
    failures.push(`${file} -> duplicate ${label} also used by ${map.get(value)}`);
  } else {
    map.set(value, file);
  }
}

const titleOwners = new Map();
const descriptionOwners = new Map();
const canonicalOwners = new Map();
const pages = [];

for (const filePath of walkHtml()) {
  const file = path.relative(projectRoot, filePath).replaceAll(path.sep, '/');
  const route = routeForHtml(filePath);
  const expectedCanonical = `${siteOrigin}${route}`;
  const html = fs.readFileSync(filePath, 'utf8');
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1].replace(/\s+/g, ' ').trim() || '';
  const description = metaContent(html, 'name', 'description');
  const robots = metaContent(html, 'name', 'robots').toLowerCase();
  const canonical = canonicalFrom(html);
  const indexable = !robots.split(/[,\s]+/).includes('noindex');

  if (!indexable) continue;

  pages.push({ file, route, canonical, html });
  if (!title) failures.push(`${file} -> title is empty`);
  if (!description) failures.push(`${file} -> meta description is empty`);
  if (canonical !== expectedCanonical) {
    failures.push(`${file} -> canonical must be ${expectedCanonical}, found ${canonical || 'none'}`);
  }
  addUnique(titleOwners, title.toLowerCase(), 'title', file);
  addUnique(descriptionOwners, description.toLowerCase(), 'description', file);
  addUnique(canonicalOwners, canonical, 'canonical URL', file);

  const socialFields = [
    ['property', 'og:title'],
    ['property', 'og:description'],
    ['property', 'og:url'],
    ['property', 'og:image'],
    ['property', 'og:image:alt'],
    ['property', 'og:site_name'],
    ['name', 'twitter:card'],
    ['name', 'twitter:title'],
    ['name', 'twitter:description'],
    ['name', 'twitter:image'],
    ['name', 'twitter:image:alt'],
  ];
  for (const [key, value] of socialFields) {
    if (!metaContent(html, key, value)) failures.push(`${file} -> missing ${value}`);
  }
  const ogUrl = metaContent(html, 'property', 'og:url');
  if (ogUrl && ogUrl !== canonical) failures.push(`${file} -> og:url must match canonical URL`);
  const alignedMetadata = [
    ['og:title', metaContent(html, 'property', 'og:title'), title],
    ['og:description', metaContent(html, 'property', 'og:description'), description],
    ['twitter:title', metaContent(html, 'name', 'twitter:title'), title],
    ['twitter:description', metaContent(html, 'name', 'twitter:description'), description],
    [
      'twitter:image',
      metaContent(html, 'name', 'twitter:image'),
      metaContent(html, 'property', 'og:image'),
    ],
  ];
  for (const [label, actual, expected] of alignedMetadata) {
    if (actual && expected && actual !== expected) {
      failures.push(`${file} -> ${label} does not match the primary page metadata`);
    }
  }
  if (!/^https:\/\/daftuyda\.moe\/(?:api\/og|assets)\b/.test(metaContent(html, 'property', 'og:image'))) {
    failures.push(`${file} -> og:image must use an absolute first-party URL`);
  }

  const jsonLdBlocks = [...html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )];
  if (!jsonLdBlocks.length) failures.push(`${file} -> missing JSON-LD structured data`);
  let hasPageEntity = false;
  for (const block of jsonLdBlocks) {
    try {
      const data = JSON.parse(block[1]);
      const entities = Array.isArray(data) ? data : Array.isArray(data['@graph']) ? data['@graph'] : [data];
      hasPageEntity ||= entities.some((entity) => {
        const types = Array.isArray(entity?.['@type']) ? entity['@type'] : [entity?.['@type']];
        return types.some((type) =>
          ['Article', 'CollectionPage', 'HowTo', 'TechArticle', 'WebApplication', 'WebPage'].includes(
            type
          )
        );
      });
    } catch (error) {
      failures.push(`${file} -> invalid JSON-LD (${error.message})`);
    }
  }
  if (jsonLdBlocks.length && !hasPageEntity) {
    failures.push(`${file} -> JSON-LD has no page-level entity`);
  }

  const words = textContent(html).split(/\s+/).filter(Boolean).length;
  if (words < 50) warnings.push(`${file} -> only ${words} words of static crawlable copy`);
  if (title.length < 30 || title.length > 70) {
    warnings.push(`${file} -> title length is ${title.length} characters`);
  }
  if (description.length < 80 || description.length > 170) {
    warnings.push(`${file} -> description length is ${description.length} characters`);
  }
  if (!/uma musume/i.test(title)) warnings.push(`${file} -> title omits “Uma Musume”`);
}

const sitemapPath = path.join(publicRoot, 'sitemap.xml');
const sitemap = fs.readFileSync(sitemapPath, 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
const sitemapSet = new Set(sitemapUrls);
if (sitemapSet.size !== sitemapUrls.length) failures.push('public/sitemap.xml -> duplicate URLs');

const indexableUrls = new Set(pages.map((page) => page.canonical).filter(Boolean));
for (const url of indexableUrls) {
  if (!sitemapSet.has(url)) failures.push(`public/sitemap.xml -> missing ${url}`);
}
for (const url of sitemapSet) {
  if (!indexableUrls.has(url)) failures.push(`public/sitemap.xml -> ${url} has no indexable HTML page`);
}
for (const block of sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
  const url = block[1].match(/<loc>([^<]+)<\/loc>/)?.[1].trim() || 'unknown URL';
  const lastModified = block[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1].trim() || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastModified)) {
    failures.push(`public/sitemap.xml -> ${url} is missing a valid YYYY-MM-DD lastmod`);
  } else if (lastModified > new Date().toISOString().slice(0, 10)) {
    failures.push(`public/sitemap.xml -> ${url} has a future lastmod (${lastModified})`);
  }
}

const inboundUrls = new Set();
for (const page of pages) {
  for (const match of page.html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const url = normalizeSiteUrl(match[1], page.canonical || siteOrigin);
    if (url && url !== page.canonical) inboundUrls.add(url);
  }
}
const navSource = fs.readFileSync(path.join(publicRoot, 'js', 'nav.js'), 'utf8');
for (const match of navSource.matchAll(/\bpath:\s*["']([^"']+)["']/g)) {
  const url = normalizeSiteUrl(match[1]);
  if (url) inboundUrls.add(url);
}
for (const url of indexableUrls) {
  if (url !== `${siteOrigin}/` && !inboundUrls.has(url)) {
    failures.push(`${url} -> orphaned; no crawlable internal link points to this page`);
  }
}

const robots = fs.readFileSync(path.join(publicRoot, 'robots.txt'), 'utf8').replace(/^\uFEFF/, '');
if (!/^Sitemap:\s*https:\/\/daftuyda\.moe\/sitemap\.xml\s*$/im.test(robots)) {
  failures.push('public/robots.txt -> missing canonical sitemap directive');
}
if (!/^Allow:\s*\/api\/og\s*$/im.test(robots)) {
  failures.push('public/robots.txt -> dynamic social image endpoint is not crawlable');
}

const vercelConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'vercel.json'), 'utf8'));
if (vercelConfig.cleanUrls !== true || vercelConfig.trailingSlash !== false) {
  failures.push('vercel.json -> cleanUrls must be true and trailingSlash must be false');
}
const hostRedirect = vercelConfig.redirects?.find(
  (redirect) =>
    redirect.permanent === true &&
    redirect.destination === `${siteOrigin}/:path*` &&
    redirect.has?.some(
      (condition) => condition.type === 'host' && condition.value === 'www.daftuyda.moe'
    )
);
if (!hostRedirect) failures.push('vercel.json -> missing permanent www-to-apex redirect');

warnings.forEach((warning) => console.warn(`SEO warning: ${warning}`));
if (failures.length) {
  console.error(`SEO audit failed (${failures.length} issues):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `SEO audit passed (${pages.length} indexable pages, ${sitemapUrls.length} sitemap URLs` +
    `${warnings.length ? `, ${warnings.length} advisory warnings` : ''}).`
);
