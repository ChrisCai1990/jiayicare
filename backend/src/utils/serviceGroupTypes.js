const TYPES = Object.freeze({
 advisor: { label: '健康顾问', suffix: '嘉医服务群', field: 'assignedFamilyDoctor', term: '年度服务' },
 nutrition: { label: '营养师', suffix: '营养干预服务群', field: 'assignedNutritionist', term: '阶段服务' },
 medical: { label: '就医专员', suffix: '就医服务群', field: 'assignedMedicalAssistant', term: '临时服务' },
 specialty: { label: '专科医师', suffix: '专病管理群', field: 'assignedSpecialist', term: '专病服务期' },
});
const same = (a,b) => String(a?._id || a || '') === String(b?._id || b || '');
const typeOf = group => TYPES[group?.serviceType] ? group.serviceType : 'legacy';
const isEnded = (group, now = new Date()) => group?.status === 'closed';
const titleOf = (group, patient) => `${patient?.name || ''}${TYPES[typeOf(group)]?.suffix || '原服务群'}`;
function memberIdsFor(patient, type) {
 if (!TYPES[type]) return [];
 return [...new Set([patient[TYPES[type].field], patient.assignedHealthManager].filter(Boolean).map(String))];
}
function inferLegacyType(group, patient) {
 if (!patient || !patient.assignedHealthManager) return 'legacy';
 const actual = [...new Set((group.memberIds || []).map(String))].sort();
 const matches = Object.keys(TYPES).filter(type => patient[TYPES[type].field] &&
  JSON.stringify(memberIdsFor(patient,type).sort()) === JSON.stringify(actual));
 return matches.length === 1 ? matches[0] : 'legacy';
}
module.exports = { TYPES, typeOf, titleOf, isEnded, memberIdsFor, inferLegacyType };
