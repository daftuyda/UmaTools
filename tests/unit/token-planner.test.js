const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const plannerPath = path.join(__dirname, '..', '..', 'public', 'js', 'token-planner.js');
const source = fs.readFileSync(plannerPath, 'utf8');
const lessonsMatch = source.match(/const LESSONS\s*=\s*(\[[\s\S]*?\n\s*\]);/);

assert(lessonsMatch, 'Expected token-planner.js to define the LESSONS reference data.');

const lessons = JSON.parse(JSON.stringify(vm.runInNewContext(lessonsMatch[1])));
const expected = [
  { label: 'Before 1st Concert', value: '1-2-3-4-4-2-3' },
  { label: 'Before 2nd to 4th Concert', value: '2-2-2-4-5-2-2' },
  { label: 'Before Grand Concert', value: '2-2-2-4-3-2-2' },
];

assert.deepStrictEqual(lessons, expected);
assert.deepStrictEqual(
  lessons.map((lesson) => lesson.value.split('-').map(Number)),
  [
    [1, 2, 3, 4, 4, 2, 3],
    [2, 2, 2, 4, 5, 2, 2],
    [2, 2, 2, 4, 3, 2, 2],
  ]
);
assert.deepStrictEqual(
  lessons.map((lesson) =>
    lesson.value
      .split('-')
      .map(Number)
      .reduce((sum, value) => sum + value, 0)
  ),
  [19, 19, 17]
);

console.log('Token planner lesson-reference tests passed.');
