#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..', '..');
const assetsRoot = path.join(projectRoot, 'public', 'assets');

function walkJson(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
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
const datasets = new Map();
for (const file of files) {
  const relative = path.relative(projectRoot, file);
  const source = fs.readFileSync(file, 'utf8');
  if (!source.trim()) {
    failures.push(`${relative}: file is empty`);
    continue;
  }

  try {
    const value = JSON.parse(source);
    datasets.set(path.relative(assetsRoot, file).replaceAll(path.sep, '/'), value);
    if (value == null || typeof value !== 'object') {
      failures.push(`${relative}: expected an object or array at the root`);
    }
  } catch (error) {
    failures.push(`${relative}: ${error.message}`);
  }
}

function catalog(file, idKey, fields) {
  const rows = datasets.get(file);
  if (!Array.isArray(rows) || !rows.length) {
    failures.push(`${file}: expected a nonempty catalog`);
    return;
  }
  const ids = new Set();
  for (const row of rows) {
    if (!row || row[idKey] == null || ids.has(String(row[idKey]))) {
      failures.push(`${file}: missing or duplicate ${idKey}`);
      break;
    }
    ids.add(String(row[idKey]));
    if (fields.some((key) => row[key] == null)) {
      failures.push(`${file}: missing required fields`);
      break;
    }
  }
}
catalog('skills_all.json', 'id', ['jpname']);
catalog('skills_core.json', 'id', []);
catalog('uma_data.json', 'UmaSlug', ['UmaName']);
catalog('support_hints.json', 'SupportSlug', ['SupportHints']);
catalog('races.json', 'id', ['distance']);
for (const name of ['support_card.json', 'career.json']) {
  const rows = datasets.get(name);
  if (
    !Array.isArray(rows) ||
    !rows.length ||
    rows.some((row) => !row.EventName || !row.EventOptions || !Object.keys(row.EventOptions).length)
  )
    failures.push(`${name}: missing event answers`);
}
const allIds = new Set((datasets.get('skills_all.json') || []).map((row) => row.id));
if ((datasets.get('skills_core.json') || []).some((row) => !allIds.has(row.id)))
  failures.push('skills_core.json: IDs missing from skills_all.json');
for (const server of ['global', 'jp']) {
  for (const suffix of ['', '-core']) {
    const name = `master/${server}${suffix}.json`,
      data = datasets.get(name);
    if (
      !data ||
      data.server !== server ||
      data.schema_version !== 1 ||
      !data.source ||
      !Array.isArray(data.skills) ||
      !data.skills.length ||
      data.skills.length !== data.skill_count
    ) {
      failures.push(`${name}: invalid server, provenance or skill count`);
      continue;
    }
    if (
      new Set(data.skills.map((s) => s.id)).size !== data.skills.length ||
      data.skills.some(
        (s) =>
          !Number.isInteger(s.id) || !Number.isFinite(s.grade_value) || typeof s.name !== 'string'
      )
    )
      failures.push(`${name}: invalid skill records`);
  }
}
const parseCSV = require('../../public/js/skill-data.js').parseCSV;
for (const name of ['uma_skills.csv', 'uma_skills_jp.csv']) {
  const rows = parseCSV(fs.readFileSync(path.join(assetsRoot, name), 'utf8'));
  const header = rows[0] || [];
  const numeric = ['base_value', 'S_A', 'B_C', 'D_E_F', 'G'].map((key) => header.indexOf(key));
  if (
    rows.length < 2 ||
    numeric.includes(-1) ||
    rows
      .slice(1)
      .some((row) => numeric.some((i) => (i === numeric[0] && row[i] === '') || !Number.isFinite(Number(row[i]))))
  )
    failures.push(`${name}: missing or invalid rating columns`);
}

if (failures.length) {
  console.error(`Data validation failed (${failures.length} files):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Data validation passed (${files.length} JSON files and manifests).`);
