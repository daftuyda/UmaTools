const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const root = path.resolve(__dirname, '../..');
const SkillData = require('../../public/js/skill-data');

async function main() {
  const source = fs.readFileSync(path.join(root, 'public/js/recommend.js'), 'utf8');
  const rec = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  assert.equal(rec.scoreOption([['Wit +10']]).total, 8);
  assert.equal(rec.scoreOption([['Wisdom +10']]).total, 8);
  assert.equal(rec.scoreOption([['Mood up']]).total, 3);
  assert.equal(rec.scoreOption([['Mood down']]).total, -3);
  assert.equal(rec.scoreOption([['Lose Practice Poor status']]).total, 20);
  assert.equal(rec.scoreOption([['All stats +10']]).total, 44);
  assert.equal(
    rec.scoreOption([['Randomly either (25%)', 'Wit +20', 'or (75%)', 'Speed +4']]).total,
    7
  );
  assert.equal(SkillData.aptitude(85, [0.7]), 60);
  assert.equal(SkillData.aptitude(95, [0.7]), 67); // Half-up retained; not a claim about MathF.Round.
  assert.deepEqual(SkillData.parseCSV('a,b\r\n"x,y","z""q"\n'), [
    ['a', 'b'],
    ['x,y', 'z"q'],
  ]);

  const solverSource = fs.readFileSync(path.join(root, 'public/js/optimizer.js'), 'utf8');
  const a = solverSource.indexOf('  function optimizeGrouped('),
    b = solverSource.indexOf('\n  function ', a + 1);
  const solver = {};
  vm.createContext(solver);
  vm.runInContext(solverSource.slice(a, b), solver);
  const items = [
    { id: 'one', cost: 100, score: 110 },
    { id: 'two', cost: 200, score: 300 },
  ];
  const groups = items.map((item, i) => [
    { none: true, items: [] },
    { pick: i, items: [i], cost: item.cost, score: item.score },
  ]);
  const normal = solver.optimizeGrouped(groups, items, 300);
  const huge = solver.optimizeGrouped(groups, items, 4294967295);
  assert.equal(huge.best, normal.best);
  assert.equal(huge.used, 300);
  assert.equal(huge.chosen.length, 2);
  assert.throws(() => solver.optimizeGrouped(groups, items, Infinity), /Invalid budget/);
  assert.equal(
    solver.optimizeGrouped(
      [
        [
          { none: true, cost: 0 },
          { cost: 1e12, score: 1, pick: 0 },
        ],
      ],
      items,
      1e12
    ).error,
    'problem_too_large'
  );
  for (let budget = 0; budget <= 350; budget += 17) {
    const expected = Math.max(
      ...[0, 1, 2, 3].map((mask) => {
        let cost = 0,
          score = 0;
        items.forEach((x, i) => {
          if (mask & (1 << i)) {
            cost += x.cost;
            score += x.score;
          }
        });
        return cost <= budget ? score : 0;
      })
    );
    assert.equal(solver.optimizeGrouped(groups, items, budget).best, expected);
  }

  const scraper = fs.readFileSync(path.join(root, 'scripts/data/gametora.js'), 'utf8');
  const ctx = {
    require,
    console: { log() {}, error() {} },
    __dirname: path.join(root, 'scripts/data'),
    process,
    fetch,
    URL,
    Buffer,
    setTimeout,
    clearTimeout,
  };
  vm.createContext(ctx);
  vm.runInContext(scraper.slice(0, scraper.lastIndexOf('main().catch')), ctx);
  vm.runInContext(
    `var writes=0; loadManifestData=async (m,key)=>{if(key==='support-cards')return [{support_id:123,rarity:3}];if(key.startsWith('training_events/'))throw Error('offline');return [];}; loadSkillNameMap=()=>({});writeJsonFile=()=>{writes++;};`,
    ctx
  );
  await assert.rejects(
    ctx.buildSupports('events', 'hints', {}, true, null),
    /Could not load training events/
  );
  assert.equal(ctx.writes, 0);
  const { validate } = require('../../scripts/data/refresh-provider');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'uma-validation-test-'));
  try {
    fs.mkdirSync(path.join(temp, 'old'));
    fs.mkdirSync(path.join(temp, 'new'));
    fs.writeFileSync(path.join(temp, 'old/events.json'), JSON.stringify([1, 2, 3]));
    fs.writeFileSync(path.join(temp, 'new/events.json'), '[]');
    assert.throws(
      () => validate(path.join(temp, 'new'), path.join(temp, 'old'), ['events.json']),
      /Refusing/
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }

  const originalFetch = global.fetch;
  try {
    global.fetch = async (url) => ({
      ok: true,
      json: async () =>
        url.includes('master/')
          ? {
              server: 'global',
              source: { kind: 'cdn-master' },
              skills: [{ id: 1, name: 'Studious', grade_value: 85, need_skill_point: 120 }],
            }
          : [{ id: 1, name_en: 'Studious', cost: 999 }],
    });
    const list = await SkillData.loadJSON('/test-skills.json', 'global');
    assert.equal(list[0].cost, 120);
    const csv = await SkillData.overlayCSV(
      'name,base_value,S_A,B_C,D_E_F,G,affinity_role\nStudious,1,1,1,1,1,Late',
      'global'
    );
    assert.equal(SkillData.parseCSV(csv)[1][5], '60');
    global.fetch = async (url) => ({
      ok: !url.includes('/master/') && !url.includes('/api/'),
      status: 503,
      json: async () => [{ id: 1, name_en: 'Backup', cost: 99 }],
    });
    const backup = await SkillData.loadJSON('/backup.json', 'jp');
    assert.equal(backup[0].cost, 99);
    assert.equal((await SkillData.status('jp')).source.kind, 'legacy-fallback');
  } finally {
    global.fetch = originalFetch;
  }
  console.log('Audit regression tests passed.');
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
