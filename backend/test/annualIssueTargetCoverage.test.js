const test = require('node:test');
const assert = require('node:assert/strict');
const { targetsFromIncludedConcerns, validateAnnualTargets, normalizeTargets, parseAnnualTargetDraft } = require('../src/utils/caseReviewManagementTargets');

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

test('AI draft is accepted only for every included issue, with pathway flags kept from staff', () => {
  const concerns = [
    { id: 'bp', title: '高血压', status: 'included', pathway: 'specialist' },
    { id: 'lung', title: '肺磨玻璃结节', status: 'included', pathway: 'both' },
    { id: 'excluded', title: '其他', status: 'excluded' },
  ];
  const answer = { targets: [
    { issueId: 'lung', goal: '明确结节随访基线', focus: '核对既往影像并请专科评估' },
    { issueId: 'bp', goal: '明确血压管理基线', focus: '记录家庭血压并复评' },
  ] };
  const rows = parseAnnualTargetDraft('```json\n' + JSON.stringify(answer) + '\n```', concerns);
  assert.deepEqual(rows.map(row => row.issueId), ['bp', 'lung']);
  assert.deepEqual(rows.map(row => row.nutritionRelevant), [false, true]);
  assert.throws(() => parseAnnualTargetDraft(JSON.stringify({ targets: answer.targets.slice(0, 1) }), concerns), /逐项完成/);
  assert.throws(() => parseAnnualTargetDraft(JSON.stringify({ targets: [answer.targets[0], { ...answer.targets[1], issueId: 'excluded' }] }), concerns), /不对应/);
  assert.throws(() => parseAnnualTargetDraft(JSON.stringify({ targets: [{ ...answer.targets[0], focus: '待确认' }, answer.targets[1]] }), concerns), /空缺/);
  assert.throws(() => parseAnnualTargetDraft(JSON.stringify({ targets: [answer.targets[0], { ...answer.targets[1], goal: answer.targets[0].goal }] }), concerns), /重复/);
  assert.throws(() => parseAnnualTargetDraft(JSON.stringify({ targets: [{ ...answer.targets[0], focus: '同时安排结直肠肠镜' }, answer.targets[1]] }), concerns), /其他器官/);
});

test('a combined discussion card cannot be copied into several management projects', () => {
  const concerns = [
    { id: 'lung', title: '肺磨玻璃结节', status: 'included' },
    { id: 'rectal', title: '直肠息肉', status: 'included' },
    { id: 'cecal', title: '（盲肠）管状腺瘤伴上皮内瘤样变', status: 'included' },
  ];
  const content = '【问题：肺磨玻璃结节、直肠息肉、（盲肠）管状腺瘤伴上皮内瘤样变】\n管理目标：肺结节随访；结直肠肠镜随访';
  const rows = targetsFromIncludedConcerns(concerns, content);
  assert.deepEqual(rows.map(row => row.goal), ['', '', '']);
});
