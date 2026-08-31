const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Polyfill window.t for Node.js test environment
global.window = global.window || {};
window.t = window.t || function (key, params) {
  var msg = key;
  if (params) {
    Object.keys(params).forEach(function (k) {
      msg = msg.replace('{' + k + '}', params[k]);
    });
  }
  return msg;
};

const TeamTrialsOptimizer = require('../../public/js/team-trials-optimizer.js');

function toObjectMap(input) {
  const out = {};
  Object.keys(input || {}).forEach((k) => {
    out[String(k)] = input[k];
  });
  return out;
}

function nonComboIds(result) {
  return (result.chosen || [])
    .filter((item) => !item.comboComponent)
    .map((item) => item.id);
}

function testConsistencyScoringOrder() {
  const passive = {
    name: 'Passive',
    desc: 'Always increases speed.',
    conditionGroups: [{ condition: 'always==1', effects: [{ type: 27, value: 1000 }] }]
  };
  const strictOrder = {
    name: 'Strict Order',
    desc: 'Acceleration on a strict random trigger.',
    conditionGroups: [{ condition: 'phase_random==1&order==1', effects: [{ type: 31, value: 1000 }] }]
  };
  const blocked = {
    name: 'Blocked',
    desc: 'Speed while blocked and overtaking.',
    conditionGroups: [{ condition: 'phase_random==1&blocked_front==1&is_overtake==1', effects: [{ type: 27, value: 1000 }] }]
  };

  const passiveScore = TeamTrialsOptimizer.scoreSkillConsistency(passive, {}, null).score;
  const strictScore = TeamTrialsOptimizer.scoreSkillConsistency(strictOrder, {}, null).score;
  const blockedScore = TeamTrialsOptimizer.scoreSkillConsistency(blocked, {}, null).score;

  assert(passiveScore > strictScore, `Expected passive (${passiveScore}) > strict (${strictScore})`);
  assert(passiveScore > blockedScore, `Expected passive (${passiveScore}) > blocked (${blockedScore})`);
  assert(strictScore < 0.6, `Expected strict-order trigger to remain low consistency, got ${strictScore}`);
  assert(blockedScore < 0.6, `Expected blocked/overtake trigger to remain low consistency, got ${blockedScore}`);
}

function testParentUpgradeConflictResolution() {
  const input = {
    budget: 320,
    raceConfig: {},
    items: [
      {
        id: 'p1',
        name: 'Parent Skill',
        skillId: '201',
        cost: 100,
        ratingScore: 80,
        category: 'yellow',
        parentSkillIds: [],
        lowerSkillId: '',
        required: false
      },
      {
        id: 'g1',
        name: 'Gold Upgrade',
        skillId: '202',
        cost: 220,
        ratingScore: 210,
        category: 'gold',
        parentSkillIds: ['201'],
        lowerSkillId: '',
        required: false
      }
    ],
    skillMetaById: {
      '201': {
        id: '201',
        name: 'Parent Skill',
        desc: 'Temporarily increases speed during mid-race.',
        conditionGroups: [{ condition: 'phase_random==1&order<=8', effects: [{ type: 27, value: 800 }] }]
      },
      '202': {
        id: '202',
        name: 'Gold Upgrade',
        desc: 'Temporarily increases speed in the final corner.',
        conditionGroups: [{ condition: 'is_finalcorner==1&order<=5', effects: [{ type: 27, value: 1800 }] }]
      }
    },
    tierById: {
      '201': { skillId: '201', tierBonus: 0.45, consistencyAdjustment: 0.03, tags: ['consistent'], note: '' },
      '202': { skillId: '202', tierBonus: 0.9, consistencyAdjustment: 0.14, tags: ['core', 'consistent'], note: '' }
    }
  };

  const result = TeamTrialsOptimizer.optimizeTeamTrialsBuild(input);
  assert.strictEqual(result.error, null);
  const picked = result.chosen || [];
  const pickedGold = picked.find((it) => it.id === 'g1' && !it.comboComponent);
  const pickedParentAsStandalone = picked.find((it) => it.id === 'p1' && !it.comboComponent);
  assert(pickedGold, 'Expected gold upgrade to be selected');
  assert(!pickedParentAsStandalone, 'Parent skill should not be selected as standalone with gold combo');
}

