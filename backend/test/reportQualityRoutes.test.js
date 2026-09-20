const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');

test('isolated Mongo: Admin confirmation, role checks, review metadata and idempotent timing', { skip: !process.env.REPORT_QUALITY_TEST_MONGO }, async () => {
  const uri = process.env.REPORT_QUALITY_TEST_MONGO;
  assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:\d+$/);
  const mongoose = require('mongoose');
  const dbName = `report_quality_test_${randomUUID().replace(/-/g, '')}`;
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 3000 });
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'local-report-quality-test-only';
  let server;
  try {
    require('express-async-errors');
    const express = require('express'), jwt = require('jsonwebtoken');
    const Admin = require('../src/models/Admin'), MedicalReport = require('../src/models/MedicalReport');
    const Category = require('../src/models/ProjectCategory');
    const admin = new mongoose.Types.ObjectId(), staff = new mongoose.Types.ObjectId(), patient = new mongoose.Types.ObjectId();
    await Admin.collection.insertMany([{ _id: admin, username: 'quality_admin', name: '测试管理员', role: 'superadmin' }, { _id: staff, username: 'quality_staff', name: '测试审核员', role: 'healthManager' }]);
    await require('../src/models/User').collection.insertOne({ _id: patient, name: '虚构测试' });
    const root = await Category.create({ name: '测试目录' });
    const leaf = await Category.create({ name: '标准项目', parent: root._id });
    const item = { itemId: randomUUID(), name: '机构特殊叫法', sourceSection: '测试栏目', value: '12', unit: 'mg/L', itemType: 'lab', screeningKey: '', screeningKeys: [] };
    const report = await MedicalReport.create({ user: patient, title: '虚构报告', reportItems: [item], aiStatus: 'pending' });
    const app = express(); app.use(express.json());
    app.use('/settings', require('../src/routes/settings'));
    app.use('/staff', require('../src/routes/staff'));
    app.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const call = async (path, body, actor = admin, method = body ? 'POST' : 'GET') => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ type: 'admin', id: String(actor) }, process.env.JWT_SECRET)}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() };
    };
    assert.equal((await call('/settings/report-classification', null, staff)).status, 403);
    assert.equal((await call('/settings/report-classification')).body.data.length, 1);
    const confirm = { reportId: String(report._id), itemId: item.itemId, expectedRevision: 0, categoryId: String(leaf._id) };
    assert.equal((await call('/settings/report-classification/confirm', confirm)).status, 200);
    assert.equal((await call('/settings/report-classification/confirm', confirm)).status, 409);
    const { classifyItemsAsync } = require('../src/utils/screeningMatch');
    assert.equal((await classifyItemsAsync([item]))[0].matchStatus, 'matched');
    assert.equal((await classifyItemsAsync([{ ...item, sourceSection: '其他栏目' }]))[0].matchStatus, 'unclassified');
    const savedCategory = await Category.findById(leaf._id);
    assert.equal(savedCategory.confirmedRules.length, 1);
    assert.equal((await call(`/settings/categories/${leaf._id}/confirmed-rules/${savedCategory.confirmedRules[0]._id}`, null, admin, 'DELETE')).status, 200);
    assert.equal((await classifyItemsAsync([item]))[0].matchStatus, 'unclassified');

    const base = `/staff/medical-reports/${report._id}`;
    assert.equal((await call(base, { aiStatus: 'pending' }, admin, 'PATCH')).status, 200);
    const invalid = await call(base, { aiStatus: 'reviewed' }, admin, 'PATCH');
    assert.equal(invalid.status, 400); assert.match(invalid.body.message, /检查日期/);
    assert.equal((await MedicalReport.findById(report._id)).audit_status, 'unaudited');
    assert.equal((await call(base, { date: '2026-09-20', institutionStatus: 'unknown' }, admin, 'PATCH')).status, 200);
    const beforeApproval = await MedicalReport.findById(report._id).lean();
    const approved = await call(base, { reportItems: beforeApproval.reportItems, aiStatus: 'reviewed', editSource: 'ocr_review', expectedRevision: beforeApproval.reviewRevision }, admin, 'PATCH');
    assert.equal(approved.status, 200, approved.body.message);
    assert.equal((await MedicalReport.findById(report._id)).audit_status, 'audited');
    const sessionId = randomUUID(), path = `reviewActivity.${admin}_${sessionId}`;
    assert.equal((await call(base + '/review-activity', { sessionId, sequence: 1 })).status, 200);
    await MedicalReport.collection.updateOne({ _id: report._id }, { $set: { [path + '.at']: new Date(Date.now() - 15000) } });
    assert.equal((await call(base + '/review-activity', { sessionId, sequence: 2 })).status, 200);
    const first = (await MedicalReport.findById(report._id)).reviewActivity[`${admin}_${sessionId}`].durationMs;
    assert.ok(first >= 15000 && first <= 20000);
    assert.equal((await call(base + '/review-activity', { sessionId, sequence: 2 })).status, 200);
    assert.equal((await MedicalReport.findById(report._id)).reviewActivity[`${admin}_${sessionId}`].durationMs, first);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    assert.equal(mongoose.connection.name, dbName);
    await mongoose.connection.dropDatabase(); await mongoose.disconnect();
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
  }
});
