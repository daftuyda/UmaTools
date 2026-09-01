#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..', '..');
const publicRoot = path.join(projectRoot, 'public');
const failures = [];
let checked = 0;

function walk(directory, extension) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath, extension);
    return !extension || path.extname(entry.name) === extension ? [fullPath] : [];
  });
}

function resolvePublicPath(urlPath) {
  const cleanPath = urlPath.split(/[?#]/, 1)[0];
  if (!cleanPath || cleanPath === '/') return path.join(publicRoot, 'index.html');
  const relativePath = cleanPath.replace(/^\//, '');
  const directPath = path.join(publicRoot, relativePath);
  if (path.extname(relativePath)) return directPath;
  return path.join(publicRoot, relativePath + '.html');
}

function getAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`(?:^|\\s)${escapedName}=["']([^"']*)["']`, 'i'));
  return match ? match[1] : null;
}

function checkReference(sourceFile, reference) {
  if (
    !reference ||
    reference.startsWith('#') ||
    reference.startsWith('http:') ||
    reference.startsWith('https:') ||
    reference.startsWith('mailto:') ||
    reference.startsWith('data:') ||
    reference.startsWith('/api/') ||
    reference.startsWith('/_vercel/') ||
    reference.includes('${')
  ) {
    return;
  }

  const target = reference.startsWith('/')
    ? resolvePublicPath(reference)
    : path.resolve(path.dirname(sourceFile), reference.split(/[?#]/, 1)[0]);

  checked += 1;
  if (!fs.existsSync(target)) {
    failures.push(
      `${path.relative(projectRoot, sourceFile)} -> ${reference} ` +
        `(missing ${path.relative(projectRoot, target)})`
    );
  }
}

for (const htmlFile of walk(publicRoot, '.html')) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  const markup = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  const relativeHtmlFile = path.relative(projectRoot, htmlFile);
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    checkReference(htmlFile, match[1]);
  }

  const requiredMarkup = [
    ['doctype', /<!doctype html>/i],
    ['document language', /<html[^>]+\blang=["'][^"']+["']/i],
    ['title', /<title>[^<]+<\/title>/i],
    ['viewport metadata', /<meta[^>]+name=["']viewport["'][^>]*>/i],
    ['description metadata', /<meta[^>]+name=["']description["'][^>]*>/i],
    ['canonical URL', /<link[^>]+rel=["']canonical["'][^>]*>/i],
    ['main landmark', /<main\b/i],
    ['page heading', /<h1\b/i],
  ];
  for (const [label, pattern] of requiredMarkup) {
    if (!pattern.test(html)) {
      failures.push(`${relativeHtmlFile} -> missing ${label}`);
    }
  }

  const viewportTag = markup.match(/<meta[^>]+name=["']viewport["'][^>]*>/i)?.[0] || '';
  const viewportContent = getAttribute(viewportTag, 'content') || '';
  if (viewportTag && !/\bwidth\s*=\s*device-width\b/i.test(viewportContent)) {
    failures.push(`${relativeHtmlFile} -> viewport must use width=device-width`);
  }
  if (/\buser-scalable\s*=\s*no\b|\bmaximum-scale\s*=\s*1(?:\.0+)?\b/i.test(viewportContent)) {
    failures.push(`${relativeHtmlFile} -> viewport must not disable page zoom`);
  }

  const mainCount = [...markup.matchAll(/<main\b/gi)].length;
  if (mainCount !== 1)
    failures.push(`${relativeHtmlFile} -> expected one main landmark, found ${mainCount}`);

  const headingCount = [...markup.matchAll(/<h1\b/gi)].length;
  if (headingCount !== 1)
    failures.push(`${relativeHtmlFile} -> expected one h1, found ${headingCount}`);

  const ids = new Set();
  for (const match of markup.matchAll(/\bid=["']([^"']+)["']/g)) {
    if (ids.has(match[1])) {
      failures.push(`${relativeHtmlFile} -> duplicate id "${match[1]}"`);
    }
    ids.add(match[1]);
  }

  for (const match of markup.matchAll(
    /\b(aria-controls|aria-describedby|aria-labelledby)=["']([^"']+)["']/gi
  )) {
    for (const referencedId of match[2].trim().split(/\s+/)) {
      if (referencedId && !ids.has(referencedId)) {
        failures.push(`${relativeHtmlFile} -> ${match[1]} references missing id "${referencedId}"`);
      }
    }
  }

  for (const match of markup.matchAll(/<label\b[^>]*\bfor=["']([^"']+)["'][^>]*>/gi)) {
    if (!ids.has(match[1])) {
      failures.push(`${relativeHtmlFile} -> label references missing id "${match[1]}"`);
    }
  }

  for (const match of markup.matchAll(/<img\b[^>]*>/gi)) {
    if (getAttribute(match[0], 'alt') === null) {
      failures.push(`${relativeHtmlFile} -> image missing alt text: ${match[0]}`);
    }
  }

  for (const match of markup.matchAll(/<a\b[^>]*\btarget=["']_blank["'][^>]*>/gi)) {
    const rel = getAttribute(match[0], 'rel') || '';
    if (!/\bnoopener\b/i.test(rel)) {
      failures.push(`${relativeHtmlFile} -> target=_blank link missing rel=noopener`);
    }
  }

  for (const match of markup.matchAll(/<[^>]+\brole=["'](?:dialog|progressbar)["'][^>]*>/gi)) {
    const tag = match[0];
    if (
      getAttribute(tag, 'aria-label') === null &&
      getAttribute(tag, 'aria-labelledby') === null &&
      getAttribute(tag, 'title') === null
    ) {
      failures.push(`${relativeHtmlFile} -> named ARIA role is missing an accessible name: ${tag}`);
    }
  }

  for (const match of markup.matchAll(/\btabindex=["']([1-9]\d*)["']/gi)) {
    failures.push(`${relativeHtmlFile} -> avoid positive tabindex (${match[1]})`);
  }
}

const stylesheet = path.join(publicRoot, 'css', 'air.css');
const css = fs.readFileSync(stylesheet, 'utf8');
for (const match of css.matchAll(/url\((?:["']?)([^)'"\s]+)(?:["']?)\)/g)) {
  checkReference(stylesheet, match[1]);
}

const serviceWorker = path.join(publicRoot, 'sw.js');
const swSource = fs.readFileSync(serviceWorker, 'utf8');
const staticBlock = swSource.match(/const STATIC_ASSETS = \[([\s\S]*?)\];/);
if (!staticBlock) {
  failures.push('public/sw.js -> unable to locate STATIC_ASSETS');
} else {
  for (const match of staticBlock[1].matchAll(/["']([^"']+)["']/g)) {
    checkReference(serviceWorker, match[1]);
  }
}

const markdownFiles = [
  path.join(projectRoot, 'README.md'),
  path.join(projectRoot, 'docs', 'architecture.md'),
  ...walk(path.join(projectRoot, 'docs', 'guides'), '.md'),
  path.join(projectRoot, 'scripts', 'data', 'README.md'),
];

for (const markdownFile of markdownFiles) {
  const markdown = fs.readFileSync(markdownFile, 'utf8');
  for (const match of markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const reference = match[1].trim().replace(/^<|>$/g, '');
    checkReference(markdownFile, reference);
  }
}

if (failures.length) {
  console.error(`Static site check failed (${failures.length} issues):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Static site check passed (${checked} local references).`);
