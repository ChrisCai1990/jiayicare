// 家庭医生双审前置校验：AI健康分析/风险评估生成前，必须确认该客户体检报告已就绪。
// 同时供 user.js（客户自助生成）和 staff.js（医护端生成、AI待办面板聚合）三处调用，
// 避免各处判断口径不一致——2026-07-21 发现 user.js 客户自助入口完全没走 staff.js
// 里已有的 pendingCount 拦截，是同一逻辑分裂成两套维护出来的漏洞，所以抽成公共函数。
const MedicalReport = require('../models/MedicalReport');
const User = require('../models/User');

// 返回 null 表示放行；返回字符串表示拦截原因（用作 message 直接展示给用户）
async function checkReportAuditGate(userId) {
  const user = await User.findById(userId).select('assignedFamilyDoctor');
  if (!user || !user.assignedFamilyDoctor) return null; // 无家庭医生的客户不受此拦截，维持原有逻辑

  const total = await MedicalReport.countDocuments({ user: userId });
  if (total === 0) return '请先上传体检报告后再生成AI健康分析/风险评估';

  const pending = await MedicalReport.countDocuments({
    user: userId, audit_status: 'audited', 'familyDoctorAudit.status': { $ne: 'audited' },
  });
  if (pending > 0) return `请先由家庭医生审核确认 ${pending} 份体检报告后再生成`;

  return null;
}

// 待办面板/前置校验共用的查询条件，避免"拦截逻辑认为有待审报告，但待办面板不显示"的口径分裂
function pendingDoctorAuditFilter(userId) {
  return { user: userId, audit_status: 'audited', 'familyDoctorAudit.status': { $ne: 'audited' } };
}

module.exports = { checkReportAuditGate, pendingDoctorAuditFilter };
