const mongoose = require('mongoose');
const MedicalExpert = require('../models/MedicalExpert');

const compact = value => String(value || '').replace(/\s/g, '');
const departmentName = value => compact(value).replace(/医学|检查/g, '');
const matches = (left, right, min) => left && right && (left === right || (Math.min(left.length, right.length) >= min && (left.includes(right) || right.includes(left))));

async function resolveAnnualPlanExperts(moduleData) {
  for (const key of ['medical_treatment', 'specialist_collab', 'abnormal_followup']) {
    for (const row of moduleData?.[key]?.records || []) {
      const ids = row.expertIds;
      if (ids === undefined) { delete row.expertSnapshots; continue; }
      if (!Array.isArray(ids) || ids.length > 12 || new Set(ids.map(String)).size !== ids.length || ids.some(id => !mongoose.isValidObjectId(id))) {
        throw new Error('请选择有效且不重复的资源库专家（最多12位）');
      }
      if (!ids.length) { row.expertSnapshots = []; continue; }
      const experts = await MedicalExpert.find({ _id: { $in: ids }, status: 'active' })
        .populate('institutionId', 'name aliases status').populate('departmentId', 'name campus status').lean();
      if (experts.length !== ids.length) throw new Error('所选专家已停用或不存在，请重新选择');
      row.expertSnapshots = ids.map(id => {
        const expert = experts.find(item => String(item._id) === String(id));
        const institution = expert?.institutionId;
        const department = expert?.departmentId;
        if (!institution || !department || institution.status === 'inactive' || department.status === 'inactive' || ![institution.name, ...(institution.aliases || [])].some(name => matches(compact(name), compact(row.hospital), 4))
          || !matches(departmentName(department.name), departmentName(row.department), 2)) {
          throw new Error('所选专家与当前医院或科室不匹配，请重新核对');
        }
        return { id: String(expert._id), name: expert.name, title: expert.title || '', institutionName: institution.name,
          departmentName: department.name, campus: expert.campus || department.campus || '', capturedAt: new Date() };
      });
    }
  }
  return moduleData;
}

module.exports = { resolveAnnualPlanExperts };
