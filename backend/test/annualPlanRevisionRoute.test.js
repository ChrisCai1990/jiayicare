const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');

test('顾问只修订本人客户的一项，保留日期和已发布状态并通知客户', async t => {
  const id = () => new mongoose.Types.ObjectId().toString();
  const patientId = id(); const planId = id(); const advisorId = id();
  const plan = { _id: planId, patientId, year: 2026, templateName: '健康预防方案',
    updatedAt: new Date('2026-10-27T00:00:00Z'), pushedAt: new Date('2026-10-26T00:00:00Z'), reviewStatus: 'approved',
    returnedAt: new Date(), returnReason: '请修改复查说明', supplementRevisions: [],
    moduleData: { abnormal_followup: { enabled: true, records: [{ items: '尿酸复查', time: '2027-01-26', reason: '原依据' }] } } };
  let role = 'familyDoctor'; let visible = [patientId]; let update; let notification;
  const paths = ['../src/middleware/staffAuth', '../src/models/AnnualPlan', '../src/models/PushRecord'].map(p => require.resolve(p));
  const prior = paths.map(p => require.cache[p]);
  const mocks = [
    (req, res, next) => { req.staff = { _id: advisorId, role }; next(); },
    { findOne: () => ({ select: () => ({ lean: async () => plan }) }),
      findOneAndUpdate: (query, changes) => { update = { query, changes }; return { select: async () => ({ ...plan, moduleData: changes.$set.moduleData, returnedAt: null, returnReason: '' }) }; } },
    { create: async row => { notification = row; } },
  ];
  paths.forEach((p, i) => { require.cache[p] = { id: p, filename: p, loaded: true, exports: mocks[i] }; });
  const routePath = require.resolve('../src/routes/reviewPlanAmendments');
  delete require.cache[routePath];
  const app = express(); app.use(express.json()); app.use(require(routePath)({ getVisiblePlanPatientIds: async () => visible }));
  const server = app.listen(0);
  t.after(() => { server.close(); paths.forEach((p, i) => { if (prior[i]) require.cache[p] = prior[i]; else delete require.cache[p]; }); delete require.cache[routePath]; });
  const body = { planId, baseUpdatedAt: plan.updatedAt.toISOString(), reason: '按客户意见调整描述',
    item: { key: 'abnormal_followup', target: 0, title: '尿酸复查', reason: '顾问核对后的依据', advice: '按原定日期复查' } };
  const call = async patch => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/${patientId}/annual-plan-revision`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, ...patch }) });
    return { status: response.status, ...await response.json() };
  };
  role = 'nutritionist'; assert.equal((await call()).status, 403);
  role = 'familyDoctor'; visible = []; assert.equal((await call()).status, 403);
  visible = [patientId]; assert.equal((await call({ baseUpdatedAt: 'old' })).status, 409);
  const result = await call();
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(update.changes.$set.moduleData.abnormal_followup.records[0].time, '2027-01-26');
  assert.equal(update.changes.$push.supplementRevisions.executionReview.status, 'pending');
  assert.equal(update.changes.$set.returnReason, '');
  assert.equal(notification.sourceAnnualPlanId, planId);
  assert.match(notification.content, /查看完整方案/);
});
