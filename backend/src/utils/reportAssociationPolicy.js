const mongoose = require('mongoose');

function sameId(left, right) {
  return !!left && !!right && String(left) === String(right);
}

function validateReportAssociation({ patientId, patient, planId, planItemId, plan }) {
  if (!mongoose.isValidObjectId(patientId) || !patient) {
    return { status: 404, message: '会员不存在或不属于当前机构' };
  }

  const hasPlanId = !!planId;
  const hasPlanItemId = !!planItemId;
  if (hasPlanId !== hasPlanItemId) {
    return { status: 400, message: '关联方案和方案项目必须同时提供' };
  }
  if (!hasPlanId) return null;

  if (!mongoose.isValidObjectId(planId) || !mongoose.isValidObjectId(planItemId)) {
    return { status: 400, message: '关联方案信息无效' };
  }
  if (!plan || !sameId(plan.patientId, patientId)) {
    return { status: 400, message: '关联方案不属于当前会员' };
  }
  if (!plan.items?.id?.(planItemId)) {
    return { status: 400, message: '关联方案项目不存在' };
  }
  return null;
}

module.exports = { validateReportAssociation };