function testDeterministicFixtureOutput() {
  const fixturePath = path.join(__dirname, '..', 'fixtures', 'team-trials-input.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const input = {
    budget: fixture.budget,
    raceConfig: fixture.raceConfig,
    items: fixture.items,
    skillMetaById: toObjectMap(fixture.skillMetaById),
    tierById: toObjectMap(fixture.tierById)
  };

  const first = TeamTrialsOptimizer.optimizeTeamTrialsBuild(input);
  const second = TeamTrialsOptimizer.optimizeTeamTrialsBuild(input);

  assert.strictEqual(first.error, null);
  assert.strictEqual(second.error, null);
  assert.deepStrictEqual(nonComboIds(first), nonComboIds(second), 'Expected stable chosen set across repeated runs');
  assert.strictEqual(first.used, second.used, 'Expected stable SP usage');
  assert.strictEqual(first.totalRatingScore, second.totalRatingScore, 'Expected stable rating total');

  assert.deepStrictEqual(nonComboIds(first), ['s2', 's3'], 'Fixture snapshot changed unexpectedly');
}

function testExplainIgnoresGoldPrereqSkills() {
  const input = {
    budget: 320,
    raceConfig: {},
    items: [
      {
        id: 'p1',
        name: 'Parent Skill',
        skillId: '301',
        cost: 100,
        ratingScore: 120,
        category: 'yellow',
        parentSkillIds: [],
        lowerSkillId: '',
        required: true
      },
      {
        id: 'g1',
        name: 'Gold Upgrade',
        skillId: '302',
        cost: 220,
        ratingScore: 260,
        category: 'gold',
        parentSkillIds: ['301'],
        lowerSkillId: '',
        required: false
      }
    ],
    skillMetaById: {
      '301': {
        id: '301',
        name: 'Parent Skill',
        desc: 'Speed while overtaking from first place.',
        conditionGroups: [{ condition: 'phase_random==1&order==1&is_overtake==1', effects: [{ type: 27, value: 1000 }] }]
      },
      '302': {
        id: '302',
        name: 'Gold Upgrade',
        desc: 'Temporarily increases speed in the final corner.',
        conditionGroups: [{ condition: 'is_finalcorner==1&order<=5', effects: [{ type: 27, value: 2200 }] }]
      }
    },
    tierById: {
      '301': { skillId: '301', tierBonus: 0.2, consistencyAdjustment: -0.35, tags: ['inconsistent'], note: 'Inconsistent trigger.' },
      '302': { skillId: '302', tierBonus: 0.9, consistencyAdjustment: 0.18, tags: ['core', 'consistent'], note: 'TT core finisher.' }
    }
  };

  const result = TeamTrialsOptimizer.optimizeTeamTrialsBuild(input);
  assert.strictEqual(result.error, null);
  const risks = Array.isArray(result.explain && result.explain.risks) ? result.explain.risks : [];
  const hasParentInRisks = risks.some((line) => /Parent Skill/i.test(String(line)));
  assert.strictEqual(hasParentInRisks, false, 'Explain section should not include prerequisite lower skill risks.');
}

