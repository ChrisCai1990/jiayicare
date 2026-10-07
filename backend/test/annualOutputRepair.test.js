const test = require('node:test'), assert = require('node:assert/strict');
const { normalizeAnnualOutput, sourceLinkRepairPrompt, annualCorrectionPrompt, validateOrRepairAnnual } = require('../src/utils/annualOutputRepair');
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

test('repairs omitted source links on existing actions without rewriting their clinical content', async () => {
  const raw = rawPlan();
  raw.evidenceCoverage.push({ sourceId: 'review:action:0', status: 'included', reason: '检查甲的已审建议' });
  const sources = [...evidence, { id: 'review:action:0' }];
  const check = candidate => validateAnnualRaw(candidate, catalog, sources, keys);
  const corrected = await validateOrRepairAnnual(raw, check, async (candidate, message) => {
    assert.match(message, /review:action:0/);
    return JSON.stringify({
    annual_checkup: raw.annual_checkup,
    evidenceCoverage: raw.evidenceCoverage,
    sourceLinkCorrections: [{ module: 'checkup_completion', index: 0, sourceIds: ['review:action:0'] }],
    checkup_completion: [],
    });
  });
  assert.deepEqual(corrected.checkup_completion[0].sourceIds, ['missing:0', 'review:action:0']);
  assert.equal(corrected.checkup_completion[0].items, raw.checkup_completion[0].items);
  assert.deepEqual(raw.checkup_completion[0].sourceIds, ['missing:0']);
  check(corrected);
  await assert.rejects(validateOrRepairAnnual(raw, check, async () => JSON.stringify({
    annual_checkup: raw.annual_checkup, evidenceCoverage: raw.evidenceCoverage,
    sourceLinkCorrections: [{ module: 'checkup_completion', index: 0, sourceIds: ['fabricated'] }],
  })), /有效来源|遗漏对应事项/);
});

test('source-only correction uses a bounded prompt and still rejects false coverage downgrade', async () => {
  const raw = rawPlan();
  const source = { id: 'review:action:0', content: { instruction: '检查甲的已审建议' } };
  raw.evidenceCoverage.push({ sourceId: source.id, status: 'included', reason: '已审建议' });
  const check = candidate => validateAnnualRaw(candidate, catalog, [...evidence, source], keys);
  const prompt = sourceLinkRepairPrompt(raw, [...evidence, source], [source.id], '遗漏来源');
  assert.match(prompt, /review:action:0/);
  assert.ok(prompt.length < 4000);
  const result = await validateOrRepairAnnual(raw, check, async () => JSON.stringify({
    sourceLinkCorrections: [{ module: 'checkup_completion', index: 0, sourceIds: [source.id] }],
    coverageCorrections: [],
  }));
  check(result);
  await assert.rejects(validateOrRepairAnnual(raw, check, async () => JSON.stringify({
    sourceLinkCorrections: [], coverageCorrections: [{ sourceId: source.id, status: 'deferred', reason: '回避已审行动' }],
  })), /有效依据/);
});

test('source-link repair also corrects an empty annual checkup focus', async () => {
  const raw = rawPlan(); raw.annual_checkup.focus = '';
  raw.evidenceCoverage.push({ sourceId: 'review:action:0', status: 'included', reason: '已审检查建议' });
  const sources = [...evidence, { id: 'review:action:0', content: { instruction: '检查甲' } }];
  const check = candidate => validateAnnualRaw(candidate, catalog, sources, keys);
  const prompt = sourceLinkRepairPrompt(raw, sources, ['review:action:0'], '年度体检缺少明确内容');
  assert.match(prompt, /annual_checkup有模板却缺少focus/);
  const result = await validateOrRepairAnnual(raw, check, async () => JSON.stringify({
    annual_checkup: { ...raw.annual_checkup, focus: '检查乙' },
    sourceLinkCorrections: [{ module: 'checkup_completion', index: 0, sourceIds: ['review:action:0'] }],
  }));
  check(result);
  assert.equal(result.annual_checkup.focus, '检查乙');
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

test('repair requests satisfy provider JSON mode even without JSON in source data', () => {
  assert.match(annualCorrectionPrompt({}, [], 'missing focus'), /json/i);
  assert.match(sourceLinkRepairPrompt({}, [], [], 'missing source'), /json/i);
});

test('annual focus correction bounds historical evidence and keeps referenced timing source', async () => {
  const raw = rawPlan(); raw.annual_checkup.focus = '';
  raw.checkup_completion[0].timingSourceId = 'report:499';
  const history = Array.from({length: 500}, (_, i) => ({id: `report:${i}`, name: `历史项目${i}`, date: '2026-01-01', result: '原始结果'.repeat(300)}));
  const prompt = annualCorrectionPrompt(raw, [...evidence, {id:'report_history', content:history}], '年度体检缺少明确内容');
  assert.ok(prompt.length < 14000);
  assert.match(prompt, /report:499/);
  assert.match(prompt, /omittedCount/);
  assert.equal(history[499].result.length, 1200);
  const db = {doc:null, async findOne(){return structuredClone(this.doc)}, async updateOne(q,u){Object.assign(this.doc,u.$set);return {modifiedCount:1}}};
  const {fingerprint,reuseAnnualGeneration}=require('../src/utils/annualGenerationConsistency');
  const input={patientId:'p'};db.doc={_id:fingerprint(input),status:'failed',owner:'old',rejectedRaw:raw};
  let repairs=0;
  const result=await reuseAnnualGeneration(db,input,saved=>{
    assert.ok(saved, 'resume stored result instead of generating the entire plan');
    return validateOrRepairAnnual(saved,validate,async()=>{repairs++;return JSON.stringify({annual_checkup:{...saved.annual_checkup,focus:'检查乙'},evidenceCoverage:saved.evidenceCoverage})});
  });
  assert.equal(repairs,1);assert.equal(result.raw.annual_checkup.focus,'检查乙');
});
