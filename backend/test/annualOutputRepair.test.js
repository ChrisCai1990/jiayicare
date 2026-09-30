const test = require('node:test'), assert = require('node:assert/strict');
const { normalizeAnnualOutput, validateOrRepairAnnual } = require('../src/utils/annualOutputRepair');
const { validateAnnualRaw } = require('../src/utils/annualGenerationConsistency');
const { validateClinicalRules } = require('../src/utils/annualClinicalRules');
const keys = ['medical_treatment', 'checkup_completion', 'abnormal_followup', 'vaccine', 'annual_checkup'];
const catalog = keys.map(category => ({ id: category, category }));
const evidence = [{ id: 'missing:0' }, { id: 'missing:1' }];
const rawPlan = () => ({ templateNodes: [], medical_treatment: [], abnormal_followup: [], vaccine: [],
  checkup_completion: [{ standardPlanId: 'checkup_completion', items: '检查甲', time: '2026-10-01', basisSummary: '已审来源', sourceIds: ['missing:0'] }],
  annual_checkup: { standardPlanId: 'annual_checkup', focus: ['检查乙'], date: '2027-05-01', basisSummary: '已审来源', sourceIds: ['missing:1'] },
  evidenceCoverage: evidence.map(x => ({ sourceId: x.id, status: 'included', reason: '已有事项' })),
});
const validate = raw => { validateAnnualRaw(raw, catalog, evidence, keys); validateClinicalRules(raw, [], evidence); };
test('string-list focus is losslessly normalized and passes actual validators without AI retry', async () => {
  const raw = rawPlan();
  const result = await validateOrRepairAnnual(raw, validate, () => assert.fail('unnecessary model call'));
  assert.equal(result.annual_checkup.focus, '检查乙'); assert.deepEqual(raw.annual_checkup.focus, ['检查乙']);
  assert.equal(result.checkup_completion, raw.checkup_completion);
  for (const focus of [{ a: '不猜结构' }, ['检查', { bad: true }]]) {
    const input = { annual_checkup: { focus } }; assert.equal(normalizeAnnualOutput(input), input);
  }
});
test('observed list with exclusion note is repaired once, not silently discarded or allowed as duplicate', async () => {
  const raw = rawPlan(); raw.annual_checkup.focus.push('检查甲——已在近期安排，年度不重复安排');
  let calls = 0;
  const result = await validateOrRepairAnnual(raw, validate, async (candidate, message) => {
    calls++; assert.match(message, /重复近期检查/); assert.match(candidate.annual_checkup.focus, /检查甲/);
    return JSON.stringify({ annual_checkup: { ...candidate.annual_checkup, focus: ['检查乙'], notes: '检查甲已在近期安排，不在年度重复' }, evidenceCoverage: candidate.evidenceCoverage, checkup_completion: [] });
  });
  assert.equal(calls, 1); assert.equal(result.annual_checkup.focus, '检查乙');
  assert.equal(result.checkup_completion, raw.checkup_completion); validate(result);
});
test('unsupported annual module may be empty only after correction and consistent evidence coverage', async () => {
  const raw = rawPlan(); raw.annual_checkup.focus = '';
  const coverage = raw.evidenceCoverage.map(x => x.sourceId === 'missing:1' ? { ...x, status: 'deferred', reason: '待顾问判断复查间隔，无明确年度项目依据' } : x);
  const result = await validateOrRepairAnnual(raw, validate, async () => JSON.stringify({ annual_checkup: {}, evidenceCoverage: coverage }));
  assert.deepEqual(result.annual_checkup, {}); assert.equal(result.checkup_completion.length, 1);
  await assert.rejects(validateOrRepairAnnual(raw, validate, async () => JSON.stringify({ annual_checkup: {}, evidenceCoverage: raw.evidenceCoverage })), /遗漏对应事项/);
});
test('invalid correction cannot weaken validation; one call only and failed candidate retained', async () => {
  const raw = rawPlan(); raw.annual_checkup.focus = '';
  for (const reply of ['bad json', '{}', JSON.stringify({ annual_checkup: { ...raw.annual_checkup, focus: {} }, evidenceCoverage: raw.evidenceCoverage })]) {
    let calls = 0;
    await assert.rejects(validateOrRepairAnnual(raw, validate, async () => { calls++; return reply; }), error => Boolean(error.generationRaw));
    assert.equal(calls, 1); assert.equal(raw.annual_checkup.focus, '');
  }
});


test('repairs timing source on an existing checkup without replacing action or bypassing validation', async () => {
  const raw = rawPlan(); Object.assign(raw.checkup_completion[0], { timingSourceId: 'missing:0', timingBaseDate: '2026-08-01' });
  const timeline = [{ id: 'report:real:0', date: '2026-08-01', group: 'test' }];
  const check = candidate => { validateAnnualRaw(candidate, catalog, evidence, keys); validateClinicalRules(candidate, timeline, evidence); };
  const reply = source => JSON.stringify({ annual_checkup: raw.annual_checkup, evidenceCoverage: raw.evidenceCoverage,
    checkup_completion: [], timingCorrections: [{module: 'checkup_completion', index: 0, timingSourceId: source, timingBaseDate: '2026-08-01', dateSelectionReason: '对应检查原日期'}] });
  const result = await validateOrRepairAnnual(raw, check, async () => reply('report:real:0'));
  assert.equal(result.checkup_completion.length, 1); assert.equal(result.checkup_completion[0].items, '检查甲');
  assert.equal(result.checkup_completion[0].time, raw.checkup_completion[0].time);
  assert.equal(raw.checkup_completion[0].timingSourceId, 'missing:0'); check(result);
  await assert.rejects(validateOrRepairAnnual(raw, check, async () => reply('fake')), /原检查日期/);
  await assert.rejects(validateOrRepairAnnual(raw, check, async () => reply('')), /缺少有效事项/);
});


test('valid corrected candidate is retained when AI appends an unnecessary invalid timing patch', async () => {
  const raw = rawPlan(); raw.annual_checkup.focus = '';
  const result = await validateOrRepairAnnual(raw, validate, async () => JSON.stringify({
    annual_checkup: {...raw.annual_checkup, focus: '检查乙'}, evidenceCoverage: raw.evidenceCoverage,
    timingCorrections: [{module: 'annual_checkup', index: 0, timingSourceId: '', timingBaseDate: ''}],
  }));
  validate(result); assert.equal(result.annual_checkup.focus, '检查乙');
  assert.deepEqual(result.checkup_completion, raw.checkup_completion);
});

test('stored valid rejected candidate completes without any further AI request', async () => {
  const db = {doc: null, async findOne(){return structuredClone(this.doc)}, async updateOne(q,u){Object.assign(this.doc,u.$set);return {modifiedCount:1}}};
  const {fingerprint,reuseAnnualGeneration} = require('../src/utils/annualGenerationConsistency');
  const input={patientId:'p'};db.doc={_id:fingerprint(input),status:'failed',owner:'old',rejectedRaw:rawPlan()};
  const result=await reuseAnnualGeneration(db,input,raw=>validateOrRepairAnnual(raw,validate,()=>assert.fail('no AI request')));
  assert.equal(db.doc.status,'ready');validate(result.raw);
});
