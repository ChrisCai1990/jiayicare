const test = require('node:test');
const assert = require('node:assert/strict');
const { targetsFromIncludedConcerns, validateAnnualTargets, normalizeTargets } = require('../src/utils/caseReviewManagementTargets');

test('only included concerns become annual targets; discussion supplies their wording', () => {
  const concerns = [
    { id: 'bp', title: '高血压', status: 'included', pathway: 'specialist' },
    { id: 'lung', title: '肺磨玻璃结节', status: 'included', pathway: 'specialist' },
    { id: 'prostate', title: '前列腺增大伴钙化', status: 'excluded' },
  ];
  const review = [
    '【问题：高血压】', '管理目标：明确血压节律；干预重点：家庭血压监测',
    '【问题：肺磨玻璃结节】', '管理目标：明确结节随访；干预重点：核对影像并安排复评',
    '【问题：前列腺增大伴钙化】', '管理目标：随访；干预重点：复查',
  ].join('\n');
  const targets = targetsFromIncludedConcerns(concerns, review);
  assert.deepEqual(targets.map(row => row.issueId), ['bp', 'lung']);
  assert.deepEqual(targets.map(row => row.goal), ['明确血压节律', '明确结节随访']);
  assert.doesNotThrow(() => validateAnnualTargets(concerns, normalizeTargets(targets)));
  assert.throws(() => validateAnnualTargets(concerns, normalizeTargets([...targets, { issueId: 'prostate', goal: '随访', focus: '复查' }])), /逐项对应/);
});

test('missing discussion details remain blank for staff; linked edits survive refresh', () => {
  const concerns = [{ id: 'bp', title: '高血压', status: 'included' }];
  const draft = targetsFromIncludedConcerns(concerns, '【问题：高血压】\n管理目标：待确认；干预重点：待核实');
  assert.equal(draft[0].goal, '');
  assert.equal(draft[0].focus, '');
  const edited = [{ ...draft[0], goal: '控制血压', focus: '监测家庭血压' }];
  assert.deepEqual(targetsFromIncludedConcerns(concerns, '', edited), edited);
  assert.deepEqual(targetsFromIncludedConcerns([{ ...concerns[0], status: 'excluded' }], '', edited), []);
});
