const test = require('node:test'), assert = require('node:assert/strict');
const { normalizeAnnualOutput, sourceLinkRepairPrompt, annualCorrectionPrompt, validateOrRepairAnnual, missingManagementActions, normalizeConfirmedManagement, managementActionRepairPrompt } = require('../src/utils/annualOutputRepair');
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
  await assert.rejects(validateOrRepairAnnual(raw, check, async () => reply('')), /原检查日期/);
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

test('system annual scheduling replaces AI provenance before validation without another AI call', async () => {
  const { applyAnnualSchedule } = require('../src/utils/annualOutputRepair');
  const reports = [{_id:'verified', checkDate:'2026-09-05', reportItems:[{name:'年度检查'}]}];
  const raw = rawPlan();
  Object.assign(raw.annual_checkup, {focus:'检查乙',timingSourceId:'report_history',timingBaseDate:'2026-08-15',date:'2027-08-15'});
  const timeline = require('../src/utils/annualClinicalRules').reportTimeline(reports);
  const check = value => { validateAnnualRaw(value,catalog,evidence,keys); validateClinicalRules(value,timeline,evidence); };
  assert.throws(() => check(raw), /原检查日期/);
  const result = await validateOrRepairAnnual(raw, check, () => assert.fail('no AI needed'), value => applyAnnualSchedule(value,reports));
  assert.equal(result.annual_checkup.date, '2027-09-05');
  assert.equal(result.annual_checkup.timingBaseDate,'2026-09-05');
  assert.equal(result.annual_checkup.timingSourceId,'report:verified:0');
  assert.deepEqual(result.checkup_completion,raw.checkup_completion);
  assert.equal(result.annual_checkup.focus,raw.annual_checkup.focus);
  assert.equal(applyAnnualSchedule(raw,[]),raw);
});

