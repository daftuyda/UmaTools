const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadRatingShared() {
  const file = path.join(__dirname, '..', '..', 'public', 'js', 'rating-shared.js');
  const source = fs.readFileSync(file, 'utf8');
  const sandbox = {
    window: {},
    getComputedStyle: () => ({ width: '0', height: '0' }),
    Image: class MockImage {
      set src(_) {}
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'rating-shared.js' });
  return sandbox.RatingShared;
}

function makeInput(value = '0') {
  return {
    value: String(value),
    addEventListener() {},
  };
}

function makeDisplay() {
  return {
    textContent: '',
    style: {},
    setAttribute(name, value) {
      this[name] = String(value);
    },
  };
}

function testAffinityHelpers() {
  const RatingShared = loadRatingShared();
  const cfg = {
    turf: { value: 'A', classList: { add() {}, remove() {} } },
    dirt: { value: 'G', classList: { add() {}, remove() {} } },
    sprint: { value: 'C', classList: { add() {}, remove() {} } },
    mile: null,
    medium: null,
    long: null,
    front: null,
    pace: null,
    late: null,
    end: null,
  };
  const helpers = RatingShared.createAffinityHelpers(cfg);

  assert.strictEqual(helpers.getBucketForGrade('A'), 'good');
  assert.strictEqual(helpers.getBucketForGrade('F'), 'bad');
  assert.strictEqual(helpers.getBucketForSkill('turf'), 'good');
  assert.strictEqual(helpers.getBucketForSkill('dirt'), 'terrible');

  const skill = {
    checkType: 'turf',
    score: { good: 120, average: 80, bad: 40, terrible: 0 },
  };
  assert.strictEqual(helpers.evaluateSkillScore(skill), 120);
}

function testMultiAffinitySkillScoring() {
  const RatingShared = loadRatingShared();
  const makeSel = (value) => ({ value, classList: { add() {}, remove() {} } });
  const cfg = {
    turf: makeSel('A'),
    dirt: makeSel('G'),
    sprint: makeSel('A'),
    mile: makeSel('B'),
    medium: makeSel('A'),
    long: makeSel('G'),
    front: makeSel('A'),
    pace: makeSel('A'),
    late: makeSel('G'),
    end: makeSel('G'),
  };
  const helpers = RatingShared.createAffinityHelpers(cfg);

  const mixedGroupsSkill = { checkType: 'Mile/Pace', score: { base: 100 } };
  assert.strictEqual(helpers.evaluateSkillScore(mixedGroupsSkill), 99);

  cfg.mile.value = 'S';
  cfg.pace.value = 'G';
  assert.strictEqual(helpers.evaluateSkillScore(mixedGroupsSkill), 77);

  const sameGroupSkill = { checkType: 'Mile/Medium', score: { base: 100 } };
  cfg.mile.value = 'C';
  cfg.medium.value = 'A';
  assert.strictEqual(helpers.evaluateSkillScore(sameGroupSkill), 110);
}

function testPurpleSkillRatingNormalization() {
  const RatingShared = loadRatingShared();

  assert.strictEqual(RatingShared.normalizeSkillRatingValue(0, 'purple'), 0);
  assert.strictEqual(RatingShared.normalizeSkillRatingValue(40, 'purple'), -129);
  assert.strictEqual(RatingShared.normalizeSkillRatingValue(50, 'violet'), -129);
  assert.strictEqual(RatingShared.normalizeSkillRatingValue(70, 'purple'), -174);
  assert.strictEqual(RatingShared.normalizeSkillRatingValue(100, 'purple'), -262);
  assert.strictEqual(RatingShared.normalizeSkillRatingValue(-174, 'purple'), -174);
  assert.strictEqual(RatingShared.normalizeSkillRatingValue(217, 'yellow'), 217);
  assert.strictEqual(
    RatingShared.normalizeSkillRatingValue(0, 'purple', "Feelin' a Bit Silly"),
    -500
  );
  assert.strictEqual(
    RatingShared.normalizeSkillRatingValue(0, 'purple', "You're Not the Boss of Me!"),
    -174
  );
  assert.strictEqual(RatingShared.normalizeSkillRatingValue(0, 'purple', '99 Problems'), -174);
}

