#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..', '..');
const assetsRoot = path.join(projectRoot, 'public', 'assets');

function walkJson(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkJson(fullPath);
    return entry.isFile() && entry.name.endsWith('.json') ? [fullPath] : [];
  });
}

const files = [
  ...walkJson(assetsRoot),
  path.join(projectRoot, 'public', 'site.webmanifest'),
  path.join(projectRoot, 'package.json'),
  path.join(projectRoot, 'vercel.json'),
];

const failures = [];
for (const file of files) {
  const relative = path.relative(projectRoot, file);
  const source = fs.readFileSync(file, 'utf8');
  if (!source.trim()) {
    failures.push(`${relative}: file is empty`);
    continue;
  }

  try {
    const value = JSON.parse(source);
    if (value == null || typeof value !== 'object') {
      failures.push(`${relative}: expected an object or array at the root`);
    }
  } catch (error) {
    failures.push(`${relative}: ${error.message}`);
  }
}

if (failures.length) {
  console.error(`Data validation failed (${failures.length} files):`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Data validation passed (${files.length} JSON files and manifests).`);