function testConsistencyIsPrimaryObjective() {
  const input = {
    budget: 200,
    raceConfig: {},
    items: [
      {
        id: 'c1',
        name: 'Reliable Choice',
        skillId: '401',
        cost: 200,
        ratingScore: 140,
        category: 'yellow',
        parentSkillIds: [],
        lowerSkillId: '',
        required: false
      },
      {
        id: 'c2',
        name: 'Greedy Rating Choice',
        skillId: '402',
        cost: 200,
        ratingScore: 320,
        category: 'yellow',
        parentSkillIds: [],
        lowerSkillId: '',
        required: false
      }
    ],
    skillMetaById: {
      '401': {
        id: '401',
        name: 'Reliable Choice',
        desc: 'Temporarily increases speed in the final corner.',
        conditionGroups: [{ condition: 'is_finalcorner==1&order<=5', effects: [{ type: 27, value: 1800 }] }]
      },
      '402': {
        id: '402',
        name: 'Greedy Rating Choice',
        desc: 'Temporarily increases speed while overtaking from first.',
        conditionGroups: [{ condition: 'phase_random==1&order==1&is_overtake==1', effects: [{ type: 27, value: 2600 }] }]
      }
    },
    tierById: {
      '401': { skillId: '401', tierBonus: 0.86, consistencyAdjustment: 0.14, tags: ['team_trials', 'consistent'], note: '' },
      '402': { skillId: '402', tierBonus: 0.42, consistencyAdjustment: -0.30, tags: ['inconsistent'], note: '' }
    }
  };

  const result = TeamTrialsOptimizer.optimizeTeamTrialsBuild(input);
  assert.strictEqual(result.error, null);
  const picked = nonComboIds(result);
  assert.deepStrictEqual(picked, ['c1'], 'Expected consistency-first mode to pick the more reliable option.');
}

function testFiltersByAptitudesAndIdealTargets() {
  const input = {
    budget: 220,
    raceConfig: {
      turf: 'A',
      dirt: 'G',
      sprint: 'C',
      mile: 'C',
      medium: 'A',
      long: 'D',
      front: 'C',
      pace: 'A',
      late: 'D',
      end: 'G'
    },
    autoTargets: ['turf', 'medium', 'pace'],
    items: [
      {
        id: 'm1',
        name: 'Mile Maven',
        skillId: '501',
        cost: 180,
        ratingScore: 220,
        category: 'yellow',
        parentSkillIds: [],
        lowerSkillId: '',
        required: true
      },
      {
        id: 'm2',
        name: 'Medium Runner',
        skillId: '502',
        cost: 180,
        ratingScore: 200,
        category: 'yellow',
        parentSkillIds: [],
        lowerSkillId: '',
        required: false
      }
    ],
    skillMetaById: {
      '501': {
        id: '501',
        name: 'Mile Maven',
        desc: 'Temporarily increases speed in mile races.',
        conditionGroups: [{ condition: 'distance_type==2&phase_random==0&accumulatetime>=5', effects: [{ type: 27, value: 2500 }] }],
        typeTags: ['mil']
      },
      '502': {
        id: '502',
        name: 'Medium Runner',
        desc: 'Temporarily increases speed in medium races for pace chasers.',
        conditionGroups: [{ condition: 'distance_type==3&running_style==2&phase_random==1', effects: [{ type: 27, value: 2200 }] }],
        typeTags: ['med', 'ldr']
      }
    },
    tierById: {
      '501': { skillId: '501', tierBonus: 0.95, consistencyAdjustment: 0.1, tags: ['consistent'], note: '' },
      '502': { skillId: '502', tierBonus: 0.75, consistencyAdjustment: 0.06, tags: ['consistent'], note: '' }
    }
  };

  const result = TeamTrialsOptimizer.optimizeTeamTrialsBuild(input);
  assert.strictEqual(result.error, null);
  const picked = nonComboIds(result);
  assert.deepStrictEqual(picked, ['m2'], 'Expected mile-only skill to be filtered out for turf/medium/pace setup.');
  const warningText = (result.warnings || []).join(' ');
  assert(/ignored.*required|ignoredRequired/i.test(warningText), 'Expected warning for ignored out-of-scope required skills.');
}