test('nearby scheduling correction survives merge without changing agreed dates or hospital', async () => {
  const { validateClinicalRules } = require('../src/utils/annualClinicalRules');
  const raw = { medical_treatment: [{visit_time:'2026-11-05', hospital:'已讨论医院', timingReason:'先就诊评估'}],
    abnormal_followup: [{time:'2026-11-10', items:'复查'}], annual_checkup:{}, evidenceCoverage:[] };
  const check = value => validateClinicalRules(value, []);
  assert.throws(() => check(raw), /尚未统筹/);
  const prompt = annualCorrectionPrompt(raw, [], '相近就医检查日期尚未统筹');
  assert.match(prompt, /先就诊评估/); assert.match(prompt, /scheduleCorrections/);
  assert.doesNotMatch(prompt, /"annual_checkup"|"evidenceCoverage"/);
  const result = await validateOrRepairAnnual(raw, check, async () => JSON.stringify({
    timingCorrections:[{module:'annual_checkup',index:0,timingSourceId:'',timingBaseDate:''}],
    scheduleCorrections:[{module:'abnormal_followup', index:0,
      scheduleSeparationReason:'先完成就诊评估，再核实复查开单和准备条件', time:'2026-12-01', hospital:'其他医院'}],
  }));
  check(result);
  assert.deepEqual(result.medical_treatment, raw.medical_treatment);
  assert.equal(result.abnormal_followup[0].time, '2026-11-10');
  assert.equal(result.abnormal_followup[0].hospital, undefined);
  await assert.rejects(validateOrRepairAnnual(raw, check, async () => JSON.stringify({
    annual_checkup:{}, evidenceCoverage:[], scheduleCorrections:[{module:'abnormal_followup',index:99,scheduleSeparationReason:'错误事项'}],
  })), /尚未统筹/);
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

test('misrouted confirmed issues are repaired with a bounded action patch', async () => {
  const sources = [
    { id: 'management_issue:kidney', content: { problem: '肾结晶', direction: 'ongoing_management' } },
    { id: 'management_issue:review', content: { problem: '复查肺结节', direction: 'abnormal_followup' } },
  ];
  const templates = [{ id: 'daily', category: 'personalized', name: '【日常跟进】' },
    { id: 'review-template', category: 'abnormal_followup', name: '定期复查' }];
  const original = { medical_treatment: [], checkup_completion: [], abnormal_followup: [], vaccine: [], annual_checkup: {},
    templateNodes: [{ standardPlanId: 'daily', standardPlanName: '【日常跟进】', matchReason: '已审问题', sourceIds: sources.map(item => item.id) }],
    evidenceCoverage: sources.map(item => ({ sourceId: item.id, status: 'deferred', reason: '模型误判' })) };
  const check = value => validateAnnualRaw(value, templates, sources, keys);
  const normalized = normalizeConfirmedManagement(original, sources, templates);
  assert.deepEqual(normalized.templateNodes[0].sourceIds, [sources[0].id]);
  assert.deepEqual(missingManagementActions(normalized, sources, templates).map(item => item.id), [sources[1].id]);
  const prompt = managementActionRepairPrompt(normalized, [sources[1]], templates, '方向错误');
  assert.ok(prompt.length < 4000);
  assert.match(prompt, /每个缺失来源恰好返回一项/);
  const action = { standardPlanId: 'review-template', items: '复查肺结节', time: '2026-11-01',
    basisSummary: '已审报告建议复查', ownerRole: '健管专员', sourceIds: [sources[1].id] };
  const patch = { managementActionCorrections: [{ sourceId: sources[1].id, module: 'abnormal_followup', action }] };
  const repair = value => normalizeConfirmedManagement(value, sources, templates);
  const result = await validateOrRepairAnnual(original, check, async () => JSON.stringify(patch), repair, { evidence: sources, catalog: templates });
  check(result);
  assert.equal(result.abnormal_followup.length, 1);
  assert.equal(original.abnormal_followup.length, 0);
  assert.equal(result.evidenceCoverage.every(item => item.status === 'included'), true);
  await assert.rejects(validateOrRepairAnnual(original, check, async () => JSON.stringify({ managementActionCorrections: [
    { ...patch.managementActionCorrections[0], action: { ...action, standardPlanId: 'daily' } }] }), repair,
  { evidence: sources, catalog: templates }), /缺少有效方向/);
  await assert.rejects(validateOrRepairAnnual(original, check, async () => JSON.stringify({ managementActionCorrections: [
    { ...patch.managementActionCorrections[0], action: { ...action, time: '' } }] }), repair,
  { evidence: sources, catalog: templates }), /缺少有效方向/);
});

test('management action repair gets one subsequent source-link pass for included priorities', async () => {
  const management = { id: 'management_issue:review', content: { problem: '定期复查', direction: 'abnormal_followup' } };
  const priority = { id: 'priority:2', content: { title: '同项复查重点' } };
  const sources = [management, priority];
  const templates = [{ id: 'followup', category: 'abnormal_followup', name: '定期复查' }];
  const raw = { medical_treatment: [], checkup_completion: [], abnormal_followup: [], vaccine: [], templateNodes: [], annual_checkup: {},
    evidenceCoverage: [{ sourceId: management.id, status: 'deferred', reason: 'AI遗漏' },
      { sourceId: priority.id, status: 'included', reason: '已确认重点' }] };
  const action = { standardPlanId: 'followup', items: '定期复查', time: '2026-11-01', ownerRole: '健管专员',
    basisSummary: '已审建议', sourceIds: [management.id] };
  const check = candidate => validateAnnualRaw(candidate, templates, sources, keys);
  const normalize = candidate => normalizeConfirmedManagement(candidate, sources, templates);
  let calls = 0;
  const result = await validateOrRepairAnnual(raw, check, async (candidate, message, missing) => {
    calls++;
    if (calls === 1) return JSON.stringify({ managementActionCorrections: [
      { sourceId: management.id, module: 'abnormal_followup', action }] });
    assert.deepEqual(missing, [priority.id]);
    assert.equal(candidate.abnormal_followup.length, 1);
    return JSON.stringify({ sourceLinkCorrections: [{ module: 'abnormal_followup', index: 0, sourceIds: [priority.id] }] });
  }, normalize, { evidence: sources, catalog: templates });
  assert.equal(calls, 2);
  assert.deepEqual(result.abnormal_followup[0].sourceIds, [management.id, priority.id]);
  check(result);
  let failedCalls = 0;
  await assert.rejects(validateOrRepairAnnual(raw, check, async () => (++failedCalls === 1
    ? JSON.stringify({ managementActionCorrections: [{ sourceId: management.id, module: 'abnormal_followup', action }] })
    : JSON.stringify({ sourceLinkCorrections: [] })), normalize,
  { evidence: sources, catalog: templates }), /遗漏对应事项/);
});
