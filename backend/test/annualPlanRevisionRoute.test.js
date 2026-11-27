const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');

test('顾问逐项暂存不改客户方案，确认发布后只通知一次', async t => {
  const id = () => new mongoose.Types.ObjectId().toString();
  const patientId = id(); const planId = id(); const advisorId = id(); const managerId = id(); const tenantId = id();
  const plan = { _id: planId, patientId, year: 2026, templateName: '健康预防方案',
    updatedAt: new Date('2026-10-27T00:00:00Z'), pushedAt: new Date('2026-10-26T00:00:00Z'), reviewStatus: 'approved',
    returnedAt: new Date(), returnReason: '请修改复查说明', supplementRevisions: [],
    moduleData: { abnormal_followup: { enabled: true, records: [{ items: '尿酸复查', time: '2027-01-26', reason: '原依据' }] }, annual_checkup: { enabled: true, date: '2027-05-01', institution: '原体检机构', focus: '原重点' } } };
  let role = 'familyDoctor'; let visible = [patientId]; let update; const notifications = [];
  const paths = ['../src/middleware/staffAuth', '../src/models/AnnualPlan', '../src/models/PushRecord', '../src/models/Admin', '../src/models/User'].map(p => require.resolve(p));
  const prior = paths.map(p => require.cache[p]);
  const mocks = [
    (req, res, next) => { req.staff = { _id: advisorId, role }; next(); },
    { findOne: () => ({ select: () => ({ lean: async () => plan }) }),
      findOneAndUpdate: (query, changes) => { update = { query, changes }; return { select: async () => {
        Object.assign(plan, changes.$set || {});
        for (const key of Object.keys(changes.$unset || {})) delete plan[key];
        if (changes.$push?.supplementRevisions) plan.supplementRevisions.push(changes.$push.supplementRevisions);
        plan.updatedAt = new Date(plan.updatedAt.getTime() + 1000);
        return { ...plan };
      } }; } },
    { updateOne: async (query, update) => { notifications.push(update.$setOnInsert); } },
    { findById: () => ({ select: () => ({ lean: async () => ({ _id: managerId, role: 'healthManager', tenantId, staffStatus: 'active' }) }) }) },
    { findById: () => ({ select: () => ({ lean: async () => ({ _id: patientId, tenantId }) }) }) },
  ];
  paths.forEach((p, i) => { require.cache[p] = { id: p, filename: p, loaded: true, exports: mocks[i] }; });
  const routePath = require.resolve('../src/routes/reviewPlanAmendments');
  delete require.cache[routePath];
  const app = express(); app.use(express.json()); app.use(require(routePath)({ getVisiblePlanPatientIds: async () => visible }));
  const server = app.listen(0);
  t.after(() => { server.close(); paths.forEach((p, i) => { if (prior[i]) require.cache[p] = prior[i]; else delete require.cache[p]; }); delete require.cache[routePath]; });
  const body = { planId, reason: '按客户意见调整描述',
    item: { key: 'abnormal_followup', target: 0, title: '尿酸复查', goal: '完成复查，明确后续管理措施', reason: '顾问核对后的依据', advice: '按原定日期复查', notes: '客户希望提前电话联系' } };
  const call = async patch => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/${patientId}/annual-plan-revision`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, baseUpdatedAt: plan.updatedAt.toISOString(), ...patch }) });
    return { status: response.status, ...await response.json() };
  };
  role = 'nutritionist'; assert.equal((await call()).status, 403);
  role = 'familyDoctor'; visible = []; assert.equal((await call()).status, 403);
  visible = [patientId]; assert.equal((await call({ baseUpdatedAt: 'old' })).status, 409);
  plan.reviewStatus = null;
  const result = await call();
  assert.equal(result.status, 200, JSON.stringify(result));
  plan.reviewStatus = 'approved';
  assert.equal(update.changes.$set.revisionDraft.moduleData.abnormal_followup.records[0].notes, '客户希望提前电话联系');
  assert.equal(plan.moduleData.abnormal_followup.records[0].notes, undefined);
  assert.equal(plan.returnReason, '请修改复查说明');
  assert.equal(plan.supplementRevisions.length, 0);
  assert.equal(notifications.length, 0);
  const oldMode = process.env.MANAGEMENT_REVIEW_MODE, oldIds = process.env.MANAGEMENT_REVIEW_PATIENT_IDS;
  process.env.MANAGEMENT_REVIEW_MODE = 'phase_assessment'; process.env.MANAGEMENT_REVIEW_PATIENT_IDS = patientId;
  t.after(() => { if (oldMode === undefined) delete process.env.MANAGEMENT_REVIEW_MODE; else process.env.MANAGEMENT_REVIEW_MODE = oldMode; if (oldIds === undefined) delete process.env.MANAGEMENT_REVIEW_PATIENT_IDS; else process.env.MANAGEMENT_REVIEW_PATIENT_IDS = oldIds; });
  const checkup = await call({ item: { key: 'annual_checkup', goal: '完成年度体检并核对重点项目', date: '2027-05-02', institution: '新体检机构', focus: '核对重点', notes: '需确认陪检', delivery: { hospital: '新体检机构', campus: '东院区', department: '', expert: '', followUpStaff: managerId, bookingRequired: true, serviceMode: 'managed', serviceType: '', managedServiceType: 'checkup' } } });
  assert.equal(checkup.status, 200, JSON.stringify(checkup));
  assert.equal(update.changes.$set.revisionDraft.moduleData.annual_checkup.campus, '东院区');
  assert.equal(update.changes.$set.revisionDraft.moduleData.annual_checkup.notes, '需确认陪检');
  assert.equal(update.changes.$set.revisionDraft.moduleData.annual_checkup.goal, '完成年度体检并核对重点项目');
  assert.equal(update.changes.$set.revisionDraft.moduleData.annual_checkup.managedServiceType, 'checkup');
  const relocated = await call({ item: { ...body.item, date: '2027-02-26', delivery: { hospital: '浙江省人民医院', campus: '朝晖院区', department: '风湿免疫科', expert: '李医生', followUpStaff: managerId, bookingRequired: true, serviceMode: 'single', serviceType: 'escort_exam', managedServiceType: '' } } });
  assert.equal(relocated.status, 200, JSON.stringify(relocated));
  assert.equal(update.changes.$set.revisionDraft.moduleData.abnormal_followup.records[0].time, '2027-02-26');
  assert.equal(update.changes.$set.revisionDraft.moduleData.abnormal_followup.records[0].hospital, '浙江省人民医院');
  assert.equal(update.changes.$set.revisionDraft.moduleData.abnormal_followup.records[0].department, '风湿免疫科');
  assert.equal(update.changes.$set.revisionDraft.moduleData.abnormal_followup.records[0].campus, '朝晖院区');
  assert.equal(update.changes.$set.revisionDraft.moduleData.abnormal_followup.records[0].followUpStaff, managerId);
  assert.equal(notifications.length, 0);
  const records = plan.revisionDraft.moduleData.abnormal_followup.records;
  records.push(...['检查甲','检查乙'].map(items => ({items,time:'2027-05-03',serviceMode:'reminder'})));
  const blocked = await call({action:'publish',item:undefined});
  assert.equal(blocked.status,409);
  assert.match(blocked.message,/同日复查/);
  assert.equal(notifications.length,0);
  assert.equal(plan.moduleData.abnormal_followup.records.length,1);
  const review = await call({action:'reviewVisits',item:undefined,review:{kind:'group',keys:['abnormal_followup:1','abnormal_followup:2'],leaderKey:'abnormal_followup:1',date:'2027-05-03',serviceMode:'reminder'}});
  assert.equal(review.status,200,JSON.stringify(review));
  assert.ok(plan.revisionDraft.moduleData.abnormal_followup.records[1].visitMergeConfirmed);
  const published = await call({ action: 'publish', item: undefined });
  assert.equal(published.status, 200, JSON.stringify(published));
  assert.equal(plan.revisionDraft, undefined);
  assert.equal(plan.moduleData.abnormal_followup.records[0].time, '2027-02-26');
  assert.equal(plan.supplementRevisions.length, 1);
  assert.equal(plan.supplementRevisions[0].executionReview.status, 'pending');
  assert.equal(notifications.length, 1);
});
