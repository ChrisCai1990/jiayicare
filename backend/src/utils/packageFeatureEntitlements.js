const ServicePackage = require('../models/ServicePackage');
const { applicableEntitlements } = require('./packageEntitlements');

const NONE = { aiHealthAnalysis: false, phaseAssessment: false, monthlyServiceReview: false, healthConsultation: false, medicalPlanning: false, expertAppointment: false, reportInterpretation: false, phaseAssessmentFrequency: '', monthlyReviewStartMonth: 1 };
const HEALTH_FUND_TIERS = new Set(['consumer365', 'annual', 'therapy', 'enterprise']);

function aiRights(value) {
  return {
    aiHealthAnalysis: value?.aiHealthAnalysis === true,
    phaseAssessment: value?.phaseAssessment === true,
    monthlyServiceReview: value?.monthlyServiceReview === true,
    healthConsultation: value?.healthConsultation === true,
    medicalPlanning: value?.medicalPlanning === true,
    expertAppointment: value?.expertAppointment === true,
    reportInterpretation: value?.reportInterpretation === true,
    phaseAssessmentFrequency: '',
    monthlyReviewStartMonth: 1,
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
        ['aiHealthAnalysis', 'phaseAssessment', 'monthlyServiceReview', 'healthConsultation', 'medicalPlanning', 'expertAppointment', 'reportInterpretation'].forEach(key => { result[key] ||= rights[key]; });
        result.phaseAssessmentFrequency ||= row.rights.phaseAssessmentFrequency || '';
        result.monthlyReviewStartMonth = Math.min(result.monthlyReviewStartMonth, Math.max(1, Number(row.rights.monthlyReviewStartMonth) || 1));
      } else if (row.packageId) legacyPackageIds.push(row.packageId);
    }
    if (legacyPackageIds.length) {
      const packages = await ServicePackage.find({ _id: { $in: legacyPackageIds } }).select('entitlements configuration').lean();
      packages.forEach(item => {
        const rights = aiRights(item.entitlements);
        ['aiHealthAnalysis', 'phaseAssessment', 'monthlyServiceReview', 'healthConsultation', 'medicalPlanning', 'expertAppointment', 'reportInterpretation'].forEach(key => { result[key] ||= rights[key]; });
        result.phaseAssessmentFrequency ||= item.configuration?.phaseAssessmentFrequency || '';
        result.monthlyReviewStartMonth = Math.min(result.monthlyReviewStartMonth, Math.max(1, Number(item.configuration?.monthlyReviewStartMonth) || 1));
      });
    }
    return result;
  }
  // 未生成新台账的存量客户：保持原服务有效期校验，但改为读取明确配置，
  // 不再用套餐名称、服务时长或团队人员来推断。
  if (!user.servicePackage) return { ...NONE };
  const pkg = await ServicePackage.findOne({
    clientBrand: user.clientBrand || 'jiayiguanjia', name: user.servicePackage, active: true,
  }).select('entitlements configuration').lean();
  return { ...aiRights(pkg?.entitlements), phaseAssessmentFrequency: pkg?.configuration?.phaseAssessmentFrequency || '', monthlyReviewStartMonth: Math.max(1, Number(pkg?.configuration?.monthlyReviewStartMonth) || 1) };
}

// 健康基金资格随“有效服务包权益”走，而不是只看客户资料上的展示分层。
// 这样一个客户同时有 365 和年度包、或主账户把权益共享给家属时，都按仍在
// 有效期内的冻结订单判断；旧订单没有台账时才兼容原有的服务期字段。
async function hasHealthFundAccess(user) {
  if (!user) return false;
  const rows = await applicableEntitlements(user._id);
  if (rows.length) {
    return rows.some(row => {
      const rights = row.rights || {};
      return rights.includes365 === true || HEALTH_FUND_TIERS.has(String(rights.membershipTier || ''));
    });
  }
  if (!HEALTH_FUND_TIERS.has(String(user.membershipTier || ''))) return false;
  const { legacyAccess } = require('./serviceAccess');
  return legacyAccess(user).active;
}

module.exports = { getAiEntitlements, hasHealthFundAccess, NONE };
