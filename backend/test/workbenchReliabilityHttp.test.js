const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { reviewToken } = require('../src/utils/summaryReviewVersion');

test('workbench reliability: isolated Mongo and authenticated HTTP', { skip: process.env.WORKBENCH_TEST_MONGO !== '1' }, async t => {
  const mongoose = require('mongoose'), express = require('express'), jwt = require('jsonwebtoken');
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  const database = 'workbench_reliability_test_' + crypto.randomBytes(8).toString('hex');
  await mongoose.connect('mongodb://127.0.0.1:27961/' + database, { serverSelectionTimeoutMS: 4000 });
  const app = express(); app.use(express.json()); app.use('/staff', require('../src/routes/staff'));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  const Admin = require('../src/models/Admin'), User = require('../src/models/User'), FollowUp = require('../src/models/FollowUp'), Order = require('../src/models/Order');
  const createStaff = (role, name) => Admin.create({ username: database + role, name, role, password: crypto.randomBytes(20).toString('hex') });
  const doctor = await createStaff('familyDoctor', '测试顾问'), planner = await createStaff('healthPlanner', '测试规划师');
  const outsider = await createStaff('healthManager', '其他专员');
  const patient = await User.create({ name: '合成验收客户', phone: '19900002861', assignedFamilyDoctor: doctor._id, assignedHealthPlanner: planner._id });
  const call = async (actor, path, body) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/staff${path}`, { method: body ? 'PATCH' : 'GET', headers: {
      'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt.sign({ type: 'admin', id: String(actor._id) }, process.env.JWT_SECRET),
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json() };
  };
  const follow = (props = {}) => ({ staffId: doctor._id, assignedTo: doctor._id, patientId: patient._id, date: new Date('2026-09-28T00:00:00Z'), status: 'planned', ...props });
  const base = '/followups?status=active&includeFuture=1&workbench=human&limit=5&dayStart=2026-09-29T00:00:00Z';
  await FollowUp.insertMany([
    ...Array.from({ length: 220 }, () => follow({ sourceType: 'medication_reminder' })),
    ...Array.from({ length: 213 }, (_, i) => follow({ theme: '人工随访' + i, status: ['planned', 'in_progress', 'missed'][i % 3] })),
    follow({ theme: '明确人工介入', sourceType: 'medication_reminder', tags: ['人工跟进'] }),
    follow({ theme: '服务进度', serviceTracking: { status: 'waiting' } }),
    follow({ theme: '已结束', status: 'completed' }),
    follow({ theme: '其他专员', assignedTo: outsider._id }),
  ]);
  await t.test('human filtering happens before paging, unfinished states and exact counts survive 200+', async () => {
    const r = await call(doctor, base + '&page=43');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.total, 214); // 213 + explicit handoff; another assignee stays outside the personal queue
    assert.equal(r.body.data.followUps.length, 4);
    assert.equal(r.body.data.workbenchSummary.counts.overdue, 214);
    assert.equal(r.body.data.workbenchSummary.waiting, 1);
    const first = await call(doctor, base);
    assert.deepEqual(new Set(first.body.data.followUps.map(f => f.status)), new Set(['planned', 'in_progress', 'missed']));
    assert.ok(first.body.data.followUps.every(f => f.sourceType !== 'medication_reminder'));
  });
  await t.test('assignee filtering, waiting progress and page shrink remain reachable', async () => {
    const filtered = await call(doctor, base + '&assigneeName=' + encodeURIComponent('其他专员'));
    assert.equal(filtered.body.data.total, 0);
    const own = await call(doctor, base + '&assigneeName=' + encodeURIComponent('测试顾问'));
    assert.equal(own.body.data.total, 214);
    const waiting = await call(doctor, base + '&workbenchTime=waiting');
    assert.equal(waiting.body.data.total, 1); assert.equal(waiting.body.data.followUps[0].theme, '服务进度');
    const clamp = await call(doctor, base + '&page=999');
    assert.equal(clamp.body.data.page, 43);
    const missing = await call(doctor, base + '&assigneeName=' + encodeURIComponent('不存在.*'));
    assert.equal(missing.body.data.total, 0, 'search characters are literal');
  });
  await t.test('all order pages include future/ongoing reservations, no 20/100 ceiling', async () => {
    const orders = await Order.insertMany(Array.from({ length: 125 }, (_, i) => ({ user: patient._id, serviceId: 'test', serviceName: '合成服务' + i, paymentStatus: 'paid', tradeStatus: 'paid', status: 'pending' })));
    await FollowUp.insertMany(orders.map((o, i) => follow({ assignedTo: planner._id, sourceType: 'order', sourceOrderId: o._id, status: i % 2 ? 'in_progress' : 'planned', remindAt: new Date('2030-01-01') })));
    await FollowUp.insertMany(orders.map(o => follow({ assignedTo: planner._id, sourceType: 'order', sourceOrderId: o._id, status: 'completed', completedAt: new Date() })));
    const { loadFollowUpPages } = await import('../../staff/src/utils/loadFollowUpPages.mjs');
    const fetchPage = async params => { const r = await call(planner, '/followups?' + new URLSearchParams(params)); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };
    for (const status of ['active', 'completed']) {
      const rows = await loadFollowUpPages(fetchPage, { status, sourceType: 'order', scope: 'assigned', includeFuture: '1' });
      assert.equal(rows.length, 125);
    }
  });
  await t.test('old high-risk years remain visible and each link selects its year', async () => {
    const risk = { alerted: true, generatedAt: new Date(), overallLevel: 'high' };
    await User.collection.updateOne({ _id: patient._id }, { $set: { aiRiskAssessment: { byYear: { 2024: risk, 2025: risk, 2026: { ...risk, approvedAt: new Date() } } } } });
    const r = await call(doctor, '/ai-todos'); assert.equal(r.status, 200, JSON.stringify(r.body));
    const rows = r.body.data.filter(row => row.type === 'risk_review');
    assert.deepEqual(new Set(rows.map(r => r.year)), new Set(['2024', '2025']));
    assert.equal(new Set(rows.map(r => r.id)).size, 2);
    assert.ok(rows.every(r => r.link.endsWith('riskYear=' + r.year)));
    await call(doctor, `/patients/${patient._id}/ai-risk-assessment`, { action: 'approve', year: '2024' });
    const remaining = (await call(doctor, '/ai-todos')).body.data.filter(r => r.type === 'risk_review');
    assert.deepEqual(remaining.map(r => r.year), ['2025']);
  });
  const draft = { scope: 'doctor', generatedAt: '2025-09-01T00:00:00Z', sections: { medical_priority: { summary: '已阅读原稿' } } };
  const newer = { ...draft, generatedAt: '2026-09-29T00:00:00Z', sections: { medical_priority: { summary: '新稿' } } };
  const writeSummary = value => User.collection.updateOne({ _id: patient._id }, { $set: { aiHealthSummary: value } });
  const path = `/patients/${patient._id}/ai-health-summary`;
  const approve = { action: 'approve', scope: 'doctor', year: '2025', recordIndex: 0, expectedRecordToken: reviewToken(draft) };
  await t.test('detail supplies token; inserting a record cannot change the approval target', async () => {
    await writeSummary({ byYear: { 2025: { records: [draft] } } });
    const detail = await call(doctor, `/patients/${patient._id}`);
    assert.equal(detail.body.data.user.aiHealthSummary.byYear[2025].records[0]._reviewToken, reviewToken(draft));
    await writeSummary({ byYear: { 2025: { records: [newer, draft] }, 2026: { records: [newer] } }, latestYear: '2026' });
    const r = await call(doctor, path, approve); assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.recordIndex, 1);
    const saved = (await User.findById(patient._id)).aiHealthSummary;
    assert.ok(saved.byYear[2025].records[1].doctorApprovedAt);
    assert.ok(!saved.byYear[2025].records[0].doctorApprovedAt);
    assert.equal(saved.latestYear, '2026'); assert.equal(saved.sections.medical_priority.summary, '新稿');
  });
  await t.test('stale content, missing token and ambiguous records fail closed', async () => {
    await writeSummary({ byYear: { 2025: { records: [newer] } } });
    assert.equal((await call(doctor, path, approve)).status, 409);
    assert.equal((await call(doctor, path, { ...approve, expectedRecordToken: undefined })).status, 409);
    await writeSummary({ byYear: { 2025: { records: [draft, draft] } } });
    assert.equal((await call(doctor, path, approve)).status, 409);
  });
  await t.test('concurrent update after reading causes CAS rejection without lost changes', async () => {
    await writeSummary({ byYear: { 2025: { records: [draft] } } });
    const original = User.collection.updateOne.bind(User.collection);
    let intercepted = false;
    User.collection.updateOne = async (filter, update, ...rest) => {
      if (!intercepted && filter.aiHealthSummary) {
        intercepted = true;
        await original({ _id: patient._id }, { $set: { 'aiHealthSummary.byYear.2025.records.0.sections.medical_priority.summary': '他人刚修改' } });
      }
      return original(filter, update, ...rest);
    };
    try { assert.equal((await call(doctor, path, approve)).status, 409); }
    finally { User.collection.updateOne = original; }
    const record = (await User.findById(patient._id)).aiHealthSummary.byYear[2025].records[0];
    assert.equal(record.sections.medical_priority.summary, '他人刚修改'); assert.ok(!record.doctorApprovedAt);
  });
  await t.test('flat legacy records can still be approved with a read-time token', async () => {
    await writeSummary(draft);
    assert.equal((await call(doctor, path, approve)).status, 200);
  });
});
