const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadFunctions(file, names, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../../public/js', file), 'utf8');
  const context = vm.createContext(globals);
  for (const name of names) {
    const start = source.indexOf(`  function ${name}(`);
    assert(start >= 0, `Missing ${name}`);
    const end = source.indexOf('\n  }', start) + 4;
    vm.runInContext(source.slice(start, end), context);
  }
  return context;
}
const rating = loadFunctions(
  'optimizer.js',
  ['buildGroups', 'optimizeGrouped', 'optimizeRatingBuild'],
  {
    normalize: (x) =>
      String(x || '')
        .trim()
        .toLowerCase(),
    canonicalCategory: (x) => x,
    isGoldCategory: (x) => x === 'gold' || x === 'golden',
  }
);
const team = loadFunctions('team-trials-optimizer.js', ['buildGroups', 'optimizeGroups'], {
  isGold: (x) => x === 'gold' || x === 'golden',
  num: (x, fallback) => (Number.isFinite(Number(x)) ? Number(x) : fallback),
});

// Independent exhaustive oracle: enumerate all combinations, reject missing requirements,
// then maximize the objective and minimize spend. No dynamic-programming code is reused.
function exhaustive(groups, items, budget) {
  let best = null;
  function visit(index, cost, score, selected) {
    if (cost > budget) return;
    if (index === groups.length) {
      if (items.some((item, i) => item.required && !selected.has(i))) return;
      if (!best || score > best.score || (score === best.score && cost < best.cost))
        best = { score, cost };
      return;
    }
    for (const option of groups[index])
      visit(
        index + 1,
        cost + (option.cost || 0),
        score + (option.score || 0),
        new Set([...selected, ...(option.items || [])])
      );
  }
  visit(0, 0, 0, new Set());
  return best;
}

function fixture(cost) {
  return [
    {
      id: 'gold',
      skillId: 2,
      category: 'gold',
      lowerRowId: 'lower',
      cost,
      score: 400,
      ratingScore: 400,
    },
    {
      id: 'lower',
      skillId: 1,
      category: 'yellow',
      parentGoldId: 'gold',
      required: true,
      cost: 100,
      score: 100,
      ratingScore: 100,
    },
    { id: 'other', skillId: 3, category: 'yellow', cost: 150, score: 350, ratingScore: 350 },
  ];
}
// Before the fix: making gold cheaper changed displayed rating 450 -> 400.
for (const cost of [300, 250, 200, 150]) {
  const items = fixture(cost);
  const result = rating.optimizeRatingBuild(items, 350);
  assert.equal(result.best, cost <= 200 ? 750 : 450);
  assert.equal(
    result.chosen.reduce((n, x) => n + x.score, 0),
    result.best
  );
  assert(result.chosen.some((x) => x.id === 'lower'));
  assert(result.used <= 350);
  // Import/row order must not break prerequisite grouping.
  assert.equal(rating.optimizeRatingBuild([...items].reverse(), 350).best, result.best);
}
// Required gold: lower cost is already included; its rating must not be added twice.
let items = fixture(300).map((x) => ({ ...x, required: x.id === 'gold' }));
assert.equal(rating.optimizeRatingBuild(items, 300).best, 400);
assert.equal(rating.optimizeRatingBuild(items, 299).error, 'required_unreachable');
// First option after mandatory filtering is still a real choice (not "none").
assert.equal(rating.optimizeRatingBuild(fixture(300), 100).best, 100);
const circle = [
  {
    id: 'base',
    skillId: 10,
    category: 'green',
    circleRowId: 'upgrade',
    required: true,
    cost: 100,
    score: 100,
  },
  { id: 'upgrade', skillId: 11, category: 'green', parentCircleId: 'base', cost: 50, score: 150 },
];
assert.equal(rating.optimizeRatingBuild(circle, 150).best, 150);
assert.equal(rating.optimizeRatingBuild(circle.slice().reverse(), 150).best, 150);
const evo = [
  { id: 'evo', skillId: 20, category: 'evo', parentEvoId: 'gold', cost: 0, score: 600 },
  ...fixture(300).map((x) => (x.id === 'gold' ? { ...x, evoRowIds: 'evo', required: true } : x)),
];
assert.equal(rating.optimizeRatingBuild(evo, 300).best, 600);

