// 健康顾问前置校验：AI健康分析/风险评估生成前，必须确认①体检报告健管专员已审核 ②健康顾问
// 已查看确认该客户当前的健康档案（不是逐份审核报告数据本身，那是健管专员 audit_status 的职责）。
// 同时供 user.js（客户自助生成）和 staff.js（医护端生成、AI待办面板聚合）三处调用，
// 避免各处判断口径不一致——2026-07-21 发现 user.js 客户自助入口完全没走 staff.js
// 里已有的 pendingCount 拦截，是同一逻辑分裂成两套维护出来的漏洞，所以抽成公共函数。
//
// 2026-07-28 改造：此前"健康顾问审核"绑定在 familyDoctorAudit（逐份报告审核数据），实际变成
// 健康顾问审核健管专员录入的数据对不对，这不合理——健管专员审核数据是健管专员自己的职责。
// 真正该拦截的是"健康顾问是否已看过这个客户自上次确认以来新增的资料"，改为检查
// User.archiveReviewStatus + archiveReviewSnapshotAt。
//
// 重要：这是增量确认机制，不是"全部推倒重来"——健康顾问已经看过、点过确认的内容永久算数，
// archiveReviewSnapshotAt 记录的是"上次确认时间点"，之后只要有新报告（健管审核通过）或健康
// 档案重要字段变动，就提示"有新增内容待查看"；点一次确认后快照就往前推进，只需要看新增部分，
// 不需要把历史资料重新翻一遍。
const MedicalReport = require('../models/MedicalReport');
const User = require('../models/User');

// 返回 null 表示放行；返回字符串表示拦截原因（用作 message 直接展示给用户）
async function checkReportAuditGate(userId) {
  const user = await User.findById(userId)
    .select('assignedFamilyDoctor archiveReviewStatus archiveReviewSnapshotAt archiveChangeLog archiveAutoLog archiveConfirmLog lifestyleHistory');
  if (!user || !user.assignedFamilyDoctor) return null; // 无健康顾问的客户不受此拦截，维持原有逻辑

  const total = await MedicalReport.countDocuments({ user: userId });
  if (total === 0) return '请先上传体检报告后再生成AI健康信息整理/健康关注提示';

  const notStaffAudited = await MedicalReport.countDocuments({ user: userId, audit_status: { $ne: 'audited' } });
  if (notStaffAudited > 0) return `还有 ${notStaffAudited} 份体检报告健管专员未审核，请先完成审核后再生成`;

  const newReportCount = await MedicalReport.countDocuments(pendingDoctorAuditFilter(userId, user.archiveReviewSnapshotAt));
  if (newReportCount > 0 || hasUnreviewedNewContent(user)) {
    return '有新增体检报告或健康档案更新，健康顾问需先查看确认后再生成';
  }

  return null;
}

// 判断是否存在"自上次确认以来新增、健康顾问尚未确认过"的内容（增量判断，不是整体失效）
function hasUnreviewedNewContent(user) {
  return !!getLatestArchiveUpdate(user, user.archiveReviewSnapshotAt);
}

function getLatestArchiveUpdate(user, snapshotValue) {
  const snapshotAt = snapshotValue ? new Date(snapshotValue).getTime() : 0;
  const candidates = [];
  (user.archiveChangeLog || []).forEach(entry => candidates.push({ at: entry.changedAt, source: '客户更新', items: entry.items || [] }));
  (user.archiveAutoLog || []).forEach(entry => candidates.push({ at: entry.appliedAt, source: entry.questionnaireTitle ? `问卷“${entry.questionnaireTitle}”自动写入` : '问卷自动写入', items: entry.items || [] }));
  (user.archiveConfirmLog || []).forEach(entry => candidates.push({ at: entry.confirmedAt, source: `${entry.confirmedByName || '健管专员'}确认写入`, items: entry.items || [] }));
  (user.lifestyleHistory || []).forEach(entry => candidates.push({ at: entry.recordedAt, source: entry.recordedByName ? `${entry.recordedByName}更新生活方式` : '生活方式更新', items: Object.entries(entry.changes || {}).map(([label, value]) => ({ label, valueStr: value?.to ?? '' })) }));
  return candidates.filter(entry => entry.at && new Date(entry.at).getTime() > snapshotAt).sort((a, b) => new Date(b.at) - new Date(a.at))[0] || null;
}

// 待办面板/前置校验共用的查询条件：健管已审，且晚于健康顾问上次确认快照的新增报告
// （这是增量查询——只返回"新增部分"，已确认过的历史报告不会再出现在这个列表里）
function pendingDoctorAuditFilter(userId, snapshotAt) {
  const filter = { user: userId, audit_status: 'audited' };
  if (snapshotAt) filter.createdAt = { $gt: snapshotAt };
  return filter;
}

module.exports = { checkReportAuditGate, pendingDoctorAuditFilter, hasUnreviewedNewContent, getLatestArchiveUpdate };
