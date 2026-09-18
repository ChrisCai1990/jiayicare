const DEFINITIONS = {
  medications: {
    key: 'preparation:medications',
    theme: '完善用药档案',
    content: '请与客户核对当前正在使用的药物并完善档案；如确认未用药，由健康顾问在首次方案准备清单中标记“确认无”。仅记录客观信息，不作诊疗或用药调整。',
  },
  supplements: {
    key: 'preparation:supplements',
    theme: '完善营养素档案',
    content: '请与客户核对当前正在使用的营养素并完善档案；如确认未使用，由健康顾问在首次方案准备清单中标记“确认无”。仅记录客观信息，不作诊疗建议。',
  },
};

const isIncomplete = (checklist, key) => (checklist?.items || []).some(item => item.key === key && !item.complete);

function buildAnnualPreparationTaskRows({ patient = {}, year, checklist }) {
  if (!patient.assignedHealthManager) return [];
  return Object.entries(DEFINITIONS)
    .filter(([key]) => isIncomplete(checklist, key))
    .map(([key, definition]) => ({
      ...definition,
      itemKey: key,
      patientId: patient._id,
      assignedTo: patient.assignedHealthManager,
      year,
    }));
}

module.exports = { DEFINITIONS, buildAnnualPreparationTaskRows };
