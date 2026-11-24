const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const router = require('../src/routes/expertConsultations');
const Case = require('../src/models/ExpertConsultationCase');
const User = require('../src/models/User');
const Admin = require('../src/models/Admin');
const MedicalReport = require('../src/models/MedicalReport');

const oid = () => new mongoose.Types.ObjectId();
const handler = (method, path) => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('staff consultation shares selected check order and brings its reviewed report to the assigned expert', async () => {
  const original = { user: User.findOne, admin: Admin.exists, count: MedicalReport.countDocuments,
    reports: MedicalReport.find, create: Case.create, case: Case.findById };
  const tenantId = oid(), patientId = oid(), otherPatientId = oid(), managerId = oid(), expertId = oid();
  const orderId = oid(), reportId = oid(), unrelatedId = oid(), caseId = oid();
  const order = { _id: orderId, title: '检验检查单', documentCategory: 'prescription_order', sourceOrderId: oid(), fileUrl: 'https://example.test/order.png' };
  const report = { _id: reportId, title: '检验结果', documentCategory: 'lab_report', sourceOrderId: order.sourceOrderId, audit_status: 'audited', fileUrl: 'https://example.test/report.png' };
  const unrelated = { _id: unrelatedId, title: '其他报告', documentCategory: 'exam_report', fileUrl: 'https://example.test/other.png' };
  const all = [order, report, unrelated];
  const chain = rows => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, async lean() { return rows; } });
  let row;
  User.findOne = () => ({ select: () => ({ lean: async () => ({ _id: patientId, assignedHealthManager: managerId }), then: (resolve) => Promise.resolve({ _id: patientId, assignedHealthManager: managerId }).then(resolve) }) });
  Admin.exists = async () => true;
  MedicalReport.countDocuments = async filter => all.filter(item => filter._id.$in.some(value => String(value) === String(item._id)) && String(filter.user) === String(patientId)).length;
  MedicalReport.find = filter => chain(all.filter(item => {
    if (filter._id && !filter._id.$in.some(value => String(value) === String(item._id))) return false;
    if (filter.sourceOrderId && String(item.sourceOrderId) !== String(filter.sourceOrderId.$in[0])) return false;
    if (filter.audit_status && item.audit_status !== filter.audit_status) return false;
    return true;
  }));
  Case.create = async data => { row = { ...data, _id: caseId, members: [{ staffId: expertId }] }; return row; };
  Case.findById = async () => row;
  try {
    const request = { staff: { _id: managerId, tenantId, role: 'healthManager' }, body: { patientId: String(patientId), type: 'single', request: '请看检查结果', reportIds: [String(orderId)] } };
    const denied = response();
    await handler('post', '/staff')({ ...request, body: { ...request.body, reportIds: [String(otherPatientId)] } }, denied);
    assert.equal(denied.statusCode, 400);
    const created = response();
    await handler('post', '/staff')(request, created);
    assert.equal(created.statusCode, 201);
    assert.deepEqual(row.materialReportIds, [String(orderId)]);
    const materials = response();
    await handler('get', '/staff/:id/materials')({ params: { id: String(caseId) }, staff: { _id: expertId, tenantId, role: 'specialist' } }, materials);
    assert.equal(materials.statusCode, 200);
    assert.deepEqual(materials.body.data.map(item => String(item._id)).sort(), [String(orderId), String(reportId)].sort());
    assert.equal(materials.body.data.find(item => String(item._id) === String(reportId)).automaticallyIncluded, true);
    assert.ok(materials.body.data.every(item => item.files.length === 1));
  } finally {
    User.findOne = original.user; Admin.exists = original.admin; MedicalReport.countDocuments = original.count;
    MedicalReport.find = original.reports; Case.create = original.create; Case.findById = original.case;
  }
});
