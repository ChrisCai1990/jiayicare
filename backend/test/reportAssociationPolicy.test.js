const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { validateReportAssociation } = require('../src/utils/reportAssociationPolicy');

const id = () => new mongoose.Types.ObjectId();
const planStub = ({ patientId, itemId }) => ({
  patientId,
  items: { id: candidate => String(candidate) === String(itemId) ? { _id: itemId } : null },
});

test('报告建档拒绝不存在或当前机构不可见的会员', () => {
  const patientId = id();
  assert.deepEqual(validateReportAssociation({ patientId, patient: null }), {
    status: 404, message: '会员不存在或不属于当前机构',
  });
});

test('报告建档不接受不完整的方案关联', () => {
  const patientId = id();
  assert.equal(validateReportAssociation({ patientId, patient: { _id: patientId } }), null);
  assert.equal(validateReportAssociation({ patientId, patient: { _id: patientId }, planId: id() }).status, 400);
});

test('报告建档拒绝关联其他会员的方案', () => {
  const patientId = id();
  const planId = id();
  const planItemId = id();
  const error = validateReportAssociation({
    patientId,
    patient: { _id: patientId },
    planId,
    planItemId,
    plan: planStub({ patientId: id(), itemId: planItemId }),
  });
  assert.match(error.message, /不属于当前会员/);
});

test('报告建档只接受目标会员方案中的真实项目', () => {
  const patientId = id();
  const planId = id();
  const planItemId = id();
  const plan = planStub({ patientId, itemId: planItemId });
  assert.equal(validateReportAssociation({ patientId, patient: { _id: patientId }, planId, planItemId, plan }), null);
  assert.match(validateReportAssociation({
    patientId,
    patient: { _id: patientId },
    planId,
    planItemId: id(),
    plan,
  }).message, /项目不存在/);
});