const chain = [
  {
    id: 'gold',
    skillId: 30,
    category: 'gold',
    lowerRowId: 'base',
    required: true,
    cost: 300,
    score: 400,
  },
  {
    id: 'base',
    skillId: 31,
    category: 'green',
    parentGoldId: 'gold',
    circleRowId: 'circle',
    cost: 100,
    score: 100,
  },
  { id: 'circle', skillId: 32, category: 'green', parentCircleId: 'base', cost: 50, score: 150 },
];
const chainResult = rating.optimizeRatingBuild(chain, 300);
assert.equal(chainResult.best, 400);
assert.equal(chainResult.used, 300);
assert.equal(chainResult.chosen.filter((x) => x.comboComponent).length, 2);
for (const input of [chain, [...chain].reverse(), fixture(250), fixture(300)]) {
  const prepared = input.map((x) => ({
    ...x,
    expectedValueInt: x.score,
    consistencyInt: 0,
    svInt: 0,
  }));
  const result = team.optimizeGroups(
    team.buildGroups(prepared),
    prepared,
    input[0].id === 'other' || input.some((x) => x.id === 'other') ? 350 : 300
  );
  assert.equal(result.value, input.some((x) => x.id === 'other') ? 450 : 400);
  if (!input.some((x) => x.id === 'other'))
    assert.equal(result.chosen.filter((x) => x.comboComponent).length, 2);
}
// An imported dependency ID must refer to its parent, never to the child itself.
assert.equal(
  rating.optimizeRatingBuild(
    [
      { id: 'base', skillId: 31, category: 'green', cost: 100, score: 100 },
      {
        id: 'circle',
        skillId: 32,
        category: 'green',
        lowerSkillId: 31,
        parentSkillIds: [31],
        cost: 50,
        score: 150,
      },
    ],
    150
  ).best,
  150
);

let seed = 0x13579;
function random(n) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed % n;
}
for (let trial = 0; trial < 1200; trial++) {
  items = [];
  const groups = Array.from({ length: 1 + random(5) }, () => {
    const options = [{ none: true, cost: 0, score: 0, items: [] }];
    for (let j = 0, count = 1 + random(3); j < count; j++) {
      const index = items.length;
      const item = {
        id: String(index),
        cost: random(35),
        score: random(90),
        required: random(12) === 0,
      };
      items.push(item);
      options.push({ pick: index, items: [index], cost: item.cost, score: item.score });
    }
    return options;
  });
  const budget = random(110);
  const expected = exhaustive(groups, items, budget);
  const result = rating.optimizeGrouped(groups, items, budget);
  if (!expected) assert.equal(result.error, 'required_unreachable');
  else {
    assert.equal(result.best, expected.score);
    assert.equal(result.used, expected.cost);
    assert.equal(
      result.chosen.reduce((n, x) => n + x.score, 0),
      result.best
    );
    assert(rating.optimizeGrouped(groups, items, budget + 10).best >= result.best);
    const cheaper = groups.map((opts) => opts.map((o) => ({ ...o, cost: Math.floor(o.cost / 2) })));
    const cheapItems = items.map((x) => ({ ...x, cost: Math.floor(x.cost / 2) }));
    assert(rating.optimizeGrouped(cheaper, cheapItems, budget).best >= result.best);
  }
  // Team Trials uses the same mandatory group constraint; identical secondary
  // metrics isolate its primary objective for an independent exhaustive comparison.
  const tt = groups.map((opts) =>
    opts.map((o) => ({ ...o, value: o.score, consistency: 0, sv: 0, rating: 0 }))
  );
  const ttResult = team.optimizeGroups(tt, items, budget);
  if (!expected) assert.equal(ttResult.error, 'required_unreachable');
  else {
    assert.equal(ttResult.value, expected.score);
    assert.equal(ttResult.used, expected.cost);
  }
}
// Exercise Team Trials' secondary priorities with a separate scalar encoding oracle.
for (let trial = 0; trial < 300; trial++) {
  const items = [],
    groups = [];
  for (let g = 0; g < 4; g++) {
    const options = [{ none: true, items: [], cost: 0, score: 0 }];
    for (let j = 0; j < 2; j++) {
      const index = items.length,
        cost = random(30),
        value = random(5),
        sv = random(5),
        consistency = random(5),
        ratingScore = random(5);
      const score = value * 1e9 + sv * 1e6 + consistency * 1e3 + ratingScore;
      items.push({ id: String(index), cost, score });
      options.push({
        pick: index,
        items: [index],
        cost,
        value,
        sv,
        consistency,
        rating: ratingScore,
        score,
      });
    }
    groups.push(options);
  }
  const budget = random(80),
    expected = exhaustive(groups, items, budget);
  const actual = team.optimizeGroups(groups, items, budget);
  assert.equal(
    actual.chosen.reduce((n, x) => n + x.score, 0),
    expected.score
  );
  assert.equal(actual.used, expected.cost);
}
// Check actual cost function against integer percentage arithmetic at every hint level.
const costs = loadFunctions('optimizer.js', ['calculateDiscountedCost'], {
  HINT_DISCOUNTS: { 0: 0, 1: 0.1, 2: 0.2, 3: 0.3, 4: 0.35, 5: 0.4 },
  HINT_DISCOUNT_STEP: 0.1,
  getFastLearnerDiscount: () => 0,
});
for (const fast of [0, 10]) {
  costs.getFastLearnerDiscount = () => fast / 100;
  for (let base = 1; base <= 1000; base++) {
    for (let hint = 0; hint <= 5; hint++) {
      assert.equal(
        costs.calculateDiscountedCost(base, hint),
        Math.floor((base * (100 - [0, 10, 20, 30, 35, 40][hint] - fast)) / 100)
      );
    }
  }
}
console.log(
  'Optimizer function tests passed: linked/required regressions and 1,200 exhaustive cases per solver, 300 Team Trials tie cases, and 12,000 hint-cost cases.'
);