function testDeprioritizesGreenRaceConditionSkills() {
  const input = {
    budget: 180,
    raceConfig: {},
    items: [
      {
        id: 'g1',
        name: 'Random Weather Boost',
        skillId: '601',
        cost: 180,
        ratingScore: 240,
        category: 'green',
        parentSkillIds: [],
        lowerSkillId: '',
        required: false
      },
      {
        id: 'y1',
        name: 'Proc Speed',
        skillId: '602',
        cost: 180,
        ratingScore: 210,
        category: 'yellow',
        parentSkillIds: [],
        lowerSkillId: '',
        required: false
      }
    ],
    skillMetaById: {
      '601': {
        id: '601',
        name: 'Random Weather Boost',
        desc: 'Speed stat increases when race ground condition is favorable.',
        conditionGroups: [{ condition: 'ground_condition==1', effects: [{ type: 1, value: 80 }] }]
      },
      '602': {
        id: '602',
        name: 'Proc Speed',
        desc: 'Temporarily increases speed at a random point in mid-race.',
        conditionGroups: [{ condition: 'phase_random==1&order<=8', effects: [{ type: 27, value: 1800 }] }]
      }
    },
    tierById: {
      '601': { skillId: '601', tierBonus: 0.95, consistencyAdjustment: 0.12, tags: ['consistent'], note: '' },
      '602': { skillId: '602', tierBonus: 0.65, consistencyAdjustment: 0.04, tags: ['consistent'], note: '' }
    }
  };

  const result = TeamTrialsOptimizer.optimizeTeamTrialsBuild(input);
  assert.strictEqual(result.error, null);
  const picked = nonComboIds(result);
  assert.deepStrictEqual(picked, ['y1'], 'Expected Team Trials to deprioritize volatile green skills.');
}

function testPrioritizesConsistentGoldSkills() {
  const input = {
    budget: 220,
    raceConfig: {},
    items: [
      {
        id: 'g1',
        name: 'Reliable Gold Finisher',
        skillId: '701',
        cost: 220,
        ratingScore: 210,
        category: 'gold',
        parentSkillIds: [],
        lowerSkillId: '',
        required: false
      },
      {
        id: 'y1',
        name: 'Reliable Yellow Finisher',
        skillId: '702',
        cost: 220,
        ratingScore: 230,
        category: 'yellow',
        parentSkillIds: [],
        lowerSkillId: '',
        required: false
      }
    ],
    skillMetaById: {
      '701': {
        id: '701',
        name: 'Reliable Gold Finisher',
        desc: 'Temporarily increases speed in the final corner.',
        conditionGroups: [{ condition: 'is_finalcorner==1&order<=5', effects: [{ type: 27, value: 2400 }] }]
      },
      '702': {
        id: '702',
        name: 'Reliable Yellow Finisher',
        desc: 'Temporarily increases speed in the final corner.',
        conditionGroups: [{ condition: 'is_finalcorner==1&order<=5', effects: [{ type: 27, value: 2000 }] }]
      }
    },
    tierById: {
      '701': { skillId: '701', tierBonus: 0.85, consistencyAdjustment: 0.1, tags: ['consistent'], note: '' },
      '702': { skillId: '702', tierBonus: 0.78, consistencyAdjustment: 0.1, tags: ['consistent'], note: '' }
    }
  };

  const result = TeamTrialsOptimizer.optimizeTeamTrialsBuild(input);
  assert.strictEqual(result.error, null);
  const picked = nonComboIds(result);
  assert.deepStrictEqual(picked, ['g1'], 'Expected Team Trials to prioritize reliable gold skills.');
}

