#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..', '..');
const publicRoot = path.join(projectRoot, 'public');
const failures = [];
let checked = 0;

function walk(directory, extension) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
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
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    checkReference(htmlFile, match[1]);
  }

  const requiredMarkup = [
    ['doctype', /<!doctype html>/i],
    ['document language', /<html[^>]+\blang=["'][^"']+["']/i],
    ['title', /<title>[^<]+<\/title>/i],
    ['viewport metadata', /<meta[^>]+name=["']viewport["'][^>]*>/i],
  ];
  for (const [label, pattern] of requiredMarkup) {
    if (!pattern.test(html)) {
      failures.push(`${path.relative(projectRoot, htmlFile)} -> missing ${label}`);
    }
  }

  const ids = new Set();
  for (const match of html.matchAll(/\bid=["']([^"']+)["']/g)) {
    if (ids.has(match[1])) {
      failures.push(`${path.relative(projectRoot, htmlFile)} -> duplicate id "${match[1]}"`);
    }
    ids.add(match[1]);
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
  console.error(`Static reference check failed (${failures.length} missing):`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Static reference check passed (${checked} local references).`);
