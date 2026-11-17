const { test } = require('node:test');
const assert = require('node:assert/strict');
const { saveProgress } = require('../src/utils/followUpProgress');
const pilotId = '6a4ef1980f2291549b4ffd8d';
process.env.MANAGEMENT_REVIEW_MODE = 'phase_assessment';
process.env.MANAGEMENT_REVIEW_PATIENT_IDS = pilotId;
const medical = {patientId:pilotId,sourceType:'scheduled',sourceScheduleKey:'medical_treatment:2026-09-23',deliveryMode:'reminder'};
test('reminder outcomes retain one task and require confirmed real visit date',async()=>{
  const s=setup(medical);
  for(const outcome of ['reminded','unreachable','deferred','booked']){
    const row=await saveProgress({...s.args,body:{...s.args.body,requestId:'contact-'+outcome,updatedAt:s.get().updatedAt,outcome}});
    assert.equal(row.status,'in_progress');assert.equal(row.content,'完成本次复查');
  }
  const body={...s.args.body,updatedAt:s.get().updatedAt,outcome:'visited',visitDate:'2026-09-23',visitConfirmed:true};
  for(const change of [{visitConfirmed:false},{visitDate:'2099-01-01'},{visitDate:'2026-02-30'}])await assert.rejects(saveProgress({...s.args,body:{...body,...change},now:new Date('2026-09-23')}),{statusCode:400});
  await saveProgress({...s.args,body,now:new Date('2026-09-23')});
  s.get().careFlowId='task';
  await saveProgress({...s.args,body});
  assert.equal(s.get().progressRecords.length,5);
  await assert.rejects(saveProgress({...s.args,body:{...body,requestId:'new-contact'}}),{statusCode:409});
});
test('assistance cannot use pure reminder transition',async()=>{
 const s=setup({...medical,deliveryMode:'single'});
 await assert.rejects(saveProgress({...s.args,body:{...s.args.body,outcome:'visited'}}),{statusCode:400});
});
test('medication reminder stays in one task until verified pickup, then closes without visit flow', async () => {
  const s = setup({ patientId: 'test-patient', sourceType: null, followUpSchemeId: 'scheme', formData: { adHocMedicalReminder: true, reminderKind: 'medication' } });
  const first = await saveProgress({ ...s.args, body: { ...s.args.body, outcome: 'reminded' } });
  assert.equal(first.status, 'in_progress');
  await assert.rejects(saveProgress({ ...s.args, body: { ...s.args.body, updatedAt: first.updatedAt, requestId: 'pickup-001', outcome: 'obtained' } }), { statusCode: 400 });
  const done = await saveProgress({ ...s.args, body: { ...s.args.body, updatedAt: first.updatedAt, requestId: 'pickup-001', outcome: 'obtained', visitConfirmed: true } });
  assert.equal(done.status, 'completed');
  assert.equal(done.completedBy, 'staff');
  assert.equal(done.completedByStaffId, 'manager');
  assert.ok(done.completedAt);
  assert.equal(done.careFlowId, undefined);
});
function setup(patch = {}) {
  let row = { _id: 'task', assignedTo: 'manager', staffId: 'advisor', status: 'planned', updatedAt: new Date('2026-09-21'),
    content: '完成本次复查', type: 'phone', ...patch };
  const model = {
    findById: () => ({ lean: async () => structuredClone(row) }),
    findOneAndUpdate: async (query, update) => {
      if (+query.updatedAt !== +row.updatedAt || row.progressRecords?.some(x => x.requestId === query['progressRecords.requestId'].$ne)) return null;
      row = { ...row, ...update.$set, progressRecords: [...(row.progressRecords || []), ...update.$push.progressRecords.$each], updatedAt: new Date(+row.updatedAt + 1) };
      return structuredClone(row);
    },
  };
  const args = { FollowUp: model, id: 'task', actor: { _id: 'manager', role: 'healthManager', name: '健管' },
    body: { requestId: 'request-0001', content: '客户下周检查', type: 'wechat', updatedAt: row.updatedAt, nextContactAt: new Date(Date.now() + 7 * 86400000).toISOString() } };
  return { args, get: () => row };
}
test('two contacts append to one plan, preserve requirements, never complete', async () => {
  const s = setup(medical); const first = await saveProgress(s.args);
  assert.equal(+first.date, +new Date(s.args.body.nextContactAt));
  const second = await saveProgress({ ...s.args, body: { ...s.args.body, updatedAt: first.updatedAt, requestId: 'request-0002', content: '已检查，等待报告', nextContactAt: null } });
  assert.equal(second.status, 'in_progress'); assert.equal(second.content, '完成本次复查');
  assert.equal(second.progressRecords.length, 2); assert.equal(second.plannedContent, '完成本次复查');
  assert.equal(+second.remindAt, +first.remindAt); assert.ok(!second.completedAt);
});
test('outside the pilot, ordinary medical progress keeps its original due date', async () => {
  const s = setup({ ...medical, patientId: '6a4ef1980f2291549b4ffd8e', date: new Date('2026-11-10T00:00:00Z') });
  const original = s.get().date;
  const row = await saveProgress(s.args);
  assert.equal(+row.date, +original);
});
test('response retry is idempotent', async () => { const s = setup(); await saveProgress(s.args); await saveProgress(s.args); assert.equal(s.get().progressRecords.length, 1); });
test('parallel contacts cannot overwrite each other', async () => {
  const s = setup(); const results = await Promise.allSettled([saveProgress(s.args), saveProgress({ ...s.args, body: { ...s.args.body, requestId: 'request-0002' } })]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(results.find(x => x.status === 'rejected').reason.statusCode, 409);
});
test('legacy execution is retained before first append', async () => { const s = setup({ executedContent: '已电话提醒' }); const row = await saveProgress(s.args); assert.equal(row.progressRecords[0].content, '已电话提醒'); });
for (const patch of [{ status: 'completed' }, { status: 'cancelled' }, { aiStatus: 'pending' }, { taskRole: 'executor' }, { workflowKey: 'medical_proxy:booking' }]) {
  test('reject closed/unreviewed/special workflow ' + JSON.stringify(patch), async () => { const s = setup(patch); await assert.rejects(saveProgress(s.args), { statusCode: 409 }); });
}
test('creator cannot edit reassigned execution progress', async () => { const s = setup(); s.args.actor._id = 'advisor'; await assert.rejects(saveProgress(s.args), { statusCode: 403 }); });
test('invalid next date rejected before writing', async () => { const s = setup(); s.args.body.nextContactAt = 'invalid'; await assert.rejects(saveProgress(s.args), { statusCode: 400 }); assert.ok(!s.get().progressRecords); });
test('service waiting permits original plan notes without unlocking service state', async () => {
  const s = setup({ continuityRequired: true, isBlocked: true, serviceTracking: { status: 'waiting', revision: 2 } });
  const row = await saveProgress(s.args);
  assert.equal(row.status, 'in_progress'); assert.equal(row.isBlocked, true);
  assert.deepEqual(row.serviceTracking, { status: 'waiting', revision: 2 });
  assert.equal(row.progressRecords.length, 1);
});

test('health recording keeps one task and advances its workbench date by the follow-up interval',async()=>{
 const s=setup({formData:{healthDataPlan:{enabled:true,followUpDays:14}},date:new Date('2026-10-01')});
 const now=new Date('2026-10-01T09:00:00+08:00');
 const body={...s.args.body,nextContactAt:null};
 const result=await saveProgress({...s.args,body,now});
 assert.equal(+result.date,+now+14*86400000);assert.equal(+result.nextFollowUpDate,+result.date);
 assert.equal(result.progressRecords.length,1);assert.equal(result.status,'in_progress');
 await saveProgress({...s.args,body,now});assert.equal(s.get().progressRecords.length,1);
 await assert.rejects(saveProgress({...s.args,body:{...body,requestId:'new-contact-003',updatedAt:result.updatedAt,nextContactAt:'2026-09-30'},now}),{statusCode:400});
});
test('consensus trial advances topics on one task and closes after advisor decision', async () => {
  const s = setup({ patientId: pilotId, formData: { healthConsensus: { question: '主题一', topicPath: ['主题一', '主题二'], currentTopicIndex: 0 } } });
  const now = new Date('2026-11-17T10:00:00+08:00');
  const nextAt = new Date('2026-11-24T10:00:00+08:00').toISOString();
  const first = await saveProgress({ ...s.args, now, body: { ...s.args.body, topicOutcome: 'next', nextContactAt: nextAt } });
  assert.equal(first.formData.healthConsensus.currentTopicIndex, 1);
  assert.match(first.theme, /主题二/);
  assert.equal(first.progressRecords[0].consensusTopic, '主题一');
  assert.equal(first.status, 'in_progress');
  await assert.rejects(saveProgress({ ...s.args, now, body: { ...s.args.body, requestId: 'request-0002', updatedAt: first.updatedAt, topicOutcome: 'next', nextContactAt: nextAt } }), { statusCode: 400 });
  const done = await saveProgress({ ...s.args, now, body: { ...s.args.body, requestId: 'request-0003', updatedAt: first.updatedAt, topicOutcome: 'complete', nextContactAt: null } });
  assert.equal(done.status, 'completed');
  assert.equal(done.progressRecords[1].consensusTopic, '主题二');
  assert.equal(done.progressRecords[1].consensusTopicOutcome, 'complete');
});
test('consensus trial starts with one topic and advisor chooses the next after contact', async () => {
  const s = setup({ patientId: pilotId, formData: { healthConsensus: { question: '主题一', topicPath: ['主题一'], currentTopicIndex: 0 } } });
  const nextAt = new Date('2026-11-24T10:00:00+08:00').toISOString();
  const first = await saveProgress({ ...s.args, body: { ...s.args.body, topicOutcome: 'next', nextTopic: '主题二', nextContactAt: nextAt } });
  assert.deepEqual(first.formData.healthConsensus.topicPath, ['主题一', '主题二']);
  assert.equal(first.formData.healthConsensus.currentTopicIndex, 1);
  assert.match(first.theme, /主题二/);
  await assert.rejects(saveProgress({ ...s.args, body: { ...s.args.body, requestId: 'request-0002', updatedAt: first.updatedAt, topicOutcome: 'next', nextTopic: '<script>', nextContactAt: nextAt } }), { statusCode: 400 });
});
