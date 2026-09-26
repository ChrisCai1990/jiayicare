const ServicePackage = require('../models/ServicePackage');
const { applicableEntitlements } = require('./packageEntitlements');

const NONE = { aiHealthAnalysis: false, phaseAssessment: false, monthlyServiceReview: false };

function aiRights(value) {
  return {
    aiHealthAnalysis: value?.aiHealthAnalysis === true,
    phaseAssessment: value?.phaseAssessment === true,
    monthlyServiceReview: value?.monthlyServiceReview === true,
  };
}

// 服务包台账是新订单的唯一依据。早于台账字段上线的历史订单没有冻结 AI 权益，
// 仅在这种兼容情形读取当前服务包配置；新订单绝不受后续套餐编辑影响。
async function getAiEntitlements(user, serviceAccess) {
  if (!user || !serviceAccess?.active) return { ...NONE };
  const rows = await applicableEntitlements(user._id);
  if (rows.length) {
    let result = { ...NONE };
    const legacyPackageIds = [];
    for (const row of rows) {
      if (row.rights && Object.prototype.hasOwnProperty.call(row.rights, 'aiEntitlements')) {
        const rights = aiRights(row.rights.aiEntitlements);
        Object.keys(NONE).forEach(key => { result[key] ||= rights[key]; });
      } else if (row.packageId) legacyPackageIds.push(row.packageId);
    }
    if (legacyPackageIds.length) {
      const packages = await ServicePackage.find({ _id: { $in: legacyPackageIds } }).select('entitlements').lean();
      packages.forEach(item => {
        const rights = aiRights(item.entitlements);
        Object.keys(NONE).forEach(key => { result[key] ||= rights[key]; });
      });
    }
    return result;
  }
  // 未生成新台账的存量客户：保持原服务有效期校验，但改为读取明确配置，
  // 不再用套餐名称、服务时长或团队人员来推断。
  if (!user.servicePackage) return { ...NONE };
  const pkg = await ServicePackage.findOne({
    clientBrand: user.clientBrand || 'jiayiguanjia', name: user.servicePackage, active: true,
  }).select('entitlements').lean();
  return aiRights(pkg?.entitlements);
}

module.exports = { getAiEntitlements, NONE };
