const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../src/routes/questionnaire'), 'utf8');
const start = source.indexOf('const readArchiveField');
const end = source.indexOf('// GET /api/questionnaire/pending', start);
const ctx = {};
vm.runInNewContext(source.slice(start, end) + '\nthis.build = buildInitialAnswers;', ctx);
test('archive prefill handles text, multi-choice, number, zero and missing values without 500', () => {
  const user = { name: '测试', healthProfile: { conditions: ['A', 'B'], age: '42', score: 0, single: 'A' } };
  const questions = [
    { id: 'name', archiveField: 'name' },
    { id: 'multi', type: 'multi', archiveField: 'healthProfile.conditions' },
    { id: 'single', type: 'multi', archiveField: 'healthProfile.single' },
    { id: 'age', type: 'number', archiveField: 'healthProfile.age' },
    { id: 'zero', type: 'number', archiveField: 'healthProfile.score' },
    { id: 'missing', archiveField: 'missing' }, { id: 'unbound' },
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.build(user, questions))),
    { name: '测试', multi: ['A', 'B'], single: ['A'], age: 42, zero: 0 });
});
test('empty or absent profiles produce no prefilled answers', () => {
  assert.equal(Object.keys(ctx.build(null, [{ id: 'x', archiveField: 'name' }])).length, 0);
  assert.equal(Object.keys(ctx.build({}, [])).length, 0);
});