// Checkbox evolutions come from the parent lookup, which can lack the category
// that findSkillByName adds. Exercise collection before either solver.
const goldSkill = { name: 'Gold', category: 'gold', score: 400 };
const exactEvolution = { name: 'Evolution', isEvo: true, score: 600 };
function inputRow(id, skill, dataset = {}) {
  return {
    dataset: { rowId: id, ...dataset },
    querySelector(selector) {
      return {
        '.skill-name': { value: skill.name },
        '.cost': { value: '300' },
        '.hint-level': { value: '0' },
        '.required-skill': { checked: id === 'gold' },
      }[selector];
    },
  };
}
const goldRow = inputRow('gold', goldSkill, { evoRowIds: 'evolution' });
const evolutionRow = inputRow('evolution', exactEvolution, { parentEvoId: 'gold' });
const collection = loadFunctions('optimizer.js', ['getAptitudeTestScore', 'collectItems'], {
  rowsEl: {
    querySelectorAll: () => [goldRow, evolutionRow],
    querySelector: () => goldRow,
  },
  getOptimizeMode: () => 'rating',
  findSkillByName: (name) => (name === 'Gold' ? goldSkill : exactEvolution),
  getEvosForSkill: () => [exactEvolution],
  normalize: (name) => name.toLowerCase(),
  CSS: { escape: (value) => value },
  getEffectiveRatingScore: (skill) => skill.score,
  getPurplePenaltyValue: () => 0,
  canonicalCategory: (category) => category,
  isGoldCategory: (category) => category === 'gold',
  APTITUDE_TEST_SCORE_GOLD: 1200,
  APTITUDE_TEST_SCORE_NORMAL: 400,
});
const collected = collection.collectItems().items;
assert.equal(collected[1].category, 'evo');
assert.equal(collected[1].cost, 0);
assert.equal(collected[1].aptitudeScore, 1200);
assert.equal(rating.optimizeRatingBuild(collected, 300).best, 600);
assert.equal(rating.optimizeRatingBuild(collected, 299).error, 'required_unreachable');
global.window = global.window || {};
window.t = (key) => key;
const teamApi = require('../../public/js/team-trials-optimizer.js');
const collectedTeamResult = teamApi.optimizeTeamTrialsBuild({ items: collected, budget: 300 });
assert.equal(collectedTeamResult.totalRatingScore, 600);
assert.equal(collectedTeamResult.used, 300);
assert(collectedTeamResult.chosen.some((item) => item.id === 'gold' && item.comboComponent));
assert(collectedTeamResult.chosen.some((item) => item.id === 'evolution' && !item.comboComponent));
assert.equal(
  teamApi.optimizeTeamTrialsBuild({ items: collected, budget: 299 }).error,
  'required_unreachable'
);
console.log('Evolution checkbox collection and prerequisite tests passed.');

// Imported/typed evolutions must render at their gold parent's position too.
const resultGrouping = loadFunctions('optimizer.js', ['getEvolutionResultParent'], {
  canonicalCategory: (category) => category,
  isGoldCategory: (category) => category === 'gold',
});
const resultGold = { id: 'gold', category: 'gold', comboComponent: true };
const resultLower = { id: 'lower', category: 'yellow', comboComponent: true };
const resultIndex = new Map([
  ['gold', resultGold],
  ['lower', resultLower],
]);
assert.equal(
  resultGrouping.getEvolutionResultParent({ isEvo: true, parentEvoId: 'gold' }, resultIndex),
  resultGold
);
assert.equal(
  resultGrouping.getEvolutionResultParent(
    { category: 'evo', components: ['lower', 'gold', 'evo'] },
    resultIndex
  ),
  resultGold
);
assert.equal(
  resultGrouping.getEvolutionResultParent(
    { category: 'yellow', components: ['lower', 'gold'] },
    resultIndex
  ),
  null
);
assert.equal(
  resultGrouping.getEvolutionResultParent({ isEvo: true, components: ['missing'] }, resultIndex),
  null
);
console.log('Evolution result parent grouping tests passed.');
