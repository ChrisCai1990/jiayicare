const { summaryTodos } = require('./humanWorkbench');
const ROLES = {
  healthManager: ['assignedHealthManager', '健管专员'], familyDoctor: ['assignedFamilyDoctor', '健康顾问'],
  rehabSpecialist: ['assignedRehabSpecialist', '运动复健师'], tcmDoctor: ['assignedTcmDoctor', '药食同源专业人员'],
  nutritionist: ['assignedNutritionist', '营养师'], healthPlanner: ['assignedHealthPlanner', '健康规划师'],
};

// A read-only exception projection. It never claims, completes or recreates business tasks.
async function loadAssignmentAttention(staff, models = {}) {
  // 缺少负责人的异常需要平台管理员修正人员归属或历史任务，
  // 不是健康规划师的业务待办，不能混入其工作台。
  if (staff.role !== 'superadmin') return [];
  const model = name => models[name] || require('../models/' + name);
  const tenantId = staff.tenantId || null;
  const patients = await model('User').find({ tenantId, isDeleted: { $ne: true } })
    .select('name assignedHealthManager assignedFamilyDoctor assignedNutritionist assignedHealthPlanner assignedRehabSpecialist assignedTcmDoctor archiveDraft aiHealthSummary').lean();
  if (!patients.length) return [];
  const users = new Map(patients.map(p => [String(p._id), p]));
  const ids = patients.map(p => p._id);
  const people = await model('Admin').find({ tenantId, staffStatus: { $ne: 'inactive' } }).select('_id role').lean();
  const active = new Map(people.map(p => [String(p._id), p.role]));
  const issues = new Map();
  function add(patientId, role, reason, explicitOwner) {
    const patient = users.get(String(patientId));
    if (!patient) return;
    const [field, label] = ROLES[role] || ['', '任务执行人'];
    const owner = explicitOwner === undefined ? patient[field] : explicitOwner;
    if (owner && active.has(String(owner)) && (explicitOwner !== undefined || active.get(String(owner)) === role)) return;
    const key = `${patient._id}_${explicitOwner !== undefined ? 'executor' : role}`;
    if (!issues.has(key)) issues.set(key, { id: `assignment_${key}`, type: 'assignment_attention',
      label: '待办缺少有效负责人', priority: 1, patientId: String(patient._id), patientName: patient.name || '会员',
      reasons: new Set(), roleLabel: label, count: 0, createdAt: null, overdue: false,
      link: `/patients/${patient._id}?tab=info` });
    const todo = issues.get(key); todo.reasons.add(reason); todo.count++;
  }
  for (const p of patients) {
    if (p.archiveDraft) add(p._id, 'healthManager', '档案草稿待审核');
    for (const todo of summaryTodos(p, () => true)) add(p._id, todo.type === 'summary_review' ? 'familyDoctor' : 'nutritionist', 'AI健康整理待审核');
  }
  const sources = [
    ['MedicalReport', 'user', { aiStatus: { $in: ['none', 'failed', 'pending'] }, audit_status: { $nin: ['audited', 'rejected'] },
      $or: [{ fileUrl: /.+/ }, { 'fileUrls.0': { $exists: true } }, { content: /.+/ }, { aiStatus: 'pending' }] }, 'healthManager', '报告待处理'],
    ['Medication', 'user', { aiStatus: 'pending' }, 'familyDoctor', '用药待核对'],
    ['Supplement', 'user', { aiStatus: 'pending' }, 'nutritionist', '营养素待核对'],
    ['HealthPlan', 'patientId', { 'content.aiStatus': 'pending', status: { $nin: ['completed', 'cancelled', 'archived'] } }, null, '方案待审核'],
    ['FollowUp', 'patientId', { $or: [{ aiStatus: 'pending' }, { status: { $in: ['planned', 'in_progress', 'missed'] } }] }, null, '随访待处理'],
    ['ServiceRecord', 'patientId', { aiStatus: 'pending', type: 'nutrition' }, 'nutritionist', '营养随访草稿待审核'],
    ['PhaseAssessment', 'patientId', require('./phaseAssessmentRouting').reviewQueueFilter('superadmin'), null, '阶段性评估待审核或归档'],
    ['ChatLog', 'user', { transferred: true, resolved: false }, 'healthPlanner', '对话转人工'],
  ];
  for (const [name, field, filter, role, reason] of sources) {
    const rows = await model(name).find({ ...filter, tenantId, [field]: { $in: ids } })
      .select(`${field} type reviewRole aiStatus assignedTo status primaryReviewRole finalReviewRole`).lean();
    for (const row of rows) {
      if (name === 'FollowUp') {
        if (row.aiStatus === 'pending') add(row[field], row.reviewRole || 'familyDoctor', '随访待审核');
        else add(row[field], 'executor', reason, row.assignedTo || null);
      } else if (name === 'PhaseAssessment') {
        const reviewer = require('./phaseAssessmentRouting').currentReviewer(row);
        if (reviewer) add(row[field], reviewer, reason);
      } else if (name === 'HealthPlan') {
        const reviewer = { annual_checkup: 'familyDoctor', nutrition: 'nutritionist', medical_assist: 'healthPlanner' }[row.type];
        if (reviewer) add(row[field], reviewer, reason);
      } else add(row[field], role, reason);
    }
  }
  return [...issues.values()].map(({ reasons, roleLabel, count, ...todo }) => ({ ...todo,
    summary: `${roleLabel}未分配、已停用或岗位不匹配；${[...reasons].join('、')}（${count}项）。请核对人员归属和原任务指派。` }));
}

module.exports = { loadAssignmentAttention };
