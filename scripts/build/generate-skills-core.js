#!/usr/bin/env node
// Generates a slim skills_core.json from skills_all.json
// Retains only fields needed by optimizer init: names, costs, linking
const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, '..', '..', 'public', 'assets', 'skills_all.json');
const OUTPUT = path.join(__dirname, '..', '..', 'public', 'assets', 'skills_core.json');

if (!fs.existsSync(INPUT)) {
  console.log('skills_all.json not found, skipping core generation');
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
if (!Array.isArray(data)) {
  console.error('skills_all.json is not an array');
  process.exit(1);
}

function slimGeneVersion(gv) {
  if (!gv || typeof gv !== 'object') return undefined;
  const slim = {};
  if (gv.id != null) slim.id = gv.id;
  if (gv.name) slim.name = gv.name;
  if (gv.name_en) slim.name_en = gv.name_en;
  if (gv.enname) slim.enname = gv.enname;
  if (gv.jpname) slim.jpname = gv.jpname;
  if (gv.cost != null) slim.cost = gv.cost;
  if (Array.isArray(gv.parent_skills) && gv.parent_skills.length) {
    slim.parent_skills = gv.parent_skills;
  }
  return Object.keys(slim).length ? slim : undefined;
}

const core = data.map(entry => {
  const slim = {};
  if (entry.id != null) slim.id = entry.id;
  if (entry.name) slim.name = entry.name;
  if (entry.name_en) slim.name_en = entry.name_en;
  if (entry.enname) slim.enname = entry.enname;
  if (entry.jpname) slim.jpname = entry.jpname;
  if (entry.cost != null) slim.cost = entry.cost;
  if (entry.rarity != null) slim.rarity = entry.rarity;
  if (Array.isArray(entry.type) && entry.type.length) slim.type = entry.type;
  if (Array.isArray(entry.versions) && entry.versions.length) slim.versions = entry.versions;
  if (Array.isArray(entry.parent_skills) && entry.parent_skills.length) {
    slim.parent_skills = entry.parent_skills;
  }
  const gv = slimGeneVersion(entry.gene_version);
  if (gv) slim.gene_version = gv;
  return slim;
});

const json = JSON.stringify(core);
fs.writeFileSync(OUTPUT, json);

const inputSize = fs.statSync(INPUT).size;
const outputSize = fs.statSync(OUTPUT).size;
const pct = Math.round((1 - outputSize / inputSize) * 100);
console.log(`skills_core.json: ${inputSize} -> ${outputSize} bytes (${pct}% reduction)`);