function testConsistentGoldBeatsHigherExpectedNonGold() {
  const input = {
    budget: 240,
    raceConfig: {},
    items: [
      {
        id: 'g1',
        name: 'Consistent Gold',
        skillId: '711',
        cost: 240,
        ratingScore: 210,
        category: 'gold',
        parentSkillIds: [],
        lowerSkillId: '',
        required: false
      },
      {
        id: 'y1',
        name: 'Higher Value Yellow',
        skillId: '712',
        cost: 240,
        ratingScore: 340,
        category: 'yellow',
        parentSkillIds: [],
        lowerSkillId: '',
        required: false
      }
    ],
    skillMetaById: {
      '711': {
        id: '711',
        name: 'Consistent Gold',
        desc: 'Temporarily increases speed in the final corner.',
        conditionGroups: [{ condition: 'is_finalcorner==1&order<=5', effects: [{ type: 27, value: 2200 }] }]
      },
      '712': {
        id: '712',
        name: 'Higher Value Yellow',
        desc: 'Temporarily increases speed in the final corner.',
        conditionGroups: [{ condition: 'is_finalcorner==1&order<=5', effects: [{ type: 27, value: 2200 }] }]
      }
    },
    tierById: {
      '711': { skillId: '711', tierBonus: 0.8, consistencyAdjustment: 0.1, tags: ['consistent'], note: '' },
      '712': { skillId: '712', tierBonus: 0.8, consistencyAdjustment: 0.1, tags: ['consistent'], note: '' }
    }
  };

  const result = TeamTrialsOptimizer.optimizeTeamTrialsBuild(input);
  assert.strictEqual(result.error, null);
  const picked = nonComboIds(result);
  assert.deepStrictEqual(picked, ['g1'], 'Expected consistent gold to outrank non-gold expected value/rating when consistency is tied.');
}

function testGoldUsesExplicitLinkedLowerRowForCosts() {
  const input = {
    budget: 306,
    raceConfig: {},
    items: [
      {
        id: 'g1',
        name: 'Professor of Curvature',
        skillId: '801',
        cost: 306,
        ratingScore: 508,
        category: 'gold',
        parentSkillIds: [],
        lowerSkillId: '802',
        lowerRowId: 'l1',
        required: false
      },
      {
        id: 'l1',
        name: 'Corner Adept ○',
        skillId: '802',
        cost: 180,
        ratingScore: 217,
        category: 'yellow',
        parentGoldId: 'g1',
        parentSkillIds: [],
        lowerSkillId: '',
        required: false
      },
      {
        id: 'd1',
        name: 'Corner Adept ○',
        skillId: '802',
        cost: 117,
        ratingScore: 217,
        category: 'yellow',
        parentSkillIds: [],
        lowerSkillId: '',
        required: false
      }
    ],
    skillMetaById: {
      '801': {
        id: '801',
        name: 'Professor of Curvature',
        desc: 'Temporarily increases speed in the final corner.',
        conditionGroups: [{ condition: 'is_finalcorner==1&order<=5', effects: [{ type: 27, value: 2600 }] }]
      },
      '802': {
        id: '802',
        name: 'Corner Adept ○',
        desc: 'Temporarily increases speed at a random point on a corner.',
        conditionGroups: [{ condition: 'all_corner_random==1', effects: [{ type: 27, value: 1500 }] }]
      }
    },
    tierById: {
      '801': { skillId: '801', tierBonus: 0.92, consistencyAdjustment: 0.18, tags: ['team_trials', 'core', 'consistent'], note: '' },
      '802': { skillId: '802', tierBonus: 0.60, consistencyAdjustment: 0.06, tags: ['consistent'], note: '' }
    }
  };

  const result = TeamTrialsOptimizer.optimizeTeamTrialsBuild(input);
  assert.strictEqual(result.error, null);
  const picked = nonComboIds(result);
  assert.deepStrictEqual(picked, ['g1'], 'Expected gold combo to use explicit linked lower row and remain purchasable at listed cost.');
}

testConsistencyScoringOrder();
testParentUpgradeConflictResolution();
testDeterministicFixtureOutput();
testExplainIgnoresGoldPrereqSkills();
testConsistencyIsPrimaryObjective();
testFiltersByAptitudesAndIdealTargets();
testDeprioritizesGreenRaceConditionSkills();
testPrioritizesConsistentGoldSkills();
testConsistentGoldBeatsHigherExpectedNonGold();
testGoldUsesExplicitLinkedLowerRowForCosts();
console.log('Team Trials optimizer tests passed.');
