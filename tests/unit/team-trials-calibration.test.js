const assert = require('assert');
const fs = require('fs');
const path = require('path');
global.window = { t: (key) => key };
const api = require('../../public/js/team-trials-optimizer.js');
const skill = {
  id: 'probe',
  name: 'Probe',
  conditionGroups: [{ condition: 'rotation==1&phase_random==1&order==1' }],
};
const signature = JSON.stringify([['', 'rotation==1&phase_random==1&order==1']]);
function dataset(rate, extra = {}) {
  return {
    schemaVersion: 1,
    method: { wisdomChecks: false },
    skills: {
      probe: {
        signature,
        wisdomGated: true,
        contexts: { mile: { front: { rate, samples: 512, source: 'globalsim', ...extra } } },
      },
    },
  };
}
function input(data) {
  return {
    budget: 100,
    wisdom: 900,
    autoTargets: ['mile', 'front'],
    activationCalibration: data,
    skillMetaById: { probe: skill },
    items: [
      {
        id: 'probe',
        skillId: 'probe',
        name: 'Probe',
        category: 'yellow',
        cost: 100,
        ratingScore: 100,
        required: true,
      },
    ],
  };
}
let result = api.optimizeTeamTrialsBuild(input(dataset(0.8)));
assert.equal(result.error, null);
assert(
  Math.abs(result.chosen[0].activationRate - 0.72) < 1e-12,
  'Apply Wisdom once, without course or tier double counting'
);
assert.equal(api.predictActivationScore(result.chosen, 900), 360);
assert.equal(
  api.predictActivationScore(result.chosen, 180),
  200,
  'Live Wisdom updates retain measured trigger coverage'
);
result = api.optimizeTeamTrialsBuild(input(dataset(0)));
assert.equal(
  result.chosen[0].activationRate,
  0,
  'Measured zero must not fall back to heuristic minimum'
);
assert.equal(result.totalExpectedValue, 0);
result = api.optimizeTeamTrialsBuild(input(dataset(1)));
assert.equal(result.chosen[0].activationRate, 0.9);
const greenData = dataset(0.77, { source: 'course-enumeration', samples: 0 });
greenData.skills.probe.wisdomGated = false;
const greenInput = input(greenData);
greenInput.items[0].category = 'green';
assert.equal(api.optimizeTeamTrialsBuild(greenInput).chosen[0].activationRate, 0.77);
for (const bad of [
  dataset(0.5, { samples: 20 }),
  dataset(NaN),
  dataset(1.1),
  dataset(0.5, { source: 'unknown' }),
])
  assert.equal(
    api.resolveCalibration(skill, input(bad)),
    null,
    'Invalid or undersampled evidence falls back'
  );
const stale = dataset(0.9);
stale.skills.probe.signature = 'outdated';
assert.equal(api.resolveCalibration(skill, input(stale)), null);
const gated = dataset(0.9);
gated.method.wisdomChecks = true;
assert.equal(api.resolveCalibration(skill, input(gated)), null, 'Do not apply lottery twice');
const mix = dataset(0.8);
mix.skills.probe.contexts.long = { front: { rate: 0.2, samples: 384, source: 'globalsim' } };
const mixInput = input(mix);
mixInput.autoTargets = ['mile', 'long', 'front'];
assert.equal(
  api.resolveCalibration(skill, mixInput).rate,
  0.5,
  'Categories have equal weight, not sample-count weight'
);
delete mix.skills.probe.contexts.long.front;
assert.equal(
  api.resolveCalibration(skill, mixInput),
  null,
  'Missing contexts cannot silently disappear'
);
const pool = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../public/assets/team-trials-tracks.json'))
);
assert.deepEqual(
  Object.fromEntries(Object.entries(pool.categories).map(([k, v]) => [k, v.length])),
  { sprint: 17, mile: 17, medium: 21, long: 12, dirt: 16 }
);
assert.equal(
  new Set(
    Object.values(pool.categories)
      .flat()
      .map((r) => r.courseIds[0])
  ).size,
  83
);
const artifact = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../public/assets/team-trials-calibration.json'))
);
assert.equal(artifact.method.wisdomChecks, false);
assert(artifact.method.races >= 250000, 'Extended run must be completed before publishing');
let measured = 0;
for (const entry of Object.values(artifact.skills))
  for (const [category, contexts] of Object.entries(entry.contexts))
    for (const cell of Object.values(contexts)) {
      assert(cell.rate >= 0 && cell.rate <= 1);
      if (cell.source === 'globalsim') {
        measured++;
        assert.equal(
          cell.samples,
          pool.categories[category].length * artifact.method.seedsPerCourse
        );
        assert.equal(Object.keys(cell.byCourse).length, pool.categories[category].length);
        assert.equal(
          cell.hits,
          Object.values(cell.byCourse).reduce((sum, [h]) => sum + h, 0)
        );
        assert(Math.abs(cell.rate - cell.hits / cell.samples) < 1e-12);
        assert(cell.interval95[0] <= cell.rate + 1e-12 && cell.interval95[1] >= cell.rate - 1e-12);
      }
    }
assert(measured > 5000);
const right = artifact.skills['200012'];
assert(right);
assert(
  Math.abs(right.contexts.sprint.front.rate - 11 / 17) < 1e-12,
  'Straight Niigata is not right-handed'
);
const left = artifact.skills['200022'];
assert(
  Math.abs(left.contexts.sprint.front.rate - 5 / 17) < 1e-12,
  'Straight Niigata is not left-handed either'
);
console.log(
  'Calibration tests passed: weighting, zero rates, Wisdom, stale data, all 83 courses, and every generated skill/context.'
);

// Turf and dirt selected together must both contribute to the model.
const surfaces = dataset(0.8);
surfaces.skills.probe.contexts.dirt = { front: { rate: 0.2, samples: 512, source: 'globalsim' } };
const surfaceInput = input(surfaces);
surfaceInput.autoTargets = ['turf', 'dirt', 'mile', 'front'];
assert.equal(api.resolveCalibration(skill, surfaceInput).rate, 0.5);
for (const condition of ['activate_count_start>=3', 'post_number==7', 'base_power>=1200']) {
  const dependent = { ...skill, conditionGroups: [{ condition }] };
  const data = dataset(0);
  data.skills.probe.signature = JSON.stringify([['', condition]]);
  assert.equal(
    api.resolveCalibration(dependent, input(data)),
    null,
    'Unrepresented build/gate/stat inputs retain fallback'
  );
}
for (const category of Object.keys(pool.categories))
  for (const cell of Object.values(artifact.skills['200362'].contexts[category]))
    assert.equal(cell.rate, 1, 'Straightaway probe must bypass the retail Wisdom lottery');
assert.equal(artifact.skills['200332'].contexts.sprint.front.rate, 16 / 17);
