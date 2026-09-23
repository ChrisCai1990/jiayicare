const test = require('node:test'), assert = require('node:assert/strict');
const { runtime } = require('../src/utils/annualDirectDispatch');
const planner = { _id: 'planner', role: 'healthPlanner' }, assistant = { _id: 'assistant', role: 'medicalAssistant' };
function setup() {
  const rows = new Map(); let stamp = 0, failChild = false, conflict = false;
  rows.set('request', { _id: 'request', patientId: 'patient', staffId: 'advisor', assignedTo: 'planner', sourceAnnualPlanId: 'annual', sourceType: 'annual_service', workflowKey: 'service_request', sourceScheduleKey: 'service-request:abnormal_followup:0:2026-12-02', taskRole: 'supervisor', status: 'planned', updatedAt: 0, date: new Date('2026-12-02'), formData: { serviceRequest: { mode: 'single', moduleKey: 'abnormal_followup', itemSnapshot: { hospital: '医院甲', items: '肾脏彩超' } } } });
  rows.set('parent', { _id: 'parent', patientId: 'patient', sourceType: 'scheduled', sourceAnnualPlanId: 'annual', sourceScheduleKey: 'abnormal_followup:2026-12-02:医院甲', deliveryMode: 'single', status: 'planned', plannedContent: '顾问原计划', annualBooking: { status: 'arranged', entries: [{ id: 'exam-0', status: 'booked', date: '2026-09-28', time: '09:00' }] } });
  const copy = x => x && structuredClone(x), get = (o,k) => k.split('.').reduce((a,b) => a?.[b], o);
  const matches = (row,q) => Object.entries(q).every(([k,v]) => v && typeof v === 'object' && !(v instanceof Date) ? (v.$in ? v.$in.includes(get(row,k)) : v.$nin ? !v.$nin.includes(get(row,k)) : false) : v === null ? get(row,k) == null : get(row,k) === v);
  const query = value => ({ lean: async () => copy(value), select: () => query(value) });
  const FollowUp = {
    findById: id => query(rows.get(String(id))), find: q => query([...rows.values()].filter(r => matches(r,q))),
    updateOne: async (q,u,options = {}) => {
      if (options.upsert) {
        if (failChild) throw new Error('模拟派单中断');
        if (!rows.has(q._id)) rows.set(q._id, { _id: q._id, ...copy(u.$setOnInsert), updatedAt: ++stamp });
        return { modifiedCount: 1 };
      }
      const row = rows.get(String(q._id));
      if (conflict || !row || !matches(row,q)) return { modifiedCount: 0 };
      for (const [k,v] of Object.entries(u.$set)) { const parts = k.split('.'); let target = row; while (parts.length > 1) { const key = parts.shift(); target = target[key] ||= {}; } target[parts[0]] = copy(v); }
      row.updatedAt = ++stamp; return { modifiedCount: 1 };
    },
  };
  return { rows, api: runtime({ FollowUp, Admin: { find: q => { assert.equal(q.role,'medicalAssistant'); assert.equal(q.staffStatus,'active'); assert.equal(q.tenantId,null); return query([{ _id: 'assistant', name: '就医专员甲' }]); } }, enabled: () => true }), crash: v => { failChild=v; }, conflict: () => { conflict=true; } };
}
test('直接派单自动带原计划预约，生成一条执行任务且重复提交幂等', async () => {
  const { rows, api } = setup(); const before = structuredClone(rows.get('parent'));
  const result = await api.dispatch('request', planner, { assigneeId: 'assistant', note: '办理后记录结果' });
  assert.equal(result.child.assignedTo,'assistant'); assert.equal(result.child.plannedContent,'顾问原计划');
  assert.equal(result.child.date.toISOString(), '2026-09-28T01:00:00.000Z');
  await api.dispatch('request',planner,{ assigneeId: 'assistant', note: '办理后记录结果' });
  assert.equal(rows.size,3); assert.deepEqual(rows.get('parent'),before);
  await assert.rejects(api.dispatch('request',planner,{assigneeId:'assistant',note:'改写'}),/不可重复改派/);
});
test('派单中断持久意图保留，重试只补同一个执行任务', async () => {
  const s=setup(); s.crash(true);
  await assert.rejects(s.api.dispatch('request',planner,{assigneeId:'assistant',note:''}),/中断/);
  const id=s.rows.get('request').annualDispatch.executionId; s.crash(false);
  await s.api.dispatch('request',planner,{assigneeId:'assistant',note:''});
  assert.equal(s.rows.size,3); assert.ok(s.rows.get(id));
});
test('权限、预约门槛、纯提醒、全托管及原服务承接不可绕过', async () => {
  for (const scenario of ['owner','unbooked','reminder','managed','linked','started','assignee','conflict']) {
    const s=setup(), r=s.rows.get('request'), p=s.rows.get('parent');
    if(scenario==='owner') r.assignedTo='other'; if(scenario==='unbooked') p.annualBooking=null;
    if(scenario==='reminder') p.deliveryMode='reminder'; if(scenario==='managed') r.formData.serviceRequest.mode='managed';
    if(scenario==='linked') r.serviceTracking={linkId:'l'}; if(scenario==='started') r.status='in_progress'; if(scenario==='conflict') s.conflict();
    await assert.rejects(s.api.dispatch('request',planner,{assigneeId:scenario==='assignee'?'other':'assistant',note:''})); assert.equal(s.rows.size,2);
  }
});
test('现场未完成不得提交；专员结果经规划师验收，原临床随访不自动结束', async () => {
  const s=setup(); const c=await s.api.dispatch('request',planner,{assigneeId:'assistant',note:''});
  const id=c.child._id; s.rows.get('parent').annualBooking.entries.push({id:'exam-1',mode:'onsite',status:'pending'});
  await assert.rejects(s.api.submit(id,assistant,{result:'已办理',confirmed:true}),/现场预约/);
  s.rows.get('parent').annualBooking.entries[1].status='booked';
  await assert.rejects(s.api.submit(id,planner,{result:'已办理',confirmed:true}),/岗位人员/);
  await s.api.submit(id,assistant,{result:'按交接完成代办',confirmed:true});
  assert.equal(s.rows.get('request').annualDispatch.status,'pending_review');
  await assert.rejects(s.api.review('request',assistant,{confirmed:true}),/岗位人员/);
  await s.api.review('request',planner,{confirmed:true});
  await s.api.review('request',planner,{confirmed:true});
  assert.equal(s.rows.get(id).status,'completed'); assert.equal(s.rows.get('request').status,'completed');
  assert.equal(s.rows.get('parent').status,'planned');
});