function testRatingEngineDisplayMath() {
  const RatingShared = loadRatingShared();
  const ratingInputs = {
    speed: makeInput(50),
    stamina: makeInput(0),
    power: makeInput(0),
    guts: makeInput(0),
    wisdom: makeInput(0),
    star: makeInput(3),
    unique: makeInput(0),
  };
  const ratingDisplays = {
    stats: makeDisplay(),
    skills: makeDisplay(),
    unique: makeDisplay(),
    total: makeDisplay(),
    badgeSprite: makeDisplay(),
    floatTotal: makeDisplay(),
    floatBadgeSprite: makeDisplay(),
    nextLabel: makeDisplay(),
    nextNeeded: makeDisplay(),
    progressFill: makeDisplay(),
    progressBar: makeDisplay(),
    floatNextLabel: makeDisplay(),
    floatNextNeeded: makeDisplay(),
    floatProgressFill: makeDisplay(),
    floatProgressBar: makeDisplay(),
  };

  const engine = RatingShared.createRatingEngine({ ratingInputs, ratingDisplays });
  engine.updateRatingDisplay(500);

  assert.strictEqual(ratingDisplays.stats.textContent, '25');
  assert.strictEqual(ratingDisplays.skills.textContent, '500');
  assert.strictEqual(ratingDisplays.unique.textContent, '0');
  assert.strictEqual(ratingDisplays.total.textContent, '525');
  assert.strictEqual(ratingDisplays.floatTotal.textContent, '525');
  assert.strictEqual(ratingDisplays.badgeSprite.textContent, 'G+');
  assert.strictEqual(ratingDisplays.floatBadgeSprite.textContent, 'G+');
  assert.strictEqual(ratingDisplays.nextLabel.textContent, 'Next: F at 600');
  assert.strictEqual(ratingDisplays.nextNeeded.textContent, '+75');
  assert.strictEqual(ratingDisplays.progressFill.style.width, '75%');
  assert.strictEqual(ratingDisplays.progressBar['aria-valuenow'], '75');
}

function testRatingStateRoundTrip() {
  const RatingShared = loadRatingShared();
  const ratingInputs = {
    speed: makeInput(0),
    stamina: makeInput(0),
    power: makeInput(0),
    guts: makeInput(0),
    wisdom: makeInput(0),
    star: makeInput(0),
    unique: makeInput(0),
  };
  const ratingDisplays = {
    stats: makeDisplay(),
    skills: makeDisplay(),
    unique: makeDisplay(),
    total: makeDisplay(),
    badgeSprite: makeDisplay(),
    floatTotal: makeDisplay(),
    floatBadgeSprite: makeDisplay(),
    nextLabel: makeDisplay(),
    nextNeeded: makeDisplay(),
    progressFill: makeDisplay(),
    progressBar: makeDisplay(),
    floatNextLabel: makeDisplay(),
    floatNextNeeded: makeDisplay(),
    floatProgressFill: makeDisplay(),
    floatProgressBar: makeDisplay(),
  };

  const engine = RatingShared.createRatingEngine({ ratingInputs, ratingDisplays });
  engine.applyRatingState({
    stats: { speed: 800, stamina: 700, power: 600, guts: 500, wisdom: 400 },
    star: 2,
    unique: 5,
  });
  const state = engine.readRatingState();

  assert.strictEqual(state.stats.speed, 800);
  assert.strictEqual(state.stats.stamina, 700);
  assert.strictEqual(state.stats.power, 600);
  assert.strictEqual(state.stats.guts, 500);
  assert.strictEqual(state.stats.wisdom, 400);
  assert.strictEqual(state.star, 2);
  assert.strictEqual(state.unique, 5);
}

testAffinityHelpers();
testMultiAffinitySkillScoring();
testPurpleSkillRatingNormalization();
testRatingEngineDisplayMath();
testRatingStateRoundTrip();
console.log('Rating shared tests passed.');
