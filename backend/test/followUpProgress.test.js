const { test } = require('node:test');
const assert = require('node:assert/strict');
const { saveProgress } = require('../src/utils/followUpProgress');
const medical = {sourceType:'scheduled',sourceScheduleKey:'medical_treatment:2026-09-23',deliveryMode:'reminder'};
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
    body: { requestId: 'request-0001', content: '客户下周检查', type: 'wechat', updatedAt: row.updatedAt, nextContactAt: '2026-09-25T09:00:00+08:00' } };
  return { args, get: () => row };
}
test('two contacts append to one plan, preserve requirements, never complete', async () => {
  const s = setup(); const first = await saveProgress(s.args);
  const second = await saveProgress({ ...s.args, body: { ...s.args.body, updatedAt: first.updatedAt, requestId: 'request-0002', content: '已检查，等待报告', nextContactAt: null } });
  assert.equal(second.status, 'in_progress'); assert.equal(second.content, '完成本次复查');
  assert.equal(second.progressRecords.length, 2); assert.equal(second.plannedContent, '完成本次复查');
  assert.equal(+second.remindAt, +first.remindAt); assert.ok(!second.completedAt);
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
