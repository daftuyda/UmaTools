/* Compare the same seeded measurements from persistent and fresh-process workers. */
const fs = require('fs');
const crypto = require('crypto');
const assert = require('assert');
const mainPath = process.argv[2] || 'public/assets/team-trials-calibration.json';
const auditPath = process.argv[3] || '.tmp-team-trials/calibration-audit.json';
const output = process.argv[4] || 'docs/analysis/team-trials-validation.json';
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const main = read(mainPath),
  audit = read(auditPath);
assert.equal(audit.method.workerIsolation, 'fresh process per batch');
for (const key of ['engineSha256', 'skillTableSha256', 'poolSha256', 'seedsPerCourse'])
  assert.equal(main.method[key], audit.method[key], key);
let contexts = 0,
  courseChecks = 0;
const skills = new Set();
for (const [id, skill] of Object.entries(audit.skills))
  for (const [category, styles] of Object.entries(skill.contexts))
    for (const [style, cell] of Object.entries(styles)) {
      if (!cell.samples) continue;
      const original = main.skills[id].contexts[category][style];
      assert.equal(original.hits, cell.hits, id + ' ' + category + ' ' + style);
      assert.equal(original.samples, cell.samples);
      assert.deepStrictEqual(original.byCourse, cell.byCourse);
      skills.add(id);
      contexts++;
      courseChecks += Object.keys(cell.byCourse).length;
    }
assert.equal(contexts, 720);
const report = {
  validatedAt: new Date().toISOString(),
  calibrationSha256: crypto.createHash('sha256').update(fs.readFileSync(mainPath)).digest('hex'),
  calibrationRaces: main.method.races,
  auditRaces: audit.method.races,
  skills: skills.size,
  contexts,
  courseChecks,
  exactMatches: true,
  independentProcesses: true,
  additionalIndependentSeeds: false,
  note: 'Same-seed reproducibility audit; it does not increase the statistical sample size or establish game fidelity.',
  auditWorkerRecoveries: audit.method.workerRecoveries.length,
};
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
